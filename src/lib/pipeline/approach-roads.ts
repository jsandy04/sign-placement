import { computeRoutes as computeGoogleRoute } from "@/lib/services/google-maps";
import { APPROACH_ROAD_DISTANCE_FT } from "@/lib/rules/placement";
import type { ApproachRoad, LatLng } from "@/lib/types";
import { bearingDeltaDegrees, destinationPoint } from "@/lib/utils/geo";

// Shoot 8 rays (every 45°) instead of 4 cardinals so diagonal arterials aren't missed.
const RAY_BEARINGS = [0, 45, 90, 135, 180, 225, 270, 315];
// Keep selected approaches at least this far apart in direction so signs come from
// multiple sides of the property rather than clustering on one corridor.
const MIN_APPROACH_SEPARATION_DEG = 60;
const MAX_APPROACH_ROADS = 3;

interface ApproachCandidate extends ApproachRoad {
  bearing: number;
  classScore: number;
}

export async function findApproachRoads(origin: LatLng): Promise<ApproachRoad[]> {
  const attempts = await Promise.allSettled(
    RAY_BEARINGS.map(async (bearing) => {
      const rayEnd = destinationPoint(origin, bearing, APPROACH_ROAD_DISTANCE_FT);
      // Route in the real approach direction (incoming traffic → property) so we can
      // see which roads actually feed the property from this bearing.
      const route = await computeGoogleRoute(rayEnd, origin);
      const arterial = fastestStep(route.steps);
      // The route origin is snapped to a real road; use it instead of the raw ray endpoint.
      const approachPoint = route.steps[0]?.start ?? rayEnd;

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

  return selectDistinctApproaches(candidates).map((road) => ({
    name: road.name,
    lat: road.lat,
    lng: road.lng,
    distance: road.distance,
  }));
}

// Greedily keep the highest-scoring approaches while enforcing directional spread and
// avoiding duplicates of the same arterial (same corridor approached from two angles).
function selectDistinctApproaches(candidates: ApproachCandidate[]): ApproachCandidate[] {
  const selected: ApproachCandidate[] = [];

  for (const candidate of candidates) {
    if (selected.length >= MAX_APPROACH_ROADS) {
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

  // If directional spacing left us short, backfill with the best remaining candidates.
  if (selected.length < MAX_APPROACH_ROADS) {
    for (const candidate of candidates) {
      if (selected.length >= MAX_APPROACH_ROADS) {
        break;
      }
      if (!selected.includes(candidate)) {
        selected.push(candidate);
      }
    }
  }

  return selected;
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
