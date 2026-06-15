export const MIN_SIGN_SPACING_FT = 50;
export const SOFT_SIGN_SPACING_FT = 500;
export const AFTER_TURN_CONFIRMATION_FT = 50;

// Default trail start radius: 0.5 mi (industry standard; agents won't drive 1.5 mi to place signs).
export const APPROACH_ROAD_DISTANCE_FT = 2_640;
// Absolute max radius (1 mi) for unusually isolated/rural properties or large sign budgets.
export const MAX_APPROACH_ROAD_DISTANCE_FT = 5_280;

// Sign-count guardrails (realtor time budget: a trail needs a floor to be followable,
// and an agent realistically can't place more than ~15 signs before an open house).
export const MIN_SIGNS = 5;
export const MAX_SIGNS = 15;
// Soft target for a followable direction (entry + turn + confirmation). Aim for this.
export const MIN_SIGNS_PER_APPROACH = 3;
// Hard floor for a SECONDARY direction: never open a 2nd/3rd route that can't carry at least
// this many signs (research Q1 — a 1-sign spur is unfollowable and just wastes the budget).
export const HARD_MIN_SIGNS_PER_APPROACH = 2;
// "Final block" radius (~1/8 mi, one Phoenix grid block): the near-property saturation zone.
export const FINAL_BLOCK_FT = 800;

// Sign count drives radius: more signs can reach further out, fewer signs stay tight.
export function approachRadiusForSignCount(signCount: number) {
  return Math.min(MAX_APPROACH_ROAD_DISTANCE_FT, APPROACH_ROAD_DISTANCE_FT + signCount * 200);
}

// How many approach directions a budget should open. Research Q1 + practitioner consensus:
// CONCENTRATE on one strong route rather than spreading thin. A small budget can't make a 2nd
// direction followable, so keep it to one; only fan out as the budget grows.
export function maxApproachesForSignCount(signCount: number) {
  if (signCount < 8) {
    return 1;
  }
  if (signCount < 12) {
    return 2;
  }
  return 3;
}

// Suggested sign count: property + arterial signs + one per turn on the primary approach.
export function recommendSignCount(primaryApproachTurns: number, additionalApproaches: number) {
  const raw = 3 + primaryApproachTurns + additionalApproaches * 2;
  return Math.min(MAX_SIGNS, Math.max(MIN_SIGNS, raw));
}

// Pre-turn lead distance. Arterials (>=35 mph) need closer to AASHTO stopping sight distance,
// so we use ~10 ft/mph there; residential streets keep the tighter ~6 ft/mph rule.
export function recommendedOffsetFeet(speedMph: number) {
  if (speedMph >= 35) {
    return Math.max(speedMph * 10, 150);
  }

  return Math.max(speedMph * 6, 100);
}

// Ideal spacing between signs, scaled by speed: tight on slow residential streets,
// wider on fast arterials where drivers cover ground quickly. Clamped to 250–800 ft.
export function idealSpacingFeet(speedMph: number) {
  return Math.min(800, Math.max(250, speedMph * 15));
}
