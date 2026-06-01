# Directions API Step Granularity

## Decision Needed
Does the Google Directions API (or the newer Routes API) return enough turn-by-turn detail on short suburban/residential routes (0.5-2 miles) to provide a meaningful candidate pool of sign placement decision points?

## Findings

### 1. What a "Step" Is in the Directions API

The Directions API breaks routes into `routes -> legs -> steps`. A step is defined as "the most atomic unit of a direction's route, containing a single step describing a specific, single instruction on the journey" (e.g., "Turn left at W. 4th St."). Steps are generated based on **navigation necessity** -- there is no documented minimum distance threshold below which steps are suppressed.

Each step contains:
- `distance` / `duration` -- length and time of this step segment
- `start_location` / `end_location` -- the two endpoints of the step
- `html_instructions` -- human-readable turn instructions
- `maneuver` -- machine-readable action type (see below)
- `polyline.points` -- an encoded polyline string for the path of this step

### 2. Maneuver Types Available

The legacy Directions API returns these `maneuver` values (lowercase-hyphenated):

| Maneuver | Meaning |
|---|---|
| `turn-left` / `turn-right` | Standard 90-degree turn |
| `turn-slight-left` / `turn-slight-right` | Gentle turn (less than ~45 degrees) |
| `turn-sharp-left` / `turn-sharp-right` | Sharp turn (more than ~135 degrees) |
| `straight` | Continue straight through an intersection |
| `merge` | Merge into traffic |
| `ramp-left` / `ramp-right` | Take a ramp (highway on/off) |
| `fork-left` / `fork-right` | Road diverges into two forks |
| `roundabout-left` / `roundabout-right` | Navigate a roundabout |
| `uturn-left` / `uturn-right` | U-turn |
| `ferry` / `ferry-train` | Ferry crossing |
| `name-change` | Street name changes without turning |
| `keep-left` / `keep-right` | Unofficial but observed; road lane guidance |

The newer Routes API (ComputeRoutes) provides a more granular enum using UPPER_SNAKE_CASE, including `TURN_SLIGHT_LEFT`, `TURN_SHARP_LEFT`, `ON_RAMP_KEEP_LEFT`, `OFF_RAMP_KEEP_RIGHT`, `ROUNDABOUT_LEFT`, `ROUNDABOUT_RIGHT`, `NAME_CHANGE`, `DEPART`, and `DESTINATION`.

Source: https://developers.google.com/maps/documentation/routes_preferred/reference/rest/Shared.Types/Maneuver

### 3. Step Granularity on Short Residential Routes

**Key finding: The API returns a step for every navigation-relevant event, but residential road segments without turns (straight stretches) are collapsed into single steps, even if they pass many minor intersections.**

On a 0.5-2 mile residential route:
- **Turns at major intersections**: Always returned as discrete steps with maneuver types. A "T-junction" or "4-way stop" turn is consistently a step.
- **Minor residential cross-streets (through traffic)**: If you are going straight through a minor intersection, you generally do NOT get a step. The API treats this as part of a longer straight step.
- **Street name changes**: A `name-change` maneuver is returned when the street name changes, even if you don't turn. This creates an additional step that can serve as a decision point.
- **Typical step count**: On a 1-mile suburban route with 3-5 turns, expect roughly 5-10 steps total (including start, turns, name-changes, and arrival). This may be a thin pool for sign placement candidates on very short routes.

Documentation: https://developers.google.com/maps/documentation/directions/overview
Source for step granularity behavior: https://stackoverflow.com/questions/7597323/google-directions-api-not-providing-exact-steps

### 4. Known Limitation: The "Not Enough Steps" Complaints

Stack Overflow threads (notably "Google Directions API not providing exact steps" and "API Google Maps doesn't return enough step") document a common complaint: users who look only at step `start_location`/`end_location` think the API is too coarse. The root cause is usually that people are not decoding the per-step `polyline.points` field, which contains hundreds of intermediate coordinates.

The correct approach: **Use decoded step-level polylines, not step endpoints, for turn detection.** Decode each step's `polyline.points` using the Google Polyline Algorithm (npm: `polyline`, `@mapbox/polyline`), then compute heading changes between consecutive decoded points to detect turns yourself.

Source evidence: https://stackoverflow.com/questions/37189634/api-google-maps-doesn-t-return-enough-of-step
> "There are hundreds and hundreds of locations points within the results, you just have to decode the locations of each driving step and plot them."

### 5. The Polyline Fallback (Extracting Turns from Geometry)

This is the most important finding for this project. The Directions API provides THREE levels of spatial detail:

| Level | Source | Resolution | Use Case |
|---|---|---|---|
| Step endpoints | `step.start_location`, `step.end_location` | One point per instruction | Navigation display |
| Step polyline | `step.polyline.points` | ~1e5 precision, road-following path | **Turn detection from geometry** |
| Overview polyline | `route.overview_polyline.points` | Simplified/smoothed | Static map rendering |

**Strategy for sign placement**: Decode each step's `polyline.points` to get a dense coordinate array that follows the actual road geometry. Then:
1. Compute heading (bearing) changes between consecutive decoded points.
2. Detect turns when heading change exceeds a threshold (e.g., > 30 degrees).
3. This reveals minor road inflections not captured as separate steps.
4. Use these geometry-detected turns as additional candidate sign locations.

This effectively allows you to extract turns at residential intersections even when the API did not emit a step for them.

### 6. Parameters That Affect Step Count

- `alternatives=true` -- Returns multiple routes, potentially with different step configurations. Each alternative route may pass different intersections. This is the most effective way to expand the candidate pool.
- `avoid=tolls|highways|ferries` -- Can force routes through more local streets, potentially increasing step count on residential roads.
- `travel_mode=driving` -- The default and best for this use case (walking would create too many steps; transit too few).
- `departure_time=now` -- With traffic-aware routing, the route may shift to avoid congestion, potentially changing which streets are used.
- There is **no** equivalent of Mapbox's `overview=full` parameter. Google does not expose a "more detailed steps" toggle.

### 7. Roundabout and Fork Handling

- **Roundabouts**: The legacy API returns `roundabout-left` or `roundabout-right` as a single step covering the entire roundabout. The newer Routes API has more granular `ROUNDABOUT_CLOCKWISE`, `ROUNDABOUT_EXIT_CLOCKWISE`, etc. In either case, for sign placement purposes, the approach to and exit from a roundabout are primary decision points.
- **Forks**: `fork-left` / `fork-right` are returned as single steps, which represent a meaningful sign placement opportunity (driver must choose between diverging roads).
- **Merges**: `merge` is a step type where a road joins another. This is another placement candidate.

### 8. Intermediate Point Detail from Polylines

The encoded polyline algorithm uses 1e5 precision, meaning coordinates are accurate to roughly 1 meter. Step-level polylines typically contain enough intermediate points to trace road curves and detect non-right-angle geometries. On a residential street, the polyline will include points at approximately 10-50 meter intervals depending on road curvature.

For turn detection from geometry alone, a threshold of 30-45 degrees of heading change over a sliding window of 3-5 consecutive points is a reasonable starting point.

## Source Assessment

- **Confidence: High** for step structure details and maneuver enum values (directly from Google documentation).
- **Confidence: Medium-High** for step granularity behavior on residential routes (from Stack Overflow developer reports and API documentation reading; no independent published benchmark was found).
- **Confidence: Medium** for the polyline-based turn detection fallback approach (well-documented technique but no official Google documentation confirms polyline density characteristics).
- **Contradiction**: Some sources claim steps correspond to "every turn," while others note that very minor residential turns may be missing from the step array but present in the polyline geometry. Both are consistent: steps cover navigation-relevant events; polyline covers road geometry.

## Recommendation

1. **Do not rely solely on step count** from short residential routes. On a 0.5-mile route, you may get only 3-5 steps (start, 1-2 turns, arrival), which is too thin for meaningful sign candidate generation.

2. **Use decoded step-level polylines** (`step.polyline.points`) to extract geometric turns by computing heading changes. This reveals minor residential intersections that the API did not promote to full steps.

3. **Use `alternatives=true`** to get multiple route options, expanding the set of road segments and intersections in the candidate pool.

4. **Use `name-change` maneuvers** as additional decision points, because the driver must recognize the street name change even without a physical turn.

5. **Consider the Routes API (ComputeRoutes)** over the legacy Directions API for its richer maneuver enum (e.g., `ON_RAMP_KEEP_LEFT`, `OFF_RAMP_KEEP_RIGHT`) which provides clearer contextual placement opportunities.

6. **If the candidate pool is still too thin**, the Roads API `snapToRoads` can accept polyline points to get road-aligned geometry with place IDs, enabling a second pass of turn detection against actual road segments.

## Gaps / Risks

- **No published benchmark**: There is no publicly available test measuring step count vs. route length on residential routes. The recommendation to use polyline-based turn detection is based on community techniques, not official documentation.
- **Polyline density is variable**: Google does not document the minimum or typical distance between polyline vertices. On very straight roads, the polyline may have very few points, and detecting turns from geometry may fail.
- **No "minimum step distance" documentation**: Google does not document the algorithm for when two turns on the same street get merged into one step vs. split. Empirical testing is needed.
- **Residential area specifics**: The API may treat a winding suburban street differently from a grid-pattern urban street. Testing across multiple property types is recommended.
- **Routes API vs. Directions API parity**: The Routes API has a richer maneuver enum but is not 100% feature-equivalent to the legacy Directions API. Migration may require handling both.
