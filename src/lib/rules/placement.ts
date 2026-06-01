export const MIN_SIGN_SPACING_FT = 50;
export const SOFT_SIGN_SPACING_FT = 500;
export const AFTER_TURN_CONFIRMATION_FT = 50;
export const APPROACH_ROAD_DISTANCE_FT = 7_920;

export function recommendedOffsetFeet(speedMph: number) {
  return Math.max(speedMph * 6, 100);
}
