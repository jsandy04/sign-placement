# LLM Provider Selection

## Decision Needed
Which LLM to use for the sign placement optimization tool -- OpenAI (GPT-4o, GPT-4.1, o4-mini), Anthropic (Claude Opus 4.6, Sonnet 4.6), or another provider.

## Findings

### 1. Structured Output / JSON Schema Adherence

The dominant finding across all benchmarks (2025-2026) is that schema compliance and value correctness are two different problems. All frontier models now achieve near-perfect schema validity when using native structured output modes, but value accuracy (getting the right values inside the valid JSON) plateaus much lower.

**Schema violation rates by method (production data, 4 systems, 3 months):**

| Method | GPT-4o | Claude Sonnet |
|---|---|---|
| Prompt-based "return JSON" (no schema) | 9.3% | 11.7% |
| Function calling / Tool use | 1.2% | 2.1% |
| Structured Outputs (strict mode) | **0.2%** | **0.3%** |

Source: Kalvium Labs production study. The 0.2% violations for OpenAI Structured Outputs with `strict: true` are the best available. Claude tool use with `additionalProperties: false` achieves 0.3%.

**Key caveat from SOB benchmark (April 2026):** Even the best model (GLM-4.7) achieves only 83.0% value accuracy on text, 67.2% on images, and 23.7% on audio. The gap between "valid JSON" and "correct JSON" is large and domain-dependent.

**Structured Output availability:**
- **GPT-4.1 family**: Full support for `response_format: { type: "json_schema", strict: true }`. Note: gpt-4.1-mini has reported multi-byte character bugs with structured outputs. gpt-4.1 and gpt-4.1-nano are stable.
- **o4-mini**: Supports structured outputs with `strict: true`.
- **Claude Opus 4.6 / Sonnet 4.6**: Support both `output_config.format` (JSON Outputs) and `strict: true` on tool use. GA since Feb 2026.
- **StructEval finding (May 2025):** Even o1-mini achieved only 75.58% average on structured format tasks. Open-source models lag ~10 points behind frontier.

**Flat schemas outperform nested:** Deeply nested schemas (3+ levels) increase violation rates 3-5x. For a sign placement tool outputting a flat list of ranked placements, this favors the simpler schema that both providers handle well.

### 2. Pricing (2026 rates, per 1M tokens)

| Model | Input | Output | Context | Notes |
|---|---|---|---|---|
| **GPT-4o** | $2.50 | $10.00 | 128K | Being phased out; retired from ChatGPT Feb 2026, full API retirement April 2026 |
| **GPT-4.1** | $2.00 | $8.00 | 1M | Recommended replacement for GPT-4o |
| **GPT-4.1 mini** | $0.40 | $1.60 | 1M | 80% cheaper than GPT-4.1 |
| **GPT-4.1 nano** | $0.10 | $0.40 | 1M | Cheapest option for simple validation |
| **o4-mini** | $1.10 | $4.40 | 200K | CoT tokens billed as output; real cost can be 2-5x higher |
| **Claude Opus 4.6** | $5.00 | $25.00 | 1M | Highest raw quality, highest cost |
| **Claude Sonnet 4.6** | $3.00 | $15.00 | 200K (1M beta) | Best value proposition |

**Per-task cost estimate for ~2,500 token input / ~1,000 token output:**

| Model | Estimated cost per call |
|---|---|
| GPT-4.1 | $0.013 |
| GPT-4.1 mini | $0.003 |
| o4-mini | ~$0.007 (base, real may be 2-5x) |
| Claude Sonnet 4.6 | $0.023 |
| Claude Opus 4.6 | $0.038 |

At 1,000 assessments per month, GPT-4.1 would cost ~$13/month vs Claude Opus 4.6 at ~$38/month. At 10,000 assessments, the gap widens to $130 vs $380.

**Prompt caching can reduce costs by 50-90%** on repeated system prompts (both OpenAI and Anthropic support this).

### 3. Latency Comparisons

| Task | GPT-4o (median) | Claude Sonnet 4.6 (median) |
|---|---|---|
| Content generation | 2.7s (p95: 5.9s) | 3.1s (p95: 6.8s) |
| Code review/generation | 3.8s | 4.2s |

Source: Production benchmark (30 runs per test, dev.to, 2025-2026).

**Key takeaway:** GPT-4o is approximately 0.4s faster than Claude Sonnet 4.6 on similar tasks. For a ~2-3K token payload, all models should return responses in 2-4 seconds. The latency difference is not material for a tool where users expect a few seconds of processing. GPT-4.1 is expected to have similar or slightly better latency than GPT-4o.

**Structured output overhead:** Adding schema enforcement adds ~80-120ms latency overhead (first request with a new schema incurs 200-500ms grammar compilation, cached for 24 hours thereafter).

### 4. Spatial Reasoning, Location Data, and Geographical Knowledge

Multiple 2025-2026 benchmarks specifically evaluate LLMs on spatial/geographic tasks:

**GPSBench (Feb 2026):** Evaluated 14 LLMs on 17 tasks involving GPS coordinate reasoning. Key finding: models are better at real-world geographic reasoning (country-level knowledge) than geometric computation (distance, bearing). Geographic knowledge degrades hierarchically -- strong at country level, weak at city-level localization.

**MapEval (ICML 2025):** Tested Claude-3.5-Sonnet, GPT-4o, and Gemini-1.5-Pro on map-based geo-spatial reasoning (700 MCQs, 180 cities, 54 countries). Best models still fall >20% below human performance. All three performed similarly.

**MapTab (Feb 2026):** Multi-criteria route planning benchmark across 160 cities. Current MLLMs face substantial challenges with multiple simultaneous constraints. Multimodal collaboration often underperforms unimodal approaches.

**RALLM-POI (Sep 2025):** Specifically addresses POI recommendation with geographical re-ranking. Uses a three-stage pipeline: retrieval -> geographical distance re-ranking (DWDTW) -> LLM rectification. This is the closest published work to what we are building.

**Spatial-RAG (Feb 2025):** Proposes hybrid spatial retrieval (SQL + semantic) with LLM reasoning. Formulates answer selection as multi-objective optimization over spatial and semantic scores.

**Implication:** No model has a proven advantage in spatial reasoning for sign placement. The task is novel enough that no benchmark directly evaluates it. The most relevant research (RALLM-POI, Spatial-RAG) uses LLMs as reasoning engines over pre-computed spatial candidates, which aligns with our proposed architecture.

### 5. API Terms of Service -- Commercial Real Estate Tool

**OpenAI (Business Terms, May 2025):**
- You own all API outputs. OpenAI assigns all rights to you.
- No restrictions on real estate applications. General commercial use is explicitly allowed.
- Cannot use outputs to train competing AI models.
- Cannot imply affiliation or endorsement by OpenAI.
- Data may be used for model training by default; opt-out available; Enterprise tier has no training on your data.
- Output uniqueness is not guaranteed -- other users could receive similar results.
- EU AI Act compliance required if serving EU customers (disclosure of AI-generated content).

**Anthropic (Commercial Terms, June 2025):**
- Commercial API use is explicitly allowed with no real estate-specific restrictions.
- Cannot build competing products or services.
- Zero data retention available for enterprise API customers (inputs/outputs not stored after request completion).
- Business Associate Agreements (BAA) available for HIPAA compliance.
- Output responsibility: must notify end users that outputs may be false or misleading and should not be verified independently.
- Third-party harness/Agent SDK restrictions apply only to consumer subscription plans, not API customers.

**Verdict:** Neither provider has restrictions relevant to a commercial real estate sign placement tool. Both have standard commercial terms that are compatible.

### 6. Model-Specific Evaluation for Our Task

**GPT-4.1 strengths for sign placement:**
- Best SWE-bench score (54.6%) for any non-reasoning model -- strong instruction following (87.4% IFEval)
- 1M token context window (overkill but future-proof)
- Excellent structured output support with strict mode
- Lowest cost among comparable models ($2/$8 per M)
- Prompt caching at 75% discount

**o4-mini considerations:**
- Chain-of-thought reasoning could help with multi-factor spatial decisions
- But CoT tokens billed as output makes real cost unpredictable (2-5x nominal)
- 200K context; no known advantage for structured output over GPT-4.1
- Best for complex multi-step problems; sign placement is multi-factor but not multi-step reasoning

**Claude Sonnet 4.6 strengths:**
- SWE-bench 79.6% -- within 1.2 points of Opus 4.6 at 40% of the cost
- Best value among frontier models
- Agentic/tool use edge case handling is slightly better than Opus (MCP Atlas: 61.3% vs 60.3%)
- Strong at following complex formatting instructions
- 1M context available (beta)

**Claude Opus 4.6 strengths:**
- Best raw reasoning (GPQA: 91.3%, ARC-AGI-2: 68.8%)
- If we need the model to reason deeply about tradeoffs between candidates, Opus is strongest
- SWE-bench 80.8% -- highest accuracy
- But at $5/$25 per M, it is 2.5x the cost of GPT-4.1

**GPT-4o is not recommended** due to imminent retirement (API sunset after April 2026).

## Source Assessment

**High confidence:**
- Pricing data is well-established across multiple aggregators (March-April 2026)
- Structured output reliability data from production studies is consistent
- Latency differences are well-documented and the gap is small
- API terms of service are clear and permissive for this use case

**Medium confidence:**
- Spatial reasoning benchmarks exist (GPSBench, MapEval, MapTab) but none tests sign placement directly. The gap between "valid JSON" and "correct values" in spatial tasks is not well-characterized.
- Cost-per-call estimates depend on actual token usage which varies by prompt design
- GPT-4o retirement timeline (April 2026) may be extended or altered

**Low confidence:**
- No model has been specifically evaluated on sign placement or route-based sign recommendation. Extrapolating from POI recommendation and route planning benchmarks is the best available approach but may not translate perfectly.

## Recommendation

**Primary choice: Claude Sonnet 4.6**

Rationale:
1. **Cost-value sweet spot:** At $3/$15 per M, Sonnet 4.6 delivers 98.5% of Opus 4.6's quality at 40% of the cost. For sign placement, where the task is multi-factor evaluation rather than deep abstract reasoning, Sonnet is more than capable.
2. **Structured output reliability:** Claude's tool use with `strict: true` achieves 0.3% schema violation rate -- comparable to OpenAI's 0.2% and well within acceptable bounds for production.
3. **Agentic edge:** Sonnet 4.6 is tuned for agentic use cases and slightly outperforms Opus on tool-use benchmarks. If we later add MCP tools for geocoding or map lookups, Sonnet handles them naturally.
4. **Prompt caching:** Anthropic's prompt caching (90% discount on cached input) strongly benefits a system with a large static system prompt, making repeated assessments very cost-efficient.
5. **No phase-out risk:** Sonnet 4.6 is the current mid-tier flagship, not slated for retirement.

**Secondary consideration: GPT-4.1**

If cost minimization is the priority, GPT-4.1 at $2/$8 per M is 33% cheaper than Sonnet 4.6. Its structured output support is equally mature. The tradeoff is slightly weaker instruction following (87.4% vs Sonnet's comparable but not directly benchmarked performance). GPT-4.1 is a strong fallback option.

**Not recommended:**
- GPT-4o -- being phased out
- o4-mini -- unpredictable real cost from CoT token billing; no advantage for this task
- Claude Opus 4.6 -- overkill for sign placement; 2.5x the cost of GPT-4.1 for marginal quality gain

## Gaps / Risks

- **No spatial benchmark for sign placement:** All spatial reasoning benchmarks test different tasks (routing, geolocation, POI recommendation). We need our own evaluation set of 5-10 real addresses with manual ground truth rankings to compare models.
- **Value accuracy unknown:** The 0.2-0.3% violation rate is for schema conformance only. Value accuracy (are the rankings correct?) needs task-specific evaluation.
- **Token usage variance:** If the model produces verbose chain-of-thought before outputting structured JSON, costs could be higher than estimated. For OpenAI, o4-mini has this risk. For Claude, "adaptive thinking" mode can increase output tokens ~3x.
- **Model availability:** API models and pricing change rapidly. These findings are as of May 2026 and should be re-validated quarterly.
- **Rate limits and throughput:** Not investigated but relevant for production scaling. Both providers offer tiered rate limits based on usage level.
