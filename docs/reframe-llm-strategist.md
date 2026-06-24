# Reframe — LLM as Strategist (on deterministic rails)

**Status:** Decided 2026-06-23. Supersedes `build-spec.md` Step 6 ("LLM Re-rank + Explain") and
archive `05-llm-prompt-design.md`. The 8-step deterministic pipeline made the LLM a re-ranker +
caption writer; this reframe makes the LLM the **placement strategist** and demotes the
deterministic engine to **geometry rails** the LLM reasons within.

## The thesis

A realtor uses *their mind* to place signs: which roads do buyers actually use, is this corner any
good, is a sign even legal/safe here, does this property need one deep route or a couple. That
judgment is the product. Today it's done by a scoring equation (`estimateRoadClassScore`,
`scorer.ts`, `optimizer.ts` allocation). The reframe moves the **judgment** to the LLM and keeps the
**geometry** in math.

Splits:
- **Judgment → LLM:** which approaches matter, per-property strategy (concentrate vs. multi-route —
  a decision the research itself won't resolve globally, so it must be situated), whether a specific
  corner works (vision), ordinance reasoning.
- **Geometry → math (unchanged):** exact lat/lng, 45° to curb, AASHTO lead distance, 50 ft spacing,
  polyline decode. The LLM never invents coordinates (it hallucinates spatial data — the one valid
  caution from the old design).

## The research is not thrown away — it becomes the LLM's knowledge base

The ~2,500 lines in `domain-rules-answers.md`, `tmf-answers.md`, `new-tmfa.md` (placement rules,
followability model, property-type playbook, ordinance facts) were wired into the wrong worker:
frozen into `if`/constants instead of given to the thing that can reason with them. They become the
strategist's system-prompt context, not tuning knobs.

## Three-stage architecture

| Stage | Owner | Does |
|---|---|---|
| **A. Which approaches matter** | LLM | Ray-cast *discovery* still finds candidate approaches (cheap geometry, kept). LLM judges which a buyer actually uses + picks the per-property strategy (route count, concentrate vs. spread, property-type adaptation: apartment→office/gate, on-arterial→advance both ways, rural→sparse). Replaces `estimateRoadClassScore` + `optimizer` allocation + `maxApproachesForSignCount`. |
| **B. Is this corner any good** | LLM (vision) | For each shortlisted spot, fetch Street View Static image → Claude judges sightline, setback, hazards (hydrant, bus stop, median), placeability. Fills the data gaps that are currently unfillable warnings. New capability. |
| **C. Exact placement** | math | lat/lng, 45°, lead distance, spacing, legal minimums. The rails the LLM picks within. Kept. |

Repeatability (cache the analysis per address) carries through both LLM stages.

## Keep / Invert / Rebuild / New

- **Keep:** `geocoder`, `routing`, `google-maps` geocode+computeRoutes, `geo.ts`, candidate geometry,
  `placement.ts` geometry constants, DB, API routes, map frontend, `useStreetView` (metadata/heading).
- **Invert (judgment → LLM):** `approach-roads` (keep discovery, drop scoring decision), `scorer`
  (→ features fed to LLM), `optimizer` allocation + `maxApproachesForSignCount`, `decision-points`
  fallback stack.
- **Rebuild:** `llm-client`/`llm.ts` — re-ranker → strategist (new prompt + tool schema + vision).
- **New:** Street View Static fetch (server-side), vision pass, property-type/strategy reasoning.

## Build phases

1. Anchor doc (this file).
2. **Strategist core, text-only:** one real address; LLM judges approaches + strategy + selects
   spots; geometry places them. Proves the inversion. No vision yet.
3. **Vision:** Street View Static → Claude judges each corner. **Billed** (image tokens) — flag cost
   and get go-ahead before real runs (per [[billed-runs-need-go-ahead]]).
4. **Collapse** the dead deterministic machinery once the LLM owns those decisions.

## Guardrails (so we don't reopen old wounds)

- LLM never emits coordinates — only selects/judges; math computes positions.
- Model is `claude-opus-4-8` with adaptive thinking + `effort: high` (→ `xhigh`/`max` for the hardest
  judgment) — accuracy over speed. Opus 4.8 rejects `temperature` (400s), so the old `temperature: 0`
  determinism is gone; **repeatability rests on caching the analysis per address** instead.
- Cost: vision adds image-token cost per analysis; must fit the build-spec budget model
  (~<$0.10/analysis target, $10/day cap). Measure before scaling.

See also: [[llm-is-the-backbone]], [[multi-route-reframe]], [[all-us-product-vision]],
[[sign-count-practitioner-consensus]].
</content>
