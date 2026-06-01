import { AFTER_TURN_CONFIRMATION_FT, recommendedOffsetFeet } from "@/lib/rules/placement";
import type { CandidateLocation, DecisionPoint, PlacementType } from "@/lib/types";
import { destinationPoint } from "@/lib/utils/geo";

export function generateCandidates(points: DecisionPoint[]): CandidateLocation[] {
  return points.flatMap((point) => {
    if (point.isProperty) {
      return [toCandidate(point, "property", "property", 0)];
    }

    const offset = recommendedOffsetFeet(point.speedEstimate);
    const before = destinationPoint(point, oppositeBearing(point.approachBearing ?? 0), offset);
    const after = destinationPoint(point, point.approachBearing ?? 0, AFTER_TURN_CONFIRMATION_FT);

    return [
      toCandidate({ ...point, ...before }, "before", placementTypeFor(point), offset),
      toCandidate(point, "at", placementTypeFor(point), 0),
      toCandidate({ ...point, ...after }, "after", placementTypeFor(point), AFTER_TURN_CONFIRMATION_FT),
    ];
  });
}

function toCandidate(
  point: DecisionPoint,
  type: CandidateLocation["type"],
  placementType: PlacementType,
  distanceToTurn: number,
): CandidateLocation {
  return {
    id: `turn-${point.turnNumber}-${type}`,
    lat: point.lat,
    lng: point.lng,
    turnNumber: point.turnNumber,
    type,
    placementType,
    maneuverType: point.maneuverType,
    roadName: point.roadName,
    distanceToTurn,
    recommendedOffset: recommendedOffsetFeet(point.speedEstimate),
    speedEstimate: point.speedEstimate,
    approachBearing: point.approachBearing,
  };
}

function placementTypeFor(point: DecisionPoint): PlacementType {
  if (point.maneuverType.startsWith("roundabout")) {
    return "roundabout";
  }

  if (point.turnNumber === 1) {
    return "entrance";
  }

  if (point.maneuverType === "straight" || point.roadName === "polyline turn") {
    return "midroute";
  }

  return "intersection";
}

function oppositeBearing(bearing: number) {
  return (bearing + 180) % 360;
}
