# Domain Rules Questionnaire

**Purpose**: Lock down every placement rule the system currently *guesses*, *stubs*, or *infers* so we can ground the pipeline in real, deliberate decisions instead of assumptions.

**How to use this**: Each item lists **what the code assumes today**, **why it matters**, and **questions to answer**. Answer as thoroughly as you can — vague answers force us back into guessing. If you don't know an answer yet, mark it `TODO` and note where you'll get it (e.g. "city ordinance PDF", "broker", "HOA bylaws"). Where a real data source is required, name it.

Legend:
- 🟢 **Real logic today** — implemented, just needs your confirmation of the numbers.
- 🟡 **Heuristic / inferred** — works but is an educated guess.
- 🔴 **Stubbed** — currently always returns "no violation"; effectively not enforced.

---

## 0. Core trail strategy 🔴 (MOST IMPORTANT — decide this first)

**Code assumes today:** shoots rays **1.5 miles** out from the property, finds up to **3 approach roads** in different directions (forced ≥60° apart), and splits the chosen number of signs across all of them. The result: signs start far from the house and get spread thin across multiple directions.

**The problem this caused:** with only ~5 signs spread across 3 directions starting 1.5 mi out, no single path is dense enough to actually follow, and a realtor doesn't have time to drive that far placing them.

**The fundamental fork (everything else depends on this):**
- **Option A — one tight lead-in trail:** pick the single busiest approach road, start closer (~0.3–0.6 mi), place all signs densely along that one path to the door. Simple to follow, fast to place.
- **Option B — multi-direction coverage:** catch buyers coming from several directions, accepting fewer signs per path. Needs a smaller radius and enough signs per direction to stay followable.

**Current lean (Jacob, to confirm):** multi-direction is probably more useful *even if the radius is smaller* — but unsure. **Needs research + real-world input before we build it.**

**Why it matters:** this single decision drives the approach-discovery radius, how signs are allocated, the gap/spacing rules, and how routes are drawn on the map.

**Questions:**
1. In your real experience, do open-house buyers usually approach from **one main road** or from **several directions**? Does it depend on the neighborhood?
2. How do you personally decide today where to put signs and from which direction(s)?
3. **Realtor time budget:** realistically, how many signs will an agent place, and how far from the house will they drive to place them? (This is a hard constraint.)
4. What's the **maximum distance from the house** you'd ever place a sign? (Sets the start radius — is 1.5 mi way too far?)
5. If multi-direction: what's the **minimum number of signs per direction** for a path to be followable (e.g. at least 2–3)? Should we only add a 2nd/3rd direction when the sign count allows it?
6. Should the agent **choose the directions**, or should the tool auto-pick the busiest approaches?
7. Should **sign count drive the radius** (more signs = reach further out) or should radius drive sign count?
8. **Research pointer:** is there an industry standard, brokerage guideline, or competitor product whose approach we should look at before deciding? Note it here.

---

## 1. Sign spacing & trail density 🟢

**Code assumes:** hard minimum **50 ft** between signs; preferred spacing **~500 ft**; flag a gap if two consecutive signs are more than **~0.5 miles** apart.

**Why it matters:** too close = wasted signs; too far = drivers lose the trail.

**Questions:**
1. What is the *absolute minimum* distance between two signs you'd ever place? Is 50 ft right?
2. What is the *ideal* spacing on a normal arterial vs. a slow residential street?
3. At what gap distance does a buyer realistically get lost / give up? Is 0.5 mi the right "flag a gap" threshold?
4. Should spacing change based on speed (faster road = signs further apart)? If so, give a rule.

---

## 2. Pre-turn placement geometry 🟡

**Code assumes:** signs go **before** the turn at an offset of `max(speed_mph × 6, 100)` feet (e.g. 45 mph → 270 ft). A confirmation sign can go **50 ft after** a turn.

**Why it matters:** a driver needs enough lead time to react at speed.

**Questions:**
1. Is the "6 ft of lead per mph" rule reasonable, or do you have a better one (e.g. based on stopping distance)?
2. What's the minimum lead distance on a slow street? (Currently 100 ft.)
3. Do you actually use "after the turn" confirmation signs? If yes, how far after?
4. Should signs ever go *at* the corner itself, or always before?
5. Which side of the road / angle to curb matters for the recommendation text? (We currently don't model side-of-road.)

---

## 3. Approach road discovery 🟡

**Code assumes:** shoots 8 rays (every 45°) 1.5 miles out from the property, routes back, keeps the top 3 approaches by road speed, and forces them to be at least 60° apart in direction.

**Why it matters:** determines which directions we guide buyers in from.

**Questions:**
1. Is 1.5 miles the right distance to "start the trail" from? Should it scale with how rural/urban the area is?
2. How many approach directions should a typical open house cover? (We cap at 3.)
3. Should we always include the single busiest nearby arterial even if it's the same direction as another?
4. How do you personally decide where the "first sign from the main road" goes today?

---

## 4. Municipal / city ordinances 🔴 (NOT enforced)

**Code assumes:** nothing — there is no ordinance checking. We do not know legal hours, permitted zones, distance-from-intersection rules, or size limits.

**Why it matters:** illegal signs get removed or fined; this is the biggest legal risk.

**Questions:**
1. Which cities/counties will this tool be used in first? (List them.)
2. For each: are open house directional signs allowed in the **public right-of-way** (the strip between sidewalk and street)? Yes/No/Permit-required?
3. Are there **permitted days/hours** (e.g. only during the open house, only weekends, must remove by sunset)?
4. Is there a **minimum distance from an intersection** signs must keep (e.g. 10 ft from the curb return)?
5. Are there **size / height limits** on the sign itself?
6. Is a **permit** required, and is there a per-sign limit per property?
7. **Where can we get this data?** Is there an ordinance PDF/URL per city we can encode, or should the tool just show a "check local rules" warning?

---

## 5. HOA & private property 🔴 (NOT enforced)

**Code assumes:** nothing.

**Why it matters:** HOAs commonly ban or restrict signs and will remove them.

**Questions:**
1. How often are target properties inside HOAs?
2. Do you have access to HOA rules per community, or is this always manual?
3. Should the tool flag "this property is in a known HOA — confirm sign rules" if we can detect it? Is there a data source for HOA boundaries you trust?
4. For signs placed on someone else's corner lot — what's your real-world rule for getting permission? Should the tool warn on residential-front placements?

---

## 6. Intersection sight triangle (safety) 🟢

**Code assumes:** a sign placed *at* a turn is rejected if it's within **25 ft** of the intersection (blocks driver sight lines). Also rejects signs within **10 ft** of the roadway edge.

**Why it matters:** blocking visibility at a corner is a real hazard/liability.

**Questions:**
1. Is 25 ft the right sight-triangle clearance, or do you use a standard (e.g. AASHTO / local code) number?
2. Does the clearance depend on speed or road type?
3. Is 10 ft from the roadway edge correct for "not in the road"?

---

## 7. Fire hydrant clearance (safety) 🔴 (NOT enforced)

**Code assumes:** never violates — we have **no hydrant location data**.

**Why it matters:** blocking a hydrant is illegal and dangerous.

**Questions:**
1. What clearance is required around a hydrant in your areas (commonly 15 ft)?
2. Is there a hydrant-location dataset available (many cities publish open-data GIS layers)? Name the source if you know one.
3. If we can't get hydrant data, is a generic "check for hydrants nearby" warning acceptable?

---

## 8. Sidewalk / right-of-way / utility (safety) 🔴 (NOT enforced)

**Code assumes:** never violates — no sidewalk geometry data.

**Questions:**
1. What's the rule for placing signs relative to a sidewalk (behind it, beside it, never on it)?
2. Are there utility-box / mailbox / crosswalk clearances you follow?
3. Any data source for sidewalk geometry, or is this judgment-only on-site?

---

## 9. Medians & roadway placement 🔴 (NOT enforced)

**Code assumes:** median placement never flagged.

**Questions:**
1. Are signs ever allowed on medians/islands in your areas? (Usually no.)
2. Should we hard-block any placement that would fall on a median or in a travel lane?

---

## 10. Physical sign specs 🟡 (referenced, not modeled)

**Code assumes:** spec text mentions ~45° to curb, 24–36" off ground (from the README domain rules) but does not model it.

**Questions:**
1. What sign dimensions / heights do your agents actually use?
2. Do these specs ever affect *placement* (e.g. tall signs need more clearance), or are they just guidance text?

---

## 11. Number-of-signs guidance 🟡

**Code assumes:** the agent picks the sign count manually; the property sign is always mandatory and last.

**Questions:**
1. Should the tool *recommend* a sign count based on route complexity (turns, distance), or always respect the manual count?
2. Minimum and maximum sensible sign counts?

---

## 12. Liability & disclaimers ⚪ (product decision)

**Questions:**
1. Should every result show a disclaimer that the agent is responsible for verifying local legality?
2. Any wording your broker/legal requires?
3. Do we need to log/record that the agent acknowledged local rules?

---

## 13. Data sources you can provide

To turn the 🔴 stubs into real checks, we need data. Please list anything you can supply or point us to:
1. City/county ordinance documents (PDF/URL) for your launch markets.
2. Open-data GIS layers (hydrants, sidewalks, right-of-way, medians, HOA boundaries) — many cities publish these.
3. Any internal brokerage "where to put signs" guide you already trust.

---

## 14. Anything we missed

List any rule, habit, or local quirk you use when placing signs by feel that isn't captured above. The more of your real-world intuition we capture here, the less the system has to guess.
