import type { CandidateLocation } from "@/lib/types";

const SIGHT_TRIANGLE_FT = 25;

export function violatesSightTriangle(candidate: CandidateLocation) {
  return candidate.type === "at" && candidate.distanceToTurn <= SIGHT_TRIANGLE_FT;
}

export function violatesFireHydrantClearance() {
  return false;
}

export function violatesSidewalkCorridor() {
  return false;
}
