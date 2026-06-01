# 13. Testing & Evaluation Strategy

**Last updated:** 2026-05-31

**Goal:** Define how to test the sign placement pipeline end-to-end, validate that recommendations are actually good, and prevent regression on every code change.

---

## Table of Contents

1. [Evaluation Criteria: What Makes a Placement Plan "Good"?](#1-evaluation-criteria-what-makes-a-placement-plan-good)
2. [Test Address Suite](#2-test-address-suite)
3. [Golden Dataset Approach](#3-golden-dataset-approach)
4. [Automated Checks](#4-automated-checks)
5. [Human Evaluation Protocol](#5-human-evaluation-protocol)
6. [Regression Testing](#6-regression-testing)
7. [LLM Output Evaluation](#7-llm-output-evaluation)

---

## 1. Evaluation Criteria: What Makes a Placement Plan "Good"?

Defining "good" requires synthesizing three sources: (a) real estate agent best-practice rubrics, (b) inverse criteria from common agent complaints, and (c) academic/industry research on sign effectiveness.

### 1.1 Agent Best-Practice Rubrics

Real estate training organizations and experienced agents converge on a layered navigation model for sign placement (sources: Curb Hero, Showable.co, Overnight Prints, Corefact):

| Layer | Sign Count | Purpose |
|-------|-----------|---------|
| Layer 1 -- Major Roads / Arterials | 2-3 signs | Capture attention at the edge of the neighborhood |
| Layer 2 -- Decision Points | 1 per turn/intersection | Guide at every place a driver could go wrong |
| Layer 3 -- Near Property | 3-5 signs | Both ends of the street + driveway |
| Layer 4 -- At the Home | 1 large sign | Confirm arrival |

**Evaluation rubric (derived from agent consensus):**

| Criterion | Definition | Pass Threshold |
|-----------|-----------|---------------|
| **Directional Clarity** | Can a driver follow signs from the main road to the front door without hesitating? | Every turn along the optimal approach route has a sign. |
| **Visibility** | Signs are placed on the correct side of the road for inbound traffic, not obstructed by curves/hills. | Coordinates snap to the inbound travel lane side. |
| **Quantity Discipline** | Not too few (lost drivers), not too many (visual clutter, fines). | 8-20 signs for a typical suburban property. |
| **Regulatory Compliance** | Signs not placed on medians, roundabouts, or where prohibited. | No sign within 50 ft of a roundabout or traffic island. |
| **Timeliness Relevance** | Signs point to the event in time, not past it. | Route ordering is sequential and doesn't double back. |
| **Brand Presence** | Agent/brokerage info visible without overpowering direction. | Handled by sign template, not algorithm output. |

### 1.2 Inverse Criteria: Common Agent Complaints

Drawing on news reports of real estate sign enforcement crackdowns (Blacktown Council, Strathfield Council, City of Stirling, Blue Mountains Gazette, Southwark Council reports):

| Complaint | Inverse Criterion (What to Avoid) |
|-----------|----------------------------------|
| Signs left up for days after sale | Not relevant to algorithmic output (operational). |
| Signs on roundabouts / medians / traffic islands | **No sign coordinates within 50 ft of a roundabout center.** |
| Signs with no directional arrows or address info | Every sign should have direction context (arrow-bearing). |
| Excessive signs (30-40 for one open house) | Cap total sign count at a configurable maximum (default 20). |
| Signs on footpaths or obstructing pedestrians | All signs must be on roadsides, not footpath polygons. |
| Metal stakes left behind | Not relevant to algorithmic output. |
| Signs placed on private property without permission | All signs should be on public right-of-way near roads. |

### 1.3 Academic / Industry Research

Academic research on real estate sign effectiveness is sparse. The koreascience.kr paper and the Lisbon conference paper found in searches address sign language and unrelated topics. No dedicated academic literature on real estate sign placement effectiveness was found. The tool's evaluation framework therefore draws primarily from practitioner rubrics and municipal regulations rather than peer-reviewed research.

**Key takeaway:** "Good enough" is validated by three mutually reinforcing signals:
1. Compliance with the layered navigation rubric above.
2. No violations of the inverse criteria (no roundabout placements, no excessive counts, etc.).
3. Favorable comparison against experienced-agent manual placements (see Section 5).

---

## 2. Test Address Suite

A canonical set of 10 test addresses covering distinct property types and road geometries. These should be real addresses in a single metro area (recommended: the Portland, OR metro area for its mix of suburban, rural, urban, and unique road geometries).

| # | Type | Address (Portland area) | What Makes It a Good Test Case |
|---|------|----------------------|-------------------------------|
| 1 | **Suburban grid** | 12345 NW Cornell Rd, Portland, OR 97229 | Standard rectangular street grid. Tests basic multi-sign fan-out from arterial. Sign placement should be straightforward. Baseline test. |
| 2 | **Rural winding road** | 32000 SE Lusted Rd, Boring, OR 97009 | No grid. Follows terrain. Tests ability to space signs along a winding two-lane road with limited intersections. Low density of decision points. |
| 3 | **Dense urban (condo)** | 1234 SW 11th Ave, Portland, OR 97201 | High-rise in a dense downtown grid with one-way streets. Tests one-way detection, limited curb space, no front yard. Signs must be on public right-of-way. |
| 4 | **Gated community** | 12345 NW Sunderland Rd, Portland, OR 97231 | Property inside a gated subdivision with a single entrance. Tests whether the algorithm places signs at the gated entrance rather than trying to route through the gate. |
| 5 | **Near a roundabout** | 12345 SW Iron Mountain Blvd, Portland, OR 97223 | Property within 0.5 mi of a roundabout intersection. Tests that the algorithm does NOT place a sign on the roundabout itself (common agent violation) and correctly places signs on approach roads. |
| 6 | **Dead-end street** | 12345 SE Long St, Portland, OR 97222 | Property on a cul-de-sac or dead-end. Tests that the algorithm doesn't over-place signs on the single access road and recognizes the dead-end topology. |
| 7 | **Near highway exit** | 12345 NE 181st Ave, Portland, OR 97230 | Property near a freeway interchange (e.g., I-84). Tests highway proximity: signs should not be on ramps or interchanges but on surface streets leading from the exit. |
| 8 | **Cul-de-sac maze** | 12345 SW 108th Ave, Tigard, OR 97223 | Subdivision with many cul-de-sacs branching off a collector. Tests path-finding through a maze-like road network. Algorithm must distinguish the correct branch. |
| 9 | **Waterfront / limited access** | 12345 NW Old Cornelius Pass Rd, Portland, OR 97231 | Property on the Willamette River or Sauvie Island with limited road access (single bridge or road). Tests that signs don't over-cluster near the single access point. |
| 10 | **Downtown high-rise / one-way streets** | 1234 SW Broadway, Portland, OR 97201 | Downtown core with all one-way streets. Tests correct handling of one-way direction constraints. Signs must be placed for inbound approach only. |

**Testing protocol for each address:**

1. Run the full pipeline with N = 10 signs.
2. Run the full pipeline with N = 5 signs (smaller set).
3. Run the full pipeline with N = 20 signs (large set).
4. Verify all automated checks (Section 4) pass.
5. Store screenshot / static map image of the result as a regression baseline.

---

## 3. Golden Dataset Approach

### 3.1 Can a "Golden Dataset" Be Built?

No existing public dataset of "correct" sign placements was found. Searches for "real estate golden dataset sign placement ground truth evaluation benchmarks" and related queries returned no results. There is no academic benchmark or industry certification body that publishes example sign placement plans.

### 3.2 Feasibility

Building a golden dataset is feasible but labor-intensive. Recommended approach:

1. **Recruit 3-5 experienced agents** (10+ years). Give each the same 10 test addresses and ask them to mark sign placements on a map (using Google My Maps or similar).

2. **Define a coordinate format:** For each address, the agent marks N points (N = 5, 10, 15) as latitude/longitude pairs.

3. **Aggregate via majority vote:**
   - For each address, compute the minimum bounding region that covers at least 2 out of 3 agents' placements.
   - Any sign coordinate placed inside this region is considered "correct" (ground truth).
   - Signs placed outside are "incorrect" by consensus.

4. **Expected size of golden dataset:**
   - 10 addresses x 3 sign counts x 2-3 agents = 60-90 annotated maps.
   - Rough estimate: 2-3 hours of agent time total.

### 3.3 Metrics Against Golden Dataset

Once a golden dataset exists:

- **Recall@N:** What fraction of agent-placed signs does the tool's top-N output cover (within X ft)?
- **Precision@N:** What fraction of the tool's output signs are within X ft of any agent-placed sign?
- **F1@N:** Harmonic mean of precision and recall.
- **Mean distance to nearest agent sign:** Average deviation from human placements.

### 3.4 Maintaining the Golden Dataset

- Re-run evaluation after every significant pipeline change (new routing API, new scoring model, new LLM prompt).
- Add new test addresses when edge cases are discovered in production.
- Set a passing bar: F1 >= 0.70 (for X = 200 ft) before considering a pipeline change acceptable.

---

## 4. Automated Checks

These checks should run on every pipeline execution and be available as both an integration test suite and a CI job. Each check returns pass/fail with supporting data.

### 4.1 Snap-to-Road Validation

**What:** Verify that every returned sign coordinate lies on or within a reasonable distance of a drivable road.

**How:** After the pipeline produces sign coordinates, snap each coordinate to the nearest road using a snap-to-roads API (Google Roads API, Azure Maps Snap to Roads, or OSM-based map matching). Calculate the haversine distance between the raw coordinate and the snapped coordinate.

**Pass criteria:**
- All sign coordinates have snap distance < 50 ft (15 m).
- If a coordinate is > 50 ft from any road, the test warns. If > 200 ft, the test fails.

**Rationale:** A sign placed in the middle of a field or a river is useless; this catches geocoding or routing errors.

### 4.2 Sequence Validation

**What:** Verify that the sign ordering follows an intelligible driving direction from the property outward (or from the nearest arterial inward).

**How:** Starting from either the property or the outermost approach road, verify that consecutive sign coordinates are monotonically approaching/retreating along the route polyline. Compute the route distance from the property to each sign. Signs should be monotonically decreasing in distance-to-property (for approach guidance) or monotonically increasing (for outward placement).

**Pass criteria:**
- The sequence of signs, when ordered by route distance from the property, is monotonic (no sign closer to the property appearing after a farther-out sign in the ordered list).
- At most 1 violation is tolerated (a lone out-of-sequence sign).

**Rationale:** A sign sequence that sends drivers back and forth creates confusion and defeats the purpose of directional signage.

### 4.3 Spacing Validation

**What:** Verify that signs are not clustered too tightly together.

**How:** Compute pairwise great-circle distances between all sign coordinates.

**Pass criteria:**
- No two signs within 100 ft (30 m) of each other. (Agree with agent best practice: signs should not be in the same line of sight.)
- At most 1 pair of signs may be within 200 ft (60 m).

**Rationale:** Clustered signs waste resources and create visual clutter that annoys residents and regulators.

### 4.4 Destination Validation

**What:** Verify that the final sign in the sequence (the "you have arrived" sign) is close to the property.

**How:** Compute the distance from the last sign coordinate to the property's geocoded address coordinate.

**Pass criteria:**
- Distance < 200 ft (60 m) for a single-family home.
- Distance < 500 ft (150 m) for a multi-unit or large-lot property.

**Rationale:** The last sign should say "here it is." Being too far from the property means a driver arrives but doesn't know they've arrived.

### 4.5 Route Coherence

**What:** Verify that the computed route polyline passes through or near each sign coordinate.

**How:** For each sign coordinate, compute the minimum perpendicular distance from the point to the route polyline (the path a driver would take from their starting point to the property).

**Pass criteria:**
- Every sign has route-polyline distance < 100 ft (30 m).
- If a sign is more than 500 ft from the route polyline, fail immediately.

**Rationale:** A sign that is not on the driver's route is useless. This check catches signs placed on a parallel street or the wrong side of a highway.

### 4.6 No-Go Zone Validation

**What:** Verify that no signs are placed in prohibited areas.

**How:** Define a set of no-go zone types and test for each:
- Within 50 ft of a roundabout center.
- Within 100 ft of a freeway interchange ramp.
- On a pedestrian-only path or trail.
- On a private road (if road classification data is available).

**Pass criteria:** Zero violations.

**Rationale:** Municipal fines for sign placement violations range from $110 to $635 per sign. This check is compliance-critical.

---

## 5. Human Evaluation Protocol

The most rigorous validation compares tool output against manual placements by experienced agents.

### 5.1 Protocol Design

**Participants:** 3 experienced real estate agents (10+ years, active open house practitioners).

**Materials:**
- The 10 canonical test addresses from Section 2.
- A map link for each address (Google My Maps with the property marked).
- A sign count: N = 10 (fixed for all placements).
- Instructions: "Place 10 directional open house signs on this map along the best approach route. Mark each with a pin."

**Procedure:**

1. Each agent independently places signs for all 10 addresses (total 30 annotated maps).
2. A minimum 24-hour gap between sessions to prevent recall bias.
3. The tool ("algorithm") runs on the same 10 addresses with N = 10.

### 5.2 What to Measure

| Metric | Definition | Interpretation |
|--------|-----------|---------------|
| **Pairwise Overlap (Jaccard)** | For two annotators (or annotator vs. tool), fraction of sign coordinates that are within 200 ft of each other, counted as a match. | Higher = more agreement. Tool vs. agents compared to agent vs. agent. |
| **F1 vs. Consensus** | Consensus ground truth = coordinates that 2+ agents placed within 200 ft of each other. Compute tool precision and recall vs. consensus. | Tool F1 should approach agent inter-annotator F1. |
| **Mean Distance to Nearest** | For each tool-placed sign, distance to the nearest agent-placed sign (average across agents). | Lower = better. Target: < 300 ft mean. |
| **Route Overlap (%)** | Fraction of the tool's recommended route (polyline) that falls within the convex hull of all agent-placed signs, weighted by road segment length. | Measures whether the tool and agents agree on the approach route. |
| **Sign Count per Layer** | For each layer (major road, decision point, near property, at home), count signs placed by agents vs. tool. | Does the tool's distribution match agent behavior? |

### 5.3 Inter-Annotator Agreement Analysis

- **Expected agent-agent agreement:** Moderately high but not perfect. Agents will disagree on the "best" approach route and exact placement. Expect Jaccard overlap of 0.4-0.7.
- **Expected tool-agent agreement:** If the tool is good, tool-agent overlap should fall within the range of agent-agent overlap.
- **Acceptable threshold:** Tool F1 vs. consensus >= 0.75 x (mean agent F1 vs. consensus). In other words, the tool should be at least 75% as good as the average agent.

### 5.4 Qualitative Feedback

After the quantitative comparison, show each agent their own map alongside the tool's map and ask:
1. "Which plan would you rather use on a Sunday open house?"
2. "Are there any signs in the tool's output that you would remove?"
3. "Are there any locations where you would add a sign that the tool missed?"
4. "Rate the tool's plan from 1 (unusable) to 5 (better than what I would do)."

This catches qualitative issues that quantitative metrics miss (signs in unsafe locations, signs at confusing intersections, etc.).

---

## 6. Regression Testing

These tests should run on every code change (pre-commit hook or CI gate). The goal is to prevent pipeline degradation without requiring excessive compute time.

### 6.1 CI Pipeline Structure

```
┌──────────────────────────────────────────────────────┐
│  Layer 1: Unit Tests (<10s)                          │
│  - Individual function correctness                   │
│  - Geocoding parsing, route extraction, etc.         │
├──────────────────────────────────────────────────────┤
│  Layer 2: Automated Validation Suite (<60s per addr) │
│  - Run against 3 minimal test addresses              │
│  - All Section 4 automated checks                    │
│  - Abort on failure                                 │
├──────────────────────────────────────────────────────┤
│  Layer 3: Full Test Suite (<5 min)                   │
│  - Run against all 10 canonical addresses            │
│  - All automated checks                             │
│  - Golden dataset comparison if available            │
├──────────────────────────────────────────────────────┤
│  Layer 4: LLM Output Evaluation (<2 min)             │
│  - Structural validity of LLM output                 │
│  - JSON schema conformance                           │
│  - No hallucinated road names or addresses           │
└──────────────────────────────────────────────────────┘
```

### 6.2 Minimum Bar Before Merging (Layer 2 must pass)

| Check | Minimum Pass Rate | Fail Behavior |
|-------|------------------|---------------|
| Snap-to-road validation | 100% of signs < 200 ft | Block merge |
| Sequence validation | 100% monotonic (or 1 violation max) | Block merge |
| Spacing validation | No signs < 100 ft apart | Block merge |
| Destination validation | 100% of final signs within 500 ft | Block merge |
| Route coherence | 100% of signs within 500 ft of route | Block merge |
| No-go zone validation | 100% compliance | Block merge |
| Pipeline completes without errors | 100% of test addresses | Block merge |

### 6.3 Regression Detection

- **Golden dataset F1 regression:** If F1 drops by more than 0.05 (5 percentage points) vs. the last CI run on main, the pipeline change is flagged for review.
- **Automated check pass rate regression:** If any check that passed on the previous main run now fails, the change is blocked.
- **Pipeline execution time regression:** If mean time per address increases by >50% vs. the previous main run, flag for review (potential performance degradation).

### 6.4 CI Cost Budget

Each full test suite run (Layer 3) touches the Google Maps API for geocoding, routing, and possibly snap-to-road:
- ~3 API calls per address (geocode + route + snap).
- 10 addresses = ~30 API calls per CI run.
- At 10 CI runs per day: ~300 API calls/day = ~$1.50/day (at ~$5/1K calls).
- **Total: ~$45/month for CI.**

Consider using a staging Google Maps API key with lower usage limits for CI.

---

## 7. LLM Output Evaluation

The LLM (used for final review / reasoning about sign placement) requires its own evaluation strategy because LLM outputs are nondeterministic and prone to hallucination.

### 7.1 Evaluation Dimensions

Based on current best practices for structured LLM output evaluation (sources: DeepEval, MarCognity-AI, llm-eval-toolkit, Neuro-Symbolic Verification papers):

| Dimension | Definition | Measurement |
|-----------|-----------|-------------|
| **Faithfulness** | Does the LLM's reasoning stay within the provided context (i.e., the computed route and sign coordinates)? | Claim-by-claim verification: extract each claim from the LLM output and check if it is supported by the input data. |
| **Structural Conformance** | Does the LLM output match the expected JSON schema? | JSON Schema validation. Reject outputs that don't conform. |
| **Factual Correctness** | Are road names correct? Are turn directions accurate? | Cross-reference road names against the route polyline geocoding. |
| **No Hallucinated Data** | Does the LLM invent roads, landmarks, or distances that don't exist? | Check every numeric claim (distance, street count, etc.) against the source data. |
| **Actionability** | Is the recommended sign placement actually implementable? | Does the LLM recommend signs in locations that pass the automated validation checks from Section 4? |

### 7.2 Automated LLM Quality Checks

**Static checks (before LLM invocation):**
- Input prompt is complete and contains the route polyline, sign coordinates, and property address.
- Input prompt does not truncate critical data (token count check).

**Post-hoc checks (after LLM response):**
- **JSON schema validation:** Verify the response matches the expected structure.
- **Claim extraction and verification:**
  1. Extract all claims about roads, distances, and directions from the LLM response.
  2. For each claim, check it against the source data (route polyline, road names from snapping, distance calculations).
  3. Score: supported_claims / total_claims. Target: >= 0.90.
- **Numeric consistency check:** If the LLM states "5 signs on Main Street," verify that exactly 5 sign coordinates are on Main St.
- **Contradiction check:** If the LLM says "Start at NE 23rd Ave" but the route begins on W Burnside St, flag as a contradiction.

### 7.3 LLM-as-Judge (Meta-Evaluation)

Use a separate LLM call (ideally a different model) to evaluate the first LLM's output:

```
Prompt: "Given the property at [ADDRESS], the route data, and the sign
placement plan below, evaluate this plan. Score 1-5 for:
- Faithfulness (does it stay within the provided data?)
- Helpfulness (would this actually help an agent?)
- Safety (are there signs in dangerous or prohibited locations?)

Plan: [LLM OUTPUT]
```

This is not a replacement for deterministic checks but adds a layer that catches nuanced issues (self-contradictory advice, confusing reasoning).

### 7.4 Recommended Tools

| Tool | Use Case | Cost |
|------|----------|------|
| **DeepEval** (pytest integration) | Hallucination detection, answer relevancy, CI/CD integration | Free/OSS |
| **JsonSchema validation** (built-in) | Structural conformance | Free |
| **HHEM** (Hughes Hallucination Evaluation Model) | Fast binary hallucination classification (82.2% accuracy, ~1.5s per eval) | Free/OSS, 439MB model |
| **llm-eval-layer** | Lightweight ACCEPT/REVIEW/REJECT decisions with attribution-specificity matrix | Free/OSS |

### 7.5 Guardrails (Pre-Production Filtering)

Before presenting any LLM output to the user:

1. **Structural guard:** JSON must parse and match the output schema. If not, retry (max 2 retries) or fall back to a template-based response.

2. **Factual guard:** If the LLM output contains a road name or address that does not match any road in the route polyline's road-name list, strip that claim and note the discrepancy.

3. **Automated check guard:** If the LLM's recommended sign plan fails any of the automated validation checks (Section 4), flag the output for human review. Do not display the plan without a warning.

---

## Summary of Testing Layers

| Layer | What | Frequency | Who Runs |
|-------|------|-----------|----------|
| Unit tests | Individual functions | Every commit | CI / pre-commit |
| Automated validation (Section 4) | 3 minimal addresses | Every commit (Layer 2) | CI |
| Full validation suite | 10 canonical addresses | Every push / nightly | CI |
| Golden dataset comparison | 10 addresses vs. agent consensus | Upon pipeline changes; monthly | CI (triggered) |
| Human evaluation | 3 agents vs. tool | Once per quarter; before major releases | Manual |
| LLM output evaluation | Faithfulness + conformance | Every pipeline run | CI / post-pipeline |
| Cost regression | API call count per analysis | Every CI run | CI (alert if >2x baseline) |

---

## Sources

- [Curb Hero - 11 Open House Tips](https://curbhe.ro/11-open-house-tips-to-elevate-your-prospecting/)
- [Showable.co - How Many Open House Signs Do I Need?](https://showable.co/blog/how-many-open-house-signs)
- [Showable.co - Open House Checklist for Agents](https://showable.co/blog/open-house-checklist-realtors)
- [Packeze - Placement Strategies for Open House Signage](https://packeze.com/placement-strategies-for-open-house-signage/)
- [Corefact - A Real Estate Agent's Success Guide: Sign Strategy](https://www.corefact.com/academy/articles/arealestateagent-ssuccessguide-signstrategy)
- [Overnight Prints - Open House Signs & Spring Listing Print Kits](https://blog.overnightprints.com/open-house-signs-spring-listing-print-kits/)
- [Daily Telegraph - Blacktown Council fines $58k over rogue signs](https://www.dailytelegraph.com.au/newslocal/blacktown-advocate/blacktown-council-dishes-out-thousands-in-fines-over-proliferation-of-real-estate-signs/news-story/f5a0dc2846347de8d40cc0a91f01bfcc)
- [Sydney Morning Herald - Strathfield mayor declares war on real estate signs](https://www.smh.com.au/politics/nsw/why-one-sydney-mayor-has-declared-war-on-real-estate-signs-20250630-p5mbbz.html)
- [Blue Mountains Gazette - Leura real estate signs confiscated in council crackdown](https://www.bluemountainsgazette.com.au/story/8806476/leura-real-estate-signs-confiscated-in-council-crackdown/)
- [DeepEval - LLM Evaluation Framework](https://www.thoughtworks.com/en-sg/radar/languages-and-frameworks/deepeval)
- [llm-eval-toolkit - Production-Grade Evaluation](https://github.com/mukund1985/llm-eval-toolkit)
- [llm-eval-layer - Lightweight Decision Engine](https://github.com/Emmimal/llm-eval-layer)
- [HHEM - Hughes Hallucination Evaluation Model (arXiv)](https://arxiv.org/html/2512.22416v1)
- [Neuro-Symbolic Verification (arXiv)](https://arxiv.org/html/2605.26942v1)
