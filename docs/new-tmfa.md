# Trail Mechanics Findings — Scope Reframe (Multi-Route)

**Date:** 2026-06-15
**Status:** Research complete — answers the 5 open questions from
[design-thesis.md](./design-thesis.md). Supersedes the Q1 answer in
[tmf-answers.md](./tmf-answers.md) (which baked single-route concentration into the engine).
These answers govern the constants that shape multi-route behavior.

**Method:** Web research across practitioner guides (Showable, Packeze, PromotionChoice,
ActiveRain, HomeLight, UZ Marketing, The Complete Package, Curb Hero), municipal code
review (Fremont, Dublin, Hayward, Pleasanton, San Jose, Oakland, Newark), and the NAR
2024 Home Buyer & Seller Generational Trends report.

---

## Q1 — Both-directions-same-arterial

### The question

> Do agents place directional signs catching traffic from both directions on the same
> road (e.g. NB and SB on 75th Ave), or only the dominant flow? When is two-way signing
> on one arterial worth it?

### Research findings

**The industry answer is unambiguous: yes, you sign both directions.** Every practitioner
source that addresses the topic recommends it:

- **PromotionChoice:** "Most open house routes require double-sided signs" because "half
  the potential audience never sees the sign" when you only cover one direction. Single-sided
  signs are only acceptable on "straight routes with minimal turns" — and even then the
  watch-out is "missed visibility from opposite direction."
  [Source](https://www.promotionchoice.com/blog/Best%20Custom%20Yard%20Signs%20for%20Real%20Estate%20Open%20Houses.html)

- **ActiveRain (agent blog):** Experienced agents place signs on "all four corners of major
  arterial intersections" or at minimum the two corners of the highest-traffic road. The
  recommended practice is to drive the arterial toward the target house from **both
  directions** and place forward-facing arrow signs at intervals before the turn-off.
  [Source](https://activerain.com/blogsview/3821258/signage-for-open-houses---why-is-it-important-)

- **Showable:** Recommends placing signs at "every turn and intersection," angling them
  "toward incoming traffic from each direction." While not explicitly saying "sign both
  sides of the same arterial," the directional logic implies it — each direction of traffic
  is a distinct incoming flow.
  [Source](https://showable.co/blog/open-house-signage)

- **The Complete Package / Packeze / HomeLight:** All describe the "breadcrumb trail"
  from "busy roads" without restricting to one direction. The core principle across all
  sources: create an unbroken stepping-stone path. If NB traffic sees no sign, the trail
  is broken for NB drivers.

**The only case where one-direction-only is legitimate:** a divided highway where drivers
from the opposite direction physically cannot access the turn-off (median barrier, no
cross-traffic intersection within range). In that case, the opposite-direction approach
doesn't exist as a navigable route.

**Double-sided signs vs. mirrored single-sided placement:** The industry prefers
double-sided signs (one sign visible from both directions) over two separate signs.
But for our purposes — a tool that places individual sign locations — mirrored placements
(NB sign + SB sign at the same decision point, or offset slightly) are the equivalent.
This is a placement optimization concern, not an approach-count concern.

### Answer

**Same arterial + opposite bearing = a legitimate distinct approach, not a duplicate.**
The current `selectDistinctApproaches` rule that rejects a second approach with the same
road name is wrong for the common case where NB and SB traffic form two separate approach
corridors to the same turn-off.

**When to treat opposite directions as one approach (dedup):**
- The road is a divided highway with a physical median AND no cross-traffic intersection
  within 0.5 mi of the turn-off that would allow opposite-direction traffic to cross.
- One direction has negligible traffic (e.g., the road dead-ends 200 ft past the approach
  point). This is rare for arterials.

**When to treat them as distinct approaches (no dedup):**
- Standard undivided or center-turn-lane arterial: always distinct.
- Divided highway WITH a traffic-light or stop-sign intersection near the turn-off that
  allows cross-traffic turns: distinct.

### Code implications

- **`approach-roads.ts` `selectDistinctApproaches`:** Remove the blanket "same road name =
  duplicate" rule. Instead, check bearing: if two approaches share a road name and their
  entry bearings are within ~40° of each other (same direction), merge them. If bearings
  are roughly opposed (≥120° apart), keep both as distinct approaches.
- **Constant:** `SAME_ROAD_BEARING_MERGE_THRESHOLD = 40` (degrees — below this, same
  direction flow, merge).
- **Constant:** `OPPOSITE_BEARING_MIN_SEPARATION = 120` (degrees — above this, definitely
  distinct; between 40–120°, ambiguous — keep the higher-traffic one).

---

## Q2 — Per-route followability floor

### The question

> What's the minimum signs that makes an independent approach followable — is a 2-sign
> approach (turn-off + one confirmation) enough, or does each route need the full
> entry→turn→confirm set?

### Research findings

**No industry source prescribes a "minimum N signs per direction."** The concept of a
per-route sign floor is a logical construct we derived — the industry doesn't think in
these terms. What the industry *does* say, universally:

- **"Place a sign at every turn where a driver could make a wrong decision."**
  ([Showable](https://showable.co/blog/how-many-open-house-signs),
  [Packeze](https://packeze.com/placement-strategies-for-open-house-signage/),
  [HomeLight](https://www.homelight.com/blog/open-house-signs/))

- **"If someone has to figure it out, you're losing people."**
  ([Showable](https://showable.co/blog/open-house-signage))

- **"Create an unbroken stepping-stone path from the busiest feeder road to the property,
  with no gap large enough for a driver to get lost."**
  ([Packeze](https://packeze.com/placement-strategies-for-open-house-signage/))

- **Minimum total signs for any open house:** 5–7 directional signs for a "typical suburban
  layout" (Showable), with 10–15 as the sweet spot. The 5–7 figure is for one complete
  trail — not split across routes.
  [Source](https://showable.co/blog/how-many-open-house-signs)

**The entry→turn→confirm model holds up under scrutiny.** If an approach has N turns
between the arterial entry and the property, a driver needs:
1. An **entry sign** on the arterial announcing the turn-off (or shortly before it).
2. A **direction sign at each turn** — every decision point where the driver could go wrong.
3. A **confirmation sign** at or very near the property so the driver knows they've arrived.

That's 2 + N signs minimum. For the degenerate case of a property directly on the arterial
(0 turns), the minimum is 2: entry sign + property sign. For a typical suburban approach
with 1 turn into the neighborhood, the minimum is 3: arterial entry + turn + property.

**A 2-sign approach with 1+ turns is unfollowable.** The driver sees the arterial entry
sign, takes the turn-off, reaches the first turn with no guidance, and gets lost. This is
the failure mode the earlier Q1 answer in tmf-answers.md correctly identified.

**The earlier tmf-answers.md Q1 answer was right about the per-route mechanics but wrong
about the strategic conclusion.** It correctly identified that 2 signs per direction is
unfollowable for routes with turns, and correctly built the entry→turn→confirm model.
But it then concluded "concentrate on the single busiest approach" — which is the
time-constrained agent's compromise, not the tool's optimum. The tool can place 8 signs
across 2 short routes (each 1 turn, needing 3 signs = 6 total + 2 near-house) and make
both followable. A solo agent at 6am might not have time to scout two approach corridors,
but the tool does.

### Answer

**The minimum is turn-driven, not a fixed number:**

| Turns on approach | Minimum signs for followability | Explanation |
|---|---|---|
| 0 (property on arterial) | 2 | Entry + property confirmation |
| 1 | 3 | Entry + turn + property |
| 2 | 4 | Entry + turn₁ + turn₂ + property |
| N | N + 2 | Entry + 1 per turn + property confirmation |

**At 2 signs per route, only a 0-turn approach is followable.** Any route with turns needs
≥3. This means a 5-sign budget can fund:
- 1 route with 2 turns (4 signs + 1 near-house), or
- 2 routes each with 0 turns (2+2+1 near-house — degenerate case), or
- 1 route with 1 turn (3 signs + 2 near-house)

It cannot fund 2 independent 1-turn routes (would need 6 signs minimum + near-house).

### Code implications

- **`HARD_MIN_SIGNS_PER_APPROACH`** should be dynamic: `2 + approach.turnCount`. This
  replaces the current flat `HARD_MIN_SIGNS_PER_APPROACH = 2` concept.
- **`MIN_SIGNS_PER_APPROACH`** (soft target): `3 + approach.turnCount` — adds a confirmation
  sign after the last turn for comfort. This is the "recommended" floor.
- **Budget gate:** Before opening a secondary approach, verify that `signCount ≥
  sum(minSignsForEachApproach) + nearHouseReserve`. If the budget can't fund each approach
  at its hard minimum, reduce the approach count.
- **Near-house reserve:** 1–2 signs minimum (property sign + one on the property's street),
  separate from approach trail signs. This is the "final block" saturation the industry
  universally recommends.

---

## Q3 — Multi-route ROI

### The question

> Does covering 2–3 independent approaches measurably lift open-house attendance, or does
> most value come from the single best approach + the near-house block? (Anchors against
> the NAR "4% find via signage" stat.)

### Research findings

**The NAR stat:** 4% of home buyers found the home they purchased through a yard sign or
open house sign (NAR 2024 Home Buyer & Seller Generational Trends). An additional ~5% were
directed by open house signs to the right agent (who then helped them find a different home).
So signage's total value is ~9% — 4% direct purchase attribution, 5% agent-lead attribution.

**No academic or industry study directly compares single-route vs. multi-route attendance
lift.** This is a genuine gap in the literature. The available evidence is directional but
not dispositive:

- **Practitioner consensus leans toward breadth:** Every guide says "cover all approaches,"
  "lead visitors from where they are," "signs from every direction." None says "pick one
  direction and go deep." But this is marketing advice aimed at agents with time budgets —
  it's not backed by A/B testing.
  ([Showable](https://showable.co/blog/how-many-open-house-signs),
  [Packeze](https://packeze.com/placement-strategies-for-open-house-signage/))

- **Agent anecdotal evidence favors more coverage:** ActiveRain agents report "dramatically
  better foot traffic" with 15+ signs placed across multiple approaches vs. sparse coverage.
  But this conflates total sign count with route count — more signs overall, not more routes
  per se.

- **The economic logic is sound:** Each additional approach captures a distinct traffic shed
  — drivers who enter the area from a different direction and would never encounter a sign on
  the primary route. If the secondary approach carries even 30% of the primary's traffic, and
  signage drives 4% of purchases, the marginal lift is real but small (~1–2 additional
  attendees per open house, assuming baseline attendance of 10–20).

- **The "near-house block" effect is the strongest per-sign ROI:** 3–5 signs within a block
  of the property serve every approach simultaneously — they're the shared last mile. This
  is why every guide emphasizes final-block saturation. Signs on the approach are route-specific;
  signs near the house benefit all routes.

**The honest answer: we don't have dispositive data, and nobody does.** The thesis that
multi-route coverage lifts attendance is logically sound and consistent with practitioner
advice, but it's unproven. The tool's value proposition ("find the approaches the agent
wouldn't scout manually") rests on the assumption that more approaches = more findability.
That assumption is reasonable but should be stated as an assumption, not a finding.

### Answer

**Multi-route coverage is directionally correct but empirically unproven.** The logic chain:
more approach corridors → more drivers encounter a sign → more attendees → higher probability
of a buyer match. Each link is plausible but the chain hasn't been measured end-to-end.

**The single best approach + near-house block is the safe baseline** — it's what agents do
today, and it demonstrably works (4% of purchases involve signage). Multi-route coverage is
the upside bet: it can't be *worse* than single-route (assuming each route is followable),
and it plausibly adds marginal attendees from unserved traffic sheds.

**Recommendation:** Surface all viable approaches, fund them at followable minima, and be
transparent in the UI that the attendance lift from additional routes is plausible but not
guaranteed. Don't claim "more routes = more buyers" as a fact.

### Code implications

- **Don't gate route count aggressively based on unproven ROI assumptions.** The current
  `maxApproachesForSignCount` (1 route until 8 signs, 2 until 12) is too conservative.
- **New default:** 1 route at 5–7 signs, 2 routes at 8–11 signs, 3 routes at 12+ signs
  — *provided each route meets its turn-driven minimum.*
- **UI:** Show a confidence qualifier: "2 approach routes found. Covering both may increase
  visibility from different directions, though most buyers find homes through a single
  well-signed route."

---

## Q4 — Diminishing returns

### The question

> Beyond ~3 approaches, is there evidence of overkill / the "spectacle" backlash, or do
> big-grid neighborhoods genuinely benefit from 4+?

### Research findings

**The "spectacle" backlash is real and municipal codes are tightening in response.**

- **Fremont, CA (2024 code review):** Explicitly called out agents using contractors to
  deploy "100 or more open house signs every weekend" for brand advertising, not wayfinding.
  Proposed caps: 4 per property, 4 per intersection, 1 per property per intersection.
  [Source](http://fremontcityca.iqm2.com/Citizens/FileOpen.aspx?Type=1&ID=1538)

- **Bay Area municipal caps (current):**

  | City | Cap |
  |------|-----|
  | Dublin | 4 per property, 8 per intersection, 1/property/intersection |
  | Hayward | 4 directional + 1 on-site; max 4 per intersection |
  | Pleasanton | 4 signs total per property |
  | San Jose | Effectively banned on public ROW |
  | Oakland | Prohibited on public property |
  | Newark | Off-site only on private property; time-limited |

- **Industry complaint:** A "significant amount" of complaints come from *other agents* who
  say non-compliant competitors gain an "unfair business advantage" through sheer sign volume.
  This is the spectacle problem: too many signs reads as desperate/aggressive, not helpful.

**For approach routes specifically (not total signs):**

- **2–3 independent approaches covers the typical suburban grid.** Most neighborhoods have
  2–4 entry points from surrounding arterials. Beyond 3 approaches, you're either:
  - Covering minor/duplicate entries (same traffic shed as an existing approach), or
  - Signing low-traffic residential streets as "approaches" (not real feeder routes).

- **The industry sweet spot of 10–15 total signs** (Showable) across 2–3 approaches leaves
  3–5 signs per approach + 3–5 near-house. At 4 approaches with 10–15 total signs, each
  approach gets 2–3 signs — which is at or below the followability floor for any route
  with turns.

- **Curb Hero's 25–35 sign recommendation** is the extreme outlier and draws the kind of
  complaints that drive municipal crackdowns. It's not a model to follow.

### Answer

**3 approaches is the practical ceiling for all but the most complex grids.** Beyond 3:
- Each additional "approach" is likely serving a traffic shed already covered, or is a
  low-traffic residential entry that doesn't justify the sign budget.
- The total sign count needed to make 4+ routes followable (4 routes × 4 signs min =
  16 + near-house = 18+) exceeds both the industry sweet spot (10–15) and most municipal
  caps (4–8).
- The spectacle risk becomes real at ~20+ total signs. At 4+ approach routes, you're
  approaching that territory.

**Exception:** Large grid neighborhoods bounded by 4+ distinct arterials with meaningful
traffic, where each approach genuinely captures a different population. In that case,
4 routes can be justified — but only at high sign budgets (16+).

### Code implications

- **`maxApproachesForSignCount` ceiling:** Cap at 3 for budgets ≤15 signs. Allow 4 only
  at 16+ signs AND only when ≥4 genuine distinct arterials are detected.
- **Approach distinctiveness check:** Before counting an approach as distinct, verify it
  doesn't share >50% of its traffic shed with an already-selected approach. (This is a
  future enhancement — requires traffic data.)
- **UI warning at 4+ routes:** "4 approach routes is unusual and may exceed local sign
  limits. Consider focusing on the 3 highest-traffic approaches."

---

## Q5 — Fixed-budget tradeoff (8 signs)

### The question

> With 8 signs, is one deep trail or thinner 2–3-route coverage better for "did buyers
> actually find it"?

### Research findings

**No direct experimental comparison exists.** The answer must be derived from first
principles using the followability model (Q2) and practitioner guidance.

**What the industry says about 8 signs:**
- Showable: 5–7 directional signs for a "typical suburban layout" plus 3–5 near-house.
  That's 8–12 total — and it describes *one trail*, not split across routes.
  [Source](https://showable.co/blog/how-many-open-house-signs)
- The consensus across all sources: make one trail solid before branching out.
- No source says "split 8 signs across 3 routes at 2–3 signs each."

**The math, using turn-driven minima from Q2:**

| Strategy | Route 1 | Route 2 | Route 3 | Near-house | Followable? |
|----------|---------|---------|---------|------------|-------------|
| 1 deep (2-turn route) | 4 | — | — | 4 | ✅ 1 solid route |
| 1 deep (1-turn route) | 3 | — | — | 5 | ✅ 1 solid + heavy near-house |
| 2 routes (1 turn each) | 3 | 3 | — | 2 | ✅ Both followable, light near-house |
| 2 routes (2-turn + 1-turn) | 4 | 3 | — | 1 | ⚠️ Marginal near-house |
| 2 routes (2 turns each) | 4 | 4 | — | 0 | ❌ No near-house |
| 3 routes (1 turn each) | 3 | 3 | 3 | -1 | ❌ Impossible |

**The answer depends on the property's turn topology:**
- If the best approach has 2+ turns (needs 4 signs) and the second-best has 1 turn (needs 3),
  you can do 2 routes at 4+3+1 near-house = 8 signs. Both are followable. This is the best
  multi-route scenario at 8 signs.
- If both approaches have 2+ turns, 2 routes is impossible without starving near-house.
  Go 1 deep route.
- If all approaches have 1 turn, 2 routes at 3+3+2 near-house = 8 works.
- 3 routes at 8 signs is never possible at followable minima (would need 9+ signs before
  near-house reserve).

### Answer

**At 8 signs, the answer is turn-driven, not a fixed strategy:**

- **1 deep route (6 trail + 2 near-house) is the default.** It's always valid regardless of
  turn complexity, and it matches what agents do today. It's the safe recommendation.
- **2 routes is viable ONLY when both routes are short (≤1 turn each, needing ≤3 signs each)
  AND the near-house reserve can still get 2 signs.** That's 3+3+2 = 8. This covers two
  genuinely different traffic sheds while keeping both trails followable.
- **2 routes with a 2-turn primary is marginal:** 4+3+1 = 8, but 1 near-house sign is thin
  (industry recommends 3–5). Only recommend this when the secondary approach carries
  substantial distinct traffic.
- **3 routes at 8 signs is never viable.** Don't offer it.

**UI recommendation:** At 8 signs, present the options:
1. "1 deep trail (6 signs) + 2 near-house — most reliable"
2. If applicable: "2 approach routes (3 signs each) + 2 near-house — broader coverage"

Let the agent choose.

### Code implications

- **Budget allocation should be turn-driven, not percentage-driven.** The current 40%
  near-house reserve is too rigid. Instead:
  1. Calculate `minSigns = 2 + turnCount` for each approach.
  2. Fund approaches in priority order (traffic volume) until budget exhausted.
  3. Allocate remaining budget to near-house saturation (target: 3–5, minimum: 2).
  4. If near-house can't hit its minimum (2), reduce approach count.
- **New constants:**
  - `NEAR_HOUSE_TARGET = 3` (soft)
  - `NEAR_HOUSE_MIN = 2` (hard)
  - `SIGNS_PER_TURN = 1`
  - `BASE_SIGNS_PER_APPROACH = 2` (entry + property confirmation)
- **At 8 signs, the typical allocation:** 1 deep route OR 2 short routes — never 3.

---

## Summary of constant changes

| Constant | Old (tmf-answers) | New (this doc) | Rationale |
|----------|-------------------|----------------|-----------|
| Same-road dedup | Reject if same road name | Reject only if bearings within 40° | Q1 — opposite directions are distinct |
| `HARD_MIN_SIGNS_PER_APPROACH` | 2 (flat) | `2 + turnCount` (dynamic) | Q2 — turn-driven floor |
| `MIN_SIGNS_PER_APPROACH` | 3 (flat, soft target) | `3 + turnCount` (dynamic) | Q2 — adds confirmation sign |
| `maxApproachesForSignCount` | 1 until 8, 2 until 12 | 1 at 5–7, 2 at 8–11, 3 at 12–15, 4 at 16+ | Q3/Q4 — looser gating |
| Near-house reserve | 40% of budget | Dynamic: target 3, min 2, from remainder after approach minima | Q5 — turn-driven allocation |
| Approach ceiling | None explicit | 3 default, 4 only at 16+ signs | Q4 — diminishing returns |

---

## Open questions remaining

These were not answerable from public sources and would need primary research (agent
surveys, A/B testing, or traffic modeling):

1. **Actual attendance lift from multi-route:** A controlled study comparing 1-route vs.
   2-route vs. 3-route open houses (same property, different weekends) would settle Q3.
   Until then, the multi-route thesis is plausible but unproven.
2. **Driver tolerance for sign gaps:** How many feet/secons without a sign before a driver
   gives up and turns around? This would refine the followability model. Current industry
   rule of thumb: "no gap large enough to get lost" — imprecise but universal.
3. **Traffic-shed overlap model:** When do two approaches serve the same drivers? This
   needs actual traffic-flow data per market and is likely city-specific.

---

## Changelog

- 2026-06-15 — Initial research and synthesis. Supersedes tmf-answers.md Q1 answer and
  the single-route concentration defaults.
