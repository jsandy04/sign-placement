import { MIN_SIGN_SPACING_FT, SOFT_SIGN_SPACING_FT } from "@/lib/rules/placement";
import type { LLMRankedResult, ScoredCandidate, SignPlacement } from "@/lib/types";
import { haversineDistanceFeet } from "@/lib/utils/geo";

export function selectTopN(candidates: ScoredCandidate[], llmResult: LLMRankedResult, n: number): SignPlacement[] {
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const llmCandidates = llmResult.selected_signs
    .map((selection) => byId.get(selection.candidate_id))
    .filter((candidate): candidate is ScoredCandidate => Boolean(candidate));
  const ordered = [...llmCandidates, ...candidates.filter((candidate) => !llmCandidates.includes(candidate))];
  const property = candidates.find((candidate) => candidate.type === "property");
  const targetCount = property ? Math.max(0, n - 1) : n;
  const selected: ScoredCandidate[] = [];
  // Treat the property as a fixed spacing anchor so approach signs don't crowd the front door
  // (the final pre-turn sign was landing right on top of the property sign).
  const spacingAnchors = property ? [property] : [];

  while (selected.length < targetCount) {
    const next = ordered
      .filter((candidate) => candidate.type !== "property")
      .filter((candidate) => !selected.includes(candidate))
      .map((candidate) => ({
        candidate,
        adjustedScore: adjustedScore(candidate, [...selected, ...spacingAnchors]),
      }))
      .filter(({ adjustedScore }) => adjustedScore > Number.NEGATIVE_INFINITY)
      .sort((a, b) => b.adjustedScore - a.adjustedScore)[0]?.candidate;

    if (!next) {
      break;
    }

    selected.push(next);
  }

  if (property) {
    selected.push(property);
  }

  return selected.slice(0, n).map((candidate, index) => ({
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
  }));
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
