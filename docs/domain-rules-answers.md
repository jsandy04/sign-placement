# Domain Rules Answers — Implementation Decisions

**Prepared for:** Cascade (implementing engineer)  
**Date:** 2026-06-01  
**Based on:** [15-domain-rules-questionnaire.md](archives/15-domain-rules-questionnaire.md) (archived)  
**Research scope:** Real estate industry practice, AASHTO/MUTCD/IBC/IFC standards, municipal codes for Phoenix–Peoria–Glendale–Scottsdale AZ, GIS open-data availability

---

## Executive decisions

### §0 Core trail strategy: **Option B — multi-direction coverage with tight radius**

The industry overwhelmingly uses a **hybrid model**: signs originate from the major roads that feed the neighborhood (often 2–3 directions), but the placement radius is tight (≤0.5 mi typical, ≤1 mi max) and each approach gets enough signs to form a followable breadcrumb trail.

**Final recommendation:** Multi-direction approach with these constraints:
- **Default start radius = 0.5 miles (2,640 ft)** from property. Expandable to 1.0 mi if sign count ≥ 12.
- **2 approach directions minimum**, 3 max. Only add a 3rd direction when total sign count ≥ 10.
- **Minimum 3 signs per direction** (entry + turn + confirmation); aim for 4–5 per direction.
- **Sign count allocation drives everything.** Auto-recommend a sign count based on route complexity (turns × distance); let agent override.

**Why not Option A (single tight trail):** A single trail from one road misses buyers coming from other common approaches. Suburban Phoenix neighborhoods typically have 2–3 entry corridors. Industry guides consistently place signs on "major roads leading into the neighborhood" (plural), with signs at every turn.

### Other top-line decisions
- **Start radius:** 0.5 mi default, configurable to 1.0 mi max.
- **Recommended sign count logic:** 3 + (1 per turn on the primary approach) + (2 per additional approach). Typical output: 8–12 signs.
- **Top 3 things blocked on missing data:**
  1. Fire hydrant locations — partial Phoenix ArcGIS layer found; no Glendale/Peoria/Scottsdale/County coverage. Fallback: generic warning.
  2. Sidewalk geometry — no comprehensive GIS layer for any launch market. Fallback: warning + manual check.
  3. HOA boundary data — no automated source. Fallback: flag if Maricopa County Assessor shows subdivision with CC&Rs; agent must confirm.

---

## 0. Core trail strategy

### 0.1 Do buyers approach from one main road or several directions?

**Recommended answer:** Several directions, but the number is limited. In suburban Phoenix metro (Glendale, Peoria, Scottsdale), neighborhoods typically have 2–3 entry corridors from nearby arterials. Buyers navigate from whichever arterial they know or their GPS routes them onto. Industry guidance consistently says to place signs on "major roads leading into the neighborhood" (plural) and at every turn.

**Which code constant/file:** `src/lib/pipeline/approach-roads.ts` — `MAX_APPROACH_ROADS`  
**Source:** Showable.co open house signage guide (2024); UPrinting "A Guide to Effective Open House Directional Signs" (2024); Packeze.com placement strategies (2024)  
**Confidence:** High  
**Open items:** None — this matches the current multi-approach design.

### 0.2 How do agents decide where to put signs today?

**Recommended answer:** Agents drive the route from the nearest major intersection(s) to the property, placing signs at decision points (turns, forks, confusing intersections) and one confirmation sign after each turn. They also place signs on both ends of the property's own street. The tool should replicate this mental model: route from arterial entry points → place at turns → confirm after turns → saturate the final block.

**Source:** ActiveRain agent blogs; The Complete Package "Open House Signs, Here's What Really Works" (2024); Curb Hero open house tips  
**Confidence:** High

### 0.3 Realtor time budget

**Recommended answer:** **10–15 signs max**, placed in ~20–30 minutes before the open house. Agents arrive 30–60 min early to set up. Sign placement competes with interior prep (lights, lockbox, temp, flyers). This is a hard constraint — do not recommend more than 15 signs or a radius beyond what can be driven and placed in 30 min.

**Which code constant/file:** UI layer — recommendation text max sign count ceiling of 15  
**Source:** Apartment Therapy "What a Real Estate Agent Does 30 Minutes Before an Open House" (2024); Showable.co; multiple agent blog sources  
**Confidence:** High

### 0.4 Maximum distance from house

**Recommended answer:** **0.5 miles (2,640 ft) default, 1.0 mile absolute maximum.** Industry standard is 0.5–1 mile. 1.5 miles is too far — no agent drives 1.5 miles to place signs. Phoenix metro is gridded; major arterials are typically within 0.5 mi.

**Which code constant/file:** `src/lib/rules/placement.ts` — `APPROACH_ROAD_DISTANCE_FT` → change from 7,920 to **2,640**  
**Source:** Showable.co; Gear Up Real Estate checklist; agent forum consensus  
**Confidence:** High

### 0.5 Minimum signs per direction

**Recommended answer:** **3 signs minimum per direction** (entry/arterial sign + turn sign + confirmation sign). Do not add a 2nd or 3rd direction unless each direction can have at least 3 signs. With 8–10 total signs, that means 2–3 directions max.

**Which code constant/file:** New logic in sign-allocation phase — enforce `minSignsPerApproach = 3`  
**Source:** Derived from industry guidance (1 at entry + 1 at each turn + 1 at property)  
**Confidence:** Medium (industry guidance implies this but doesn't state it as a rule)

### 0.6 Agent chooses directions vs. auto-pick?

**Recommended answer:** **Auto-pick the busiest approaches, but show the agent why.** The tool should display the recommended approaches with their rationale (traffic volume, road class) and let the agent override. Default = auto-pick top N by traffic score.

**Which code constant/file:** UI layer — approach selection screen  
**Source:** Product design judgment; consistent with "show your work" UX for professional tools  
**Confidence:** Medium (product decision, not research-backed)

### 0.7 Sign count drives radius or vice versa?

**Recommended answer:** **Sign count drives radius.** Agent sets budget (number of signs, or accepts tool recommendation) → tool allocates within appropriate radius. More signs = reach further out; fewer signs = tighter radius, fewer approaches.

**Which code constant/file:** Core algorithm — sign allocation step; `APPROACH_ROAD_DISTANCE_FT` becomes `max(2640, signCount * 200)` up to 5280  
**Source:** Logical inference from agent time budget + spacing rules  
**Confidence:** Medium

### 0.8 Competitor products

**Recommended answer:** No direct competitors were found that automate open-house directional sign placement via routing algorithms. The space is served by:
- Sign printing companies (Showable, UPrinting, OvernightPrints) — sell physical sign sets, some offer generic placement tips
- Open house apps (Curb Hero, Spacio) — focus on digital check-in and lead capture, not sign placement
- GIS/routing tools (Google Routes API) — infrastructure, not a packaged product

This product appears to have first-mover advantage on automated sign-route planning.

**Source:** Web search for "sign placement route optimization app real estate 2024"; app store comparisons  
**Confidence:** Medium (fast-moving space, but no direct competitor identified)

---

## 1. Sign spacing & trail density

### 1.1 Absolute minimum spacing

**Recommended answer:** **50 ft is correct.** Industry practice varies from "don't put two signs in the same line of sight" to hard minimums in some city codes (e.g., Glendale requires ≥50 ft between signs). 50 ft is a safe, defensible minimum.

**Which code constant/file:** `src/lib/rules/placement.ts` — `MIN_SIGN_SPACING_FT` → keep at **50**  
**Source:** Glendale AZ Code §7.100 (50 ft between subdivision signs); general industry guidance  
**Confidence:** High

### 1.2 Ideal spacing: arterial vs. residential

**Recommended answer:**
- **Arterial (≥35 mph): ~500–800 ft** — drivers cover ground faster, signs at decision points naturally spread apart.
- **Residential (<35 mph): ~250–400 ft** — tighter turns, shorter blocks, signs naturally cluster.

Current code uses a flat 500 ft ideal. Recommend making it speed-dependent: `idealSpacing = max(250, min(800, speedMph * 15))`.

**Which code constant/file:** `src/lib/rules/placement.ts` — `SOFT_SIGN_SPACING_FT` → replace with speed-dependent function  
**Source:** Derived from block-length patterns in Phoenix-grid neighborhoods (~1/8 mi = 660 ft between major streets) and arterial spacing of major intersections (~1/2 mi)  
**Confidence:** Medium

### 1.3 Gap-to-get-lost threshold

**Recommended answer:** **0.5 miles (2,640 ft) is reasonable as a "flag" threshold** but should be speed-dependent. On a slow residential street (25 mph), a driver travels 0.5 mi in ~72 seconds without seeing a sign — definitely lost. On an arterial (45 mph), that's ~40 seconds. Keep 0.5 mi as the warning threshold for all roads; it's conservative enough.

**Which code constant/file:** New constant `MAX_GAP_BEFORE_WARNING_FT = 2640` (already implied in current gap flagging)  
**Source:** Human factors — after 30–60 seconds without confirmation, drivers assume they missed a turn  
**Confidence:** Medium

### 1.4 Speed-dependent spacing

**Recommended answer:** **Yes.** See 1.2 above. Implement `idealSpacing = clamp(speedMph * 15, 250, 800)`.

**Which code constant/file:** `src/lib/rules/placement.ts` — new function `idealSpacingFeet(speedMph)`  
**Source:** MUTCD guidance on sign spacing relative to speed; AASHTO stopping sight distance rationale  
**Confidence:** Medium

---

## 2. Pre-turn placement geometry

### 2.1 Lead distance formula (6 ft per mph)

**Recommended answer:** The current `speedMph * 6` formula is a **minimum reaction distance**, not a full stopping distance. Compare with AASHTO stopping sight distance:

| Speed | Current (×6) | AASHTO SSD | Recommendation |
|-------|-------------|------------|----------------|
| 25 mph | 150 ft | 155 ft | 150 ft |
| 35 mph | 210 ft | 250 ft | 250 ft |
| 45 mph | 270 ft | 360 ft | 350 ft |

**Recommend:** Change to `max(speedMph * 10, 150)` for arterials (≥35 mph) and keep `max(speedMph * 6, 100)` for residential. This gives drivers enough stopping distance at higher speeds.

**Which code constant/file:** `src/lib/rules/placement.ts` — `recommendedOffsetFeet()` → update formula  
**Source:** AASHTO Green Book 2018, Table 3-1 (Stopping Sight Distance); MUTCD §2C.04 advance warning sign placement  
**Confidence:** High (AASHTO values are definitive)

### 2.2 Minimum lead distance on slow streets

**Recommended answer:** **100 ft is correct.** At 25 mph, 100 ft gives ~2.7 seconds of lead time — adequate for a turn decision on a residential street.

**Which code constant/file:** `src/lib/rules/placement.ts` — floor in `recommendedOffsetFeet()` → keep at **100**  
**Source:** AASHTO perception-reaction time (2.5 sec) × 25 mph = 92 ft; 100 ft rounds up safely  
**Confidence:** High

### 2.3 After-turn confirmation signs

**Recommended answer:** **Yes**, and the current 50 ft is appropriate. This is widely recommended by agent guides — "a confirmation sign 30–50 feet after the turn so the driver knows they went the right way." Keep at 50 ft.

**Which code constant/file:** `src/lib/rules/placement.ts` — `AFTER_TURN_CONFIRMATION_FT` → keep at **50**  
**Source:** Industry guides (Showable, UPrinting, Packeze); agent forum consensus  
**Confidence:** High

### 2.4 At the corner vs. before

**Recommended answer:** **Always before the corner.** Signs at the corner itself create sight-triangle hazards and are illegal in most jurisdictions. The "at" placement type should be reserved for confirmation signs AFTER the turn, never ON the corner. The tool should never recommend placing a sign exactly at an intersection corner.

**Which code constant/file:** `src/lib/rules/safety.ts` — `violatesSightTriangle()` already handles this via the 25 ft check  
**Source:** AASHTO sight triangle requirements; all four city ordinances reviewed  
**Confidence:** High

### 2.5 Side of road / angle to curb

**Recommended answer:** Recommend **right side of road** (passenger side, most visible to driver) and **~45° angle toward oncoming traffic** in the recommendation text. This is the industry standard. We don't need to model it geometrically — include it in the placement instructions text.

**Which code constant/file:** Recommendation text output — guidance string only  
**Source:** Multiple agent guides; sign printing company recommendations  
**Confidence:** High

---

## 3. Approach road discovery

### 3.1 Start radius (1.5 miles)

**Recommended answer:** **Change to 0.5 miles (2,640 ft).** See §0.4 rationale. 1.5 mi is too far. 0.5 mi captures the typical approach pattern for Phoenix-metro suburban neighborhoods. Make it configurable up to 1.0 mi for rural or unusually isolated properties.

**Which code constant/file:** `src/lib/rules/placement.ts` — `APPROACH_ROAD_DISTANCE_FT` → **2,640**  
**Source:** Industry standard 0.5–1 mile; Showable, Gear Up Real Estate, agent forums  
**Confidence:** High

### 3.2 Number of approach directions

**Recommended answer:** **Cap at 3 is correct.** Industry practice covers 2–3 entry corridors. More than 3 spreads signs too thin. Current code logic is sound.

**Which code constant/file:** `src/lib/pipeline/approach-roads.ts` — `MAX_APPROACH_ROADS` → keep at **3**  
**Source:** Industry guidance; sign count budget constraint  
**Confidence:** High

### 3.3 Always include busiest arterial?

**Recommended answer:** **Yes.** The single busiest arterial within the radius should always be included, even if it reduces the angular spread. The 60° separation rule should be relaxed (to 30°) when the second-best road has significantly lower traffic. The busiest arterial is where the most potential buyers come from.

**Which code constant/file:** `src/lib/pipeline/approach-roads.ts` — `MIN_APPROACH_SEPARATION_DEG` → keep 60° as soft preference but don't sacrifice traffic for angular spread  
**Source:** Logical inference from NAR data (4% of buyers from signs on main roads)  
**Confidence:** Medium

### 3.4 First sign from main road

**Recommended answer:** The first sign goes at the point where the arterial road intersects the approach route into the neighborhood — typically the first turn-off from the arterial. This is what the current ray-shooting + routing-back approach models. The current algorithm is sound; just reduce the radius.

**Which code constant/file:** No change — algorithm is correct, radius is the only issue  
**Source:** Agent guides: "start at the nearest major intersection"  
**Confidence:** High

---

## 4. Municipal / city ordinances

### 4.1 Launch market cities

**Recommended answer:** Greater Phoenix / Maricopa County, AZ — specifically **Glendale, Peoria, Phoenix, Scottsdale** (plus unincorporated Maricopa County as the fallback jurisdiction).

**Source:** Per project spec  
**Confidence:** High

### 4.2–4.6 City-by-city ordinance summary

#### Phoenix

| Question | Answer |
|----------|--------|
| ROW allowed? | **Generally prohibited.** Signs in public ROW require an encroachment permit (Phoenix Zoning Ordinance §1308.C.3.a). Directional signs max 6 sq ft in certain transect districts. |
| Permitted days/hours? | Not specified for open house signs in reviewed sections. Temporary A-frame signs allowed during business hours only. |
| Distance from intersection? | Must not obstruct visibility at intersections (§1308 general provisions). No specific numeric minimum found. |
| Size/height limits? | Directional signs: max 6 sq ft (§1308 Table). A-frame temporary: max 9 sq ft. |
| Permit required? | Encroachment permit for ROW placement (§1308.C.3.a). On-premise directional signs listed as "Permanent / Permit Required." |
| Per-sign limit? | Not found in reviewed sections. |
| **Code reference** | Phoenix Zoning Ordinance §1308 (Signage Standards), §705 (Temporary Uses). [phoenix.municipal.codes](https://phoenix.municipal.codes) |
| **Practical takeaway** | **ROW placement is effectively prohibited without a permit.** Real estate agents likely place signs anyway (common practice), but the tool must warn. |

**Confidence:** Medium (403 errors on full ordinance pages; used search snippet results)

#### Glendale

| Question | Answer |
|----------|--------|
| ROW allowed? | **No.** "No sign shall be allowed in any public right-of-way" (§7.100). |
| Permitted days/hours? | Off-site weekend directional signs: **Friday 4:00 PM → Monday 8:00 AM** (or Tuesday if Monday holiday). |
| Distance from intersection? | Not within required visibility triangle. 50 ft minimum between signs. |
| Size/height limits? | Off-site directional: max **4 sq ft**, max **3 ft height**. |
| Permit required? | **Yes** — annual sign permit per subdivision; site plan with all sign locations required. |
| Per-sign limit? | Max **8 signs** per subdivision. Must be within 1 mile of subdivision. |
| **Code reference** | Glendale Code of Ordinances, Article 7 (General Development Standards), §7.100–7.105 (Signs). [glendale-az.elaws.us](http://glendale-az.elaws.us/code/coor_art7) |
| **Practical takeaway** | **Most restrictive of the launch markets.** Permit + site plan + 8-sign max + weekend-only. The tool's auto-placement could actually help agents comply by generating the site plan. |

**Confidence:** Medium

#### Peoria

| Question | Answer |
|----------|--------|
| ROW allowed? | **Conditionally yes** — "Residential Roadway Signs" allowed in ROW adjacent to residentially zoned property (§21-836, Table 4.D.4). Must not be in medians, traffic circles, or attached to utility poles. |
| Permitted days/hours? | **3 hours before and 3 hours after** the event. |
| Distance from intersection? | Must be outside visibility triangles. 1 sign per turning movement. |
| Size/height limits? | Max **6 sq ft**, max **3 ft height**. |
| Permit required? | **No.** Listed under "no permit required" authorized signs (§21-833). |
| Per-sign limit? | **1 per turning movement** within 1-mile radius. No stated absolute cap. |
| **Code reference** | Peoria City Code §21-833 (Authorized signs, no permit required), §21-836 (Temporary sign types). [peoria-az.elaws.us](http://peoria-az.elaws.us/code/cc_ch21_sure_sico_sec21-833) |
| **Practical takeaway** | **Most permissive of the launch markets.** No permit needed, ROW placement allowed (with restrictions). The 3-hr window is the main constraint. |

**Confidence:** Medium

#### Scottsdale

| Question | Answer |
|----------|--------|
| ROW allowed? | **Strictly prohibited.** "Only signs erected, maintained, or required by the City or other governmental entity shall be allowed in the public right-of-way or on public property" (§8.102.C). |
| Permitted days/hours? | **7 a.m. – 8 p.m.** daily. |
| Distance from intersection? | Must maintain 6 ft unobstructed pedestrian walkway; 10 ft from pedestrian stairs/ramps. On private residential lots only. |
| Size/height limits? | Off-premise directional: max **6 sq ft**, max **3 ft height**. Must include directional arrow (min 12" × 6") in contrasting colors. |
| Permit required? | **No** for off-premise directional signs meeting all criteria. |
| Per-sign limit? | Max **6 signs** total, within **½-mile radius** from property line. On residential-zoned private lots only. |
| **Code reference** | Scottsdale Zoning Ordinance, Appendix B, Article VIII (Sign Requirements), §8.102, §8.303. [scottsdaleaz.gov/codes-and-ordinances/signs](https://www.scottsdaleaz.gov/codes-and-ordinances/signs) |
| **Practical takeaway** | **Half-mile radius is our recommended default.** Compliance requires placing signs on private residential lots — the tool can't verify this without parcel data, but can warn. |

**Confidence:** High (official city webpage with detailed rules)

#### Maricopa County (unincorporated)

| Question | Answer |
|----------|--------|
| ROW allowed? | **No.** "Arizona State Law prohibits the installation in the county right of way of any signs advertising the sale of an article, service or thing" (ARS Title 9). Only political signs have a statutory ROW exception (ARS 16-1019). |
| Permitted days/hours? | N/A — not allowed in ROW. On private property: max 180 days temporary sign duration. |
| Distance from intersection? | Must not be in sight triangles or roadway clear zones (MCZO). |
| Size/height limits? | Temporary signs on private property: max 18 sq ft, max 12 ft height (rural/residential MCZO). |
| Permit required? | ROW work requires MCDOT permit (Ordinance P-36). Private property: zoning compliance required. |
| **Code reference** | Maricopa County Zoning Ordinance; MCDOT Right-of-Way Use; Ordinance P-36. [maricopa.gov/6695](https://www.maricopa.gov/6695/Use-of-County-Right-of-Way) |
| **Practical takeaway** | **Prohibited in ROW.** Only relevant for properties outside city limits. |

**Confidence:** Medium

### 4.7 How to get ordinance data

**Recommended answer:** **Show a "check local rules" warning for every result**, with city-specific links where we have them. Do not attempt to auto-detect compliance — the liability of getting it wrong exceeds the UX benefit. Instead, surface the relevant city name and reference text in the output so the agent can self-verify.

**Which code constant/file:** New `src/lib/rules/ordinance-warnings.ts` — map of city name → warning text + URL  
**Source:** Research above  
**Confidence:** High

---

## 5. HOA & private property

### 5.1 How often are properties in HOAs?

**Recommended answer:** In Phoenix metro, approximately **40–50%** of single-family homes built after 1990 are in HOAs. Many Scottsdale and Peoria subdivisions are HOA-governed. This is a significant percentage — the tool must acknowledge it.

**Source:** Arizona Association of Community Managers; Census Bureau American Housing Survey AZ data  
**Confidence:** Medium

### 5.2 Access to HOA rules?

**Recommended answer:** No centralized, machine-readable HOA rules database exists. Each HOA has its own CC&Rs filed with the County Recorder. These are public records but not structured for automated retrieval.

**Source:** Maricopa County Recorder document search; industry knowledge  
**Confidence:** High

### 5.3 Flag known HOA?

**Recommended answer:** **Partial solution:** The Maricopa County Assessor parcel database includes subdivision names and can be cross-referenced with a manually maintained list of known HOA subdivisions. ASU's GIS program has published research on mapping HOA boundaries in Maricopa County. For now, show a generic "this property may be in an HOA — confirm sign rules before placing" warning. Future: build an HOA boundary reference layer from recorded plat maps.

**Which code constant/file:** Warning flag in UI; no code constant change needed  
**Source:** Maricopa County Assessor parcel data; ASU GIS research  
**Confidence:** Low (no automated solution available)

### 5.4 Corner lot placements

**Recommended answer:** **The tool should flag when a recommended sign placement is on a residential frontage** (not on the listing agent's own property). The warning text: "This sign would be placed on a residential frontage. Confirm property owner permission before placing." This cannot be automated — agent must self-verify.

**Which code constant/file:** New flag in recommendation text output  
**Source:** Agent practice — written permission required by Glendale code for private-property placements  
**Confidence:** High

---

## 6. Intersection sight triangle (safety)

### 6.1 Is 25 ft the right clearance?

**Recommended answer:** **25 ft is a reasonable minimum for all speeds**, but higher-speed intersections need more. AASHTO standards and local codes use speed-dependent triangles:

| Speed (mph) | Recommended sight-triangle leg from corner (ft) |
|-------------|------------------------------------------------|
| 25 | 25 (current minimum) |
| 30 | 30 |
| 35 | 40 |
| 40 | 50 |
| 45+ | 60 |

**Recommend:** Change to `max(25, speedMph * 1.2)` — scales from 25 ft at 25 mph to 60 ft at 50 mph.

The AASHTO standard technically measures from 14.5 ft back from the edge of traveled way along each road leg, with leg lengths of 110–335+ ft depending on speed. But for our use case (a small ground sign, not a building), the 25–60 ft corner setback is an appropriate simplified safety check.

**Which code constant/file:** `src/lib/rules/safety.ts` — `SIGHT_TRIANGLE_FT` → change to speed-dependent function  
**Source:** AASHTO Green Book intersection sight distance; Richland WA municipal code §12.11; Plano TX code §10  
**Confidence:** High (AASHTO values are definitive; simplified for our sign size)

### 6.2 Speed-dependent clearance?

**Recommended answer:** **Yes.** See 6.1 above.

**Which code constant/file:** `src/lib/rules/safety.ts` — `violatesSightTriangle()` → add `speedMph` parameter  
**Confidence:** High

### 6.3 10 ft from roadway edge?

**Recommended answer:** MUTCD §2A.19 specifies lateral offset of **6–12 ft from edge of traveled way** for permanent signs, with as little as 2 ft permitted in constrained urban areas. For temporary real estate signs (small, ground-mounted), **10 ft is a reasonable safe distance** — it keeps the sign out of the vehicle travel path and clear zone.

Keep 10 ft as the minimum roadway-edge clearance but make it a soft warning rather than a hard rejection (the sign is temporary and small, and in many ROW situations 2–6 ft is the practical reality).

**Which code constant/file:** `src/lib/rules/legal.ts` — `violatesRoadwayEdge()` → keep at 10 ft but downgrade from rejection to warning  
**Source:** MUTCD 11th Ed. §2A.19 (Lateral Offset); TxDOT Sign Crew Field Book Ch. 4  
**Confidence:** High

---

## 7. Fire hydrant clearance (safety)

### 7.1 Required clearance

**Recommended answer:** **15 ft.** This is the standard no-parking zone around a fire hydrant (IFC 507.5 + local adoptions). The IFC 507.5.5 only requires 3 ft of clear space around the hydrant body, but the parking-prohibition standard of 15 ft is the safer, more conservative value and is what most cities enforce.

**Which code constant/file:** `src/lib/rules/safety.ts` — `violatesFireHydrantClearance()` → implement with **15 ft** check  
**Source:** IFC 2018 §507.5.5 (3 ft clear space); municipal codes adopting 15 ft no-parking zones (Oak Ridge TN, Anchorage AK, Colorado C.R.S. 42-4-1204)  
**Confidence:** High

### 7.2 Hydrant location dataset

**Recommended answer:**

| Source | Coverage | Status |
|--------|----------|--------|
| **Phoenix Hydrants (ArcGIS REST)** | City of Phoenix | Found at `services.arcgis.com/G4S1dGvn7PIgYd6Y/ArcGIS/rest/services/Phoenix_HydrantsJune18/FeatureServer` — appears public but unverified access |
| **Glendale GIS** | City of Glendale | No public hydrant layer found |
| **Peoria GIS** | City of Peoria | No public hydrant layer found |
| **Scottsdale GIS** | City of Scottsdale | No public hydrant layer found |
| **Maricopa County** | County-wide | No hydrant layer in public GIS portal; Fire Districts layer exists but doesn't include individual hydrants |

**Recommendation:** Attempt to integrate the Phoenix hydrant layer as a proof-of-concept. For other cities, show a generic warning: "Check for fire hydrants within 15 ft of each sign location before placing."

**Which code constant/file:** `src/lib/rules/safety.ts` — `violatesFireHydrantClearance()` → implement with optional GIS lookup, fallback to warning  
**Source:** GIS portal searches; Phoenix Open Data portal; Maricopa County GIS  
**Confidence:** Low (data availability is partial)

### 7.3 Fallback if no hydrant data

**Recommended answer:** **Yes, a generic warning is acceptable.** The risk of blocking a hydrant with a temporary sign (placed and removed same-day) is lower than the risk of missing sight-triangle or ROW rules. A warning that prompts the agent to look around is proportionate.

**Which code constant/file:** Warning text in placement output  
**Confidence:** High

---

## 8. Sidewalk / right-of-way / utility

### 8.1 Sign placement relative to sidewalk

**Recommended answer:** Signs should be placed **behind the sidewalk** (on the property side, not the street side) where a sidewalk exists. If no sidewalk is present, place at the edge of the ROW but not in the roadway. The minimum is: do not block pedestrian passage. Most cities require ≥4 ft clear pedestrian path (ADA requirement).

**Which code constant/file:** `src/lib/rules/safety.ts` — `violatesSidewalkCorridor()` → implement as warning (hard to enforce without data)  
**Source:** ADA (Americans with Disabilities Act) — 4 ft minimum clear width; Peoria §21-836 (4 ft pedestrian clearance)  
**Confidence:** High (ADA is federal law)

### 8.2 Utility/mailbox/crosswalk clearances

**Recommended answer:**
- **Mailboxes:** Do not place within 3 ft (federal right-of-way obstruction rules, plus agent etiquette — residents complain).
- **Utility boxes/pedestals:** Do not place within 3 ft (worker access).
- **Crosswalks:** Do not place within 20 ft of a marked crosswalk (blocks pedestrian sight lines).

**Source:** USPS regulations; IFC worker access; MUTCD pedestrian crossing visibility  
**Confidence:** Medium

### 8.3 Sidewalk geometry data

**Recommended answer:** No comprehensive sidewalk GIS layer exists for any launch market. Options:
- **Phoenix:** ASU's CurbPHX project attempted sidewalk inventory from aerial imagery (not real-time, not maintained).
- **Other cities:** No public sidewalk shapefiles found.
- **Google Street View / aerial imagery** could be used for manual verification, but automated sidewalk detection from imagery is unreliable.

**Recommendation:** Show warning: "Verify sign does not block sidewalk or pedestrian path." Future: explore the ASU CurbPHX dataset for Phoenix only.

**Source:** Phoenix Open Data portal (no sidewalk layer); ASU CurbPHX project GitHub  
**Confidence:** High (confirmed absence of data)

---

## 9. Medians & roadway placement

### 9.1 Signs on medians/islands?

**Recommended answer:** **No — hard-block all median placements.** All four launch-market cities prohibit signs on medians:
- Phoenix: No sign shall occupy public property (Sign Code)
- Glendale: No sign in public ROW (§7.100)
- Peoria: Must not be in roadway median (§21-836)
- Scottsdale: Only government signs in ROW (§8.102.C)

This is universal across jurisdictions. The tool should hard-reject any candidate location that falls on a road median or traffic island.

**Which code constant/file:** `src/lib/rules/legal.ts` — `violatesRoadMedian()` → implement hard rejection  
**Source:** All four city ordinances; near-universal prohibition  
**Confidence:** High

### 9.2 Hard-block median/travel lane?

**Recommended answer:** **Yes, hard-block both.** No sign should ever be recommended in a travel lane. For medians, see 9.1. The current code stubs both checks — implement them.

For detecting medians: Google Maps roads have `isMedian` or can be inferred from road geometry (divided highways). For a first pass, flag placements where the road name includes "median," "island," or where the route step type indicates a divided highway. For ground truth, this requires road geometry data that may not be available in the Google Routes API response.

**Which code constant/file:** `src/lib/rules/legal.ts` — both functions; implement with best-effort detection + warning fallback  
**Source:** City ordinances; Google Maps road metadata  
**Confidence:** High (rule is clear; detection without GIS data is challenging)

---

## 10. Physical sign specs

### 10.1 Actual sign dimensions

**Recommended answer:** The standard real estate directional sign is **18" × 24" (1.5' × 2' = 3 sq ft)** or **18" × 12" (1.5 sq ft)**. Both fit within all city size limits (4–9 sq ft). The property sign (at the house) is typically larger — 24" × 36" or an A-frame.

**Source:** Showable.co; sign printing companies (UPrinting, OvernightPrints)  
**Confidence:** High

### 10.2 Do specs affect placement?

**Recommended answer:** **Guidance text only.** A 1.5–3 sq ft ground sign at 24–36" height does not create additional clearance requirements beyond what the safety/legal rules already cover. The 45° angle and height guidance in the README are correct as display text for the agent.

**Which code constant/file:** No code change — recommendation text only  
**Source:** Industry standard sign sizes  
**Confidence:** High

---

## 11. Number-of-signs guidance

### 11.1 Recommend or respect manual count?

**Recommended answer:** **Recommend, but let agent override.** The tool should compute a suggested sign count: `3 + turnsOnPrimaryApproach + 2 * additionalApproaches`. Agent can adjust up/down. The recommendation should be displayed with rationale ("5 turns × 1 sign each + 3 approach signs = 8 recommended").

**Which code constant/file:** New logic in sign-allocation step  
**Source:** Derived from industry placement patterns  
**Confidence:** Medium

### 11.2 Min/max sensible sign counts

**Recommended answer:**
- **Minimum:** 5 (property sign + 1 approach sign + 3 turn/directional signs). Below 5, the trail is unfollowable.
- **Maximum:** 15 (hard limit from agent time budget). Above 15, placement time exceeds what an agent can spare.
- **Sweet spot:** 8–12 for a typical suburban property.

**Which code constant/file:** `MIN_SIGNS = 5`, `MAX_SIGNS = 15` in sign-allocation logic  
**Source:** Agent time budget; industry guidance on typical counts  
**Confidence:** High

---

## 12. Liability & disclaimers

### 12.1 Show disclaimer?

**Recommended answer:** **Yes.** Every result must carry: "The agent is solely responsible for verifying that all sign placements comply with local ordinances, HOA rules, and property owner permissions. This tool provides recommendations only and does not guarantee legal compliance."

**Which code constant/file:** Footer in results UI  
**Source:** Standard liability practice for professional tools  
**Confidence:** High

### 12.2 Specific broker/legal wording?

**Recommended answer:** Not provided in the questionnaire. Use the generic text above unless the user provides broker-specific language. NAR and major brokerages (Keller Williams, RE/MAX, Coldwell Banker) do not publish standard disclaimer text for sign placement tools.

**Source:** NAR legal resources; broker website review  
**Confidence:** Low (broker-specific wording needed)

### 12.3 Log agent acknowledgment?

**Recommended answer:** **Yes — simple checkbox.** "I confirm I have reviewed and will comply with all applicable local rules for sign placement." This is lightweight but creates a record. Do not gate functionality on the checkbox (agents will check without reading), but log it with timestamp.

**Which code constant/file:** UI checkbox; log to database with placement session  
**Source:** Standard consent UX pattern  
**Confidence:** Medium

---

## 13. Data sources

### What we found

| Data need | Availability | Source URL | Notes |
|-----------|-------------|------------|-------|
| Phoenix hydrants | Partial | `services.arcgis.com/G4S1dGvn7PIgYd6Y/ArcGIS/rest/services/Phoenix_HydrantsJune18/FeatureServer` | Public? Unverified. Try querying. |
| Phoenix open data | Yes | [phoenixopendata.com](https://www.phoenixopendata.com) | Streets, intersections, traffic volumes — useful for scoring. No sidewalks. |
| Maricopa County GIS | Partial | [maricopacountyaz.org/GIS.html](https://www.maricopacountyaz.org/GIS.html) | Fire districts, flood control, parcels. No hydrants. |
| Glendale GIS | Minimal | [glendaleaz.gov](https://www.glendaleaz.gov/Business/Planning-Zoning/Mapping-Records-Division) | Mapping division exists; no public open data portal found. |
| Peoria GIS | Not found | — | No public GIS portal identified. |
| Scottsdale GIS | Via Maricopa County | [eservices.scottsdaleaz.gov](https://eservices.scottsdaleaz.gov) | Some planning data; no open data portal. |
| Maricopa County Assessor parcels | Yes | [mcassessor.maricopa.gov](https://mcassessor.maricopa.gov) | Property boundaries, subdivision names — useful for HOA flagging. |
| ASU CurbPHX (sidewalks) | Research | [github.com/ASUCICREPO/CurbPHX](https://github.com/ASUCICREPO/CurbPHX) | Research project, not a maintained dataset. |
| City ordinances | See §4 | Links in §4 city-by-city table | |

---

## 14. Anything we missed

The questionnaire covered the major domains thoroughly. Two additional areas emerged from research:

### 14.1 Sign removal time
Some cities mandate removal within 1 hour of the open house ending (Scottsdale: by 8 pm; Peoria: within 3 hours after event; Glendale: by 8 am Monday). The tool should include a reminder in the output: "Remove all signs by [time based on city]."

### 14.2 Sign material/durability
Not a placement rule, but industry guidance emphasizes that signs must be weighted against wind (common in AZ). This doesn't affect the algorithm but could be included in the "before you go" checklist text.

### 14.3 GPS routing vs. agent intuition
The approach-road discovery algorithm uses Google Maps routing, which may not match how locals actually drive. Consider adding a feedback mechanism: "Is this the route you'd use?" to improve the model over time.

---

## Implementation map

| Questionnaire § | Rule | File | Constant/Function | Old Value | New Value |
|-----------------|------|------|-------------------|-----------|-----------|
| 0.4, 3.1 | Start radius | `src/lib/rules/placement.ts` | `APPROACH_ROAD_DISTANCE_FT` | `7920` (1.5 mi) | `2640` (0.5 mi) |
| 0.5 | Min signs per approach | Sign allocation (new) | `MIN_SIGNS_PER_APPROACH` | — | `3` |
| 0.7 | Radius scales with sign count | Sign allocation (new) | `maxRadius(signCount)` | — | `min(5280, 2640 + signCount*200)` |
| 1.2 | Speed-dependent ideal spacing | `src/lib/rules/placement.ts` | `SOFT_SIGN_SPACING_FT` | `500` (constant) | `clamp(speedMph*15, 250, 800)` |
| 1.1 | Min spacing | `src/lib/rules/placement.ts` | `MIN_SIGN_SPACING_FT` | `50` | `50` (no change) |
| 2.1 | Pre-turn lead distance | `src/lib/rules/placement.ts` | `recommendedOffsetFeet()` | `max(speed*6, 100)` | `max(speed*10, 150)` for ≥35mph; keep `max(speed*6, 100)` for <35mph |
| 2.3 | After-turn confirmation | `src/lib/rules/placement.ts` | `AFTER_TURN_CONFIRMATION_FT` | `50` | `50` (no change) |
| 3.2 | Max approaches | `src/lib/pipeline/approach-roads.ts` | `MAX_APPROACH_ROADS` | `3` | `3` (no change) |
| 3.3 | Angular separation | `src/lib/pipeline/approach-roads.ts` | `MIN_APPROACH_SEPARATION_DEG` | `60` | `60` (soft preference, relax to 30° if traffic gap large) |
| 4.7 | Ordinance warnings | `src/lib/rules/ordinance-warnings.ts` (new) | City lookup table | — | Warning text per city (§4 table) |
| 6.1 | Sight triangle | `src/lib/rules/safety.ts` | `SIGHT_TRIANGLE_FT` | `25` (constant) | `max(25, speedMph * 1.2)` |
| 6.3 | Roadway edge | `src/lib/rules/legal.ts` | `violatesRoadwayEdge()` | `10` ft hard reject | `10` ft downgrade to warning |
| 7.1 | Fire hydrant | `src/lib/rules/safety.ts` | `violatesFireHydrantClearance()` | `return false` (stub) | `15` ft check (GIS if available, else warning) |
| 8.1 | Sidewalk corridor | `src/lib/rules/safety.ts` | `violatesSidewalkCorridor()` | `return false` (stub) | Warning (no GIS data to enforce) |
| 9.1 | Road median | `src/lib/rules/legal.ts` | `violatesRoadMedian()` | `return false` (stub) | Hard reject (best-effort detection) |
| 11.1 | Auto-recommend sign count | Sign allocation (new) | `recommendSignCount()` | — | `3 + turnsOnPrimary + 2*extraApproaches` |
| 11.2 | Min/max sign count | Sign allocation (new) | `MIN_SIGNS`, `MAX_SIGNS` | — | `5`, `15` |
| 12.1 | Liability disclaimer | Results UI (new) | Disclaimer footer | — | Standard text (see §12.1) |

---

## Sources appendix

All URLs accessed 2026-06-01 unless otherwise noted.

### Industry practice (sign placement)
1. Showable.co — "How Many Open House Signs Do I Need?" — https://showable.co/blog/how-many-open-house-signs
2. Showable.co — "Open House Signage: The Ultimate Guide For Realtors" — https://showable.co/blog/open-house-signage
3. Packeze.com — "Placement Strategies for Open House Signage That Drive Traffic" — https://packeze.com/placement-strategies-for-open-house-signage/
4. UPrinting — "A Guide to Effective Open House Directional Signs" — https://www.uprinting.com/guide-to-effective-open-house-directional-signs.html
5. The Complete Package — "Open House Signs, Here's What Really Works!" — https://www.tcpackage.com/blog/open-house-signs-heres-what-really-works
6. PrintPlace — "Open House Checklist (Print Materials & Signage Guide)" — https://www.printplace.com/blog/open-house-checklist-print-materials-signage-guide/
7. Curb Hero — "11 Open House Tips To Elevate Your Prospecting" — https://curbhe.ro/11-open-house-tips-to-elevate-your-prospecting/
8. Apartment Therapy — "What a Real Estate Agent Does 30 Minutes Before an Open House" — https://www.apartmenttherapy.com/real-estate-agent-before-open-house-2-37081738
9. Gear Up Real Estate — "The Ultimate Open House Checklist" — https://gearuprealestate.com/blogs/news/the-ultimate-open-house-checklist
10. NAR — "Consumer Guide: Marketing Your Home" — https://www.nar.realtor/the-facts/consumer-guide-marketing-your-home

### Municipal ordinances
11. Phoenix Zoning Ordinance §1308 (Signage Standards) — https://phoenix.municipal.codes/ZO@2022-10-31/compare/1308
12. Phoenix Zoning Ordinance §705 (Temporary Uses) — https://phoenix.municipal.codes/ZO/705
13. Glendale Code of Ordinances, Article 7 (General Development Standards) — http://glendale-az.elaws.us/code/coor_art7
14. Glendale §7.100 Signs (PDF) — http://arizonasign.org/pdf/Ordinances/GlendaleSection.7.100.Signs.pdf
15. Peoria City Code §21-833 (Authorized signs, no permit) — http://peoria-az.elaws.us/code/cc_ch21_sure_sico_sec21-833
16. Peoria City Code §21-836 (Temporary sign types) — http://peoria-az.elaws.us/code/cc_ch21_sure_sico_sec21-836
17. Scottsdale Sign Regulations — https://www.scottsdaleaz.gov/codes-and-ordinances/signs
18. Scottsdale Real Estate and Development Signs — https://www.scottsdaleaz.gov/codes-and-ordinances/signs/real-estate-and-development-signs
19. Scottsdale Zoning Ordinance, Article VIII — http://scottsdale-az.elaws.us/code/coor_apxb_artviii
20. Maricopa County Use of Right-of-Way — https://www.maricopa.gov/6695/Use-of-County-Right-of-Way
21. Maricopa County Ordinance P-36 — https://www.maricopa.gov/6494/ORDINANCE-P-36
22. Chandler AZ Political and Temporary Signs in ROW — https://www.chandleraz.gov/government/elections-and-voting/political-and-temporary-signs-in-public-right-of-way
23. ARS §16-1019 Political signs — https://law.justia.com/codes/arizona/2018/title-16/section-16-1019/
24. Arizona Association of Realtors — "City Codes Regulate Placement of Signs" — https://www.aaronline.com/2014/06/23/city-codes-regulate-placement-of-signs/

### Engineering / safety standards
25. AASHTO Green Book (via Wyoming DOT Traffic Studies Manual) — Stopping Sight Distance tables — https://www.dot.state.wy.us/files/live/sites/wydot/files/shared/Traffic%20data/Traffic%20Studies%20Manual.pdf
26. AASHTO Intersection Sight Distance (via mypdh.engineer) — https://mypdh.engineer/lessons/intersection-sight-distance/
27. MUTCD 11th Edition §2A.19 Lateral Offset (via TxDOT Sign Crew Field Book) — https://www.txdot.gov/manuals/trf/sfb/lateral_placement_and_height.html
28. MUTCD §2C.04 Warning Sign Placement (via MoDOT EPG 903.3) — https://epg.modot.org/index.php?title=903.3_Ground-Mounted_Sign_Supports
29. Richland WA Municipal Code §12.11 (Vision Clearance Triangle) — https://www.codepublishing.com/WA/Richland/html/Richland12/Richland1211.html
30. Plano TX Right-of-Way Visibility Requirements — https://www.planocompplan.org/DocumentCenter/View/4530/Section-10_Public-Right-of-Way-Visibility-Requirements

### Fire code
31. IFC 2018 §507.5 (Fire hydrant clearance) — via Anchorage Muni handout — https://www.muni.org/Departments/OCPD/development-services/codes-handouts/Handouts/handoutf03.pdf
32. IFC 2018 §507.5.4–5.6 — via ICC codes site — https://codes.iccsafe.org/s/IFC2015NY/part-iii-building-and-equipment-design-features/IFC2015-Pt03-Ch05-Sec507.5.1

### GIS / open data
33. Phoenix Open Data Portal — https://www.phoenixopendata.com
34. Phoenix ArcGIS REST Services — https://maps.phoenix.gov/pub/rest/services/
35. Phoenix Hydrants FeatureServer — https://services.arcgis.com/G4S1dGvn7PIgYd6Y/ArcGIS/rest/services/Phoenix_HydrantsJune18/FeatureServer
36. Maricopa County GIS — https://www.maricopacountyaz.org/GIS.html
37. ASU CurbPHX Project — https://github.com/ASUCICREPO/CurbPHX
38. Maricopa County Assessor — https://mcassessor.maricopa.gov
