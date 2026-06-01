import { computeRoutes as computeGoogleRoute } from "@/lib/services/google-maps";
import { APPROACH_ROAD_DISTANCE_FT } from "@/lib/rules/placement";
import type { ApproachRoad, LatLng } from "@/lib/types";
import { destinationPoint } from "@/lib/utils/geo";

const CARDINAL_BEARINGS = [0, 90, 180, 270];

export async function findApproachRoads(origin: LatLng): Promise<ApproachRoad[]> {
  const attempts = await Promise.allSettled(
    CARDINAL_BEARINGS.map(async (bearing) => {
      const destination = destinationPoint(origin, bearing, APPROACH_ROAD_DISTANCE_FT);
      const route = await computeGoogleRoute(origin, destination);
      const firstStep = route.steps[0];

      return {
        name: firstStep?.roadName ?? "Approach road",
        lat: destination.lat,
        lng: destination.lng,
        distance: route.distance,
        classScore: estimateRoadClassScore(firstStep?.distance ?? 0, firstStep?.duration ?? 0),
      };
    }),
  );

  return attempts
    .filter((result): result is PromiseFulfilledResult<ApproachRoad & { classScore: number }> => result.status === "fulfilled")
    .map((result) => result.value)
    .sort((a, b) => b.classScore - a.classScore)
    .slice(0, 3)
    .map((road) => ({
      name: road.name,
      lat: road.lat,
      lng: road.lng,
      distance: road.distance,
    }));
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
