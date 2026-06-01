import { computeRoutes as computeGoogleRoute } from "@/lib/services/google-maps";
import { extractDecisionPoints } from "./decision-points";
import type { ApproachRoad, LatLng, RouteData } from "@/lib/types";

export async function computeRoutes(property: LatLng, approaches: ApproachRoad[]): Promise<RouteData[]> {
  const attempts = await Promise.allSettled(
    approaches.map(async (approach) => {
      const route = await computeGoogleRoute(approach, property);
      const routeData: RouteData = {
        approachRoad: approach.name,
        distance: route.distance,
        duration: route.duration,
        polyline: route.polyline,
        steps: route.steps,
        polylinePoints: route.polylinePoints,
        decisionPoints: [],
      };
      const decisionPoints = extractDecisionPoints(routeData);

      return {
        ...routeData,
        decisionPoints,
        polylineFallbackActive: routeData.steps.length < 5,
      };
    }),
  );

  return attempts
    .filter((result): result is PromiseFulfilledResult<RouteData & { polylineFallbackActive: boolean }> => result.status === "fulfilled")
    .map((result) => result.value);
}
