import { MIN_SIGN_SPACING_FT, SOFT_SIGN_SPACING_FT } from "@/lib/rules/placement";
import type { LLMRankedResult, ScoredCandidate, SignPlacement } from "@/lib/types";
import { haversineDistanceFeet } from "@/lib/utils/geo";

export function selectTopN(candidates: ScoredCandidate[], llmResult: LLMRankedResult, n: number): SignPlacement[] {
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const llmCandidates = llmResult.selected_signs
    .map((selection) => byId.get(selection.candidate_id))
    .filter((candidate): candidate is ScoredCandidate => Boolean(candidate));
  // Priority order: LLM-preferred candidates first, then everything else in score order.
  const ordered = [...llmCandidates, ...candidates.filter((candidate) => !llmCandidates.includes(candidate))];
  const property = candidates.find((candidate) => candidate.type === "property");
  const targetCount = property ? Math.max(0, n - 1) : n;
  // Treat the property as a fixed spacing anchor so approach signs don't crowd the front door.
  const spacingAnchors = property ? [property] : [];

  // Group the (non-property) budget by approach so each direction is a followable mini-trail
  // instead of one route hogging every sign. Groups preserve the LLM/score priority order.
  const groups = new Map<number, ScoredCandidate[]>();
  for (const candidate of ordered) {
    if (candidate.type === "property") {
      continue;
    }
    const key = candidate.approachIndex ?? 0;
    const group = groups.get(key) ?? [];
    group.push(candidate);
    groups.set(key, group);
  }

  const selected = allocateAcrossApproaches(groups, spacingAnchors, targetCount);

  if (property) {
    selected.push(property);
  }

  return orderForTrail(selected, property)
    .slice(0, n)
    .map((candidate, index) => ({
      id: candidate.id,
      sortOrder: index + 1,
      lat: candidate.lat,
      lng: candidate.lng,
      description: descriptionFor(candidate),
      reasoning: reasoningFor(candidate, llmResult),
      score: candidate.score,
      placementType: candidate.placementType,
      flag: candidate.flag,
      isSelected: true,
      approachBearing: candidate.approachBearing,
      approachIndex: candidate.approachIndex,
    }));
}

// Round-robin allocation: cycle through approaches, each round taking the highest-priority
// remaining candidate from each that still satisfies hard spacing. This fairly distributes the
// budget (research §0.5: aim for an even, followable trail per direction) — a route can only
// "win" extra signs once the others are exhausted, so we never get a lonely 1-sign route while
// another is overloaded. Stops when the budget is met or no approach can place another sign.
function allocateAcrossApproaches(
  groups: Map<number, ScoredCandidate[]>,
  spacingAnchors: ScoredCandidate[],
  targetCount: number,
): ScoredCandidate[] {
  const selected: ScoredCandidate[] = [];
  const approachKeys = [...groups.keys()];
  let madeProgress = true;

  while (selected.length < targetCount && madeProgress) {
    madeProgress = false;

    for (const key of approachKeys) {
      if (selected.length >= targetCount) {
        break;
      }

      const group = groups.get(key) ?? [];
      const next = group.find(
        (candidate) =>
          !selected.includes(candidate) &&
          adjustedScore(candidate, [...selected, ...spacingAnchors]) > Number.NEGATIVE_INFINITY,
      );

      if (next) {
        selected.push(next);
        madeProgress = true;
      }
    }
  }

  return selected;
}

// Present signs grouped by approach and roughly in driving order (arterial entry → turns →
// near the property) so the agent's list reads like a route, not a scattered score ranking.
// The mandatory property sign always sorts last.
function orderForTrail(selected: ScoredCandidate[], property?: ScoredCandidate): ScoredCandidate[] {
  return [...selected].sort((a, b) => {
    if (property && a.id === property.id) {
      return 1;
    }
    if (property && b.id === property.id) {
      return -1;
    }
    const approachDelta = (a.approachIndex ?? 0) - (b.approachIndex ?? 0);
    if (approachDelta !== 0) {
      return approachDelta;
    }
    return a.turnNumber - b.turnNumber;
  });
}

function adjustedScore(candidate: ScoredCandidate, selected: ScoredCandidate[]) {
  let score = candidate.score;

  for (const selectedCandidate of selected) {
    const distance = haversineDistanceFeet(candidate, selectedCandidate);

    if (distance < MIN_SIGN_SPACING_FT) {
      return Number.NEGATIVE_INFINITY;
    }

    if (distance < SOFT_SIGN_SPACING_FT) {
      score -= ((SOFT_SIGN_SPACING_FT - distance) / (SOFT_SIGN_SPACING_FT - MIN_SIGN_SPACING_FT)) * 0.1;
    }
  }

  return score;
}

function descriptionFor(candidate: ScoredCandidate) {
  if (candidate.type === "property") {
    return "Mandatory — final sign at the property address.";
  }

  // "straight" candidates are reassurance signs on a long stretch between turns, not a turn.
  if (candidate.maneuverType === "straight") {
    const road = candidate.roadName && candidate.roadName !== "along the route" ? ` on ${candidate.roadName}` : "";
    return `Confirmation sign to keep drivers on track along the straightaway${road}.`;
  }

  return `Place sign ${candidate.type} the ${candidate.maneuverType.replaceAll("-", " ")}${candidate.roadName ? ` near ${candidate.roadName}` : ""}.`;
}

function reasoningFor(candidate: ScoredCandidate, llmResult: LLMRankedResult) {
  const selection = llmResult.selected_signs.find((sign) => sign.candidate_id === candidate.id);

  return selection?.rationale ?? `Selected by standard ranking with score ${candidate.score.toFixed(1)}.`;
}
