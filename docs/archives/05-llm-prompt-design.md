# LLM Prompt Design

## Decision Needed
What context to give the LLM, what output format to request, and whether the LLM should re-rank candidates or only explain the backend's ranking.

## Findings

### 1. Best Practices for Structured JSON Output (2025-2026)

The field has converged on a clear set of principles:

**Use native API-level schema enforcement, not prompt-only instructions.** "Respond in JSON" in prose text fails 9-12% of the time on frontier models. Using `response_format` (OpenAI) or `output_config.format` / `strict: true` on tool use (Anthropic) reduces failures to 0.2-0.3%.

**Recommended architecture pattern (2025-2026 consensus):**

```
Discussion -> Schema-constrained JSON generation -> Validate -> Repair (max 2x) -> Parse
```

**Key rules from production testing across GPT-5, Claude Opus 4.7, Gemini 3 (Future AGI, 2026):**
1. Put the task instruction on line 1. Context after. (Reasoning models plan before scanning context.)
2. Use one delimiter style per prompt. Do not mix XML, JSON, and Markdown delimiters.
3. Use 2-4 few-shot examples for classification/extraction tasks; 0-1 for open-ended generation.
4. Pin hard rules to the top of the prompt AND the system message. Mid-prompt rules get dropped ("lost in the middle" is still measurable in 2026).
5. Set temperature to 0.2 or lower for structured output. Below 0.3 improves format correctness by ~40%.
6. Do NOT use "think step by step" on reasoning models (GPT-4.1, Claude Opus 4.6). It slows responses without accuracy gain.

**The validation-repair loop is essential:** Even with schema enforcement, implement `generate -> parse (Pydantic) -> if invalid, re-prompt with error -> retry (max 2-3)`. Use a cheaper model for the repair step if possible.

### 2. Spatial/Location Reasoning Prompt Patterns

The most relevant academic work comes from two 2025 papers:

**RALLM-POI (Sep 2025):** For POI recommendation with geographical re-ranking, the architecture uses a **three-stage pipeline**:
1. Retrieve: TF-IDF + cosine similarity to find relevant candidates
2. Re-rank: Geographical Distance Re-ranker using Decaying Weighted Dynamic Time Warping
3. Rectify: A second LLM with a specialized prompt reviews and self-corrects the output

The "rectifier" LLM prompt structure includes:
- Task requirements (constrained output format)
- The re-ranked candidate list (top K)
- A review step to check for duplicates, spatial validity, and format compliance

This two-stage agentic pattern (Prior LLM -> Rectifier LLM) is directly applicable to sign placement.

**Spatial-RAG (Feb 2025):** Integrates structured spatial databases with LLMs via hybrid retrieval (SQL spatial filtering + semantic matching). Formulates answer selection as multi-objective optimization over spatial and semantic relevance. The LLM prompt is constructed as a learnable decision process where the model trades off between spatial and semantic scores.

**"Reason free, constrain late" insight (Constraint Tax paper, May 2026):** For sub-3B models, hard schema enforcement raises validity but lowers answer accuracy. The recommended pattern is: let the model reason freely first, then constrain to structured format. This maps to a two-call pattern (discussion -> finalization).

### 3. Structured Output Methods: Reliability Comparison

| Method | Schema Violation Rate | Notes |
|---|---|---|
| **OpenAI Structured Outputs** (`strict: true`) | **0.2%** | Best available; token-level enforcement |
| **Claude tool use** (`strict: true` + `additionalProperties: false`) | **0.3%** | Nearly identical reliability |
| **Claude JSON Outputs** (`output_config.format`) | ~0.5% | Newer feature, less production data |
| **Function calling** (no strict) | 1.2-2.1% | Depends on schema complexity |
| **Prompt-based JSON** (no schema enforcement) | 9-12% | Not acceptable for production |

**Silent semantic drift is the unsolved problem:** Schema-conformant JSON with wrong values. No method catches this. Mitigation: Add a `confidence` or `justification` field to catch 30-40% of semantically wrong outputs.

**OpenAI is more mature** for structured outputs (launched strict mode Aug 2024, production-tested across millions of calls). Anthropic's Structured Outputs reached GA Feb 2026. Both are production-ready, but OpenAI has a longer track record.

### 4. "Re-rank Then Explain" vs "Explain Then Re-rank"

The literature and prompt engineering community converge on **re-rank then explain** as the superior pattern:

**RALLM-POI evidence:** The Prior LLM receives pre-ranked candidates, then the Rectifier LLM reviews and explains. This two-stage pipeline outperforms one-stage approaches. The reasoning is that:
- Re-ranking first constrains the problem space (top K candidates)
- The explanation step benefits from knowing which candidates survived
- The LLM's natural-language reasoning is more grounded when it can reference specific candidates and their scores

**Spatial-RAG evidence:** Pareto-optimal candidates are identified first (by the retrieval/re-ranking system), then the LLM selects and explains the best option. The LLM reasons over a known-good candidate set rather than generating candidates from scratch (which introduces hallucination risk).

**Practical recommendation from production systems:** The LLM should:
1. Receive the top 2-3x candidates (if 3 signs needed, show 6-9 candidates)
2. Select the optimal set
3. Explain why each was chosen (referencing candidate attributes)

This avoids overwhelming the LLM with irrelevant low-scoring candidates while still giving it meaningful choice.

**Do NOT ask the LLM to generate candidates from scratch.** LLMs hallucinate spatial data (invented addresses, incorrect distances, non-existent routes). Always pre-compute candidates and present them for selection/re-ranking.

### 5. Draft Hypothesis Evaluation

From the prior exploration document, here is the evaluation of each design element:

#### System Prompt: "You are an expert real estate sign placement strategist..."

**Assessment:** Effective framing. The persona establishes domain expertise and gives the model clear operational constraints ("one sign per turn", "place signs BEFORE the turn", etc.).

**Suggested refinements:**
- Add the specific scoring factors and their weights so the LLM understands how the pre-ranking was done
- Explicitly state that all candidates have been validated for code compliance and physical feasibility (the LLM should not re-check constraints the backend already checked)
- Add a rule: "If no candidate adequately serves a turn, flag the gap rather than forcing a selection"

**Revised system prompt draft:**

```
You are an expert real estate sign placement strategist. Signs form a directional trail from the nearest major road to the property. You will receive a set of pre-scored candidate sign locations for each turn along the route.

Rules:
1. One sign per turn. Select exactly one sign for each turn.
2. Place signs BEFORE the turn, not at the turn.
3. High-traffic intersections are most valuable -- prioritize candidates at or near intersections.
4. Final sign must be at the property address.
5. All candidates have been pre-validated for code compliance, physical feasibility, and spatial constraints. Do NOT re-check these.
6. Space selected signs well apart -- do not select two signs within 100 feet of each other unless they serve different turns.
7. If no candidate adequately serves a given turn, flag the gap rather than forcing a suboptimal selection.

Scoring methodology: Each candidate has been scored on traffic volume (40%), visibility (25%), code compliance (20%), proximity appropriateness (10%), and installation cost (5%). Understand these weights when evaluating the pre-scored list.
```

#### User Prompt: Property address, approach roads, route steps with maneuvers, pre-scored candidates

**Assessment:** This provides the LLM with all necessary context. The key decision is how many candidates to show.

**Recommendation:** Show top N candidates where N = 2-3x the number of signs needed. For a route with 4 turns, show top 8-12 candidates total (2-3 per turn). Include the scoring breakdown for each candidate (traffic volume score, visibility score, etc.) so the LLM can reason about tradeoffs.

**Data format for each candidate:**

```
Candidate ID, Turn #, Lat/Lng, Address Description, Traffic Score (/40), Visibility Score (/25), Code Score (/20), Proximity Score (/10), Cost Score (/5), Total Score, Key Proximity Features (nearby landmarks, distances)
```

#### JSON Structured Output vs Free Text with Post-Processing

**Assessment:** JSON structured output is strongly preferred. The decision is between:
1. **JSON in a designated field** (OpenAI `response_format` or Anthropic `output_config.format`)
2. **Tool use with JSON schema** (both providers support this)

**Recommendation:** Use the native structured output mode of whichever provider is chosen. For OpenAI, use `response_format: { type: "json_schema", strict: true }`. For Anthropic (recommended primary), use `output_config.format` with JSON schema.

**JSON schema design:**

```json
{
  "name": "sign_placement_recommendations",
  "strict": true,
  "schema": {
    "type": "object",
    "properties": {
      "overall_assessment": {
        "type": "string",
        "description": "Brief summary of the route and placement strategy (2-3 sentences)"
      },
      "selected_signs": {
        "type": "array",
        "description": "One selected sign per turn, ordered from first turn to last",
        "items": {
          "type": "object",
          "properties": {
            "turn_number": { "type": "integer", "description": "Which turn this sign serves (1-indexed)" },
            "candidate_id": { "type": "string", "description": "ID of the selected candidate" },
            "rationale": { "type": "string", "description": "Why this candidate was chosen over alternatives for this turn (2-3 sentences)" },
            "confidence": { "type": "number", "description": "Confidence in this selection, 0.0 to 1.0" },
            "flagged_alternatives": {
              "type": "array",
              "items": { "type": "string" },
              "description": "IDs of runner-up candidates considered but not selected"
            }
          },
          "required": ["turn_number", "candidate_id", "rationale", "confidence", "flagged_alternatives"],
          "additionalProperties": false
        }
      },
      "gaps_or_warnings": {
        "type": "array",
        "description": "Any turns where no adequate candidate was found, or other concerns",
        "items": {
          "type": "object",
          "properties": {
            "turn_number": { "type": "integer" },
            "issue": { "type": "string", "description": "Description of the gap or concern" },
            "suggestion": { "type": "string", "description": "Suggested action to fill this gap" }
          },
          "required": ["turn_number", "issue"],
          "additionalProperties": false
        }
      },
      "route_coherence_check": {
        "type": "object",
        "properties": {
          "passes": { "type": "boolean", "description": "Whether the selected signs form a coherent directional trail" },
          "notes": { "type": "string", "description": "Any concerns about sign sequence continuity" }
        },
        "required": ["passes", "notes"],
        "additionalProperties": false
      }
    },
    "required": ["overall_assessment", "selected_signs", "gaps_or_warnings", "route_coherence_check"],
    "additionalProperties": false
  }
}
```

### 6. Testing Plan -- Evaluation Criteria for 5 Real Addresses

To validate prompt quality, use the following evaluation framework:

**Test set:**
- 5 real property addresses with varying characteristics (one simple straight-in approach, one with multiple turns, one on a divided highway, one in a dense urban area with many candidate locations, one rural with few candidates)

**Pass criteria for each test:**
1. **Schema compliance:** Output parses as valid JSON matching the schema (automated check)
2. **Turn coverage:** Exactly one sign selected per turn, or gap explicitly flagged (automated check)
3. **Spatial validity:** Selected locations are before the turn they serve, within reasonable distance (manual review + Haversine distance check)
4. **Reasoning quality:** The LLM's rationale references specific candidate attributes (scores, proximity features) rather than generic statements (manual review)
5. **Coherence:** The selected signs form a continuous directional trail from approach road to property (manual review)
6. **No hallucination:** The LLM does not reference candidates not in the provided list, or spatial data not provided (automated check)

**Pass threshold:** 4 out of 5 test cases must pass all criteria. If not, iterate on the prompt.

**Iteration process:**
1. Run all 5 tests with the draft prompt
2. Identify failure patterns (e.g., "LLM consistently picks signs too close together")
3. Add explicit rules to the system prompt addressing the failure pattern
4. Re-run all 5 tests
5. Repeat until threshold is met

### 7. Should the System Prompt Include Scoring Weights?

**Yes.** The LLM should know the scoring weights (traffic 40%, visibility 25%, code compliance 20%, proximity 10%, cost 5%) so it understands why candidates are pre-ranked as they are. This lets the LLM:
- Recognize when a lower-total-score candidate might be preferable because of specific factor tradeoffs
- Understand the backend's optimization objectives when making its own selection
- Provide more accurate reasoning about why it chose one candidate over another

However, the LLM should NOT be asked to re-weight or re-calculate scores. It should treat the pre-scored ranking as a strong signal and only override it when there are qualitative reasons (e.g., two candidates are nearly tied on score but one has an obvious visibility advantage the scoring didn't fully capture).

## Source Assessment

**High confidence:**
- Structured output best practices are established and consistent across multiple production guides (2025-2026)
- The "reason free, constrain late" pattern is validated by the Constraint Tax paper (May 2026)
- Schema violation rates are well-documented across providers and methods
- Evaluation frameworks for prompt quality are standard practice

**Medium confidence:**
- The "re-rank then explain" vs "explain then re-rank" comparison comes from adjacent domains (POI recommendation, information retrieval) rather than direct sign placement research
- The RALLM-POI and Spatial-RAG patterns are the closest published work but test different tasks
- The recommended JSON schema and system prompt drafts are hypotheses that need empirical validation

**Low confidence:**
- No prompt design has been specifically tested for sign placement. The hypotheses above are informed by spatial reasoning research and structured output best practices but need our own benchmarking.

## Recommendation

### Prompt Architecture: Two-Stage "Retrieve -> Re-rank -> Explain" Pattern

**Stage 1 (Backend):** Pre-compute candidate locations with scoring breakdowns. Filter to top 2-3x candidates per sign needed.

**Stage 2 (LLM):** The LLM receives pre-ranked candidates and performs final selection with natural-language reasoning.

**Use native structured outputs** (not free-text with post-processing). This reduces schema violation rate from ~10% to <0.5%.

**Output format:** Structured JSON via the provider's native mechanism (OpenAI `response_format` or Anthropic `output_config.format`). Do NOT ask the LLM to output free text and parse it.

**Re-rank then explain:** Provide candidates pre-ranked by the backend scoring system. The LLM selects from these and explains why. Do NOT ask the LLM to generate candidates from scratch.

**Show all scoring dimensions:** Include the factor breakdown (traffic, visibility, code, proximity, cost) for each candidate so the LLM can reason about tradeoffs.

**System prompt design:**
- Use the revised persona prompt (Section 5) with explicit constraints and scoring weights
- Pin rules to the top of the prompt
- Include that candidates have been pre-validated for code and feasibility
- Add "flag gaps, don't force selections"

**Testing:**
- Create a test set of 5 real addresses with manual ground truth
- Run automated schema compliance checks
- Manual review of reasoning quality and spatial validity
- Iterate until 4/5 pass all criteria

## Gaps / Risks

- **No empirical validation of the draft prompt.** The recommended prompt and schema are hypotheses based on adjacent research. They need to be tested against real data.
- **The two-stage pattern adds latency.** Two API calls (discussion + finalization) vs one call halves throughput. For the sign placement task, a single optimized call may suffice if the prompt is well-structured.
- **Value accuracy is the real risk.** Even with perfect schema compliance, the LLM might select inferior sign placements. The evaluation framework (Section 6) tests for this but needs ground truth data.
- **Scoring weight disclosure creates a risk:** If the LLM knows the weights, it might over-rely on them and fail to consider qualitative factors the scoring couldn't capture. The prompt should explicitly state that the LLM should override scores when there are good qualitative reasons.
- **Prompt injection via candidate data:** If candidate descriptions contain adversarial text (e.g., a remark field), they could influence the LLM's selection. Candidate data should be sanitized before being included in the prompt.
- **Token budget for rationale:** The `rationale` field at 2-3 sentences per candidate across multiple signs could significantly increase output tokens. Consider limiting rationale length or making it optional for cost-sensitive deployments.
- **Maintaining prompt freshness:** As the backend scoring system evolves, the prompt needs to stay synchronized with scoring weights and methodology. Version the prompt alongside the scoring system.
