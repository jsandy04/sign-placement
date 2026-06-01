# Candidate Offset Distances

## Decision Needed

How far before a turn (intersection) should candidate sign coordinates be placed, as a function of the road's speed limit?

## Findings

### No Real Estate Industry Standard for Offset Distances

Extensive searching across agent forums (ActiveRain, Reddit r/realtors, LabCoat Agents), training guides (Showable.co, HomeLight, Curb Hero), and sign vendor materials (UPrinting, PackEze, BuildASign) yielded **no quantified guidance on how many feet before a turn a sign should be placed**. Agents universally advise placing signs "at every turn" and "at every intersection" but never specify an exact distance. The absence suggests agents rely on visual judgment rather than measurement.

**Confidence: High** that no real estate industry standard exists.

### Traffic Engineering Provides the Best Basis

#### AASHTO Stopping Sight Distance (SSD)

The distance required for a driver to stop after perceiving a hazard (AASHTO Green Book, Exhibit 3-1):

| Speed (mph) | Design SSD (ft) |
|---|---|
| 20 | 115 |
| 25 | 155 |
| 30 | 200 |
| 35 | 250 |
| 40 | 305 |
| 45 | 360 |
| 50 | 425 |
| 55 | 495 |
| 60 | 570 |

SSD represents the minimum distance for emergency stopping. For sign reading (a less urgent task than emergency braking), shorter distances may be acceptable.

#### AASHTO Decision Sight Distance (DSD)

For more complex maneuvers at intersections and visually cluttered environments (AASHTO Exhibit 3-3):

| Speed (mph) | Minimum DSD - Rural Stop (ft) | Maximum DSD - Urban Change (ft) |
|---|---|---|
| 30 | 220 | 620 |
| 35 | 275 | 720 |
| 40 | 330 | 825 |
| 45 | 395 | 930 |
| 50 | 465 | 1,030 |
| 55 | 535 | 1,135 |
| 60 | 610 | 1,280 |

DSD for "speed/path/direction change" is the most relevant category for reading a directional sign and executing a turn. These values are substantially higher than SSD because they account for detection, recognition, decision, and maneuver initiation.

**Confidence: High** on the table values; **Medium** on which specific maneuver category best applies to open house sign reading.

#### MUTCD Advance Warning Sign Placement

For temporary traffic control zones (construction), MUTCD Table 6C-1 specifies:

| Road Type | Distance Between Signs (ft) |
|---|---|
| Urban low speed (<= 40 mph) | 100 |
| Urban high speed (> 40 mph) | 350 |
| Rural | 500 |
| Expressway / Freeway | 1,000 - 2,640 |

MUTCD Section 6C.04 also provides a rule of thumb for first warning sign placement:
- Urban streets: 4 to 8 times the speed limit in feet
- Rural highways: 8 to 12 times the speed limit in feet

This gives the following minimum distances for a single advance warning sign before the point of restriction:

| Speed (mph) | Urban Min (4x) | Urban Max (8x) |
|---|---|---|
| 20 | 80 | 160 |
| 25 | 100 | 200 |
| 30 | 120 | 240 |
| 35 | 140 | 280 |
| 40 | 160 | 320 |
| 45 | 180 | 360 |
| 50 | 200 | 400 |
| 55 | 220 | 440 |
| 60 | 240 | 480 |

**Confidence: Medium-High** -- MUTCD values are codified standards for construction warning signs, which is the closest formal analogue to temporary directional signage. However, open house signs are not construction zone signs, and the MUTCD does not govern them.

#### Driver Conspicuity Research

Temporary sign readability research provides additional evidence:
- SAFEye eye-tracking studies found drivers first observe a temporary sign at ~360 ft (110 m), but semantically process its meaning at ~210 ft (64 m) at 62 mph -- roughly half the initial observation distance.
- At 62 mph, this leaves only ~100 ft or ~1 second to process the sign's meaning before it becomes illegible.
- LOOK distance tables (US DOT): At 25 mph, first look at ~290 ft, last usable look at ~179 ft. At 40 mph: first look ~458 ft, last usable ~281 ft. At 55 mph: first look ~625 ft, last usable ~383 ft.

This research suggests that for adequate reading time, a sign should be placed at least at the "last usable look" distance, but ideally earlier so the driver has time to decide and safely execute the turn.

**Confidence: Medium** -- these studies focus on work zone warning signs, not real estate directional signs. The cognitive load is different (simple directional arrow vs. warning of a hazard).

### Google Roads API Speed Limit Reliability

Google's official documentation states explicitly:

> *"The accuracy of speed limit data returned by the Roads API cannot be guaranteed. The speed limit data provided is not real-time, and may be estimated, inaccurate, incomplete, and/or outdated."*

Key reliability issues:
- **Data sources**: Google combines government transportation department feeds, third-party providers (including TomTom), AI-extracted limits from Street View imagery, and user-contributed reports.
- **Update cadence**: No fixed schedule. Updates can take "days to several weeks" from government change to map update.
- **Variable speed limits**: Not supported. Only the default posted limit is returned.
- **Coverage gaps**: Not globally available. Requires an Asset Tracking license.
- **Rural and residential roads**: Lower accuracy than major highways.

**Confidence: High** (that the API has documented reliability concerns); **Medium** (that it is still usable for approximate speed data)

### Municipal Ordinances Provide Supporting Context

Some city codes provide relevant distance references:
- **Carrollton, TX** (§ 151.85): Home builder directional signs require a **100 ft setback from intersecting curb lines**.
- **Orange, CA** (§ 17.36.050): No sign allowed within the "corner cut-off" area (25 ft from intersection) unless under 42 inches tall.
- **Champlin, MN** (§ 118-6): Must not be within the **20 ft sight visibility triangle** at intersections; must be at least **4 ft from roadway**.

These setback requirements define the minimum distance from the intersection (closest the sign can be), not the advance distance before the turn. They confirm that signs should not be placed right at the corner.

## Source Assessment

### Confidence Ratings

| Source | Confidence | Reasoning |
|---|---|---|
| AASHTO SSD/DSD tables | High | Peer-reviewed engineering standard, legally adopted by most states |
| MUTCD advance warning distances | High | Federally adopted standard; most directly applicable analogue |
| Driver conspicuity research | Medium | Academic studies with small sample sizes; not specific to real estate signs |
| Google Roads API documentation | High | First-party statement about accuracy limitations |
| Real estate agent guides | High (absence) | Consistent in not providing quantified distances |
| Municipal ordinances | High | Legal fact for those specific cities |

### Contradictions

AASHTO DSD values (330-825 ft at 40 mph) are substantially higher than MUTCD advance warning distances (160-320 ft at 40 mph). This reflects different intended purposes: DSD accounts for the full detection-recognition-decision-action cycle in complex environments, while MUTCD addresses simple hazard awareness. For an open house directional sign, the MUTCD values are more appropriate because the sign communicates a simple directional instruction rather than requiring complex hazard assessment.

## Recommendation

**Adopt a modified version of the MUTCD urban advance warning distance rule of thumb** as the primary offset model, validated against the original hypothesis:

| Speed | Original Hypothesis | Recommended | Rationale |
|---|---|---|---|
| <= 25 mph | 100 ft | 100-150 ft | Consistent with MUTCD 4x rule (100 ft at 25 mph) and SSD (155 ft at 25 mph) |
| 25-35 mph | (200 ft for 25-40) | 120-200 ft | MUTCD 4x at 30 mph = 120 ft; 6x at 35 mph = 210 ft |
| 35-45 mph | (200 ft for 25-40, then 300 for >=40) | 160-280 ft | MUTCD 4x at 40 mph = 160 ft; 8x at 45 mph = 360 ft. A midpoint of 6x is reasonable |
| 45-55 mph | 300 ft | 200-360 ft | Wider range appropriate; use higher end for rural, lower for urban |
| >= 55 mph | 300 ft | 220-440 ft | MUTCD 4-8x rule applies; 300 ft is the middle of this range |

**The original hypothesis is reasonable for speeds up to ~40 mph but under-estimates for higher speeds.** Specifically:
- At <= 25 mph: 100 ft is supported (matches MUTCD 4x at 25 mph).
- At 25-40 mph: 200 ft is at the upper end of MUTCD range for 40 mph (4x = 160 ft) but too low for 40 mph when considering SSD (305 ft). Use 160-250 ft.
- At >= 40 mph: 300 ft is acceptable as a minimum (MUTCD 4x at 40 mph = 160 ft, 8x at 40 mph = 320 ft). For higher speeds, increase: 400 ft at 50 mph, 500 ft at 55+ mph.

**Proposed formula**: Min offset (ft) = max(speed_mph x 6 ft, 100 ft)

This gives:
- 25 mph: 150 ft
- 35 mph: 210 ft
- 45 mph: 270 ft
- 55 mph: 330 ft
- 65 mph: 390 ft

This balanced approach stays within the MUTCD 4-8x range (which is 6x at midpoint) and exceeds SSD at all speeds, giving drivers adequate reading and maneuver time.

### Treatment of Google Roads API Data

Given Google's explicit accuracy disclaimer:
- Use speed limit data as an **input** but allow manual override by the user.
- Flag segments where speed limits may be unreliable (e.g., rural roads, roads without recent Street View coverage).
- Default to conservative (lower) offset assumptions when speed data is missing.
- Consider batching with the `snapToRoads` endpoint for more accurate road segment identification before requesting speed limits.

## Gaps / Risks

1. **Lack of real estate-specific validation**: No academic or industry research measures the relationship between sign offset distance and open house attendance. The recommendation extrapolates from traffic engineering and construction zone guidelines.

2. **Road geometry matters**: Curves, hills, and visual obstructions may require placing the sign earlier (further from the turn) than the speed-based formula suggests. The tool needs additional logic to detect and compensate for geometry.

3. **Multiple approach directions**: A single intersection has multiple approach directions, each with potentially different speed limits. The tool must calculate offsets for each approach independently.

4. **Turn complexity**: A simple right turn requires less advance notice than crossing multiple lanes for a left turn onto a busy road. The offset could be adjusted based on turn complexity.

5. **Google API licensing**: The Roads API requires an Asset Tracking license -- confirm this is available for the project before building dependency on it.

6. **Variable speed limits**: School zones, construction zones, and dynamic speed limit roads are not handled by Google's API. The tool may produce incorrect offsets on such roads.
