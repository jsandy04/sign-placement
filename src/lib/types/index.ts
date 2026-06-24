export interface LatLng {
  lat: number;
  lng: number;
}

export interface AnalyzeInput {
  address: string;
  signCount: number;
}

export interface GeocodedAddress extends LatLng {
  formattedAddress: string;
  placeId: string;
  partialMatch?: boolean;
  resultTypes?: string[];
}

export interface ApproachRoad extends LatLng {
  name: string;
  distance: number;
}

export type ManeuverType =
  | "turn-left"
  | "turn-right"
  | "turn-slight-left"
  | "turn-slight-right"
  | "turn-sharp-left"
  | "turn-sharp-right"
  | "roundabout-left"
  | "roundabout-right"
  | "fork-left"
  | "fork-right"
  | "merge"
  | "name-change"
  | "straight";

export interface RouteStep {
  start: LatLng;
  end: LatLng;
  distance: number;
  duration: number;
  maneuverType: ManeuverType;
  roadName?: string;
  polyline?: string;
}

export interface GoogleRoute {
  distance: number;
  duration: number;
  polyline: string;
  steps: RouteStep[];
  polylinePoints: LatLng[];
}

export interface DecisionPoint extends LatLng {
  maneuverType: ManeuverType;
  roadName?: string;
  distanceFromPrior: number;
  speedEstimate: number;
  turnNumber: number;
  approachBearing?: number;
  isProperty?: boolean;
  // Which approach route this point belongs to (index into the routes array). Used by the
  // optimizer to allocate the sign budget fairly across directions.
  approachIndex?: number;
}

export interface RouteData {
  approachRoad: string;
  distance: number;
  duration: number;
  polyline: string;
  steps: RouteStep[];
  polylinePoints: LatLng[];
  decisionPoints: DecisionPoint[];
  polylineFallbackActive?: boolean;
}

export type CandidateType = "before" | "at" | "after" | "property";

export type PlacementType =
  | "intersection"
  | "entrance"
  | "midroute"
  | "roundabout"
  | "property";

export type ConstraintFlag = "none" | "safety" | "legal" | "visibility";

export interface CandidateLocation extends LatLng {
  id: string;
  turnNumber: number;
  type: CandidateType;
  placementType: PlacementType;
  maneuverType: ManeuverType;
  roadName?: string;
  distanceToTurn: number;
  recommendedOffset: number;
  speedEstimate: number;
  approachBearing?: number;
  approachIndex?: number;
}

export interface FilteredCandidate extends CandidateLocation {
  flag: ConstraintFlag;
  constraintConfidence?: number;
}

export interface ScoreBreakdown {
  decisionPointCriticality: number;
  trafficVolume: number;
  visibilityQuality: number;
  approachSpeedAlignment: number;
  signSpacing: number;
  proximityToProperty: number;
}

export interface ScoredCandidate extends FilteredCandidate {
  score: number;
  scoreBreakdown: ScoreBreakdown;
}

export interface RouteContext {
  address: string;
  formattedAddress?: string;
  property: LatLng;
  signCount: number;
  routes: RouteData[];
}

export interface LLMSelectedSign {
  turn_number: number;
  candidate_id: string;
  rationale: string;
  confidence: number;
  flagged_alternatives?: string[];
}

export interface LLMGapOrWarning {
  turn_number: number;
  issue: string;
  suggestion?: string;
}

export interface LLMRankedResult {
  overall_assessment: string;
  selected_signs: LLMSelectedSign[];
  gaps_or_warnings: LLMGapOrWarning[];
  route_coherence_check: {
    passes: boolean;
    notes: string;
  };
}

export interface LLMEvaluationResult {
  result: LLMRankedResult;
  cost: number;
}

// === LLM Strategist (reframe — see docs/reframe-llm-strategist.md) ===
// Stage A: the LLM is handed each discovered approach as FEATURES (not a pre-computed ranking) and
// decides which approaches matter, the per-property strategy, and which decision points get a sign.
// Geometry (Stage C) then turns each chosen decision point into a real coordinate; vision (Stage B)
// judges the corner. The LLM never emits coordinates.

// One genuine fork on an approach, described for the strategist to reason over. Stable `id` lets the
// LLM reference a point without inventing geometry.
export interface DecisionPointBrief {
  id: string; // `${approachIndex}-${turnNumber}` — stable across the request
  approachIndex: number;
  turnNumber: number;
  role: "entry" | "turn" | "confirmation" | "property"; // geometric role; the LLM may sign or skip it
  maneuver: ManeuverType;
  roadName?: string;
  distanceFromPropertyFt: number;
}

// A discovered approach, handed to the strategist as features to judge — replaces
// `estimateRoadClassScore` deciding for it.
export interface ApproachOption {
  index: number;
  roadName: string;
  compass: string; // human label, e.g. "from the north (northbound traffic)"
  bearingDegrees: number;
  distanceFt: number; // route length from the arterial turn-off to the property
  speedMph: number; // free-flow speed of the feeding road — a road-class hint, not a verdict
  signableTurns: number; // genuine wrong-way decisions on the route
  decisionPoints: DecisionPointBrief[];
}

// The full situation briefing the strategist reasons over.
export interface StrategistBriefing {
  address: string;
  formattedAddress?: string;
  signCount: number;
  propertyTypeHints?: string[]; // geocode result `types` (e.g. premise, subpremise, establishment)
  approaches: ApproachOption[];
}

// One sign the strategist chose — references a decision point by id; geometry computes the coordinate.
export interface StrategistSign {
  decision_point_id: string;
  approach_index: number;
  role: "entry" | "turn" | "confirmation" | "near-house" | "property";
  rationale: string; // plain-English "why here" for the agent
  order: number; // driving order within its approach
}

// Stage A output.
export interface StrategistDecision {
  strategy_summary: string; // which approaches & why; concentrate vs. spread; property-type read
  property_type: string; // LLM's classification: subdivision | on-arterial | rural | apartment | gated | ...
  chosen_approaches: number[]; // approach indices to fund, in priority order
  signs: StrategistSign[];
}

// Stage B output — the model's read of one corner's Street View image.
export interface CornerVerdict {
  decision_point_id: string;
  usable: boolean; // is this a good, legal, visible spot to stake a yard sign?
  confidence: number;
  hazards: string[]; // e.g. "fire hydrant", "no setback / sidewalk to curb", "bus stop", "median"
  note: string; // one-line agent-facing observation
  imageAvailable: boolean; // false when there's no Street View coverage — verdict passes through
}

export interface SignPlacement extends LatLng {
  id: string;
  sortOrder: number;
  description?: string;
  reasoning?: string;
  score?: number;
  placementType: PlacementType;
  flag: ConstraintFlag;
  isSelected: boolean;
  approachBearing?: number;
  approachIndex?: number;
  // Reframe additions (optional so existing consumers are unaffected):
  role?: StrategistSign["role"]; // the strategist's role for this sign in the trail
  streetViewChecked?: boolean; // whether Stage B looked at this corner
  visionUsable?: boolean; // Stage B verdict: is the corner a good spot?
  visionNote?: string; // one-line corner observation from the vision pass
  hazards?: string[]; // hazards the vision pass spotted (hydrant, no setback, median, …)
}

export interface RouteSummary {
  approachRoad: string;
  distance: number;
  duration: number;
  polyline: string;
  // "funded" routes carry signs and render solid; "available" routes are approaches the engine
  // discovered but the sign budget couldn't make followable — rendered faded, with `signsToUnlock`
  // being the extra signs they'd need (design-thesis "surface, don't mandate").
  status?: "funded" | "available";
  signsToUnlock?: number;
}

export interface SignPlacementResult {
  id: string;
  placements: SignPlacement[];
  route: RouteSummary;
  routes?: RouteSummary[];
  fullReasoning: string;
  recommendedSignCount?: number;
  complianceWarnings?: string[];
  disclaimer?: string;
  degradationLevel: number;
  costs: {
    maps: number;
    llm: number;
  };
}
