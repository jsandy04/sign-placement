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
}

export interface RouteSummary {
  approachRoad: string;
  distance: number;
  duration: number;
  polyline: string;
}

export interface SignPlacementResult {
  id: string;
  placements: SignPlacement[];
  route: RouteSummary;
  routes?: RouteSummary[];
  fullReasoning: string;
  degradationLevel: number;
  costs: {
    maps: number;
    llm: number;
  };
}
