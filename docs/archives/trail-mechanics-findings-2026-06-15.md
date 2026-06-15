# Trail Mechanics — Findings & Working Base

**Purpose:** the durable base for improving sign-trail quality. Captures what the eval revealed,
the prioritized fix list, and the open domain questions worth researching. Update this as we go.

**How to regenerate the data:** `npm run dev` then `npm run eval` (addresses live in
`scripts/eval-addresses.mjs`; raw output in `scripts/eval-results.json`, which is gitignored).

**Related:** [domain-rules-answers.md](domain-rules-answers.md) is the original research. Where the
code drifted from it, that's called out below.

---

## Phase 1 — what's already fixed (shipped to `main`)

- **Offset gate** (`hard-constraints.ts`): after-turn confirmation signs (~50 ft past a turn) are
  no longer deleted by the lead-distance rule. Was halving the candidate pool.
- **Allocation engine** (`optimizer.ts`): round-robin across approaches so the budget is
  distributed fairly instead of one route hogging every sign. Output ordered by route in driving
  order, property last.
- **Confirmation spacing** (`decision-points.ts`): 1,320 ft → 660 ft so short routes fill toward
  the requested count.
- **Radius** (`approach-roads.ts`): reverted a harmful discovery-radius shrink. Budget-driven
  *placement* clamp is deferred to the classifier layer (see open questions).

Result: happy-path subdivisions reliably hit the requested count with fair distribution.

---

## Eval snapshot (12 addresses, first run)

| category | asked | placed | routes signs/claimed | near/mid/far | flags |
|---|---|---|---|---|---|
| subdivision | 8 | 8 | 2/2 | 3/3/1 | ok |
| subdivision | 8 | 8 | 2/2 | 3/4/0 | ok |
| subdivision | 5 | 5 | 1/1 | 1/1/2 | DEGRADED(4) |
| subdivision | 12 | 12 | 3/3 | 3/4/4 | ok |
| on-arterial | 8 | 8 | 1/2 | 1/4/2 | PHANTOM_ROUTES |
| on-arterial | 8 | 8 | 2/2 | 2/2/3 | LOPSIDED |
| apartment | 8 | 8 | 2/2 | 3/3/1 | ok |
| apartment | 8 | **1** | 0/2 | 0/0/0 | COUNT_SHORT, PHANTOM |
| urban | 8 | 8 | 2/2 | 1/2/4 | ok |
| gated | 10 | 10 | 2/3 | 4/3/2 | PHANTOM_ROUTES |
| rural | 8 | **1** | 0/2 | 0/0/0 | COUNT_SHORT, PHANTOM |
| rural | 8 | 8 | 1/2 | 3/4/0 | PHANTOM_ROUTES |

**Flag tally:** PHANTOM_ROUTES ×5, COUNT_SHORT ×2, DEGRADED ×1, LOPSIDED ×1.

`near/mid/far` = signs Near (≤800 ft) / Mid / Far (>0.5 mi) from the house.

---

## Systemic findings (evidence-based)

### F1 — 🔴 Catastrophic 1-sign result (apartment + rural)
Two cases returned **only the house sign** (`0/0/0`, zero approach signs). Routes were found
(claimed 2) but produced **zero usable candidates**. A house-only result is useless to an agent.
**Likely cause:** all candidates dropped by hard constraints / spacing dedup, or routes too short
/ turn-sparse to host signs. Needs tracing.

### F2 — 🟠 Phantom routes (5/12)
We report 2–3 routes but signs land on fewer. The extra "routes" overlap and collapse after the
50 ft spacing dedup. We over-promise coverage. Fix: detect collapsed approaches; report only
routes that actually carry signs.

### F3 — 🟠 Signs skew away from the house
On sparse/arterial properties most signs land Far (toward the arterial), few Near the door
(urban 1/2/4; on-arterial 1/4/2, 2/2/3; subdivision-n5 1/1/2). Research §0.2 wants the opposite:
**saturate the final block** + signs on **both ends of the property's own street**. Not implemented.

### F4 — 🟡 "5 signs = 1 route" is mislabeled DEGRADED
`degradationForRoutes` returns 4 when `routes.length === 1`, treating a legitimate budget-driven
single-route plan as a failure. Semantics conflate "only 1 route" with "something broke." Should
explain, not flag as degraded.

---

## Prioritized fix list

1. **F1 — never return a house-only result.** Trace where candidates vanish on apartment/rural;
   add a real fallback trail. Highest damage.
2. **F2 — kill phantom routes.** Collapse/merge overlapping approaches; report only carrying routes.
3. **F3 — pull signs toward the house.** Saturate last-mile/neighborhood path + property's street.
4. **F4 — fix degradation semantics.** 1 route by budget ≠ degraded; surface the tradeoff in UI.
5. **Per-property classifier** (apartment / on-arterial / rural / gated / subdivision) on top, once
   the above mechanics are sound.

After each fix: re-run `npm run eval` and confirm the relevant flag clears.

---

## Open domain questions (worth researching — NOT answered by existing research)

These are genuine product/domain unknowns the original research didn't settle:

- **Q1 — Sparse multi-direction trails:** is 1–2 signs per direction ever acceptable, or is
  min-3-per-direction (§0.5) firm? This decides whether 5 signs can be 2 light routes vs 1 strong one.
- **Q2 — Apartment/complex strategy:** for a complex, where do signs go? (Leasing office, gate,
  building cluster?) The "destination" isn't a single front door.
- **Q3 — On-arterial frontage:** when the property is *on* the main road with no neighborhood
  turn-in, what's the right trail? (Advance signs on the arterial + property only?)
- **Q4 — Rural reach:** how far is too far when the nearest arterial is >1 mi? Does the agent
  accept a longer drive, or fewer signs?
- **Q5 — Neighborhood saturation ratio:** what fraction of signs should be inside the neighborhood
  vs on the approach? (Drives the F3 fix weighting.)

---

## Changelog
- 2026-06-15 — Initial findings from first 12-address eval run; Phase 1 mechanics fixes shipped.
