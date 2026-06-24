import { computeRoutes as computeGoogleRoute } from "@/lib/services/google-maps";
import type { ApproachRoad, LatLng, RouteStep } from "@/lib/types";
import { bearingDeltaDegrees, destinationPoint, haversineDistanceFeet } from "@/lib/utils/geo";

// Shoot 8 rays (every 45°) instead of 4 cardinals so diagonal arterials aren't missed.
const RAY_BEARINGS = [0, 45, 90, 135, 180, 225, 270, 315];
// Keep selected approaches reasonably far apart in direction so signs come from multiple
// sides of the property rather than clustering on one corridor. Soft preference (60°),
// relaxed to a 30° floor when backfilling so we never sacrifice a busy arterial for spread.
const MIN_APPROACH_SEPARATION_DEG = 60;
const HARD_APPROACH_SEPARATION_DEG = 30;
const MAX_APPROACH_ROADS = 5;
// Fixed discovery radius (~0.6 mi). It reflects where the property's arterials actually are, NOT the
// sign budget — scaling reach with budget was the "more signs = one longer trail to the freeway" bug.
const DISCOVERY_RADIUS_FT = 3_168;
// Same-road dedup is bearing-aware (new-tmfa.md Q1): NB and SB traffic on the same arterial are two
// distinct approaches ("half the audience never sees the sign" with one-direction coverage). Only
// merge two same-named approaches when they come from roughly the SAME direction (within 40°); when
// their bearings are opposed, keep both.
const SAME_ROAD_BEARING_MERGE_THRESHOLD = 40;
// Minimum speed for a step to count as a real arterial (vs. a residential street).
const ARTERIAL_MPH = 30;
// Minimum trail length: the anchor must sit at least this far back from the property so there's
// room for at least a couple of signs. Without this, a fast road that runs right to the door (the
// rural case) anchors on the property itself, collapsing the route to 0 ft and yielding a
// house-only result. When the natural turn-off lands closer than this, we walk back along the
// route to give the trail a body.
const MIN_TRAIL_FT = 1_000;

interface ApproachCandidate extends ApproachRoad {
  bearing: number;
  classScore: number;
}

export async function findApproachRoads(origin: LatLng): Promise<ApproachRoad[]> {
  // Surface MORE approaches than the budget can fund so the LLM strategist has real options to judge
  // — including the third/fourth way in a realtor would think of (e.g. out to a different arterial).
  // Discovery is geometry; the strategist decides which of these actually matter, and the UI shows
  // the rest as "available — needs +N signs" (design-thesis "surface, don't mandate").
  const maxApproaches = MAX_APPROACH_ROADS;
  // More signs should buy broader coverage and density near the house — NOT a trail that reaches
  // farther out. So the search radius is fixed, decoupled from the budget.
  const discoveryRadiusFt = DISCOVERY_RADIUS_FT;
  const attempts = await Promise.allSettled(
    RAY_BEARINGS.map(async (bearing) => {
      const rayEnd = destinationPoint(origin, bearing, discoveryRadiusFt);
      // Route in the real approach direction (incoming traffic → property) so we can
      // see which roads actually feed the property from this bearing.
      const route = await computeGoogleRoute(rayEnd, origin);
      const arterial = fastestStep(route.steps);
      // Anchor the trail where the driver TURNS OFF the arterial toward the house, not at the
      // raw ray endpoint (which can sit deep inside the subdivision) and not far out on the
      // arterial. Falls back to the snapped route start if no real arterial is on this route.
      const rawAnchor = arterialTurnOff(route.steps) ?? route.steps[0]?.start ?? rayEnd;
      // Guarantee a followable trail length: if the turn-off collapsed onto the property (a fast
      // rural road running to the door), walk back along the route so the trail has a body.
      const approachPoint =
        haversineDistanceFeet(rawAnchor, origin) >= MIN_TRAIL_FT
          ? rawAnchor
          : pointBackFromProperty(route.polylinePoints, MIN_TRAIL_FT) ?? rawAnchor;

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
    const duplicateRoad = selected.some((chosen) => sameDirectionDuplicate(chosen, candidate));

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
      const duplicateRoad = selected.some((chosen) => sameDirectionDuplicate(chosen, candidate));
      if (!tooClose && !duplicateRoad) {
        selected.push(candidate);
      }
    }
  }

  return selected;
}

// Two approaches are the SAME approach only when they're the same named road AND come from roughly
// the same direction. Opposite directions on one arterial (NB vs SB 75th Ave) are kept as distinct
// approaches so the trail catches traffic from both sides (new-tmfa.md Q1).
function sameDirectionDuplicate(chosen: ApproachCandidate, candidate: ApproachCandidate) {
  if (chosen.name === "Approach road" || chosen.name !== candidate.name) {
    return false;
  }
  return bearingDeltaDegrees(chosen.bearing, candidate.bearing) < SAME_ROAD_BEARING_MERGE_THRESHOLD;
}

// Walk the route polyline back from the property (the route runs approach → property, so its last
// point is the property) until we're at least `minFt` away, and return that point. Used to pull a
// collapsed anchor back from the door so the trail has room for signs. Falls back to the farthest
// point on the route when the whole route is shorter than `minFt`.
function pointBackFromProperty(polylinePoints: LatLng[], minFt: number): LatLng | undefined {
  if (polylinePoints.length < 2) {
    return undefined;
  }

  let accumulated = 0;
  for (let index = polylinePoints.length - 1; index > 0; index -= 1) {
    accumulated += haversineDistanceFeet(polylinePoints[index], polylinePoints[index - 1]);
    if (accumulated >= minFt) {
      return polylinePoints[index - 1];
    }
  }

  return polylinePoints[0];
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

// The best sign corridor is a major SURFACE arterial: fast enough to carry real traffic, slow
// enough that drivers can read a yard sign and you can legally place one. Score therefore PEAKS at
// arterial speed and DROPS for freeway speed — you can't sign a freeway, and anchoring a trail on
// one sends the agent to a road no sign can sit on. A monotonic speed score wrongly tied freeways
// with arterials and let the 101 outrank 75th Ave.
const FREEWAY_MPH = 57; // at/above this it's effectively limited-access — not a sign corridor
const ARTERIAL_MIN_MPH = 35; // major surface arterial floor — the ideal corridor

function estimateRoadClassScore(distanceMeters: number, durationSeconds: number) {
  if (durationSeconds <= 0) {
    return 0;
  }

  const mph = (distanceMeters / durationSeconds) * 2.23694;

  if (mph >= FREEWAY_MPH) {
    return 25; // freeway / limited-access — deprioritize hard
  }

  if (mph >= ARTERIAL_MIN_MPH) {
    return 100; // major surface arterial — the ideal sign corridor
  }

  if (mph >= 30) {
    return 65; // collector
  }

  return 35; // residential
}
