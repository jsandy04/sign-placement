import type { CandidateLocation } from "@/lib/types";

// Minimum corner clearance, scaled by approach speed (AASHTO intersection sight distance,
// simplified for a small ground sign): 25 ft at 25 mph up to ~60 ft at 50 mph.
const MIN_SIGHT_TRIANGLE_FT = 25;

// Standard fire-hydrant no-obstruction clearance (IFC / common municipal no-parking zone).
// Surfaced as a warning because no public hydrant-location dataset is available for the
// launch markets — we can't verify per-sign without GIS data.
export const FIRE_HYDRANT_CLEARANCE_FT = 15;
// ADA minimum clear pedestrian path that a sign must not block.
export const SIDEWALK_CLEARANCE_FT = 4;

export function sightTriangleClearanceFt(speedMph: number) {
  return Math.max(MIN_SIGHT_TRIANGLE_FT, speedMph * 1.2);
}

export function violatesSightTriangle(candidate: CandidateLocation) {
  return (
    candidate.type === "at" &&
    candidate.distanceToTurn <= sightTriangleClearanceFt(candidate.speedEstimate)
  );
}
