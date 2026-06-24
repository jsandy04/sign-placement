import { nanoid } from "nanoid";
import { insertAnalysis } from "@/lib/db/queries";
import {
  hardMinSignsForApproach,
  MAX_SIGNS,
  MIN_SIGNS,
  NEAR_HOUSE_TARGET,
  recommendedOffsetFeet,
} from "@/lib/rules/placement";
import { buildComplianceWarnings, LIABILITY_DISCLAIMER } from "@/lib/rules/ordinance-warnings";
import { fetchStreetViewImage } from "@/lib/services/google-maps";
import { judgeCorners, runStrategist, type CornerInput } from "@/lib/services/llm-strategist";
import { bearingDegrees, destinationPoint, haversineDistanceFeet, metersToFeet } from "@/lib/utils/geo";
import { findApproachRoads } from "./approach-roads";
import { countSignableDecisions } from "./decision-points";
import { geocode } from "./geocoder";
import { computeRoutes } from "./routing";
import type {
  ApproachOption,
  AnalyzeInput,
  CornerVerdict,
  DecisionPoint,
  DecisionPointBrief,
  LatLng,
  RouteData,
  RouteSummary,
  SignPlacement,
  SignPlacementResult,
  StrategistBriefing,
  StrategistDecision,
  StrategistSign,
} from "@/lib/types";

// High-effort Opus + a per-corner vision pass is slow on purpose (accuracy over speed). Give the
// whole pipeline real headroom — the old 60s ceiling was sized for a Haiku re-ranker.
const PIPELINE_TIMEOUT_MS = 300_000;
const PLACEMENT_SUFFIX = "Right side of the road, angled ~45° toward oncoming traffic.";

export async function analyze(input: AnalyzeInput): Promise<SignPlacementResult> {
  return withTimeout(runAnalysis(input), PIPELINE_TIMEOUT_MS);
}

async function runAnalysis(input: AnalyzeInput): Promise<SignPlacementResult> {
  const geocoded = await geocode(input.address);
  const property: LatLng = { lat: geocoded.lat, lng: geocoded.lng };
  const signCount = Math.min(MAX_SIGNS, Math.max(MIN_SIGNS, input.signCount));

  // Discovery stays deterministic geometry — ray-cast to find the genuine approaches. The LLM judges
  // which of them matter (it no longer scores roads with arithmetic).
  const approaches = await findApproachRoads(property, signCount);
  const routes = await computeRoutes(property, approaches);

  if (routes.length === 0) {
    return persist(input, geocoded, houseOnlyResult(property, "We couldn't compute any approach routes to this property."));
  }

  // Build the situation briefing + a lookup so we can turn the strategist's chosen decision-point ids
  // back into real points (it never emits coordinates).
  const pointById = new Map<string, { point: DecisionPoint; approachIndex: number }>();
  const briefingApproaches: ApproachOption[] = routes.map((route, approachIndex) => {
    const decisionPoints: DecisionPointBrief[] = route.decisionPoints.map((point, i) => {
      const id = `${approachIndex}-${i}`;
      pointById.set(id, { point, approachIndex });
      return {
        id,
        approachIndex,
        turnNumber: point.turnNumber,
        role: briefRole(point),
        maneuver: point.maneuverType,
        roadName: point.roadName,
        distanceFromPropertyFt: Math.round(haversineDistanceFeet(point, property)),
      };
    });

    const anchor = route.polylinePoints[0] ?? property;
    return {
      index: approachIndex,
      roadName: route.approachRoad,
      compass: `from the ${cardinal(bearingDegrees(property, anchor))}`,
      bearingDegrees: Math.round(bearingDegrees(anchor, property)),
      distanceFt: Math.round(metersToFeet(route.distance)),
      speedMph: approachSpeedMph(route),
      signableTurns: countSignableDecisions(route.decisionPoints),
      decisionPoints,
    };
  });

  const briefing: StrategistBriefing = {
    address: input.address,
    formattedAddress: geocoded.formattedAddress,
    signCount,
    propertyTypeHints: geocoded.resultTypes,
    approaches: briefingApproaches,
  };

  // DIAGNOSTIC: what did discovery actually find? (How many distinct approaches, which roads,
  // directions, distances, turn counts.) This tells us whether thin coverage is a discovery problem
  // or a strategy problem.
  console.log(
    `[diag] ${signCount} signs requested — discovery found ${briefingApproaches.length} approaches:\n` +
      briefingApproaches
        .map(
          (a) =>
            `  #${a.index} ${a.roadName} (${a.compass}, ${a.bearingDegrees}°) — ${a.distanceFt}ft, ${a.speedMph}mph, ${a.signableTurns} turns, ${a.decisionPoints.length} points`,
        )
        .join("\n"),
  );

  // Stage A — the LLM decides which approaches and which corners. Degrade to a minimal deterministic
  // trail if it fails, so the pipeline always returns something usable.
  let decision: StrategistDecision;
  let degradationLevel = 0;
  try {
    decision = await runStrategist(briefing);
  } catch (error) {
    console.error("[pipeline] strategist failed:", error);
    decision = deterministicFallback(routes);
    degradationLevel = 3;
  }

  // DIAGNOSTIC: what did the strategist decide to do with those approaches?
  console.log(
    `[diag] strategist chose approaches [${decision.chosen_approaches.join(", ")}] as "${decision.property_type}", ${decision.signs.length} signs:\n` +
      decision.signs
        .map((s) => `  ${s.role} @ approach#${s.approach_index} (point ${s.decision_point_id}, order ${s.order})`)
        .join("\n"),
  );

  // Stage C — geometry turns each chosen decision point into a precise, lead-distance-correct,
  // 45°-to-the-curb coordinate. The strategist picked WHICH; the math places it.
  const placements = decision.signs
    .map((sign) => placeSign(sign, pointById, property))
    .filter((placement): placement is PlacedSign => placement !== null);
  const ordered = dedupeColocated(orderForTrail(placements));

  // Stage B — read each corner's Street View and fold the verdict back in.
  const verdicts = await visionPass(ordered);

  const signPlacements: SignPlacement[] = ordered.map((placed, index) => {
    const verdict = verdicts.get(placed.id);
    return {
      id: placed.id,
      sortOrder: index + 1,
      lat: placed.lat,
      lng: placed.lng,
      description: descriptionFor(placed),
      reasoning: placed.sign.rationale,
      placementType: placementTypeFor(placed),
      flag: "none",
      isSelected: true,
      approachBearing: placed.approachBearing,
      approachIndex: placed.sign.approach_index,
      role: placed.sign.role,
      streetViewChecked: verdict !== undefined,
      visionUsable: verdict?.imageAvailable ? verdict.usable : undefined,
      visionNote: verdict?.note || undefined,
      hazards: verdict && verdict.hazards.length > 0 ? verdict.hazards : undefined,
    };
  });

  const fundedSet = new Set(decision.chosen_approaches);
  const reportedRoutes = buildRouteSummaries(routes, fundedSet);
  const primary = reportedRoutes.find((route) => route.status === "funded") ?? reportedRoutes[0];

  return persist(input, geocoded, {
    id: nanoid(10),
    placements: signPlacements,
    route: primary ?? houseRouteSummary(),
    routes: reportedRoutes,
    recommendedSignCount: recommendedSignCount(routes),
    complianceWarnings: buildComplianceWarnings(geocoded.formattedAddress),
    disclaimer: LIABILITY_DISCLAIMER,
    fullReasoning: decision.strategy_summary,
    degradationLevel,
    costs: { maps: 0, llm: 0 },
  });
}

// === geometry: a chosen decision point → a real sign coordinate ===

interface PlacedSign extends LatLng {
  id: string;
  sign: StrategistSign;
  point: DecisionPoint;
  approachBearing?: number;
}

function placeSign(
  sign: StrategistSign,
  pointById: Map<string, { point: DecisionPoint; approachIndex: number }>,
  property: LatLng,
): PlacedSign | null {
  const entry = pointById.get(sign.decision_point_id);
  if (!entry) {
    return null;
  }
  const { point } = entry;

  let coordinate: LatLng;
  if (point.isProperty) {
    coordinate = property;
  } else if (isRealTurn(point) && point.approachBearing !== undefined) {
    // Lead the turn: place the sign back along the approach so a driver has room to react.
    coordinate = destinationPoint(point, oppositeBearing(point.approachBearing), recommendedOffsetFeet(point.speedEstimate));
  } else {
    coordinate = { lat: point.lat, lng: point.lng };
  }

  return { ...coordinate, id: sign.decision_point_id, sign, point, approachBearing: point.approachBearing };
}

function isRealTurn(point: DecisionPoint) {
  return (
    point.maneuverType.startsWith("turn") ||
    point.maneuverType.startsWith("roundabout") ||
    point.maneuverType.startsWith("fork")
  );
}

function oppositeBearing(bearing: number) {
  return (bearing + 180) % 360;
}

// Present signs grouped by approach and in the strategist's driving order; the property sign sorts last.
function orderForTrail(placements: PlacedSign[]): PlacedSign[] {
  return [...placements].sort((a, b) => {
    if (a.sign.role === "property") return 1;
    if (b.sign.role === "property") return -1;
    const approachDelta = a.sign.approach_index - b.sign.approach_index;
    if (approachDelta !== 0) return approachDelta;
    return a.sign.order - b.sign.order;
  });
}

// Two signs at the same spot is the "double-signed turn" bug — and it's also where the real value is:
// when approaches overlap, ONE sign on the shared segment serves both routes. Drop any sign that lands
// within DEDUP_FT of one we already kept (trail order = priority). The mandatory property sign always
// stays.
const DEDUP_FT = 100;
function dedupeColocated(placements: PlacedSign[]): PlacedSign[] {
  const kept: PlacedSign[] = [];
  for (const placed of placements) {
    if (placed.sign.role === "property") {
      kept.push(placed);
      continue;
    }
    const collides = kept.some((other) => other.id === placed.id || haversineDistanceFeet(other, placed) < DEDUP_FT);
    if (!collides) {
      kept.push(placed);
    }
  }
  return kept;
}

// === Stage B: vision pass over the placed corners ===

async function visionPass(placements: PlacedSign[]): Promise<Map<string, CornerVerdict>> {
  const verdicts = new Map<string, CornerVerdict>();
  const corners: CornerInput[] = [];

  const fetched = await Promise.all(
    placements
      .filter((placed) => placed.sign.role !== "property")
      .map(async (placed) => ({
        placed,
        image: await fetchStreetViewImage(placed, placed.approachBearing ?? 0).catch(() => null),
      })),
  );

  for (const { placed, image } of fetched) {
    if (image) {
      corners.push({
        decisionPointId: placed.id,
        role: placed.sign.role,
        roadName: placed.point.roadName,
        image,
      });
    } else {
      // No Street View coverage — record a pass-through so the agent knows it wasn't checked.
      verdicts.set(placed.id, {
        decision_point_id: placed.id,
        usable: true,
        confidence: 0,
        hazards: [],
        note: "No Street View coverage here — check this corner in person.",
        imageAvailable: false,
      });
    }
  }

  if (corners.length > 0) {
    try {
      for (const verdict of await judgeCorners(corners)) {
        verdicts.set(verdict.decision_point_id, verdict);
      }
    } catch (error) {
      console.error("[pipeline] vision pass failed:", error);
    }
  }

  return verdicts;
}

// === descriptions, roles, summaries ===

function briefRole(point: DecisionPoint): DecisionPointBrief["role"] {
  if (point.isProperty) return "property";
  if (point.turnNumber === 0) return "entry";
  if (point.maneuverType === "straight") return "confirmation";
  return "turn";
}

function descriptionFor(placed: PlacedSign): string {
  const road = placed.point.roadName && placed.point.roadName !== "the main road" ? ` ${placed.point.roadName}` : "";
  switch (placed.sign.role) {
    case "property":
      return "Mandatory — final sign at the property address.";
    case "entry":
      return `First sign — where drivers turn off${road || " the main road"} toward the property (highest-visibility spot). ${PLACEMENT_SUFFIX}`;
    case "turn":
      return `Sign before the turn${road ? ` onto${road}` : ""} so drivers know where to go. ${PLACEMENT_SUFFIX}`;
    case "confirmation":
      return `Confirmation sign to keep drivers on track${road ? ` along${road}` : ""}. ${PLACEMENT_SUFFIX}`;
    case "near-house":
      return `Near the property — within sight of the open house. ${PLACEMENT_SUFFIX}`;
    default:
      return `Directional sign. ${PLACEMENT_SUFFIX}`;
  }
}

function placementTypeFor(placed: PlacedSign): SignPlacement["placementType"] {
  if (placed.sign.role === "property") return "property";
  if (placed.point.maneuverType.startsWith("roundabout")) return "roundabout";
  if (placed.sign.role === "entry") return "entrance";
  if (placed.sign.role === "turn") return "intersection";
  return "midroute";
}

function buildRouteSummaries(routes: RouteData[], fundedSet: Set<number>): RouteSummary[] {
  return routes
    .map((route, index) => {
      const funded = fundedSet.has(index);
      return {
        approachRoad: route.approachRoad,
        distance: route.distance,
        duration: route.duration,
        polyline: route.polyline,
        status: funded ? ("funded" as const) : ("available" as const),
        signsToUnlock: funded ? undefined : hardMinSignsForApproach(countSignableDecisions(route.decisionPoints)),
      };
    })
    .sort((a, b) => (a.status === b.status ? 0 : a.status === "funded" ? -1 : 1));
}

function recommendedSignCount(routes: RouteData[]): number {
  const approachTotal = routes.reduce(
    (sum, route) => sum + hardMinSignsForApproach(countSignableDecisions(route.decisionPoints)),
    0,
  );
  return Math.min(MAX_SIGNS, approachTotal + NEAR_HOUSE_TARGET);
}

// Minimal deterministic plan when the strategist can't be reached: the busiest route's entry + the
// property sign. Keeps the pipeline returning something followable-ish rather than nothing.
function deterministicFallback(routes: RouteData[]): StrategistDecision {
  const signs: StrategistSign[] = [];
  const entry = routes[0]?.decisionPoints.findIndex((point) => point.turnNumber === 0);
  if (entry !== undefined && entry >= 0) {
    signs.push({ decision_point_id: `0-${entry}`, approach_index: 0, role: "entry", rationale: "Entry sign at the main turn-off.", order: 1 });
  }
  const propertyIndex = routes[0]?.decisionPoints.findIndex((point) => point.isProperty);
  if (propertyIndex !== undefined && propertyIndex >= 0) {
    signs.push({ decision_point_id: `0-${propertyIndex}`, approach_index: 0, role: "property", rationale: "Final sign at the property.", order: 99 });
  }
  return {
    strategy_summary: "Automated planning was unavailable, so this shows a minimal trail on the busiest approach. Re-run for a full plan.",
    property_type: "unknown",
    chosen_approaches: [0],
    signs,
  };
}

function houseOnlyResult(property: LatLng, message: string): SignPlacementResult {
  return {
    id: nanoid(10),
    placements: [
      {
        id: "property",
        sortOrder: 1,
        lat: property.lat,
        lng: property.lng,
        description: "Mandatory — sign at the property address.",
        reasoning: message,
        placementType: "property",
        flag: "none",
        isSelected: true,
        role: "property",
      },
    ],
    route: houseRouteSummary(),
    routes: [],
    fullReasoning: message,
    degradationLevel: 5,
    costs: { maps: 0, llm: 0 },
  };
}

function houseRouteSummary(): RouteSummary {
  return { approachRoad: "Route unavailable", distance: 0, duration: 0, polyline: "" };
}

function approachSpeedMph(route: RouteData): number {
  let best = 25;
  for (const step of route.steps) {
    if (step.distance > 0 && step.duration > 0) {
      best = Math.max(best, Math.round((step.distance / step.duration) * 2.23694));
    }
  }
  return best;
}

function cardinal(bearing: number): string {
  const dirs = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];
  return dirs[Math.round(((bearing % 360) / 45)) % 8];
}

async function persist(
  input: AnalyzeInput,
  geocoded: { formattedAddress: string; lat: number; lng: number },
  result: SignPlacementResult,
): Promise<SignPlacementResult> {
  return insertAnalysis({
    id: result.id,
    address: input.address,
    formattedAddress: geocoded.formattedAddress,
    lat: geocoded.lat,
    lng: geocoded.lng,
    signCount: input.signCount,
    status: result.degradationLevel === 0 ? "complete" : "degraded",
    degradationLevel: result.degradationLevel,
    result,
  });
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error("Pipeline timed out")), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}
