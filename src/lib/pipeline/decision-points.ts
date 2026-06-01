import type { DecisionPoint, LatLng, ManeuverType, RouteData, RouteStep } from "@/lib/types";
import { bearingDegrees, bearingDeltaDegrees, haversineDistanceFeet } from "@/lib/utils/geo";

const DECISION_MANEUVERS = new Set<ManeuverType>([
  "turn-left",
  "turn-right",
  "turn-slight-left",
  "turn-slight-right",
  "turn-sharp-left",
  "turn-sharp-right",
  "roundabout-left",
  "roundabout-right",
  "fork-left",
  "fork-right",
  "merge",
  "name-change",
]);

// Drop a "keep straight" confirmation sign roughly every quarter mile of road so long legs
// between turns still get coverage. Without these, a route only yields ~1 selectable sign per
// turn, so short/turn-sparse routes can't reach the agent's requested sign count.
const CONFIRMATION_SPACING_FT = 1_320;
// Don't place a confirmation sign right next to an actual turn or the property.
const CONFIRMATION_MIN_GAP_FT = 300;

export function extractDecisionPoints(route: RouteData): DecisionPoint[] {
  const points: DecisionPoint[] = route.steps
    .map((step, index) => toDecisionPoint(step, index + 1, cumulativeDistance(route.steps, index)))
    .filter((point): point is NonNullable<ReturnType<typeof toDecisionPoint>> => Boolean(point));

  if (route.steps.length < 5) {
    points.push(...extractPolylineFallbackPoints(route, points.length + 1));
  }

  const finalStep = route.steps.at(-1);
  const propertyPoint = finalStep?.end;
  const avoid = propertyPoint ? [...points, { ...propertyPoint } as DecisionPoint] : points;
  points.push(...extractConfirmationPoints(route, points.length + 1, avoid));

  if (finalStep) {
    points.push({
      ...finalStep.end,
      maneuverType: "straight",
      roadName: "property",
      distanceFromPrior: finalStep.distance,
      speedEstimate: estimateSpeedMph(finalStep),
      turnNumber: points.length + 1,
      approachBearing: bearingDegrees(finalStep.start, finalStep.end),
      isProperty: true,
    });
  }

  return points;
}

function toDecisionPoint(step: RouteStep, turnNumber: number, distanceFromPrior: number) {
  if (!DECISION_MANEUVERS.has(step.maneuverType)) {
    return null;
  }

  return {
    ...step.end,
    maneuverType: step.maneuverType,
    roadName: step.roadName,
    distanceFromPrior,
    speedEstimate: estimateSpeedMph(step),
    turnNumber,
    approachBearing: bearingDegrees(step.start, step.end),
  };
}

function extractConfirmationPoints(route: RouteData, startingTurnNumber: number, avoid: LatLng[]): DecisionPoint[] {
  const pts = route.polylinePoints;
  if (pts.length < 2) {
    return [];
  }

  const out: DecisionPoint[] = [];
  let sinceLast = 0;

  for (let index = 1; index < pts.length; index += 1) {
    sinceLast += haversineDistanceFeet(pts[index - 1], pts[index]);

    if (sinceLast < CONFIRMATION_SPACING_FT) {
      continue;
    }

    const location = pts[index];
    const tooCloseToTurn = [...avoid, ...out].some(
      (point) => haversineDistanceFeet(point, location) < CONFIRMATION_MIN_GAP_FT,
    );

    if (tooCloseToTurn) {
      continue;
    }

    out.push({
      ...location,
      maneuverType: "straight",
      roadName: "along the route",
      distanceFromPrior: sinceLast,
      speedEstimate: 25,
      turnNumber: startingTurnNumber + out.length,
      approachBearing: bearingDegrees(pts[index - 1], location),
    });
    sinceLast = 0;
  }

  return out;
}

function extractPolylineFallbackPoints(route: RouteData, startingTurnNumber: number) {
  const points: DecisionPoint[] = [];
  const polylinePoints = route.polylinePoints;

  for (let index = 2; index < polylinePoints.length; index += 1) {
    const previous = polylinePoints[index - 2];
    const current = polylinePoints[index - 1];
    const next = polylinePoints[index];
    const segmentDistance = haversineDistanceFeet(previous, current);

    if (segmentDistance < 50) {
      continue;
    }

    const priorBearing = bearingDegrees(previous, current);
    const nextBearing = bearingDegrees(current, next);
    const delta = bearingDeltaDegrees(priorBearing, nextBearing);

    if (delta <= 30 || isChicane(polylinePoints, index - 1, priorBearing)) {
      continue;
    }

    points.push({
      ...current,
      maneuverType: "turn-left",
      roadName: "polyline turn",
      distanceFromPrior: segmentDistance,
      speedEstimate: 25,
      turnNumber: startingTurnNumber + points.length,
      approachBearing: priorBearing,
    });
  }

  return points;
}

function isChicane(points: LatLng[], currentIndex: number, originalBearing: number) {
  for (let index = currentIndex + 1; index < points.length; index += 1) {
    const distance = haversineDistanceFeet(points[currentIndex], points[index]);

    if (distance > 200) {
      return false;
    }

    const bearing = bearingDegrees(points[currentIndex], points[index]);

    if (bearingDeltaDegrees(originalBearing, bearing) < 15) {
      return true;
    }
  }

  return false;
}

function cumulativeDistance(steps: RouteStep[], index: number) {
  return steps.slice(0, index + 1).reduce((total, step) => total + step.distance, 0);
}

function estimateSpeedMph(step: RouteStep) {
  // Derive the real speed from the traffic-aware duration the Routes API already returns,
  // instead of bucketing into fixed guesses. Clamp to a realistic road-speed range.
  if (step.distance <= 0 || step.duration <= 0) {
    return step.maneuverType === "merge" ? 65 : 35;
  }

  const mph = (step.distance / step.duration) * 2.23694;

  return Math.round(Math.min(75, Math.max(10, mph)));
}
