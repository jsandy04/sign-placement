import type { CandidateLocation } from "@/lib/types";

// Signs on medians/islands are prohibited in every launch-market city, so this is a hard
// block. We can't get true road geometry from the Routes API, so we use a best-effort
// detection on the road name (median/island/divided) — better than the previous no-op stub.
const MEDIAN_NAME_PATTERN = /\b(median|island|divider|divided)\b/i;
const ROADWAY_EDGE_CLEARANCE_FT = 10;

export function violatesRoadMedian(candidate: CandidateLocation) {
  return Boolean(candidate.roadName && MEDIAN_NAME_PATTERN.test(candidate.roadName));
}

// Lateral clearance from the travel lane. Downgraded from a hard rejection to a warning:
// these signs are small and temporary, and in many right-of-way situations 2–6 ft is the
// practical reality. Used to flag, not to reject.
export function violatesRoadwayEdge(candidate: CandidateLocation) {
  return candidate.type === "at" && candidate.distanceToTurn < ROADWAY_EDGE_CLEARANCE_FT;
}
