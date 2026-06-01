import type { CandidateLocation } from "@/lib/types";

export function violatesRoadMedian() {
  return false;
}

export function violatesRoadwayEdge(candidate: CandidateLocation) {
  return candidate.type === "at" && candidate.distanceToTurn < 10;
}
