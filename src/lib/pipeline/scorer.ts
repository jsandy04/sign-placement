import { SOFT_SIGN_SPACING_FT } from "@/lib/rules/placement";
import type { FilteredCandidate, ManeuverType, ScoredCandidate } from "@/lib/types";
import { haversineDistanceFeet } from "@/lib/utils/geo";

export function scoreCandidates(filtered: FilteredCandidate[]): ScoredCandidate[] {
  return filtered
    .map((candidate) => {
      const scoreBreakdown = {
        decisionPointCriticality: decisionPointScore(candidate.maneuverType),
        trafficVolume: trafficVolumeScore(candidate.speedEstimate),
        visibilityQuality: visibilityScore(candidate.distanceToTurn),
        approachSpeedAlignment: speedAlignmentScore(candidate.distanceToTurn, candidate.recommendedOffset),
        signSpacing: spacingScore(candidate, filtered),
      };
      const score =
        scoreBreakdown.decisionPointCriticality * 0.3 +
        scoreBreakdown.trafficVolume * 0.25 +
        scoreBreakdown.visibilityQuality * 0.2 +
        scoreBreakdown.approachSpeedAlignment * 0.15 +
        scoreBreakdown.signSpacing * 0.1;

      return {
        ...candidate,
        score: Math.min(100, Math.max(0, score)),
        scoreBreakdown,
      };
    })
    .sort((a, b) => b.score - a.score);
}

function decisionPointScore(maneuverType: ManeuverType) {
  if (maneuverType.startsWith("fork")) {
    return 100;
  }

  if (maneuverType.startsWith("turn")) {
    return 85;
  }

  if (maneuverType.startsWith("roundabout")) {
    return 80;
  }

  if (maneuverType === "merge") {
    return 60;
  }

  if (maneuverType === "straight") {
    return 40;
  }

  if (maneuverType === "name-change") {
    return 30;
  }

  return 40;
}

function trafficVolumeScore(speedMph: number) {
  // Real road speed is a proxy for road class / traffic exposure. Scale smoothly from
  // ~25 (slow residential, 20 mph) to 100 (arterial/highway, 50+ mph) instead of bucketing.
  const normalized = (speedMph - 20) / (50 - 20);

  return Math.min(100, Math.max(25, normalized * 100));
}

function visibilityScore(distanceToTurn: number) {
  return Math.min(100, Math.max(0, (distanceToTurn / 500) * 100));
}

function speedAlignmentScore(distanceToTurn: number, recommendedOffset: number) {
  if (recommendedOffset === 0) {
    return 100;
  }

  const delta = Math.abs(distanceToTurn - recommendedOffset);

  return Math.min(100, Math.max(0, 100 - (delta / recommendedOffset) * 100));
}

function spacingScore(candidate: FilteredCandidate, candidates: FilteredCandidate[]) {
  const nearest = candidates
    .filter((other) => other.id !== candidate.id)
    .map((other) => haversineDistanceFeet(candidate, other))
    .sort((a, b) => a - b)[0];

  if (nearest === undefined || nearest >= SOFT_SIGN_SPACING_FT) {
    return 100;
  }

  return Math.min(100, Math.max(0, ((nearest - 50) / (SOFT_SIGN_SPACING_FT - 50)) * 100));
}
