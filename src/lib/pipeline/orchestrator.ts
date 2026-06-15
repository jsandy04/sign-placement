import { nanoid } from "nanoid";
import { insertAnalysis } from "@/lib/db/queries";
import { MAX_SIGNS, MIN_SIGNS, recommendSignCount } from "@/lib/rules/placement";
import { buildComplianceWarnings, LIABILITY_DISCLAIMER } from "@/lib/rules/ordinance-warnings";
import { findApproachRoads } from "./approach-roads";
import { generateCandidates } from "./candidates";
import { geocode } from "./geocoder";
import { applyHardConstraints } from "./hard-constraints";
import { llmEvaluate } from "./llm";
import { selectTopN } from "./optimizer";
import { computeRoutes } from "./routing";
import { scoreCandidates } from "./scorer";
import type { AnalyzeInput, LLMRankedResult, RouteData, ScoredCandidate, SignPlacementResult } from "@/lib/types";

const PIPELINE_TIMEOUT_MS = 60_000;

export async function analyze(input: AnalyzeInput): Promise<SignPlacementResult> {
  return withTimeout(runAnalysis(input), PIPELINE_TIMEOUT_MS);
}

async function runAnalysis(input: AnalyzeInput) {
  const geocoded = await geocode(input.address);
  const property = { lat: geocoded.lat, lng: geocoded.lng };
  // Keep the sign budget within followable bounds (a trail needs a floor; an agent can't
  // realistically place more than ~15 before an open house). Drives radius + approach count.
  const signCount = Math.min(MAX_SIGNS, Math.max(MIN_SIGNS, input.signCount));
  const approaches = await findApproachRoads(property, signCount);
  const routes = await computeRoutes(property, approaches);
  const routeFailureCount = Math.max(0, approaches.length - routes.length);
  // Tag each decision point with the route it came from so the optimizer can allocate the
  // sign budget fairly across approaches (otherwise one route can hog every sign).
  const allDecisionPoints = routes.flatMap((route, routeIndex) =>
    route.decisionPoints.map((point) => ({ ...point, approachIndex: routeIndex })),
  );
  const fallbackDecisionPoints =
    allDecisionPoints.length > 0
      ? allDecisionPoints
      : [
          {
            ...property,
            maneuverType: "straight" as const,
            roadName: "property",
            distanceFromPrior: 0,
            speedEstimate: 25,
            turnNumber: 1,
            isProperty: true,
            approachIndex: 0,
          },
        ];
  const rawCandidates = generateCandidates(fallbackDecisionPoints);
  const filteredCandidates = applyHardConstraints(rawCandidates);
  const scoredCandidates = scoreCandidates(filteredCandidates);
  const routeContext = {
    address: input.address,
    formattedAddress: geocoded.formattedAddress,
    property,
    signCount,
    routes,
  };
  const llmCandidateCount = Math.max(signCount * 3, signCount);
  let llmResult: LLMRankedResult;
  let degradationLevel = degradationForRoutes(routes, routeFailureCount);

  try {
    llmResult = await llmEvaluate(scoredCandidates.slice(0, llmCandidateCount), routeContext);
  } catch (error) {
    console.error("[pipeline] LLM failed:", error);
    degradationLevel = Math.max(degradationLevel, 3);
    llmResult = deterministicLLMResult(scoredCandidates);
  }

  // Turns per approach (route index → turn count) so the optimizer can size each route's
  // followable minimum (entry + per-turn + confirmation). Confirmation/advance signs ("straight")
  // and the property point don't count as turns.
  const approachTurnCounts = new Map<number, number>(
    routes.map((route, routeIndex) => [
      routeIndex,
      route.decisionPoints.filter((point) => !point.isProperty && point.maneuverType !== "straight").length,
    ]),
  );
  const placements = selectTopN(scoredCandidates, llmResult, signCount, property, approachTurnCounts);
  // F2: only surface routes that actually received a directional sign. The optimizer concentrates
  // the budget (research Q1), so a computed route can end up with zero signs — drawing its polyline
  // would tell the agent to drive a road that has no signs on it. Keep the route↔sign mapping honest.
  const usedApproachIndices = new Set(
    placements
      .filter((placement) => placement.placementType !== "property")
      .map((placement) => placement.approachIndex ?? 0),
  );
  // If nothing mapped to a route (only the house sign survived — a degenerate approach with no
  // followable trail), report no routes rather than drawing a sign-less polyline. The map still
  // anchors on the property marker, and we keep the route↔sign mapping honest (no phantom route).
  const reportedRoutes = routes.filter((_, index) => usedApproachIndices.has(index));
  const primaryRoute = primaryRouteFor(reportedRoutes);
  const primaryTurns = (reportedRoutes[0]?.decisionPoints ?? []).filter((point) => !point.isProperty).length;
  const result: SignPlacementResult = {
    id: nanoid(10),
    placements,
    route: {
      approachRoad: primaryRoute.approachRoad,
      distance: primaryRoute.distance,
      duration: primaryRoute.duration,
      polyline: primaryRoute.polyline,
    },
    routes: reportedRoutes.map((route) => ({
      approachRoad: route.approachRoad,
      distance: route.distance,
      duration: route.duration,
      polyline: route.polyline,
    })),
    recommendedSignCount: recommendSignCount(primaryTurns, Math.max(0, reportedRoutes.length - 1)),
    complianceWarnings: buildComplianceWarnings(geocoded.formattedAddress),
    disclaimer: LIABILITY_DISCLAIMER,
    fullReasoning: llmResult.overall_assessment,
    degradationLevel: Math.max(degradationLevel, reportedRoutes.some((route) => route.polylineFallbackActive) ? 2 : 0),
    costs: {
      maps: 0,
      llm: 0,
    },
  };

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

// Degradation reflects how far short of the directions we *set out to open* we ended up — not the
// absolute route count. Q1 concentration deliberately opens a single approach for small budgets, so
// a clean 1-route plan is a success, not a degraded result. `routeFailureCount` is how many intended
// approaches failed to route (approaches found − routes computed).
function degradationForRoutes(routes: RouteData[], routeFailureCount: number) {
  if (routes.length === 0) {
    return 5; // nothing routed at all — total failure
  }

  if (routeFailureCount >= 2) {
    return 4; // multiple intended approaches failed to route
  }

  if (routeFailureCount === 1) {
    return 1; // a single intended approach failed
  }

  return 0; // got every direction we intended to open
}

function deterministicLLMResult(candidates: ScoredCandidate[]): LLMRankedResult {
  return {
    overall_assessment: "Detailed descriptions unavailable. Using standard ranking.",
    selected_signs: candidates.map((candidate) => ({
      turn_number: candidate.turnNumber,
      candidate_id: candidate.id,
      rationale: `Selected by standard ranking with score ${candidate.score.toFixed(1)}.`,
      confidence: 0.5,
      flagged_alternatives: [],
    })),
    gaps_or_warnings: [],
    route_coherence_check: {
      passes: true,
      notes: "Deterministic ranking fallback used.",
    },
  };
}

function primaryRouteFor(routes: RouteData[]) {
  return (
    routes[0] ?? {
      approachRoad: "Route unavailable",
      distance: 0,
      duration: 0,
      polyline: "",
    }
  );
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
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
