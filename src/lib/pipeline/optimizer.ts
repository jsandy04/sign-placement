import { FINAL_BLOCK_FT, MIN_SIGN_SPACING_FT, SOFT_SIGN_SPACING_FT } from "@/lib/rules/placement";
import type { LatLng, LLMRankedResult, ScoredCandidate, SignPlacement } from "@/lib/types";
import { haversineDistanceFeet } from "@/lib/utils/geo";

export function selectTopN(
  candidates: ScoredCandidate[],
  llmResult: LLMRankedResult,
  n: number,
  propertyLocation?: LatLng,
): SignPlacement[] {
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
  // Fall back to the property candidate's own coordinates if no explicit location was passed.
  const propertyPoint: LatLng | undefined = propertyLocation ?? property;

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

  // Reserve ~40% of the budget for the final block near the property (research Q5): without this,
  // arterial/high-traffic candidates win on score and the door gets no coverage ("none in the
  // neighborhood"). Phase 1 fills near-house slots first, phase 2 fills the rest.
  const nearReserve = propertyPoint ? Math.min(targetCount, Math.max(2, Math.round(targetCount * 0.4))) : 0;
  const selected = allocateAcrossApproaches(groups, spacingAnchors, targetCount, propertyPoint, nearReserve);

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

// Round-robin allocation across approaches, in two phases:
//   Phase 1 — fill the near-house reserve (only candidates within the final block) so the door
//             always gets coverage (research Q5 / fixes the "none in the neighborhood" skew).
//   Phase 2 — fill the remaining budget with the best-spaced candidates from any zone.
// Within each phase, cycling through approaches keeps a route from hogging the budget; a route
// only wins extra signs once the others are exhausted, so we avoid lonely 1-sign spurs.
function allocateAcrossApproaches(
  groups: Map<number, ScoredCandidate[]>,
  spacingAnchors: ScoredCandidate[],
  targetCount: number,
  propertyPoint: LatLng | undefined,
  nearReserve: number,
): ScoredCandidate[] {
  const selected: ScoredCandidate[] = [];
  const approachKeys = [...groups.keys()];

  const fits = (candidate: ScoredCandidate) =>
    !selected.includes(candidate) &&
    adjustedScore(candidate, [...selected, ...spacingAnchors]) > Number.NEGATIVE_INFINITY;
  const isNearHouse = (candidate: ScoredCandidate) =>
    Boolean(propertyPoint) && haversineDistanceFeet(candidate, propertyPoint!) <= FINAL_BLOCK_FT;

  // Phase 1: near-house reserve (everything added here is near, so selected length == near count).
  roundRobinFill(selected, approachKeys, groups, Math.min(nearReserve, targetCount), (c) => fits(c) && isNearHouse(c));
  // Phase 2: fill the rest from any zone.
  roundRobinFill(selected, approachKeys, groups, targetCount, fits);

  return selected;
}

function roundRobinFill(
  selected: ScoredCandidate[],
  approachKeys: number[],
  groups: Map<number, ScoredCandidate[]>,
  limit: number,
  eligible: (candidate: ScoredCandidate) => boolean,
) {
  let madeProgress = true;

  while (selected.length < limit && madeProgress) {
    madeProgress = false;

    for (const key of approachKeys) {
      if (selected.length >= limit) {
        break;
      }

      const next = (groups.get(key) ?? []).find(eligible);
      if (next) {
        selected.push(next);
        madeProgress = true;
      }
    }
  }
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
