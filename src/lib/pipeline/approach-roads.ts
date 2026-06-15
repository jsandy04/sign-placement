import { computeRoutes as computeGoogleRoute } from "@/lib/services/google-maps";
import { maxApproachesForSignCount } from "@/lib/rules/placement";
import type { ApproachRoad, LatLng, RouteStep } from "@/lib/types";
import { bearingDeltaDegrees, destinationPoint } from "@/lib/utils/geo";

// Shoot 8 rays (every 45°) instead of 4 cardinals so diagonal arterials aren't missed.
const RAY_BEARINGS = [0, 45, 90, 135, 180, 225, 270, 315];
// Keep selected approaches reasonably far apart in direction so signs come from multiple
// sides of the property rather than clustering on one corridor. Soft preference (60°),
// relaxed to a 30° floor when backfilling so we never sacrifice a busy arterial for spread.
const MIN_APPROACH_SEPARATION_DEG = 60;
const HARD_APPROACH_SEPARATION_DEG = 30;
const MAX_APPROACH_ROADS = 3;
// Search 1 mile out — far enough to reliably reach a feeding arterial in suburban grids.
// This is only the DISCOVERY distance; the trail itself is anchored to the arterial turn-off
// (see arterialTurnOff), so a wide search does NOT push signs far from the house. We deliberately
// keep this wide regardless of sign budget: shrinking it just produces shorter routes with fewer
// decision points, which starves the trail. Budget-driven *placement* radius is a separate clamp
// (planned for the per-property strategy/classifier layer), not a discovery shrink.
const DISCOVERY_RADIUS_FT = 5_280;
// Minimum speed for a step to count as a real arterial (vs. a residential street).
const ARTERIAL_MPH = 30;

interface ApproachCandidate extends ApproachRoad {
  bearing: number;
  classScore: number;
}

export async function findApproachRoads(origin: LatLng, signCount: number): Promise<ApproachRoad[]> {
  // Sign budget governs how many directions the trail can cover (min ~3 signs per direction).
  const maxApproaches = Math.min(MAX_APPROACH_ROADS, maxApproachesForSignCount(signCount));
  const attempts = await Promise.allSettled(
    RAY_BEARINGS.map(async (bearing) => {
      const rayEnd = destinationPoint(origin, bearing, DISCOVERY_RADIUS_FT);
      // Route in the real approach direction (incoming traffic → property) so we can
      // see which roads actually feed the property from this bearing.
      const route = await computeGoogleRoute(rayEnd, origin);
      const arterial = fastestStep(route.steps);
      // Anchor the trail where the driver TURNS OFF the arterial toward the house, not at the
      // raw ray endpoint (which can sit deep inside the subdivision) and not far out on the
      // arterial. Falls back to the snapped route start if no real arterial is on this route.
      const approachPoint = arterialTurnOff(route.steps) ?? route.steps[0]?.start ?? rayEnd;

      return {
        name: arterial?.roadName ?? route.steps[0]?.roadName ?? "Approach road",
        lat: approachPoint.lat,
        lng: approachPoint.lng,
        distance: route.distance,
        bearing,
        classScore: estimateRoadClassScore(arterial?.distance ?? 0, arterial?.duration ?? 0),
      } satisfies ApproachCandidate;
    }),
  );

  for (const [index, result] of attempts.entries()) {
    if (result.status === "rejected") {
      console.error(`[approach-roads] bearing ${RAY_BEARINGS[index]} failed:`, result.reason);
    }
  }

  const candidates = attempts
    .filter((result): result is PromiseFulfilledResult<ApproachCandidate> => result.status === "fulfilled")
    .map((result) => result.value)
    .sort((a, b) => b.classScore - a.classScore);

  return selectDistinctApproaches(candidates, maxApproaches).map((road) => ({
    name: road.name,
    lat: road.lat,
    lng: road.lng,
    distance: road.distance,
  }));
}

// Greedily keep the highest-scoring approaches while enforcing directional spread and
// avoiding duplicates of the same arterial (same corridor approached from two angles).
// Candidates are pre-sorted by traffic score, so the busiest arterial is always picked first.
function selectDistinctApproaches(candidates: ApproachCandidate[], maxApproaches: number): ApproachCandidate[] {
  const selected: ApproachCandidate[] = [];

  for (const candidate of candidates) {
    if (selected.length >= maxApproaches) {
      break;
    }

    const tooClose = selected.some(
      (chosen) => bearingDeltaDegrees(chosen.bearing, candidate.bearing) < MIN_APPROACH_SEPARATION_DEG,
    );
    const duplicateRoad = selected.some(
      (chosen) => chosen.name !== "Approach road" && chosen.name === candidate.name,
    );

    if (!tooClose && !duplicateRoad) {
      selected.push(candidate);
    }
  }

  // If the 60° preference left us short, backfill with the best remaining candidates that
  // are still at least 30° apart from what we have (and not the same road).
  if (selected.length < maxApproaches) {
    for (const candidate of candidates) {
      if (selected.length >= maxApproaches) {
        break;
      }
      if (selected.includes(candidate)) {
        continue;
      }
      const tooClose = selected.some(
        (chosen) => bearingDeltaDegrees(chosen.bearing, candidate.bearing) < HARD_APPROACH_SEPARATION_DEG,
      );
      const duplicateRoad = selected.some(
        (chosen) => chosen.name !== "Approach road" && chosen.name === candidate.name,
      );
      if (!tooClose && !duplicateRoad) {
        selected.push(candidate);
      }
    }
  }

  return selected;
}

// Find where the driver leaves the arterial and heads toward the house: the END of the last
// high-speed (arterial) step on the route (which runs arterial → property). That point is the
// turn-off into the neighborhood — the natural spot for the first directional sign.
function arterialTurnOff(steps: RouteStep[]): LatLng | undefined {
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    const step = steps[i];
    if (step.duration <= 0 || step.distance <= 0) {
      continue;
    }
    const mph = (step.distance / step.duration) * 2.23694;
    if (mph >= ARTERIAL_MPH) {
      return step.end;
    }
  }

  return undefined;
}

// Pick the highest-speed step on the route — the genuine arterial feeding the property,
// rather than the slow residential street right at the address.
function fastestStep(steps: { distance: number; duration: number; roadName?: string }[]) {
  let best: { distance: number; duration: number; roadName?: string } | undefined;
  let bestMph = -1;

  for (const step of steps) {
    if (step.duration <= 0 || step.distance <= 0) {
      continue;
    }
    const mph = (step.distance / step.duration) * 2.23694;
    if (mph > bestMph) {
      bestMph = mph;
      best = step;
    }
  }

  return best;
}

function estimateRoadClassScore(distanceMeters: number, durationSeconds: number) {
  if (durationSeconds <= 0) {
    return 0;
  }

  const mph = (distanceMeters / durationSeconds) * 2.23694;

  if (mph >= 40) {
    return 100;
  }

  if (mph >= 30) {
    return 65;
  }

  return 35;
}
