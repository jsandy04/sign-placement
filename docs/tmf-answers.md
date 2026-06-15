# Trail Mechanics Findings — Answers

**Date:** 2026-06-15
**Purpose:** Researched answers to the five open domain questions from the
[trail-mechanics-findings.md](archives/trail-mechanics-findings-2026-06-15.md) (archived).
Each answer draws from external industry research, municipal code review, and a full
codebase audit. Answers are written to be directly actionable by an implementing engineer.

**Related:** [domain-rules-answers.md](domain-rules-answers.md) — the original research
that informed the build spec. Where that research was incomplete or ambiguous, these
answers fill the gap.

---

## Q1 — Sparse multi-direction trails: is 1–2 signs per direction ever acceptable?

### The question

> Is 1–2 signs per direction ever acceptable, or is min-3-per-direction (§0.5) firm?
> This decides whether 5 signs can be 2 light routes vs 1 strong one.

### Research findings

**No industry source states "minimum 3 signs per direction" as a rule.** The 3-sign-per-direction
rule (entry + turn + confirmation) from domain-rules-answers.md §0.5 is a logical construct we
derived, not an industry standard. Here's what the industry actually says:

- **Showable.co** (the most-cited open house signage guide): recommends 5–7 directional signs
  for a "typical suburban layout," with 10–15 as the sweet spot. They recommend 2–3 signs on
  major roads, 1 per turn, and 3–5 in the final block — but they do NOT prescribe a minimum
  per approach direction. [Source](https://showable.co/blog/how-many-open-house-signs)
- **Packeze.com**: recommends ~3 signs on major roads, 1 per turn, ~5 within the same block.
  Again, no per-direction minimum. [Source](https://packeze.com/placement-strategies-for-open-house-signage/)
- **Curb Hero**: recommends 25–35 signs total (extreme outlier — likely targeting urban core /
  high-density events). Not useful for our per-direction floor.
- **The Complete Package**: no quantitative per-direction guidance.
- **Municipal codes** (Glendale, Scottsdale, Peoria, Phoenix): cap total signs (4–8 per
  property/event), not signs per direction. Edmonds, WA caps 1 sign per intersection, 5 total.

**The core industry principle** is not "N signs per direction" but rather: create an unbroken
stepping-stone path from the busiest feeder road to the property, with no gap large enough
for a driver to get lost. If a direction can't support an unbroken path, don't include it.

**What agents actually do when signs are tight:** The implicit guidance across all sources is
to prioritize: (1) busiest arterial approach, (2) key decision turns, (3) final block saturation.
No source says "split 5 signs across 2 directions at 2–3 each." The consensus is: concentrate
on the single busiest approach, make that trail solid, then expand to other directions only if
signs remain.

### Answer

**1–2 signs per direction is NOT acceptable for a standalone direction.** A 2-sign trail
(arterial entry sign → property sign, with nothing at the turns in between) is unfollowable —
the driver hits the first turn with no direction and gets lost. The minimum for a followable
trail per direction is:

| Signs | Trail shape | Verdict |
|-------|------------|---------|
| 2 | Arterial entry → property (no turn guidance) | ❌ Unfollowable |
| 3 | Arterial entry → 1 turn → property (no confirmation) | ⚠️ Marginal — works only if there's exactly 1 turn |
| 4 | Arterial entry → 1 turn → confirmation → property | ✅ Minimum followable trail |
| 5+ | Entry → turn → confirm → turn → … → property | ✅ Solid |

**For a 5-sign budget, the answer is clear: 1 strong route (4–5 signs) beats 2 skeletal routes
(2–3 signs each).** The 3-sign-per-direction floor from §0.5 should be treated as a soft target
(ideal), not a hard gate. The actual hard constraint should be:

- **Hard floor: 2 signs per direction** — but only include a 2nd direction if the first direction
  has ≥4 signs AND the second direction covers a genuinely different approach corridor (≥60° separation)
  AND the second direction's entry point is on a different arterial.
- **Soft target: 3–5 signs per direction** — aim for this when budget allows.

**Implementation implications:**
- `MIN_SIGNS_PER_APPROACH = 3` should become a soft preference, not a hard gate
- Add a new constant `HARD_MIN_SIGNS_PER_APPROACH = 2` (a 2-sign direction is only
  acceptable as a secondary, and only when the primary has ≥4)
- When `signCount < 8`, cap `maxApproachesForSignCount` at 1 except when there's a
  compelling second arterial from a different corridor
- Surface the tradeoff in the UI: "With 5 signs, we recommend concentrating on the busiest
  approach. Adding a second direction would thin the trail below what's followable."

---

## Q2 — Apartment/complex strategy: where do signs go?

### The question

> For a complex, where do signs go? (Leasing office, gate, building cluster?) The
> "destination" isn't a single front door.

### Research findings

There is almost no published industry guidance specifically about directional sign placement
for apartment/condo open houses. What exists is fragmented:

- **Multifamily wayfinding best practices** (Sunrise Signs, industry sign manufacturer):
  directional signs in multifamily properties point to: leasing office, clubhouse, model unit,
  visitor parking, individual building addresses, and amenity areas (pool, gym, mailroom).
  [Source](https://www.sunrisesigns.com/our-blog/wayfinding-signage-for-multifamily-housing)
- **Showable.co**: recommends A-frame signs "near pedestrian entrances — especially in
  downtown areas, condo complexes, or neighborhoods with heavy foot traffic." For gated
  communities: agents "may need special permission" and should "confirm with the community
  management before placing signs."
- **Curb Hero** (gated community guide): recommends placing a sign at the gate with the
  gate code (if permitted), plus signs at internal turns within the community.
  [Source](https://curbhe.ro/open-house-in-a-gated-community/)
- **AAOA (American Apartment Owners Association)**: emphasizes directional signage pointing
  to the leasing office as the primary destination for prospects.
- **No MLS or NAR guidelines** specifically address multi-unit sign placement.

The key insight from multifamily wayfinding design (which is a different domain from temporary
open house signs, but the closest analog) is that the **destination hierarchy** for a visitor is:

1. **Main entrance / gate** (how do I get in?)
2. **Leasing office / model unit** (where do I go?)
3. **Parking** (where do I leave my car?)
4. **Specific building entrance** (if large complex)

### Answer

The "destination" for the tool depends on the property subtype:

| Property type | Destination point | Rationale |
|---------------|-------------------|-----------|
| **Garden apartment** (leasing office handles showings) | Leasing office | Agent meets buyer there; unit is shown from office |
| **Garden apartment** (vacant unit, lockbox) | Specific building entrance | Buyer goes directly to unit |
| **High-rise condo** | Building lobby / main entrance | Concierge/front desk directs from there |
| **Townhouse community** | Individual unit front door | Same as single-family |
| **Gated community** (SFH or condo) | Gate entrance + internal unit | Sign at gate, then follow internal streets |
| **55+ active adult** | Community clubhouse (if that's the showing hub) or unit | Varies by community practice |

**For the tool, the practical approach is:**

1. **Detect the property type** from the address/geocoding result (apartment complex, condo
   building, townhouse, etc. — Google Places API returns `types` that can distinguish these).
2. **For apartments/condos with a leasing office:** set the destination to the leasing office
   address (detectable via Places API "establishment" type or a lookup). The trail guides
   buyers to the leasing office, not a specific unit.
3. **For gated communities:** the first "decision point" is the gate. Place a sign at the gate
   entrance. Add internal signs at forks/splits within the community if the route from gate to
   unit has turns.
4. **For complexes with internal road networks:** the approach discovery should find roads
   leading to the main entrance, then the routing should continue from the entrance to the
   specific building/cluster. This may require a two-leg route (arterial → gate, gate → unit).
5. **For all multi-unit properties:** add a compliance warning: "This is a multi-unit property.
   Confirm with property management before placing any signs inside the complex."

**Implementation implications:**
- Add a `propertySubtype` field to the analysis input/output (detected from Places API result types)
- Add a `destinationType` field: `"front-door"` | `"leasing-office"` | `"building-lobby"` | `"gate"`
- For "gate" destinations: add gate as an explicit decision point; compute internal routing
  from gate to unit as a sub-route
- Add a gated-community warning: "Sign at gate requires community management permission"
- The LLM system prompt should include property-subtype context so it can adjust its reasoning

---

## Q3 — On-arterial frontage: what's the right trail?

### The question

> When the property is *on* the main road with no neighborhood turn-in, what's the
> right trail? (Advance signs on the arterial + property only?)

### Research findings

Industry sources consistently say homes on main roads need **fewer** directional signs:

- **Showable.co**: "Homes on main roads need fewer directional signs; cul-de-sacs, gated
  communities, or hilly terrain require more."
- **Packeze.com**: urban/high-visibility settings may need only 5–6 signs vs 10–15 for
  suburban subdivisions.
- **No source provides specific guidance** for the on-arterial case beyond "fewer signs."
  This is a genuine gap in published guidance.

However, the **traffic engineering literature** is useful here. The MUTCD provides
speed-dependent advance warning distances (Table 6C-2, stopping sight distance):

| Speed (mph) | Stopping sight distance (ft) | Recommended advance sign distance |
|-------------|------------------------------|-----------------------------------|
| 25 | 155 | 100–150 ft |
| 35 | 250 | 200–350 ft |
| 45 | 360 | 350–500 ft |
| 55 | 495 | 500–700 ft |

[Source: TxDOT Sign Crew Field Book](https://www.txdot.gov/content/txdotoms/us/en/manuals/trf/sfb/warning_signs/warning_sign_advance_placement-i1007447.html)

For an on-arterial property, the "approach" is the arterial itself — drivers are already on
the road. The trail becomes:

1. **Advance sign in each direction** — placed far enough back for drivers to slow down
   and look for the property (AASHTO stopping sight distance)
2. **Property sign** — visible from the road, confirming "this is it"
3. **Optional: side-street signs** — if the arterial has cross streets where traffic turns
   onto it, place a sign at that turn to catch drivers entering the arterial

### Answer

For an on-arterial property, **the trail is fundamentally different from a subdivision trail**.
There is no neighborhood turn-in, so there are no turn-decision-points to sign. The trail
collapses to:

```
                     ARTERIAL ROAD
    ← Westbound ─────────────────────────── Eastbound →
    
       ▲                                     ▲
       │ Advance sign (W-bound)              │ Advance sign (E-bound)
       │ ~350-500 ft before property         │ ~350-500 ft before property
       │                                     │
                      🏠 PROPERTY
                      (yard sign)
```

**The recommended on-arterial trail:**

| Sign # | Location | Distance from property | Purpose |
|--------|----------|----------------------|---------|
| 1 | Arterial, approaching from west | 350–500 ft (at 45 mph) | Advance warning — "Open House Ahead" |
| 2 | Arterial, approaching from east | 350–500 ft (at 45 mph) | Advance warning from opposite direction |
| 3 | Nearest major cross-street (north) | At the turn onto arterial | Catch traffic turning onto the arterial |
| 4 | Nearest major cross-street (south) | At the turn onto arterial | Catch traffic from the other side |
| 5 | Property | At the house | "This is it" |

**This is a 3–5 sign trail, not 8–12.** The property IS on the main road — the arterial
serves as the approach, and the house is visible from it. The job of the signs is:
1. Warn drivers to slow down and look (advance signs)
2. Confirm arrival (property sign)
3. Catch turning traffic from cross-streets (if applicable)

**On a divided highway** where only one direction can access the property:
- Place advance signs on the correct side only
- Add a U-turn sign at the next legal U-turn point if the property is on the far side
- Skip the opposite-direction advance sign (drivers going the wrong way can't turn in)

**Implementation implications:**
- Add an `onArterial` flag to the analysis — detect when the property's address is on a
  road with speed ≥35 mph AND the route from the nearest approach road has ≤1 turns
  (meaning the property is directly on the approach road)
- When `onArterial === true`: reduce the target sign count (recommend 3–5 instead of
  8–12), generate advance signs along the arterial in both directions at AASHTO offset,
  skip neighborhood turn-in logic
- The approach-road discovery should still find feeding arterials, but the routing step
  should recognize that the "route" is just the arterial segment past the property
- Add advance-warning distance formula for on-arterial trails: use
  `max(speedMph × 10, 150)` (the already-implemented formula for ≥35 mph roads)

---

## Q4 — Rural reach: how far is too far?

### The question

> How far is too far when the nearest arterial is >1 mi? Does the agent accept a
> longer drive, or fewer signs?

### Research findings

**Published industry guidance on rural sign placement distance is nearly nonexistent.**
The closest data comes from municipal codes and logical inference:

- **Municipal distance limits vary wildly:** Sammamish, WA: 2 road miles max; Kirkland,
  WA: 1/4 mile; Lakewood, WA: 1/2 mile; Gig Harbor, WA: "nearest arterial street
  intersection" (no fixed distance). Most rural/unincorporated areas don't specify a
  distance — they cap the number of signs (3–6) instead.
- **Glendale, AZ code**: max 8 signs within 1 mile of the subdivision. This applies to
  Glendale city limits only, not unincorporated Maricopa County (where rural properties
  like New River fall).
- **Maricopa County (unincorporated)**: no specific distance limit found. The county
  prohibits ROW placement generally but doesn't specify a radius for off-premise
  directional signs on private property.
- **Industry guides**: Showable.co says signs may be "spaced over several miles" for
  rural properties. Packeze.com mentions rural/hard-to-find areas need more coverage
  over longer distances. But no source specifies a maximum distance.
- **Agent behavior (inferred from forum consensus)**: rural agents use fewer, more
  visible signs at major turns, with wider spacing. On a 3-mile rural approach with
  3–4 turns, an agent might place 4–6 signs (1 at each major turn + property),
  compared to 10–12 for a 0.5-mile suburban trail with 4–5 turns.

**The "GPS it" threshold:** There's no published research on when agents switch from
signs to GPS reliance. Logical inference: when the sign-placement drive time exceeds
~15 minutes one-way (roughly 8–10 miles), the agent is spending more time placing
signs than is practical. But this is a product judgment, not researched fact.

### Answer

**There is no single hard distance limit for rural properties.** The practical constraints
are the agent's time budget and the number of decision points between the arterial and
the property. The answer depends on the property's distance from the nearest arterial:

| Distance from arterial | Strategy | Typical signs | Radius |
|------------------------|----------|---------------|--------|
| < 1.0 mi | Full trail (same as suburban) | 6–10 | 1.0 mi |
| 1.0–2.0 mi | Skeleton trail (major turns only, wider spacing) | 4–7 | 2.0 mi |
| 2.0–3.0 mi | Minimal trail (arterial entry + major turns + property) | 3–5 | 3.0 mi |
| > 3.0 mi | Sparse trail (arterial entry + property, with 1–2 critical turns only) | 3–4 | 3.0 mi |

**Key principles for rural trails:**

1. **Spacing scales with speed.** On a 55 mph rural road, drivers cover 0.5 miles in
   ~33 seconds. A sign every 0.5–1.0 mile is acceptable (vs every 250–500 ft in a
   subdivision). The `idealSpacingFeet(speedMph)` function already handles this:
   at 55 mph it returns 800 ft, which can stretch to ~1,200 ft for rural roads.
2. **Fewer signs, more visible.** For rural trails, recommend larger signs (if the
   agent has them), flags/balloons, and high-contrast colors. This is guidance text,
   not algorithmic.
3. **Include a "distance advisory."** When the trail extends beyond 1.0 mile from the
   property, surface: "This trail extends [X] miles from the property. Sign placement
   will take approximately [Y] minutes of driving. Consider using GPS coordinates in
   your listing description as a supplement."
4. **Drop the least-important direction.** For a rural property with a 2+ mile approach,
   recommend a single approach direction (the busiest arterial), even with a large sign
   budget. Spreading signs across 2 directions at 2+ miles each is impractical.

**The 1.0-mile Glendale limit** applies only within Glendale city limits. For
unincorporated Maricopa County (New River, far north Scottsdale, etc.), the tool
should reference county rules and note that distance limits may not apply but ROW
placement is still prohibited.

**Implementation implications:**
- Extend `MAX_APPROACH_ROAD_DISTANCE_FT` from 5,280 (1 mi) to 15,840 (3 mi) for
  rural properties specifically — flagged with a warning
- Add a `ruralExtendedRadius` flag set when the nearest arterial turn-off is >1 mi
  from the property
- Make `CONFIRMATION_SPACING_FT` (currently 660 ft) speed-dependent for rural:
  `max(660, speedMph * 20)` — at 55 mph, confirmation signs every ~1,100 ft
- Surface the driving-time estimate in the UI so the agent can decide whether the
  distance is acceptable
- For distances >2 mi: cap approaches at 1 (don't try to serve 2 directions at 2+ mi each)
- Add a "GPS fallback" note in the trail description for >3 mi properties

---

## Q5 — Neighborhood saturation ratio: what fraction inside vs. outside?

### The question

> What fraction of signs should be inside the neighborhood vs on the approach?
> (Drives the F3 fix weighting.)

### Research findings

This is the best-documented question. Multiple industry sources give consistent ratios:

**Recommended distribution (consensus across Showable.co, Packeze.com, HomeLight, Brown Team):**

| Zone | Signs | % of total (10-sign trail) | % of total (8-sign trail) |
|------|-------|---------------------------|--------------------------|
| Major/approach roads (arterials, collectors) | 2–3 | 20–30% | 25–38% |
| Decision points (turns, intersections) | 3–5 | 30–50% | 25–38% |
| Final block (within ~1/8 mile of property) | 3–5 | 30–50% | 25–50% |

**Specific guidance from sources:**

- **Showable.co**: "3–5 signs within a block of the home" including "signs on both ends
  of the street." Plus "2–3 signs on major roads." Plus "1 at every key turn or stop sign."
  [Source](https://showable.co/blog/how-many-open-house-signs)
- **Packeze.com**: "5 signs within the same block as the house." Plus "3 signs on major
  roads." Plus "1 at every turn or stop sign."
  [Source](https://packeze.com/placement-strategies-for-open-house-signage/)
- **HomeLight**: "10 to 15 signs overall, with most concentrated near the property."
  [Source](https://www.homelight.com/blog/open-house-signs/)
- **Brown Team Real Estate**: same 3-zone breakdown, emphasizing "signs at both ends
  of the street" and "high density in the final block."
  [Source](https://brown-team.com/open-house-signs-that-work-maximizing-foot-traffic/)

**The "both ends of the street" principle** appears in every major guide. The property's
own street should have a sign at each end so buyers approaching from either direction
see directional confirmation. This is universally recommended and not currently implemented
in the code.

**The "saturate the final block" principle** means: within ~660 ft (1/8 mile, one standard
city block in Phoenix's grid) of the property, place enough signs that no driver can be on
a nearby street without seeing one. This means 3–5 signs within that radius.

**Rural adjustment:** On rural properties, the approach zone expands and the final-block
zone stays the same. A rural trail might be: 4–5 approach signs (on highway + secondary
roads) + 3 near-property signs (driveway entrance + both ends of the road + property).

### Answer

**The target ratio is roughly 1/3 approach, 1/3 turns, 1/3 near the property.** For an
8-sign trail, that means:

| Sign # | Zone | Location |
|--------|------|----------|
| 1 | Approach | Major arterial entry — "turn here for open house" |
| 2 | Approach | Collector road leading into neighborhood |
| 3 | Turn | First turn from collector into property's street |
| 4 | Turn | (if applicable) intermediate turn |
| 5 | Near | One end of property's street |
| 6 | Near | Other end of property's street |
| 7 | Near | Approaching the property (within sight) |
| 8 | Property | At the house |

**The current code's Far-skew is clearly wrong.** The eval results show many properties
with 1/2/4 or 2/2/3 near/mid/far splits — meaning only 1–2 signs land within 800 ft of
the house. Industry guidance expects 3–5 signs in that zone. The fix requires:

1. **Weight near-house candidates higher in the scorer.** The current scoring weights
   (30% decision criticality, 25% traffic volume) inherently favor arterial/high-speed
   locations. Add a `proximityToProperty` bonus of 10–15% weight that boosts candidates
   within 800 ft of the property.

2. **Guarantee both-ends coverage.** After the optimizer selects signs, check whether
   the property's own street has signs at both ends and within sight of the house.
   If not, force-add candidates at those locations (override spacing rules if needed).

3. **The final-block reserve.** Reserve the last 3–4 signs of the budget for within
   800 ft of the property. Don't let the approach roads consume the entire budget.

**Implementation implications:**
- Add a `proximityToProperty` scoring factor (10% weight): distance from candidate to
  property, scored 100 if ≤400 ft, linear decline to 0 at 2,640 ft (0.5 mi)
- Reduce `trafficVolume` weight from 25% to 20%, add `proximityToProperty` at 15%
  (rebalance: 30% criticality + 20% traffic + 20% visibility + 15% speed alignment +
  10% spacing + 5% proximity — wait, that's 110%. Let's do: 25% criticality + 20%
  traffic + 20% visibility + 15% speed alignment + 10% spacing + 10% proximity)
- After `selectTopN` runs, run a `finalBlockCheck`: if fewer than 2 signs are within
  800 ft of the property (excluding the property sign itself), force-add the nearest
  available candidates at the property's street ends
- Add `bothEndsOfStreet` as a post-optimization check — ensure signs exist at both
  ends of the road segment containing the property
- Update the LLM system prompt to reflect the near-house saturation priority

---

## Codebase audit notes

A full audit of the codebase (all 44 source files in `src/`, all 3 scripts, all tests)
was conducted alongside this research. Key observations:

### What's well-implemented
- The pipeline architecture (geocode → approach roads → routes → decision points →
  candidates → hard constraints → scorer → LLM → optimizer) matches the build spec
- The round-robin allocation across approaches (`optimizer.ts`) correctly distributes
  the sign budget
- The offset gate in `hard-constraints.ts` (after-turn signs exempt from lead-distance
  rule) is correct per research §2.3
- Speed-dependent offset formula (`recommendedOffsetFeet`) matches AASHTO values
- The speed estimation from step data (distance/duration → mph) is more accurate
  than the build spec's bucketed approach
- Confirmation point generation at 660 ft spacing is a good innovation for filling
  turn-sparse routes

### What drifts from the research
1. **Discovery radius is 5,280 ft (1 mi), not 2,640 ft (0.5 mi).** The code comment
   justifies this as intentional: discovery radius ≠ placement radius. The wider
   search reliably finds feeding arterials in suburban grids. This is reasonable —
   but the budget-driven placement clamp mentioned in the comment doesn't exist yet.
2. **`approachRadiusForSignCount` is defined but unused.** The approach-road discovery
   always uses the full 5,280 ft radius regardless of sign budget. This is correct
   per the comment's logic, but the function should either be wired in or removed.
3. **`violatesFireHydrantClearance` and `violatesSidewalkCorridor` are stubs** that
   return `false` — they're mentioned in the build spec but unimplemented. Per
   domain-rules-answers.md §7.3, a generic warning is the right fallback, and the
   current ordinance-warnings system handles that. The stubs are fine.
4. **`violatesRoadMedian` uses a regex on road names** — a best-effort approach that
   will miss most medians (road names rarely contain "median"). Per research §9.1,
   this should be a hard block but we lack the road geometry data to implement it
   properly. The regex-based detection is a reasonable stopgap.
5. **LLM pipeline sends `signCount * 3` candidates** (`Math.max(signCount * 3, signCount)`).
   For signCount=8, that's 24 candidates. The LLM prompt says "select exactly one sign
   per turn" — but with confirmation points mixed in, there are more "turns" than real
   turns, and the LLM can't distinguish them. This may cause the LLM to over-select
   or produce incoherent results for sparse routes.

### F1–F4 root causes confirmed
- **F1 (catastrophic 1-sign):** Likely caused by short/turn-sparse routes where all
  candidates are confirmation points (maneuverType="straight"), which score low and
  get dropped by spacing dedup. The apartment and rural cases in the eval had zero
  usable candidates after hard constraints. Need to trace with debug logging.
- **F2 (phantom routes):** Confirmed — the approach discovery finds routes that
  overlap/collapse after spacing dedup. The `selectDistinctApproaches` function
  only prevents bearing overlap and duplicate road names, not route overlap after
  routing. Routes that share >50% of their polyline should be collapsed.
- **F3 (signs skew away from house):** Confirmed — the scorer weights favor
  high-traffic/high-speed locations (arterials), and there's no proximity-to-property
  bonus. See Q5 answer above for the fix.
- **F4 (degradation semantics):** Confirmed in `orchestrator.ts` line 119:
  `if (routes.length === 1) return 4` — this treats a single route as degradation
  level 4 ("Limited analysis — fewer routes available"), even when the single route
  is by valid budget constraint. The function should distinguish "1 route by failure"
  from "1 route by budget." Fix: check whether approaches were found but routes failed
  vs. only 1 approach was requested.

### Additional issues found
- **No retry on approach-road failures:** `findApproachRoads` uses `Promise.allSettled`
  but never retries failed rays. A single transient Routes API error on a bearing
  silently reduces the candidate pool.
- **`llmCandidateCount` floor is wrong:** `Math.max(signCount * 3, signCount)` always
  returns `signCount * 3` (since signCount is positive). The intent was probably
  `Math.max(signCount * 3, 10)` or similar — a floor of `signCount` is meaningless.
- **No per-property classifier exists yet.** The plan mentions a classifier
  (apartment/on-arterial/rural/gated/subdivision) but it's deferred. Without it,
  all property types get the same treatment, which produces the poor results on
  apartments, on-arterial, and rural properties seen in the eval.

---

## Prioritized action list

Based on the research answers and code audit, here's the updated priority stack:

1. **Fix F1 (never return house-only).** Trace candidate disappearance on apartment/rural;
   add fallback trail generation. *Highest user-facing damage.*
2. **Fix F3 (pull signs toward house).** Add proximity scoring factor + final-block
   reserve. *Directly implements Q5 research.*
3. **Fix F4 (degradation semantics).** Distinguish "1 route by budget" from "1 route
   by failure." *Clean signal, quick fix.*
4. **Fix F2 (kill phantom routes).** Collapse overlapping approaches post-routing.
   *Prevents over-promising coverage.*
5. **Implement Q1 logic (sparse trail strategy).** Make min-signs-per-approach a soft
   preference; cap approaches at 1 when signCount < 8.
6. **Implement Q3 logic (on-arterial property detection).** Detect on-arterial properties
   and switch to the advance-signs-on-arterial strategy with reduced sign count.
7. **Implement Q2 logic (apartment/complex destination).** Detect multi-unit properties
   and set destination to leasing office / building lobby / gate as appropriate.
8. **Implement Q4 logic (rural extended radius).** Allow radius up to 3 mi for rural
   properties with appropriate warnings and wider spacing.
9. **Build per-property classifier** on top of the above mechanics.
10. **Re-run eval** after each fix to confirm the relevant flags clear.

---

## Sources

1. Showable.co — "How Many Open House Signs Do I Need?" — https://showable.co/blog/how-many-open-house-signs
2. Showable.co — "Open House Signage: The Ultimate Guide For Realtors" — https://showable.co/blog/open-house-signage
3. Packeze.com — "Placement Strategies for Open House Signage That Drive Traffic" — https://packeze.com/placement-strategies-for-open-house-signage/
4. Curb Hero — "11 Open House Tips To Elevate Your Prospecting" — https://curbhe.ro/11-open-house-tips-to-elevate-your-prospecting/
5. Curb Hero — "How to do an Open House in a Gated Community" — https://curbhe.ro/open-house-in-a-gated-community/
6. HomeLight — "Real Estate Open House Signs: Which Kinds You Need" — https://www.homelight.com/blog/open-house-signs/
7. Brown Team Real Estate — "Open House Signs That Work: Maximizing Foot Traffic" — https://brown-team.com/open-house-signs-that-work-maximizing-foot-traffic/
8. UPrinting — "A Guide to Effective Open House Directional Signs" — https://www.uprinting.com/guide-to-effective-open-house-directional-signs.html
9. The Complete Package — "Open House Signs, Here's What Really Works" — https://www.tcpackage.com/blog/open-house-signs-heres-what-really-works
10. Sunrise Signs — "Wayfinding Signage Made Easy: Clear Navigation for Multifamily Housing" — https://www.sunrisesigns.com/our-blog/wayfinding-signage-for-multifamily-housing
11. Sunrise Signs — "Directional Signage: Making Multifamily Properties Easy to Navigate" — https://www.sunrisesigns.com/our-blog/directional-signage-making-multifamily-properties-easy-to-navigate
12. TxDOT Sign Crew Field Book — "Advance Placement Distance for Warning Signs" — https://www.txdot.gov/content/txdotoms/us/en/manuals/trf/sfb/warning_signs/warning_sign_advance_placement-i1007447.html
13. MUTCD Part 6 (Temporary Traffic Control) — Tables 6C-1, 6C-2 via FHWA
14. NAR — "Open Houses in a Post-NAR Settlement World" — https://www.nar.realtor (2024 consumer guides)
15. AAOA — "Multifamily Branding and the Leasing Agent" — https://american-apartment-owners-association.org/property-management/multifamily-branding-and-the-leasing-agent/
16. Glendale AZ Code §7.100–7.105 (Signs)
17. Scottsdale AZ Sign Regulations — https://www.scottsdaleaz.gov/codes-and-ordinances/signs
18. Peoria AZ City Code §21-833, §21-836
19. Maricopa County Right-of-Way Use — https://www.maricopa.gov/6695/Use-of-County-Right-of-Way
20. Edmonds, WA Municipal Code §20.60.065 (Real estate signs — 1 per intersection, 5 max)
21. Sammamish, WA — off-site signs max 2 road miles from development entrance

---

## Appendix: Deep-research workflow validation

A 42-agent adversarial-research workflow was run against Q1 (sparse multi-direction trails) to
pressure-test the claims above. It searched 5 angles (industry best practices, sign printing
guides, NAR/association resources, agent forums, and traffic/conversion studies), fetched 15+
sources, extracted falsifiable claims, and adversarially verified each with 3 independent
skeptics (refuted if ≥2/3 voted against). Key findings that strengthen or nuance the answers:

### Agent forum evidence (ActiveRain — practicing agents)

These are direct practitioner voices, not vendor marketing:

- **Kevin Heinrich** (ActiveRain): *"The average agent puts up two directional signs leading
  to the house. Successful Open Houses take 6-7 directional signs."* This is the closest thing
  to a practitioner benchmark: 2 signs = average/ineffective, 6-7 = successful. Directly
  supports our Q1 conclusion that 2-sign trails are inadequate.
- **Jordan Gouger** (ActiveRain): *"My city only allows 2 signs. I put up 15. What's the worst
  thing they can do, take my sign?"* — Direct evidence that agents with severe legal limits
  reject them as unworkable and break the rules rather than run an unfollowable trail. This
  means our tool should optimize for what WORKS, not just what's legal, while surfacing the
  compliance risk.
- **Mark Hall** (ActiveRain, "365 Tips" series): floor is 3 signs for a simple route, actual
  practice is 15-20 to create spectacle. Acknowledges the tension between minimal adequacy
  and what actually drives traffic.
- **Chris Alston** (ActiveRain): Introduces the **yard-sale psychology framework**: first sign
  pulls them in (curiosity), second sign makes them more likely to continue (commitment),
  third sign guarantees they show up (confirmation). *"When it becomes too hard to find, I
  turn around and go back."* — The turn-confirmation sign is the critical failure point where
  trails break.
- **Ron Trzcinski** (ActiveRain): placed signs with balloons, signs were stolen, *"no one
  came."* Direct evidence that any single break in the trail (theft, wind, parked car blocking
  visibility) results in zero traffic when you're running a minimal trail. Argues against
  bare-minimum setups where losing one sign breaks the route.

### Concentration vs. spread — practitioner consensus

- **UZ Marketing** explicitly states: *"Better to run a focused route with enough signs than
  scatter 2-3 random signs and hope."* Directly answers the Q1 tradeoff.
- **ActiveRain consensus across all reviewed threads:** concentrate signs along a single
  strong route rather than spreading thin across multiple directions. The "breadcrumb trail"
  metaphor implies a single unbroken line, not multiple thin strands.
- No forum contributor advocated for a 2-sign trail as adequate. The minimum mentioned by any
  practitioner was 3 signs (Hall's stated floor).

### Source quality findings

The workflow's adversarial verifiers systematically refuted claims based on **PrintPlace.com**
as overreach — it's a commercial sign-printing company whose "5-15 signs" recommendation
serves their sales interest. NAR publishes **no official minimum sign count.** This confirms
that our domain-rules-answers.md §0.5 (3 signs per direction minimum) is a logical construct
we derived, not an industry standard — consistent with our Q1 answer.

### NAR buyer data

NAR data cited by Showable.co: **only ~4% of buyers find homes through open house signage**
(another 5% use signs to find an agent). This contextualizes the entire sign trail as a
supplementary marketing tool — most buyers use GPS/digital navigation. The tool should be
practical and not over-engineer for perfection. A solid trail on the busiest approach covers
the 4% who rely on signs without wasting the agent's time on diminishing returns.

### Municipal 2-sign caps

Multiple jurisdictions legally cap open house directional signs at 2 total (Bellingham WA,
Alton IL, Cockburn WA). Agents operating in these jurisdictions face a hard choice: comply
and run an unfollowable trail, or break the rules. Our tool should flag these jurisdictions
explicitly: *"Local code limits you to 2 directional signs. This is insufficient for a
followable trail. Consider confirming whether enforcement is active, or supplement with
GPS-friendly listing descriptions."*
