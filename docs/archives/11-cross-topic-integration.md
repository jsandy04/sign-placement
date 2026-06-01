# Cross-Topic Integration: How Pipeline Components Interact

## Decision Needed

How do the findings from Topics 1-7 interact? Where do changes in one component cascade to others, and what are the integration points that must be designed consistently?

---

## 1. Scoring -- LLM Interaction: Hard Constraints vs. Scored Factors

### Current State

Topic 1 established that safety and legal compliance should be **hard constraints** (pass/fail filters applied before scoring), not weighted scoring factors. Topic 5 established that the LLM performs the final ranking and explanation.

### The Handoff Point

The pipeline should have three distinct stages, with the LLM operating on a pre-filtered set:

```
Stage 1: Candidate Generation
  - Directions API produces raw turn points
  - Polyline decoding generates intermediate candidates
  - Output: Unfiltered candidate list (N = 15-40 typical)

Stage 2: Hard Constraint Filtering (BEFORE LLM)
  - Legal: Remove candidates violating local ordinances (setback from
    intersections, right-of-way restrictions)
  - Safety: Remove candidates in visibility triangles, blocking fire
    hydrants, etc.
  - Physical: Remove candidates that are impossible to place (median,
    water, private property with no permission)
  - Offset: Apply AASHTO-based minimum distance from turns
  - Spacing: Apply minimum spacing between candidates
  - Output: Filtered candidate list (N = 5-15 typical)

Stage 3: LLM Scoring & Ranking
  - Receives ONLY the pre-filtered candidate list
  - Scores remaining candidates on soft factors:
    * Traffic volume / road class
    * Decision-point criticality (breadcrumb continuity)
    * Visibility quality
    * Proximity to complementary routes
  - Produces ranked list with explanations
  - Output: Final ranked candidates (N = 3-8 displayed)
```

### Why This Order Matters

**If legal/safety filtering happens after the LLM:**
- Wasted LLM cost on candidates that will be discarded
- LLM may recommend a candidate that violates a hard constraint
- User sees recommendations that are illegal to implement
- Creates trust issues if the tool recommends an illegal placement

**If legal/safety filtering happens before the LLM:**
- LLM receives a cleaner, smaller input set -- faster and cheaper
- LLM can focus on the comparative scoring task it handles well
- Hard constraint violations are caught deterministically, not left to
  LLM judgment (which is fallible on precise legal rules)
- The LLM prompt is simpler: "rank these" instead of "rank these while
  also checking if each one is legal"

### LLM Role in Legal Review

The LLM should NOT be asked to evaluate legal compliance from scratch.
It should only be told that the candidates it receives have already been
vetted for legal/safety compliance. However, the LLM can add value by:

- Flagging edge cases where filtering might have been incorrect
- Explaining in natural language WHY a particular candidate scores well
  (e.g., "This intersection has high approach traffic and is the last
  turn before the property, making it a critical breadcrumb point")
- Adjusting relative scores based on local knowledge encoded in training
  data (e.g., knowing that certain road types tend to have higher
  conversion rates)

### Summary

| Aspect | Recommendation |
|---|---|
| Hard constraint filter location | BEFORE LLM, as deterministic Stage 2 |
| LLM legal role | None on hard constraints. Optional advisory on edge cases. |
| Candidate count sent to LLM | 5-15 (filtered), not 15-40 (raw) |
| LLM prompt cost reduction | ~40-50% fewer tokens from shorter candidate lists |
| Error mode | If legal DB is incomplete, filter may miss violations. LLM
  can catch obvious ones as a secondary check, but not a replacement. |

---

## 2. API Granularity -- Scoring: Polyline Decoding and Candidate Volume

### Current State

Topic 2 found that Directions API step-level maneuvers may produce too few
candidates on short residential routes. The fallback is polyline-based turn
detection: decode the encoded polyline, compute bearing changes between
consecutive points, and flag direction changes above a threshold (e.g.,
> 30 degrees) as candidate turn points.

### The Cascade Effect

| Factor | Step-Only Mode | Polyline Mode |
|---|---|---|
| Candidates per route | 3-8 (only at explicit maneuvers) | 8-25 (any change of direction) |
| Noise rate | Low (every maneuver is meaningful) | Medium (some direction changes are
  road curvature, not intersections) |
| Scoring bandwidth needed | Low | Higher |
| LLM input size | Small | Potentially 3x larger |

### Adjustments Required

**1. Noise filtering must be added to Stage 2.**

When polyline mode is active, Stage 2 must include a curvature filter to
remove candidates that are road curves rather than actual intersections:

```
Polyline candidate filter rules:
  - Minimum bearing change: 30 degrees (below this = road curve)
  - Minimum segment length before turn: 50 ft (excludes micro-adjustments)
  - Consecutive turn filter: if two candidates within 100 ft of each
    other with similar bearing changes, keep only the sharper one
  - Road width heuristic: bearing change that returns to original
    heading within 200 ft is likely a chicane, not an intersection
```

**2. Scoring algorithm must handle variable candidate density.**

A route with 3 candidates and a route with 15 candidates need comparable
score distributions. The scoring should normalize so the highest-ranked
candidate always gets a score near 1.0 regardless of input size. This
prevents dense routes from appearing "better" than sparse routes.

**3. LLM prompt adaptation.**

If polyline mode is active, the prompt should acknowledge the higher
noise level and instruct the LLM to be more selective:

```
System prompt addition when polyline mode active:
"Some of these candidates were detected from road geometry changes
rather than explicit turn instructions. Evaluate each candidate's
real-world suitability independently. A valid placement requires
an actual intersection or driveway that a driver would recognize
as a decision point."
```

**4. Mode selection should be automated.**

The system should detect when to use polyline mode:

```
If (direction_api_step_count < 5) {
  Enable polyline decoding
  Set noise_filter_threshold = "high"
} else {
  Use step-level candidates only
  Set noise_filter_threshold = "standard"
}
```

### Summary

| Aspect | Recommendation |
|---|---|
| Polyline mode trigger | Step count < 5 on approach route |
| Noise filter parameters | 30-deg bearing change, 50-ft segment min |
| Scoring adjustment | Normalize top score to 1.0 regardless of candidate count |
| LLM prompt change | Add noise awareness instruction |
| Candidate count range | 3-8 (step) vs 8-25 (polyline), filtered to 5-15 for LLM |

---

## 3. Offset Distances -- API Data: Speed Estimation Without Speed Limits

### Current State

Topic 6 found that AASHTO-based offset distances are the right framework,
but the offset distance depends on approach speed. Topic 6 also found
that Google's Roads API Speed Limits endpoint requires a $10,000+/year
Asset Tracking license, making it cost-prohibitive for this tool.

### The Speed Estimation Problem

The pipeline needs approach speed to calculate offset distance, but the
primary API (Routes API / Directions API) does not return speed limits or
road classification. The Roads API does but costs too much.

### Solution: Road Classification from Directions API Geometry

The Directions API response includes encoded polylines at the step level.
Each step covers one road segment. By analyzing step characteristics,
we can classify the road without a separate speed API:

```
Step characteristic -> Road class -> Estimated speed

Step distance > 0.5 miles AND step duration > 60s
  -> Likely arterial/major road
  -> Default speed: 45 mph (urban) / 55 mph (rural)

Step distance 0.1-0.5 miles AND step duration 15-60s
  -> Likely collector road
  -> Default speed: 35 mph

Step distance < 0.1 miles AND step duration < 15s
  -> Likely local/residential road
  -> Default speed: 25 mph

Step has maneuver = RAMP_LEFT or RAMP_RIGHT
  -> Highway interchange
  -> Default speed: 55 mph

Step has maneuver = MERGE
  -> Highway or freeway
  -> Default speed: 65 mph
```

### Accuracy Tradeoff

| Method | Accuracy | Cost | Notes |
|---|---|---|---|
| Roads API Speed Limits | +/- 5 mph | $10k+/yr license | Gold standard, but prohibitive |
| Step-duration heuristic (above) | +/- 10 mph | $0 (included in route response) | Reasonable for offset calculation |
| OSM road classification lookup | +/- 5-10 mph | $0 (free) | Requires additional API or database |
| User-provided speed estimate | +/- 15 mph | $0 | Worst accuracy, but viable fallback |

The step-duration heuristic is recommended as the default because:

- It uses data already returned by the Directions API
- The error band (+/- 10 mph) is acceptable for offset calculation
  (Example: SSD at 35 mph = 250 ft; at 45 mph = 325 ft. The 75 ft
  difference is within the safety margin built into the offset formula)
- The step distance measurement is inherent in the API response, not
  a separate API call
- No additional cost or API surface area

### AASHTO Offset Applied to Estimated Speeds

Using the AASHTO SSD table from Topic 6 with speed estimated from road
classification:

| Estimated Speed | Road Type (by step heuristics) | Recommended Offset |
|---|---|---|
| 25 mph | Residential/Local | 120 ft (round to nearest 10) |
| 35 mph | Collector/Suburban | 200 ft |
| 45 mph | Arterial/Urban Major | 280 ft |
| 55 mph | Rural Arterial or Highway | 440 ft |
| 65 mph | Freeway | 570 ft |

These offsets represent the minimum distance BEFORE a turn. The "after"
offset (distance after the turn for sign placement) should be shorter:
15-25% of the pre-turn offset, or a flat 50 ft for residential roads.

### Fallback: When Step Data Is Insufficient

On very short routes (1-2 steps, total < 0.5 miles), step characteristics
may not provide enough data for classification. In this case:

1. Use the geocoded property location to query road type via
   the Nearest Road sub-endpoint of the Roads API (no special license
   needed for this basic endpoint -- $10/1K calls, free tier first 5K)
2. Or fall back to a default assumption of 25 mph (residential) which is
   the safest (most conservative) assumption -- shorter offset means the
   sign is placed closer to the turn, which is more visible but gives
   less reaction time. Conservative is better for safety.

### Summary

| Aspect | Recommendation |
|---|---|
| Primary speed source | Step-duration heuristic from Directions API |
| Accuracy | +/- 10 mph -- acceptable for offset calculation |
| Fallback 1 | Nearest Road API (basic, no special license) |
| Fallback 2 | Default 25 mph (conservative residential assumption) |
| Expensive option skipped | Roads API Speed Limits ($10k/yr license) |
| Offset ranges | 120 ft (residential) to 570 ft (freeway) |

---

## 4. Spacing -- Optimization: Penalty vs. Hard Constraint

### Current State

Topic 7 found that municipal spacing rules range from 5 ft to 1,000 ft
and are context-dependent. The question is how this interacts with the
optimizer that selects the final N placements from scored candidates.

### Design Decision: Two-Tier Spacing

Spacing should operate at TWO levels:

**Level 1: Hard Constraint (deterministic, Stage 2)**
- Enforce minimum spacing based on local ordinance if known
- Default minimum: 50 ft if no local data exists (conservative default)
- This ensures no two selected candidates are too close to each other
- Applied BEFORE LLM ranking, same as other hard constraints

**Level 2: Optimization Penalty (scored component)**
- Beyond the minimum, closer candidates should score slightly lower
  to encourage even distribution
- This is a soft penalty: score -= f(distance_between_candidates)
- Penalty function: linear decay from 0 penalty at > 500 ft to
  -0.1 score at 50 ft (the hard minimum)
- Applied by the optimizer when selecting the final N from the
  LLM-ranked list

### How the Optimizer Uses Spacing

The optimizer (which selects final N placements from a scored list) should
use a greedy algorithm with spacing awareness:

```
Algorithm: Greedy Selection with Spacing Penalty

1. Sort all scored candidates by LLM score (descending)
2. Pick the highest-scored candidate
3. For each remaining candidate:
   a. Calculate distance to all already-selected candidates
   b. If any distance < hard_min_spacing (Level 1): remove candidate
   c. If all distances > hard_min_spacing: apply soft penalty
      based on distance to nearest selected candidate
   d. Re-sort remaining candidates by adjusted score
   e. Pick the next highest
4. Repeat until N candidates selected or no viable candidates remain
```

This approach ensures:
- No spacing violation is ever recommended (Level 1 hard constraint)
- Among equally good candidates, the optimizer prefers well-distributed
  ones (Level 2 soft penalty)
- The user always gets valid placements even without local ordinance data
- If local ordinance data IS available, the hard minimum adjusts
  automatically (50 ft default, 500 ft if 1,000 ft municipal rule is known)

### Table: Spacing Configuration by Data Availability

| Scenario | Hard Min | Soft Penalty Start | Notes |
|---|---|---|---|
| No local data | 50 ft | 500 ft | Conservative default minimum |
| Local ordinance known (e.g., 1,000 ft rule) | 1,000 ft | 1,500 ft | Penalty starts beyond legal min |
| Distance to nearest neighbor data available | 50 ft | Adaptive | Use observed agent spacing |
| User overrides | User-set value | Hard min + 300 ft | Power user mode |

### Summary

| Aspect | Recommendation |
|---|---|
| Spacing level 1 | Hard constraint in Stage 2 filtering |
| Spacing level 2 | Soft penalty in optimizer (final selection) |
| Default hard minimum | 50 ft |
| Penalty function | Linear: score -= 0.1 at 50ft, -= 0.0 at 500ft+ |
| Selection algorithm | Greedy with spacing-aware re-sort |
| Order of operations | Filter -> LLM score -> spacing penalty -> select N |

---

## 5. Cost Validation: Updated Per-Analysis Estimate

### Current State

Topic 3 estimated $0.027/analysis for Maps APIs only (Geocoding +
Directions). The actual cost depends on whether Directions API (legacy,
cheaper) or Routes API (new, field-mask-based) is used.

### Maps API Cost Breakdown (Updated)

Using the March 2025 per-SKU pricing model (not the old $200 credit):

| API Call | SKU Tier | Free Tier | Cost per 1K | Cost per Analysis | Notes |
|---|---|---|---|---|---|
| Geocoding (1 call) | Essentials | 10K/mo | $5.00 | $0.005 | One address lookup |
| Directions/Routes (3 approach routes avg) | Essentials | 10K/mo | $5.00 | $0.015 | Property to 3 major roads |
| Maps JavaScript (1 page load) | Essentials | 10K/mo | $7.00 | $0.007 | Interactive result map |
| Roads API Nearest Road (fallback only) | Essentials | 5K/mo | $10.00 | $0.01 (rare) | Only used when step data insufficient |
| **Subtotal (Maps only)** | | | | **$0.027** | Per analysis, within free tier |

**Key update:** The free tier covers 10,000 analyses/month for Essentials
SKUs. A single agent running 100-200 analyses/month would stay well within
the free tier across all Maps APIs. The pricing model change from the old
$200 credit to per-SKU free caps benefits this tool because usage is spread
across multiple Essentials SKUs with individual free allocations.

### LLM Cost Breakdown

Using Topic 4's recommendation of Claude Sonnet 4.6 at $3/$15 per M tokens:

| LLM Operation | Input Tokens | Output Tokens | Cost |
|---|---|---|---|
| System prompt (cached) | ~800 | -- | $0.000 (cache hit) |
| Candidates + scoring prompt | ~1,700 | -- | $0.005 (1,700 * $3/1M) |
| LLM output (ranked list + explanations) | -- | ~1,000 | $0.015 (1,000 * $15/1M) |
| **Total per LLM call** | ~2,500 | ~1,000 | **$0.020** |

With prompt caching (as recommended by Topic 4), system prompt costs
approach zero after the first few calls. The per-LLM-call cost stabilizes
at approximately $0.020.

### Combined Per-Analysis Cost

| Component | Cost | Share of Total |
|---|---|---|
| Maps APIs (Geocoding + Directions + Map) | $0.027 | 57% |
| LLM (Claude Sonnet 4.6, 1 call) | $0.020 | 43% |
| **Total per analysis** | **$0.047** | 100% |

At 200 analyses/month (typical agent usage): $9.40/month
At 1,000 analyses/month (heavy usage): $47.00/month

Both are well within the Maps free tiers (10K/month each) and LLM costs
are the dominant factor at scale.

### Where Costs Could Be Higher

| Scenario | Cost Increase | Mitigation |
|---|---|---|
| 5+ approach routes needed | +$0.025 per extra route | Limit to 3 maximum for optimization |
| Roads API fallback needed | +$0.01 per fallback call | Rare: only when step data < 2 steps |
| 3 LLM retries required | +$0.06 for retries | Cap retries at 2, use model with JSON mode |
| Maps API over free tier (reselling) | Full pay-as-you-go | At scale, use subscription plan (~$100/mo for 50K) |

### Summary

| Aspect | Updated Value |
|---|---|
| Maps API cost per analysis | $0.027 (unchanged from Topic 3) |
| LLM cost per analysis | $0.020 (Claude Sonnet 4.6, 1 call)
| Total cost per analysis | $0.047 |
| Monthly cost at 200 analyses | $9.40 |
| Monthly cost at 1,000 analyses | $47.00 |
| Free tier coverage | Maps APIs covered up to 10K/mo each |
| Dominant cost at scale | LLM (43%) |

---

## 6. Pipeline Dependency Map

Below is a text diagram of the pipeline with dependencies, fallback paths,
and single points of failure.

```
                                    +------------------+
                                    |  USER INPUT:     |
                                    |  Address string  |
                                    +--------+---------+
                                             |
                                             v
                                    +--------+---------+
                  [FAIL] <---------+  GEOCODING API    +---------> [FATAL]
                  Can't proceed    |  (address -> lat/ |     Pipeline cannot
                  without coords   |   lng)            |     start without
                                    +--------+---------+     coordinates
                                             |
                                             v
                                    +--------+---------+
                                    |  FIND NEAREST    |
                                    |  MAJOR ROADS     |
                                    |  (spatial query  |
                                    |   against cached |
                                    |   road network)  |
                                    +--------+---------+
                                             |
                    +------------------------+------------------------+
                    |                        |                        |
                    v                        v                        v
            +-------+--------+      +--------+--------+      +-------+--------+
            | ROUTE ANALYSIS |      | ROUTE ANALYSIS  |      | ROUTE ANALYSIS  |
            | (Approach 1)   |      | (Approach 2)    |      | (Approach 3)   |
            +-------+--------+      +--------+--------+      +-------+--------+
                    |                        |                        |
                    v                        v                        v
            +-------+--------+      +--------+--------+      +-------+--------+
            | Directions API |      | Directions API  |      | Directions API  |
            +-------+--------+      +--------+--------+      +-------+--------+
                    |                        |                        |
                    +------------------------+------------------------+
                                             |
                                     +-------v--------+
         +----------------------------+  COMBINE       |
         |                            |  ROUTE STEPS   |
         |                            +-------+--------+
         v                                    |
    [Partial failure OK]                      v
    If one route fails,                +-------+--------+
    process remaining                  | CANDIDATE      |
    routes without it                  | GENERATION     |
                                        | (turn points   |
                                        | from maneuvers |
                                        | + polyline)    |
                                        +-------+--------+
                                                |
                                                v
                                        +-------+--------+
                        +---------------+ HARD CONSTRAINT |
                        |               | FILTER         |
                        |               | (legal, safety,|
                        |               |  offset,       |
                        |               |  spacing)      |
                        |               +-------+--------+
                        |                       |
                        |                       v
                        |               +-------+--------+
                        |               | LLM SCORING &  | <------[FAIL]
                        |               | RANKING        |        Fallback to
                        |               +-------+--------+        deterministic
                        |                       |                ranking
                        |                       v
                        |               +-------+--------+
                        |               | OPTIMIZER      |
                        |               | (select final N|
                        |               |  with spacing  |
                        |               |  penalty)      |
                        |               +-------+--------+
                        |                       |
                        v                       v
                +-------+--------+      +-------+--------+
                | MAP RENDER     |      | RESULTS JSON   |
                | (JavaScript)   |      | (API response) |
                +----------------+      +----------------+
```

### Single Points of Failure

| Step | Failure Mode | Impact | Mitigation |
|---|---|---|---|
| Geocoding API | Any failure | **FATAL** -- pipeline cannot start | Pre-validation of address format; cache common addresses |
| Directions API | Complete failure | **FATAL** -- no route data | Fallback to straight-line distance heuristic (poor quality) |
| Directions API | Partial failure | **Degraded** -- one approach route missing | Process remaining routes; results are less comprehensive |
| LLM API | Failure | **Degraded** -- no ranking/scoring | Fallback to deterministic scoring (traffic counts, road class heuristics) |
| Maps JS API | Failure | **Degraded** -- no visual map | Return text results with list view only |
| Hard constraint DB | Data missing | **Degraded** -- may miss local laws | Fallback to conservative defaults (50 ft spacing, 25 ft setback) |

### Notes on Failure Propagation

- **Geocoding is the only true single point of failure.** Without
  coordinates, no pipeline step can proceed.
- **Directions API partial failures are expected.** In rural areas, one or
  more approach routes may return ZERO_RESULTS. The pipeline should handle
  this as a normal state, not an error.
- **LLM failure is non-fatal.** The deterministic scoring fallback is
  less sophisticated but still produces useful results. This is the
  recommended graceful degradation path.
- **The Maps JavaScript API is the least critical.** It renders results
  that are already computed. Failure here is a UI problem, not a pipeline
  problem.

---

## 7. Data Freshness and Caching Strategy

### What MUST Be Re-Run

| Data Point | Why Must Refresh | Freshness Window |
|---|---|---|
| Directions/Routes API | Routing changes (new roads, construction, one-way
  changes, traffic patterns). For residential areas, routing is stable
  but not guaranteed. | Each analysis (no cache) |
| Traffic volume estimates | Traffic patterns change with season, time of day,
  road closures, development. | Prefer live data; cache for max 7 days |
| LLM ranking | LLM output is non-deterministic. Re-running may give
  different rankings. | Each analysis (no cache) |
| Road classification heuristic | Derived from step data which changes with
  routing results. | Each analysis (derived, no separate cache) |

### What CAN Be Cached

| Data Point | Cache Duration | Reason |
|---|---|---|
| Geocoding result (lat/lng for address) | 30 days (or until address is edited) | Geocoding results are stable for the same
  formatted address. Google recommends periodic refreshes but changes are
  rare. Caching is explicitly allowed by Google ToS. |
| Nearest major roads | 30 days | The set of major roads near an address
  changes only when new roads are built. |
| Local ordinance data (setbacks, spacing) | Until updated (manual refresh) | Ordinance data changes infrequently (years).
  Store in application database with last-reviewed timestamp. |
| Road network geometry (for route analysis) | 30 days | Can be cached if using a local OSM-based
  road graph. If using Google API, re-fetch each time (the API IS the
  source of truth). |
| LLM prompt / system prompt | Indefinite | Static prompt content. Cache at application
  level. |
| AASHTO offset tables | Indefinite | Engineering standards that change on
  multi-year cycles. |

### Caching Rules: Practical Implementation

```
CACHE POLICY:

Geocoding cache:
  Key: "geocode:{normalized_address}"
  TTL: 30 days
  Invalidation: User edits address, or manual "refresh" button
  Purpose: Avoid $0.005 charge on every re-analysis

Road network cache (optional, if using local OSM):
  Key: "roads:{lat_bucket}:{lng_bucket}" (bucketed to ~1km grid)
  TTL: 7 days (since this is derived, not from a paid API)
  Purpose: Speed up nearest-major-road queries

Local ordinance cache:
  Key: "ordinance:{city}:{state}"
  TTL: Manual (stored in application DB with admin update UI)
  Purpose: Avoid re-fetching legal data that changes infrequently

Session cache (same address within single session):
  All non-paid API results cached for the duration of the user session
  (typically 1 hour). If user re-runs analysis on the same address,
  only the Directions API and LLM calls are re-executed.
```

### Re-Analysis Scenario

If a user runs the same address on Day 1 and Day 8:

| API Call | Day 1 | Day 8 | Re-run? |
|---|---|---|---|
| Geocoding | $0.005 | $0.000 (cached) | No |
| Directions (3 routes) | $0.015 | $0.015 (fresh data) | Yes |
| LLM | $0.020 | $0.020 (fresh result) | Yes |
| Maps render | $0.007 | $0.007 | Yes |
| **Total Day 8** | -- | **$0.042** | (vs $0.047 for fresh) |

Savings from geocoding cache is marginal ($0.005) but the pattern is
important at scale. The real benefit is reduced latency (no geocoding
round-trip) rather than cost savings.

### Summary

| Data | Cache? | TTL | Cost Savings | Notes |
|---|---|---|---|---|
| Geocoding | Yes | 30 days | $0.005/call | Google-approved caching |
| Directions | No | -- | -- | Must be fresh for accuracy |
| LLM output | No | -- | -- | Non-deterministic; re-run each time |
| Ordinance data | Yes | Manual | Variable (API-adjacent) | Stored in app database |
| Road network | Optional | 7-30 days | Variable | Only if using OSM fallback |
| Traffic estimates | No / 7-day max | 7 days | Variable | Use live data when possible |
