import { MIN_SIGN_SPACING_FT } from "@/lib/rules/placement";
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

// A SIGNABLE decision is a genuine fork-in-the-road where a driver could go the WRONG way and so
// needs a sign (new-tmfa.md Q2: "a sign at every turn where a driver could make a wrong decision" —
// NOT every maneuver). Slight/gentle bends, merges, and name-changes carry the driver through
// without a decision, so they don't need a sign. Counting every maneuver overcharges each route's
// followable minimum and starves multi-route coverage — this is what we size the budget against.
const SIGNABLE_DECISIONS = new Set<ManeuverType>([
  "turn-left",
  "turn-right",
  "turn-sharp-left",
  "turn-sharp-right",
  "roundabout-left",
  "roundabout-right",
  "fork-left",
  "fork-right",
]);

// How many signs a route REQUIRES to stay followable = signable decisions on it (the optimizer adds
// the entry + property-confirmation on top). Excludes the property point and obvious/forced moves.
export function countSignableDecisions(decisionPoints: DecisionPoint[]): number {
  return decisionPoints.filter((point) => !point.isProperty && SIGNABLE_DECISIONS.has(point.maneuverType)).length;
}

// Drop a "keep straight" confirmation sign roughly every block (~1/8 mi) of road so legs
// between turns get real coverage. Without these, a route only yields ~1 selectable sign per
// turn, so short/turn-sparse routes can't reach the agent's requested sign count. 660 ft sits
// just outside the 500 ft soft-spacing penalty, so candidates fill the trail without crowding;
// the optimizer's spacing rules still thin them out if the budget is small.
const CONFIRMATION_SPACING_FT = 660;
// Don't place a confirmation sign right next to an actual turn or the property.
const CONFIRMATION_MIN_GAP_FT = 300;
// F1 safety net: tighter spacing for advance signs generated on turn-sparse routes, and how far
// back from the property we'll walk to place them (stay within the near-approach zone).
const ADVANCE_SPACING_FT = 400;
const ADVANCE_MAX_BACK_FT = 2_640;

export function extractDecisionPoints(route: RouteData): DecisionPoint[] {
  const points: DecisionPoint[] = route.steps
    .map((step, index) => toDecisionPoint(step, index + 1, cumulativeDistance(route.steps, index)))
    .filter((point): point is NonNullable<ReturnType<typeof toDecisionPoint>> => Boolean(point));

  // Entry sign at the arterial turn-off — the route's start, where buyers leave the main road toward
  // the property. This is the single highest-visibility sign (domain-rules-answers.md §3.4) and the
  // anchor that makes the trail REACH OUT to the arterial instead of clustering at the inner turns
  // near the house. turnNumber 0 marks it as the entry (sorts first, one-per-turn-safe).
  const entry = entryPoint(route);
  if (entry) {
    points.unshift(entry);
  }

  if (route.steps.length < 5) {
    points.push(...extractPolylineFallbackPoints(route, points.length + 1));
  }

  const finalStep = route.steps.at(-1);
  const propertyPoint = finalStep?.end;
  const avoid = propertyPoint ? [...points, { ...propertyPoint } as DecisionPoint] : points;
  points.push(...extractConfirmationPoints(route, points.length + 1, avoid));

  // F1 safety net: if a route is so short/turn-sparse that it produced no real guidance points,
  // the agent would be left with only a house sign. Generate near-approach advance signs walking
  // back from the property so every route is at least minimally followable.
  if (propertyPoint && points.length < 2) {
    points.push(...extractAdvancePoints(route, points.length + 1, 3 - points.length));
  }

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

// Build the entry sign at the route start (the arterial turn-off). Skips when the route is too
// short to have a meaningful "out there" entry distinct from the near-house block, or when an actual
// turn already sits at the very start (it would double up).
function entryPoint(route: RouteData): DecisionPoint | undefined {
  const start = route.polylinePoints[0];
  const firstStep = route.steps[0];
  const property = route.steps.at(-1)?.end;
  if (!start || !firstStep || !property) {
    return undefined;
  }
  // Nothing to reach out to if the whole route sits inside the final block.
  if (haversineDistanceFeet(start, property) < CONFIRMATION_MIN_GAP_FT) {
    return undefined;
  }

  return {
    ...start,
    maneuverType: "straight",
    roadName: firstStep.roadName ?? "the main road",
    distanceFromPrior: 0,
    speedEstimate: estimateSpeedMph(firstStep),
    turnNumber: 0,
    approachBearing: bearingDegrees(firstStep.start, firstStep.end),
  };
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

// Walk the route polyline backward from the property, dropping advance signs at ~400 ft spacing
// within the near-approach zone. Used only as the F1 safety net when a route yields no real
// guidance points, so the trail near the destination is at least followable.
function extractAdvancePoints(route: RouteData, startingTurnNumber: number, count: number): DecisionPoint[] {
  const pts = route.polylinePoints;
  if (count <= 0 || pts.length < 2) {
    return [];
  }

  // Total drivable length of this (often short) route. Short approaches — a house just off the
  // arterial, an apartment with no internal turns — are exactly where the house-only failure bites.
  let totalFt = 0;
  for (let index = 1; index < pts.length; index += 1) {
    totalFt += haversineDistanceFeet(pts[index - 1], pts[index]);
  }
  // Genuinely degenerate route (anchor collapsed onto the property): nothing to place on.
  if (totalFt < MIN_SIGN_SPACING_FT) {
    return [];
  }

  // Use the fixed advance spacing when the route is long enough; otherwise divide the available
  // length so even a short route still yields `count` evenly-spaced advance signs. Without this a
  // ~360 ft route can't fit a single 400 ft-spaced sign and collapses to a house-only result (F1).
  const reach = Math.min(totalFt, ADVANCE_MAX_BACK_FT);
  const spacing = Math.min(ADVANCE_SPACING_FT, reach / (count + 1));

  const out: DecisionPoint[] = [];
  let sinceLast = 0;
  let backFromProperty = 0;

  for (let index = pts.length - 1; index > 0 && out.length < count; index -= 1) {
    const segment = haversineDistanceFeet(pts[index], pts[index - 1]);
    sinceLast += segment;
    backFromProperty += segment;

    if (backFromProperty > ADVANCE_MAX_BACK_FT) {
      break;
    }
    if (sinceLast < spacing) {
      continue;
    }

    const location = pts[index - 1];
    out.push({
      ...location,
      maneuverType: "straight",
      roadName: "approaching the property",
      distanceFromPrior: sinceLast,
      speedEstimate: 25,
      turnNumber: startingTurnNumber + out.length,
      approachBearing: bearingDegrees(pts[index - 1], pts[index]),
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
