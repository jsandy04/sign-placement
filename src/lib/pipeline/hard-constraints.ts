import { MIN_SIGN_SPACING_FT, recommendedOffsetFeet } from "@/lib/rules/placement";
import { violatesRoadMedian, violatesRoadwayEdge } from "@/lib/rules/legal";
import { violatesFireHydrantClearance, violatesSidewalkCorridor, violatesSightTriangle } from "@/lib/rules/safety";
import type { CandidateLocation, FilteredCandidate } from "@/lib/types";
import { haversineDistanceFeet } from "@/lib/utils/geo";

export function applyHardConstraints(candidates: CandidateLocation[]): FilteredCandidate[] {
  const filtered = candidates
    .filter((candidate) => !violatesSafety(candidate))
    .filter((candidate) => !violatesLegal(candidate))
    .filter((candidate) => !violatesOffset(candidate))
    .map((candidate) => ({
      ...candidate,
      flag: "none" as const,
      constraintConfidence: 0.5,
    }));

  return applySpacing(filtered);
}

function violatesSafety(candidate: CandidateLocation) {
  return violatesSightTriangle(candidate) || violatesFireHydrantClearance() || violatesSidewalkCorridor();
}

function violatesLegal(candidate: CandidateLocation) {
  return violatesRoadMedian() || violatesRoadwayEdge(candidate);
}

function violatesOffset(candidate: CandidateLocation) {
  if (candidate.type === "property") {
    return false;
  }

  return candidate.distanceToTurn < recommendedOffsetFeet(candidate.speedEstimate);
}

function applySpacing(candidates: FilteredCandidate[]) {
  const kept: FilteredCandidate[] = [];

  for (const candidate of candidates) {
    const conflictIndex = kept.findIndex(
      (keptCandidate) => haversineDistanceFeet(candidate, keptCandidate) < MIN_SIGN_SPACING_FT,
    );

    if (conflictIndex === -1) {
      kept.push(candidate);
      continue;
    }

    if (preConstraintScore(candidate) > preConstraintScore(kept[conflictIndex])) {
      kept[conflictIndex] = candidate;
    }
  }

  return kept;
}

function preConstraintScore(candidate: CandidateLocation) {
  if (candidate.type === "before") {
    return 100;
  }

  if (candidate.type === "property") {
    return 95;
  }

  if (candidate.type === "after") {
    return 60;
  }

  return 40;
}
