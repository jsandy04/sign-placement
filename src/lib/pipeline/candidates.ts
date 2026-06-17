import { AFTER_TURN_CONFIRMATION_FT, recommendedOffsetFeet } from "@/lib/rules/placement";
import type { CandidateLocation, DecisionPoint, PlacementType } from "@/lib/types";
import { destinationPoint } from "@/lib/utils/geo";

export function generateCandidates(points: DecisionPoint[]): CandidateLocation[] {
  // `index` makes candidate IDs globally unique. turnNumber resets per approach route, so
  // without it two routes both produce e.g. "turn-1-before" — which collides in the optimizer
  // lookup and violates the placements primary key when both are selected (DB insert 500).
  return points.flatMap((point, index) => {
    if (point.isProperty) {
      return [toCandidate(point, "property", "property", 0, index)];
    }

    const offset = recommendedOffsetFeet(point.speedEstimate);
    const before = destinationPoint(point, oppositeBearing(point.approachBearing ?? 0), offset);
    const after = destinationPoint(point, point.approachBearing ?? 0, AFTER_TURN_CONFIRMATION_FT);

    const candidates = [
      toCandidate({ ...point, ...before }, "before", placementTypeFor(point), offset, index),
      toCandidate({ ...point, ...after }, "after", placementTypeFor(point), AFTER_TURN_CONFIRMATION_FT, index),
    ];

    // §2.4: NEVER place a sign exactly at an intersection corner (sight-triangle hazard, illegal in
    // most jurisdictions). The "at" spot is only acceptable on a straightaway (entry / confirmation
    // points), never on a real turn — there we keep only "before" (lead) and "after" (confirmation).
    if (point.maneuverType === "straight") {
      candidates.push(toCandidate(point, "at", placementTypeFor(point), 0, index));
    }

    return candidates;
  });
}

function toCandidate(
  point: DecisionPoint,
  type: CandidateLocation["type"],
  placementType: PlacementType,
  distanceToTurn: number,
  index: number,
): CandidateLocation {
  return {
    id: `turn-${index}-${point.turnNumber}-${type}`,
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
    approachIndex: point.approachIndex,
  };
}

function placementTypeFor(point: DecisionPoint): PlacementType {
  if (point.maneuverType.startsWith("roundabout")) {
    return "roundabout";
  }

  // turnNumber 0 = the arterial entry sign; 1 = the first inner turn. Both are "entrance" spots.
  if (point.turnNumber <= 1) {
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
