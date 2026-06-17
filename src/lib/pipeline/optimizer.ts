import {
  FINAL_BLOCK_FT,
  hardMinSignsForApproach,
  MIN_SIGN_SPACING_FT,
  NEAR_HOUSE_MIN,
  NEAR_HOUSE_TARGET,
  SOFT_SIGN_SPACING_FT,
} from "@/lib/rules/placement";
import type { LatLng, LLMRankedResult, ScoredCandidate, SignPlacement } from "@/lib/types";
import { haversineDistanceFeet } from "@/lib/utils/geo";

export function selectTopN(
  candidates: ScoredCandidate[],
  llmResult: LLMRankedResult,
  n: number,
  propertyLocation?: LatLng,
  // Turns per approach (index → turn count), used to size each route's followable minimum.
  turnCounts: Map<number, number> = new Map(),
): SignPlacement[] {
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const llmCandidates = llmResult.selected_signs
    .map((selection) => byId.get(selection.candidate_id))
    .filter((candidate): candidate is ScoredCandidate => Boolean(candidate));
  // Priority order: LLM-preferred candidates first, then everything else in score order.
  const ordered = [...llmCandidates, ...candidates.filter((candidate) => !llmCandidates.includes(candidate))];
  const property = candidates.find((candidate) => candidate.type === "property");
  const targetCount = property ? Math.max(0, n - 1) : n;
  // Treat the property as a fixed spacing anchor so approach signs don't crowd the front door.
  const spacingAnchors = property ? [property] : [];
  // Fall back to the property candidate's own coordinates if no explicit location was passed.
  const propertyPoint: LatLng | undefined = propertyLocation ?? property;

  // Group the (non-property) budget by approach so each direction is a followable mini-trail
  // instead of one route hogging every sign. Groups preserve the LLM/score priority order.
  const groups = new Map<number, ScoredCandidate[]>();
  for (const candidate of ordered) {
    if (candidate.type === "property") {
      continue;
    }
    const key = candidate.approachIndex ?? 0;
    const group = groups.get(key) ?? [];
    group.push(candidate);
    groups.set(key, group);
  }

  // Turn-driven allocation (new-tmfa.md Q2/Q5): fund each approach at its followable minimum in
  // priority order, dropping any route the budget can't fund, then saturate the shared near-house
  // block. Replaces the old flat 40% near-house reserve.
  const selected = allocateAcrossApproaches(groups, turnCounts, spacingAnchors, targetCount, propertyPoint);

  if (property) {
    selected.push(property);
  }

  return orderForTrail(selected, property)
    .slice(0, n)
    .map((candidate, index) => ({
      id: candidate.id,
      sortOrder: index + 1,
      lat: candidate.lat,
      lng: candidate.lng,
      description: descriptionFor(candidate),
      reasoning: reasoningFor(candidate, llmResult),
      score: candidate.score,
      placementType: candidate.placementType,
      flag: candidate.flag,
      isSelected: true,
      approachBearing: candidate.approachBearing,
      approachIndex: candidate.approachIndex,
    }));
}

// Turn-driven allocation (new-tmfa.md Q2/Q5). Multi-route coverage is the goal, but only for routes
// the budget can make followable:
//   1. In priority (traffic) order, fund each approach at its turn-driven minimum (entry + per-turn
//      + confirmation), always keeping the near-house minimum in reserve. A route the budget can't
//      fund is dropped, not opened as an unfollowable spur.
//   2. Build each funded approach's trail from signs OUTSIDE the final block.
//   3. Saturate the shared near-house block across the funded approaches.
//   4. Spend any leftover budget deepening the funded trails.
function allocateAcrossApproaches(
  groups: Map<number, ScoredCandidate[]>,
  turnCounts: Map<number, number>,
  spacingAnchors: ScoredCandidate[],
  targetCount: number,
  propertyPoint: LatLng | undefined,
): ScoredCandidate[] {
  const selected: ScoredCandidate[] = [];
  // Sort keys ascending so the busiest arterial (approachIndex 0) is funded first.
  const approachKeys = [...groups.keys()].sort((a, b) => a - b);

  // One sign per decision point: every turn yields before/at/after candidates (~150 ft apart) that
  // share an (approachIndex, turnNumber). Placing two of them is the "7 signs crammed at 300 ft"
  // failure. The research is explicit — one sign per turn — so reject a candidate whose turn already
  // has a sign on its approach.
  const turnTaken = (candidate: ScoredCandidate) =>
    selected.some(
      (chosen) => chosen.approachIndex === candidate.approachIndex && chosen.turnNumber === candidate.turnNumber,
    );
  const fits = (candidate: ScoredCandidate) =>
    !selected.includes(candidate) &&
    !turnTaken(candidate) &&
    adjustedScore(candidate, [...selected, ...spacingAnchors]) > Number.NEGATIVE_INFINITY;
  const isNearHouse = (candidate: ScoredCandidate) =>
    Boolean(propertyPoint) && haversineDistanceFeet(candidate, propertyPoint!) <= FINAL_BLOCK_FT;

  // The property sign (added by the caller) is itself a near-house sign, so we only reserve the REST
  // of the near-house block here.
  const nearMinExtra = propertyPoint ? Math.max(0, NEAR_HOUSE_MIN - 1) : 0;
  const nearTargetExtra = propertyPoint ? Math.max(0, NEAR_HOUSE_TARGET - 1) : 0;

  // Step 1: pick which approaches the budget can fund at their followable minimum, keeping the
  // near-house minimum in reserve.
  const fundedKeys: number[] = [];
  let approachBudget = targetCount - nearMinExtra;
  for (const key of approachKeys) {
    const hardMin = hardMinSignsForApproach(turnCounts.get(key) ?? 0);
    if (approachBudget >= hardMin) {
      fundedKeys.push(key);
      approachBudget -= hardMin;
    } else {
      break;
    }
  }
  // Always fund at least the busiest approach, even on a tight budget.
  if (fundedKeys.length === 0 && approachKeys.length > 0) {
    fundedKeys.push(approachKeys[0]);
  }

  // Step 2: build each funded approach's trail (signs outside the final block), capped so the
  // near-house minimum survives.
  const trailLimit = Math.max(0, targetCount - nearMinExtra);
  for (const key of fundedKeys) {
    const target = Math.min(trailLimit, selected.length + hardMinSignsForApproach(turnCounts.get(key) ?? 0));
    fillFromApproach(selected, groups.get(key) ?? [], target, (c) => fits(c) && !isNearHouse(c));
  }

  // Step 3: saturate the shared near-house block across the funded approaches.
  const nearLimit = Math.min(targetCount, selected.length + nearTargetExtra);
  roundRobinFill(selected, fundedKeys, groups, nearLimit, (c) => fits(c) && isNearHouse(c));

  // Step 4: spend any leftover budget deepening the funded trails.
  roundRobinFill(selected, fundedKeys, groups, targetCount, fits);

  return selected;
}

// Fill from a single approach's candidates (in priority order) until `limit` total signs are
// selected. Used to build one route's trail up to its followable minimum.
function fillFromApproach(
  selected: ScoredCandidate[],
  candidates: ScoredCandidate[],
  limit: number,
  eligible: (candidate: ScoredCandidate) => boolean,
) {
  for (const candidate of candidates) {
    if (selected.length >= limit) {
      break;
    }
    if (eligible(candidate)) {
      selected.push(candidate);
    }
  }
}

function roundRobinFill(
  selected: ScoredCandidate[],
  approachKeys: number[],
  groups: Map<number, ScoredCandidate[]>,
  limit: number,
  eligible: (candidate: ScoredCandidate) => boolean,
) {
  let madeProgress = true;

  while (selected.length < limit && madeProgress) {
    madeProgress = false;

    for (const key of approachKeys) {
      if (selected.length >= limit) {
        break;
      }

      const next = (groups.get(key) ?? []).find(eligible);
      if (next) {
        selected.push(next);
        madeProgress = true;
      }
    }
  }
}

// Present signs grouped by approach and roughly in driving order (arterial entry → turns →
// near the property) so the agent's list reads like a route, not a scattered score ranking.
// The mandatory property sign always sorts last.
function orderForTrail(selected: ScoredCandidate[], property?: ScoredCandidate): ScoredCandidate[] {
  return [...selected].sort((a, b) => {
    if (property && a.id === property.id) {
      return 1;
    }
    if (property && b.id === property.id) {
      return -1;
    }
    const approachDelta = (a.approachIndex ?? 0) - (b.approachIndex ?? 0);
    if (approachDelta !== 0) {
      return approachDelta;
    }
    return a.turnNumber - b.turnNumber;
  });
}

function adjustedScore(candidate: ScoredCandidate, selected: ScoredCandidate[]) {
  let score = candidate.score;

  for (const selectedCandidate of selected) {
    const distance = haversineDistanceFeet(candidate, selectedCandidate);

    if (distance < MIN_SIGN_SPACING_FT) {
      return Number.NEGATIVE_INFINITY;
    }

    if (distance < SOFT_SIGN_SPACING_FT) {
      score -= ((SOFT_SIGN_SPACING_FT - distance) / (SOFT_SIGN_SPACING_FT - MIN_SIGN_SPACING_FT)) * 0.1;
    }
  }

  return score;
}

function descriptionFor(candidate: ScoredCandidate) {
  if (candidate.type === "property") {
    return "Mandatory — final sign at the property address.";
  }

  // The arterial entry sign (turnNumber 0): the first, highest-visibility sign where buyers leave
  // the main road toward the property.
  if (candidate.turnNumber === 0) {
    const road = candidate.roadName && candidate.roadName !== "the main road" ? ` off ${candidate.roadName}` : " off the main road";
    return `First sign — at the turn${road} toward the property (highest-visibility spot).`;
  }

  // "straight" candidates are reassurance signs on a long stretch between turns, not a turn.
  if (candidate.maneuverType === "straight") {
    const road = candidate.roadName && candidate.roadName !== "along the route" ? ` on ${candidate.roadName}` : "";
    return `Confirmation sign to keep drivers on track along the straightaway${road}.`;
  }

  return `Place sign ${candidate.type} the ${candidate.maneuverType.replaceAll("-", " ")}${candidate.roadName ? ` near ${candidate.roadName}` : ""}.`;
}

function reasoningFor(candidate: ScoredCandidate, llmResult: LLMRankedResult) {
  const selection = llmResult.selected_signs.find((sign) => sign.candidate_id === candidate.id);

  return selection?.rationale ?? `Selected by standard ranking with score ${candidate.score.toFixed(1)}.`;
}
