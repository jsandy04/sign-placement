import { MIN_SIGN_SPACING_FT, recommendedOffsetFeet } from "@/lib/rules/placement";
import { violatesRoadMedian, violatesRoadwayEdge } from "@/lib/rules/legal";
import { violatesSightTriangle } from "@/lib/rules/safety";
import type { CandidateLocation, ConstraintFlag, FilteredCandidate } from "@/lib/types";
import { haversineDistanceFeet } from "@/lib/utils/geo";

export function applyHardConstraints(candidates: CandidateLocation[]): FilteredCandidate[] {
  const filtered = candidates
    // Hard rejections: corner sight-triangle (safety), medians (legal), and insufficient
    // pre-turn lead distance. Hydrant/sidewalk clearance can't be verified without GIS data,
    // so they're surfaced as result-level warnings rather than silently dropping candidates.
    .filter((candidate) => !violatesSightTriangle(candidate))
    .filter((candidate) => !violatesRoadMedian(candidate))
    .filter((candidate) => !violatesOffset(candidate))
    .map((candidate) => ({
      ...candidate,
      flag: flagFor(candidate),
      constraintConfidence: 0.5,
    }));

  return applySpacing(filtered);
}

// Soft issues that shouldn't drop a candidate but should be surfaced to the agent.
function flagFor(candidate: CandidateLocation): ConstraintFlag {
  if (violatesRoadwayEdge(candidate)) {
    return "legal";
  }

  return "none";
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
