export const MIN_SIGN_SPACING_FT = 50;
export const SOFT_SIGN_SPACING_FT = 500;
export const AFTER_TURN_CONFIRMATION_FT = 50;

// Default trail start radius: 0.5 mi (industry standard; agents won't drive 1.5 mi to place signs).
export const APPROACH_ROAD_DISTANCE_FT = 2_640;
// Absolute max radius (1 mi) for unusually isolated/rural properties or large sign budgets.
export const MAX_APPROACH_ROAD_DISTANCE_FT = 5_280;

// Sign-count guardrails. Tuned for the 5–20 band, where the tool's value is highest: most realtors
// run ≤15 signs and want to maximize visibility with what they have. The ceiling can be lifted later
// for "power" realtors (15–30+ signs / assistants doing the placement) once the tool proves out —
// the allocation logic is count-agnostic, so raising MAX_SIGNS is all it takes.
export const MIN_SIGNS = 5;
export const MAX_SIGNS = 20;

// Per-approach followability is TURN-DRIVEN, not a fixed number (new-tmfa.md Q2): a driver needs an
// entry sign + one sign per turn + a confirmation near the property. So a 0-turn approach (property
// on the arterial) needs 2, a 1-turn approach needs 3, an N-turn approach needs N+2.
export const BASE_SIGNS_PER_APPROACH = 2; // entry + property confirmation
export const SIGNS_PER_TURN = 1;
// Near-property "final block" saturation: the shared last mile every approach funnels into. The
// property sign counts as one of these (new-tmfa.md Q5).
export const NEAR_HOUSE_TARGET = 3; // soft target incl. the property sign
export const NEAR_HOUSE_MIN = 2; // hard floor incl. the property sign
// "Final block" radius (~1/8 mi, one Phoenix grid block): the near-property saturation zone.
export const FINAL_BLOCK_FT = 800;

// Hard minimum signs to make an approach with `turnCount` turns followable (entry + per-turn +
// confirmation). Below this an approach is an unfollowable spur, so the budget can't open it.
export function hardMinSignsForApproach(turnCount: number) {
  return BASE_SIGNS_PER_APPROACH + SIGNS_PER_TURN * Math.max(0, turnCount);
}

// Sign count drives radius: more signs can reach further out, fewer signs stay tight.
export function approachRadiusForSignCount(signCount: number) {
  return Math.min(MAX_APPROACH_ROAD_DISTANCE_FT, APPROACH_ROAD_DISTANCE_FT + signCount * 200);
}

// How many approach directions a budget should open. Multi-route is the tool's differentiation
// (design-thesis.md): find every real approach the agent wouldn't scout manually. Gating per
// new-tmfa.md Q3/Q4 — looser than before, but 3 is the practical ceiling (diminishing returns +
// "spectacle" backlash + municipal caps); 4 only at large budgets for genuine big grids. The
// turn-driven budget check in the optimizer still drops any route the signs can't make followable.
export function maxApproachesForSignCount(signCount: number) {
  if (signCount < 8) {
    return 1;
  }
  if (signCount < 12) {
    return 2;
  }
  if (signCount < 16) {
    return 3;
  }
  return 4;
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
