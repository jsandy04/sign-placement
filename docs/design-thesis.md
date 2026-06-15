# Design Thesis — Multi-Route Coverage as the Differentiation

**Status:** Decided 2026-06-15. Supersedes the "concentrate on one feeder road" reading of
[tmf-answers.md](./tmf-answers.md) Q1.

## The thesis

**The tool's reason to exist is finding the multiple genuinely-good approaches a realtor would
love to cover but can't be bothered to scout manually.** Google's routing + the AI can, in seconds,
identify every real feeder direction to a property and lay a followable sign trail down each one.

## Why we reject "concentrate on one route" as the default

The practitioner consensus — "most agents use one feeder road, 4–6 signs" — is real, but it
describes a **time-and-gas constraint**, not an optimum. Agents place signs at 6am, alone, driving
around; they physically can't scout 3 routes, so they don't. That compromise is exactly the
constraint the tool removes. **Optimizing the tool to imitate the constraint throws away its value.**

The earlier interpretation of Q1 baked concentration into the engine (`maxApproachesForSignCount`
gating routes hard, a 40% near-house reserve, and opposite-direction dedup). The result: even at 11
signs the output is one L-shaped corridor instead of independent approaches. That is the behavior we
are correcting.

## The synthesis — "surface, don't mandate"

We are **not** flipping from "always 1 route" to "always 3 routes." Signage ROI is genuinely modest
(NAR: ~4% of buyers find homes via open-house signage) and varies by agent goal (serious-buyer
wayfinding vs. brand exposure). So:

- **Find and surface** every real approach effortlessly — the core value.
- **Fund what the budget supports** at a followable floor per route.
- **Let the agent dial coverage** via the sign budget, and **recommend** a budget that covers the
  approaches we found (route count *and* route length scale with budget).
- Do **not** push toward maximal saturation — the same research warns against the 25–40 sign
  "spectacle" pattern.

## What this changes in the code

1. **Stop merging opposite directions on the same arterial.** `approach-roads.ts`
   `selectDistinctApproaches` rejects a second approach with the same road name — which kills the
   legitimate "northbound 75th Ave" + "southbound 75th Ave" case (two distinct sign approaches).
   Relax the duplicate-road rule when bearings are roughly opposed.
2. **Loosen budget gating of route count.** `maxApproachesForSignCount` (1 route until 8 signs, 2
   until 12) is too conservative; open more approaches at lower budgets when distinct good ones
   exist, governed by the per-route followability floor.
3. **Stop starving secondary routes.** The 40% near-house reserve pulls budget to the door so
   secondary approaches get nothing. Rebalance so coverage and near-house saturation coexist.
4. **Recommend a budget that fits the approaches found**, surfaced in the UI.

## Open questions to validate (non-blocking — tunes constants, not architecture)

Run via external research (DeepSeek); fold answers into the constants noted.

1. **Both-directions-same-arterial:** Do agents sign both directions on one road, or only the
   dominant flow? When is it worth it? → governs the opposite-direction dedup rule.
2. **Per-route followability floor:** Minimum signs for an *independent* approach to be followable —
   is 2 (turn-off + confirmation) enough, or is the full entry→turn→confirm set needed? →
   `HARD_MIN_SIGNS_PER_APPROACH`, `MIN_SIGNS_PER_APPROACH`.
3. **Multi-route ROI:** Does covering 2–3 approaches measurably lift attendance vs. the single best
   approach + near-house block? → how aggressively to open routes by default.
4. **Diminishing returns:** Beyond ~3 approaches, overkill/spectacle backlash, or do big-grid
   neighborhoods benefit from 4+? → `maxApproachesForSignCount` ceiling.
5. **Fixed-budget tradeoff:** At 8 signs, one deep trail vs. thinner 2–3-route coverage — which wins
   on "did buyers find it"? → the near-house reserve % and route-count default.

See also: [[sign-count-practitioner-consensus]], [[all-us-product-vision]].
