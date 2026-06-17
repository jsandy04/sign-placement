import { nanoid } from "nanoid";
import { insertAnalysis } from "@/lib/db/queries";
import { hardMinSignsForApproach, MAX_SIGNS, MIN_SIGNS, NEAR_HOUSE_TARGET } from "@/lib/rules/placement";
import { buildComplianceWarnings, LIABILITY_DISCLAIMER } from "@/lib/rules/ordinance-warnings";
import { findApproachRoads } from "./approach-roads";
import { generateCandidates } from "./candidates";
import { geocode } from "./geocoder";
import { applyHardConstraints } from "./hard-constraints";
import { llmEvaluate } from "./llm";
import { selectTopN } from "./optimizer";
import { countSignableDecisions } from "./decision-points";
import { computeRoutes } from "./routing";
import { scoreCandidates } from "./scorer";
import type {
  AnalyzeInput,
  LLMRankedResult,
  RouteData,
  RouteSummary,
  ScoredCandidate,
  SignPlacementResult,
} from "@/lib/types";

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
  // Pass the property so the proximity factor (research Q5) actually fires — without it
  // proximityScore returns a constant 50 and the near-house weighting is dead.
  const scoredCandidates = scoreCandidates(filteredCandidates, property);
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

  // Signable decisions per approach (route index → count) so the optimizer can size each route's
  // followable minimum (entry + one sign per genuine wrong-turn decision + confirmation). Counting
  // only signable decisions — not every maneuver — keeps routes affordable so the budget can cover
  // more directions (coverage-first) while each funded route stays followable.
  const approachDecisionCounts = new Map<number, number>(
    routes.map((route, routeIndex) => [routeIndex, countSignableDecisions(route.decisionPoints)]),
  );
  const placements = selectTopN(scoredCandidates, llmResult, signCount, property, approachDecisionCounts);
  const usedApproachIndices = new Set(
    placements
      .filter((placement) => placement.placementType !== "property")
      .map((placement) => placement.approachIndex ?? 0),
  );

  // Surface EVERY discovered approach (design-thesis "surface, don't mandate"). A funded route
  // carries signs and renders solid; a discovered-but-unfunded approach is returned as "available"
  // with the extra signs it would take to make it followable, so the agent sees the option (faded on
  // the map) instead of a hidden constraint. We never place signs below the followability floor.
  const fundedRoutes = routes.filter((_, index) => usedApproachIndices.has(index));
  const reportedRoutes: RouteSummary[] = routes
    .map((route, index) => {
      const funded = usedApproachIndices.has(index);
      return {
        approachRoad: route.approachRoad,
        distance: route.distance,
        duration: route.duration,
        polyline: route.polyline,
        status: funded ? ("funded" as const) : ("available" as const),
        signsToUnlock: funded ? undefined : hardMinSignsForApproach(approachDecisionCounts.get(index) ?? 0),
      };
    })
    // Funded (solid) routes lead so the map's primary styling lands on a route that has signs.
    .sort((a, b) => (a.status === b.status ? 0 : a.status === "funded" ? -1 : 1));

  const primaryRoute = primaryRouteFor(fundedRoutes);
  // Budget that would make every discovered approach followable: each route's turn-driven minimum
  // plus the shared near-house block. Surfaced as the recommendation so the agent knows what unlocks
  // the unfunded approaches.
  const signsToCoverAllApproaches = Math.min(
    MAX_SIGNS,
    routes.reduce((sum, _route, index) => sum + hardMinSignsForApproach(approachDecisionCounts.get(index) ?? 0), 0) +
      NEAR_HOUSE_TARGET,
  );
  const result: SignPlacementResult = {
    id: nanoid(10),
    placements,
    route: {
      approachRoad: primaryRoute.approachRoad,
      distance: primaryRoute.distance,
      duration: primaryRoute.duration,
      polyline: primaryRoute.polyline,
    },
    routes: reportedRoutes,
    recommendedSignCount: signsToCoverAllApproaches,
    complianceWarnings: buildComplianceWarnings(geocoded.formattedAddress),
    disclaimer: LIABILITY_DISCLAIMER,
    fullReasoning: llmResult.overall_assessment,
    degradationLevel: Math.max(degradationLevel, fundedRoutes.some((route) => route.polylineFallbackActive) ? 2 : 0),
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
