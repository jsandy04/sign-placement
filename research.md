# Research

Things that need external sources, testing, or evidence before a decision can be made. Each item explains what the decision is, why it can't be made without research, and what specifically to look for.

---

## 1. Scoring Algorithm — Factors and Weights

**The decision:** What factors determine a good sign location, and how much does each one matter relative to the others?

**Why it needs research:** The factors themselves are logical (traffic volume, proximity to a turn, visibility, spacing), but the weights are empirical — they need to reflect how experienced agents actually prioritize. A model that weights spacing 3x higher than turn criticality might produce technically valid but practically useless recommendations that any agent would immediately override.

**What to look for:**
- Real estate agent accounts of how they decide where to skip a valid intersection or add a sign somewhere without a turn
- Whether there is an implied hierarchy (e.g., "always cover every turn first, then fill in with high-traffic spots") vs. a continuous tradeoff
- Any existing industry frameworks or training materials that formalize sign placement logic
- Sources: agent forums (ActiveRain, BiggerPockets agent threads), open house training materials, sign vendor guides

**Hypothesis from old README to validate or discard:**
> Decision-point criticality 30%, traffic 25%, visibility 15%, spacing 15%, safety/legal 10%, approach speed 5%

---

## 2. Directions API — Step Granularity on Residential Streets

**The decision:** Whether the Google Directions API returns enough turn-by-turn steps on short suburban/residential routes to give a meaningful candidate pool.

**Why it needs research:** The entire pipeline depends on extracting decision points from Directions API `steps[]`. On highways or long routes, step granularity is fine. On a 0.5-mile residential route with 4 turns, the API might collapse it into 2–3 steps or omit minor intersections entirely. If the candidate pool is too thin, the scoring and LLM steps are working with bad inputs.

**What to look for:**
- Test the Directions API against 3–5 real addresses: one suburban grid, one rural winding road, one dense urban neighborhood, one gated community, one with a roundabout
- For each, count how many steps are returned and whether every turn is represented as a discrete step with a maneuver type
- Check whether `maneuver` values are granular enough (e.g., does it distinguish `turn-right` from `turn-slight-right`?)
- Check the Google Maps Platform documentation for `alternatives`, `avoid`, and whether `optimize:true` changes step granularity
- This is a 1-day prototype test — run it before finalizing the candidate generation step

---

## 3. Which Google Maps APIs Are Actually Needed

**The decision:** Which APIs to enable and pay for. Enabling unnecessary APIs adds cost and attack surface.

**Why it needs research:** The pipeline spec implies several APIs but it's not confirmed which ones provide the data actually needed at each step. Some APIs overlap in capability and the cheaper one may be sufficient.

**Questions to answer:**
- Does the Directions API alone provide road classification data (arterial vs. residential), or is the Roads API required for that?
- Does the Places Nearby Search API reliably identify major approach roads, or is there a better signal?
- Is the Roads API (snapToRoads / nearestRoads) needed for anything beyond speed limits, and are speed limits even available via the standard Directions response?
- Is the Maps JavaScript API the right rendering choice, or is there a maintained React-friendly wrapper that simplifies integration (and what does Google officially recommend)?

**What to look for:**
- Google Maps Platform documentation for each API's response shape
- Community comparisons of Maps JS API React wrappers (the old README used `@vis.gl/react-google-maps` — verify this is actively maintained and recommended)
- Pricing page for each API to confirm the cost estimates in the README are current

---

## 4. LLM Provider

**The decision:** Which LLM to use — OpenAI (GPT-4o or similar), Anthropic (Claude), or another provider.

**Why it needs research:** The LLM in this pipeline receives a structured payload of scored candidates with coordinates, route context, and scoring breakdowns, and must return a ranked selection with natural-language reasoning. The right choice depends on how well each model handles structured spatial reasoning tasks, output format reliability (does it follow JSON schema consistently?), cost per call, and latency at the expected payload size.

**What to look for:**
- Benchmarks or community comparisons on structured output reliability (JSON adherence under complex prompts)
- Cost per 1K tokens for the models under consideration, compared against estimated payload size (~2K input tokens, ~500 output)
- Latency — the pipeline already has several API calls; the LLM call should not dominate wall time
- Whether any provider has specific advantages for location/spatial reasoning tasks
- API terms of service — any restrictions relevant to a commercial tool

---

## 5. LLM Prompt Design

**The decision:** What context to give the LLM, what output format to request, and whether the LLM should re-rank candidates or only explain the backend's ranking.

**Why it needs research:** This cannot be reasoned to — it requires iteration against real inputs. The old README drafted a system prompt and user prompt template (preserved below as a starting hypothesis). Whether that structure produces good outputs depends on testing it.

**What to test:**
- Run the draft prompt against 5 real addresses covering different neighborhood types (suburban grid, rural winding, dense urban, gated community, one with a roundabout)
- For each, evaluate: does the LLM select placements an experienced agent would agree with? Does the reasoning explain the tradeoffs clearly? Does it hallucinate road names or distances?
- Test whether the LLM should receive the full scored candidate list or only the top N
- Test JSON output adherence vs. free-text with a structured parsing step

**Draft hypothesis (from prior exploration — treat as a starting point, not a decision):**

System prompt:
```
You are an expert real estate sign placement strategist. Your job is to evaluate candidate sign locations for an open house and select the optimal placements.

Rules:
1. Signs form a directional trail from the nearest major road to the property.
2. One sign per turn — every decision point needs a marker.
3. Signs should be placed BEFORE the turn, giving drivers time to react.
4. High-traffic intersections are the most valuable placement spots.
5. The final sign must be directly in front of the property.
6. Avoid medians, utility poles, private property, and anything that violates local codes.
7. Space signs well apart when possible.

For each selected placement, provide: sequence position, location description, reasoning, and any concerns.
```

User prompt includes: property address, approach roads, route steps with maneuver types, and pre-scored candidates with factor breakdowns.

---

## 6. Candidate Offset Distances

**The decision:** How far before and after a turn to place candidate sign coordinates.

**Why it needs research:** The old README proposed speed-limit-based offsets (100ft before at ≤25mph, 200ft at 25–40mph, 300ft at ≥40mph). This is a reasonable hypothesis but the numbers are not sourced. Real-world sign placement may follow different rules of thumb, and the distances may need to account for sign size and legibility distance, not just reaction time.

**What to look for:**
- Traffic engineering or road safety guidelines on decision sight distance by speed
- Any real estate or sign vendor guidance on "how far before a turn" signs should go
- Whether the Roads API actually returns speed limits reliably enough to use as input to this calculation, or whether speed needs to be estimated from road classification

---

## 7. Minimum Sign Spacing

**The decision:** Whether to enforce a minimum distance between selected sign locations, and if so, what that distance should be.

**Why it needs research:** The old README proposed a 300ft minimum between signs. It's unclear whether this reflects a real industry rule, a legal requirement, or a made-up heuristic. If it's a real constraint, the source matters — a municipal ordinance would be a hard constraint, while an industry best practice would be a soft one that the LLM could override with reasoning.

**What to look for:**
- Whether any municipalities publish minimum spacing rules for temporary signs
- Whether real estate associations have guidance on this
- Agent accounts of whether sign clustering ever works (e.g., two signs at a complex intersection)

---

## 8. Frontend Layout

**The decision:** How to arrange the input, map, and results on screen.

**Why it needs research (or at minimum, validation):** The intuitive layout is a 3-panel design — narrow input panel, dominant map, results sidebar. This matches mental models from routing tools. But it may not be the right layout once you see real output: if LLM reasoning is long, a sidebar might not have enough space; if the map is the primary output, collapsing the input after submission might work better. The layout should be validated against actual output length and usability before committing.

**What to look for:**
- Examples of tools with similar input/map/results patterns (routing planners, location intelligence tools)
- Whether the results panel content (LLM reasoning per pin) is typically short (fits a sidebar) or long (needs a different treatment)
- Mobile considerations — agents may use this on a phone the morning of the open house

---

## 9. Tech Stack

**The decision:** Frontend framework, backend language/runtime, and whether to use a monorepo or separate services.

**Why it needs research:** Several options are reasonable. The pipeline is a linear, server-side request/response flow — which favors a full-stack framework like Next.js with API routes over a separate backend service. But the right answer also depends on what the frontend map rendering requires and what you're most comfortable maintaining.

**Questions to answer:**
- Is Next.js the right choice, or is there a reason to separate frontend and backend (e.g., if the pipeline eventually becomes long-running and needs background jobs)?
- What does the Google Maps JavaScript API require from the frontend framework — is there any friction with React Server Components or SSR?
- TypeScript vs. JavaScript — is there a reason not to use TypeScript for this project?

---

## 10. Database and Persistence

**The decision:** Whether to persist anything in an MVP, and if so, what and how.

**Why it needs research:** The right answer depends on whether re-running the pipeline is cheap enough that persistence is optional. At ~$0.11/analysis (Maps only, LLM cost TBD), re-running is cheap — which means for MVP, a database may not be needed at all. But if you want shareable result URLs or to avoid re-running when the user refreshes, some persistence is required.

**Questions to answer:**
- Does MVP need shareable URLs? (This requires persisting at minimum the final result)
- If persisting: store only the final output (small, loses reproducibility) or also cache intermediate API responses (larger, enables re-scoring without API calls)?
- SQLite is the simplest option for a self-hosted VPS — is there a reason to use something else?
