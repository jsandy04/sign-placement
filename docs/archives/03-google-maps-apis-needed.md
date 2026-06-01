# Which Google Maps APIs Are Needed

## Decision Needed
Which Google Maps Platform APIs to enable and pay for, the expected cost per analysis, and what each API actually contributes to the sign placement workflow.

## Findings

### 1. API-by-API Analysis

#### Geocoding API -- Required

**What it returns**: Converts a textual address (e.g., "123 Main St, Anytown, USA") into coordinates (`lat`, `lng`) plus address components (street number, route, locality, administrative area, postal code, country), formatted address, and address `types` (e.g., `street_address`, `premise`, `route`).

**Role in sign placement**: The entry point. Takes the property address and returns latitude/longitude to use as the origin for route computation.

**Confidence**: This is the correct API for this purpose. The alternative (Places API Text Search) also returns coordinates but is more expensive and slower. Geocoding API is optimized for structured address input.

Documentation: https://developers.google.com/maps/documentation/geocoding/overview

---

#### Directions API / Routes API -- Required

**What it returns**: A route from origin to destination broken into `routes -> legs -> steps`. Each step includes `distance`, `duration`, `start_location`, `end_location`, `maneuver` (turn type), `html_instructions`, and `polyline.points` (encoded road geometry).

**What it does NOT return**: Road classification (arterial vs. residential), speed limits, or any road metadata. The Directions API tells you "turn here" but not "this road is a 35 MPH arterial."

**Role in sign placement**: Core computation engine. Drive from the property to nearby major roads and analyze the steps/polyline to identify decision points (turns, intersections, merges) where signs would be effective.

**Legacy vs. New**: The legacy Directions API is being deprecated for new projects as of March 2025. New projects should use the Routes API (ComputeRoutes). The Routes API requires field masks (`X-Goog-FieldMask` header) and supports traffic-aware routing, eco-friendly routing, and richer maneuver types.

Documentation: https://developers.google.com/maps/documentation/routes/usage-and-billing
Why migrate: https://developers.google.com/maps/documentation/routes/migrate-routes-why

---

#### Places API (Nearby Search / Text Search) -- Optional, Limited Value

**What Nearby Search returns**: Places (businesses, landmarks, points of interest) within a radius of a coordinate. Response includes `name`, `types` (e.g., `restaurant`, `gas_station`), `formatted_address`, `geometry`, `rating`, `price_level`, etc.

**What it does NOT return**: Road segments or road classification. The Places API works with named places, not roads. The `route` place type exists but is an address component type, not a filterable search type. You cannot use Nearby Search to "find all roads near this point."

**Alternative use**: You could use Text Search (New) with `searchAlongRouteParameters` to find places near a route, but this is for landmarks (possible sign reference points), not road segments.

**Role in sign placement**: Minimal direct value. For identifying nearby approach roads, the Directions API (driving from the property in multiple directions) is more useful than Places search.

Documentation: https://developers.google.com/maps/documentation/places/web-service/search-nearby
Place types: https://developers.google.com/maps/documentation/places/web-service/place-types

---

#### Roads API -- Optional but Potentially Valuable

**What it returns**:
- `snapToRoads`: Snaps up to 100 GPS coordinates to the nearest road, returning snapped `location`, `originalIndex`, and `placeId` (opaque road segment identifier).
- `nearestRoads`: Same as snapToRoads but for non-continuous points.
- `speedLimits`: Returns posted speed limits for road segments (requires `placeId` from snapToRoads). Note: requires an Asset Tracking license tier.

**What it does NOT return**: Road name directly. The `placeId` from snapToRoads can be resolved via Places API Place Details to get the road name, but this requires an additional API call.

**Role in sign placement**:
1. **Speed limits**: Know the speed limit on each approach road to determine sign size and placement distance requirements.
2. **Road snapping**: Improve polyline accuracy if Directions API polylines are insufficiently detailed.
3. **Constraints**: Speed limits require an Asset Tracking license. The speed limit data is not guaranteed and "may be estimated, incomplete, or outdated."

Documentation: https://developers.google.com/maps/documentation/roads/overview
Speed limits: https://developers.google.com/maps/documentation/roads/speed-limits
Nearest roads: https://developers.google.com/maps/documentation/roads/nearest

---

#### Maps JavaScript API -- Required for Interactive Visualization

**What it provides**: Embeddable interactive map with custom markers, polylines, info windows, events (click, hover), layers, and controls. Uses a page-load billing model (one billable event per map load).

**Role in sign placement**: The interface for displaying candidate sign locations on a map, allowing the user to visually inspect placement and adjust. A static map could substitute for basic reporting, but an interactive map supports the iterative selection workflow.

**Alternative**: Static Maps API ($2/1K vs. $7/1K for Dynamic) for report-only output.

Documentation: https://developers.google.com/maps/documentation/javascript

---

### 2. React Integration: @vis.gl/react-google-maps

**Status**: Actively maintained and healthy as of May 2026. Latest stable release is v1.7.1 (November 2025), with v1.8.0 in release candidate stage. The library has ~1.58 million monthly npm downloads, 5 maintainers, and an MIT license.

**Google's stance**: Google does not publish an official React wrapper. However, `@vis.gl/react-google-maps` is explicitly listed and linked from the Google Maps Platform JavaScript documentation. It is the de facto standard React integration for the Google Maps JS API.

**2025 release history**: v1.5.x (Jan-Aug 2025), v1.6.0 (Oct 2025), v1.7.0 (Oct 2025), v1.7.1 (Nov 2025). React 19 compatible.

**Recommendation**: Use this library. It is the best-supported option for React + Google Maps integration.

Source: https://visgl.github.io/react-google-maps/docs/whats-new
NPM: https://www.npmjs.com/package/@vis.gl/react-google-maps

---

### 3. Current Pricing (Post-March 2025)

Google replaced the $200/month credit on March 1, 2025 with per-SKU free monthly allowances:

| API | SKU Tier | Free Calls/Month | Price per 1K after free |
|---|---|---|---|
| Geocoding API | Essentials | 10,000 | $5.00 |
| Routes API (Basic) | Essentials | 10,000 | $5.00 |
| Routes API (Advanced, traffic) | Pro | 5,000 | $10.00 |
| Places API (Nearby Search) | Pro | 5,000 | $32.00 |
| Roads API (snapToRoads) | Pro | 5,000 | $10.00 |
| Roads API (speedLimits) | Pro | 5,000 | $10.00 |
| Maps JavaScript API (Dynamic Maps) | Essentials | 10,000 | $7.00 |
| Static Maps | Essentials | 10,000 | $2.00 |

Sources:
- https://developers.google.com/maps/billing-and-pricing/march-2025
- https://web.archive.org/web/20250610032806/https://mapsplatform.google.com/pricing/

---

### 4. Cost per Analysis Calculation

For a single property analysis (minimum viable workflow):

| API Call | Quantity | Unit Cost | Subtotal |
|---|---|---|---|
| Geocode: property address | 1 | $0.005 | $0.005 |
| Directions: property to major road A | 1 | $0.005 | $0.005 |
| Directions: property to major road B (2-3 approaches) | 2 | $0.005 | $0.010 |
| Directions: alternative routes for each (alternatives=true) | 0 | $0.005 | $0.000 |
| Maps JS: interactive map load (user session) | 1 | $0.007 | $0.007 |
| **Total (minimum viable)** | | | **$0.027** |

If adding Roads API for speed limits:

| API Call | Quantity | Unit Cost | Subtotal |
|---|---|---|---|
| Roads snapToRoads (per approach route) | 3 | $0.010 | $0.030 |
| Roads speedLimits (per approach route) | 3 | $0.010 | $0.030 |
| **Total with Roads API** | | | **$0.087** |

If the earlier estimate of **~$0.11/analysis** was cited, that is reasonable for a more complete workflow including Places API calls (e.g., finding nearby landmarks as reference points) and multiple direction queries. The minimum viable cost is closer to **$0.03/analysis** using just Geocoding + Directions + Maps JS.

Note: These costs are all within the free tiers for volumes under 10K/month per API, so the first ~3,300 analyses per month (since they use 3 APIs) would be effectively free.

---

### 5. Rate Limits and Quotas

| API | Rate Limit | Notes |
|---|---|---|
| Geocoding API | 3,000 QPM (~50 QPS) | Hard limit; returns OVER_QUERY_LIMIT when exceeded |
| Directions API (Legacy) | Per-project configurable | Check Google Cloud Console for your project |
| Routes API | Per-project configurable | Default is typically adequate for single-user applications |
| Roads API | 100 points per request | For snapToRoads; batch requests for longer paths |
| Maps JavaScript API | No API rate limit | Billing is per map load; no server-side rate limit |

For batch processing (e.g., analyzing 100 properties in a batch), the Geocoding API's 3,000 QPM limit is the tightest constraint. At 50 QPS, you could geocode all 100 properties in 2 seconds. The Directions API rate limit is typically not an issue for batch sizes under 1,000.

Sources:
- https://developers.google.com/maps/documentation/geocoding/geocoding-strategies
- https://developers.google.com/maps/documentation/directions/usage-and-billing

---

### 6. Key Architectural Insight: You Do NOT Need the Roads API for Road Classification

A critical discovery: you can determine road types (arterial, local, etc.) WITHOUT the Roads API. The Directions API response includes the road names in `html_instructions` (e.g., "Turn left onto **Smith Street**"). By extracting road names from the instructions and optionally cross-referencing with the Places API (Place Details using decoded polyline points), you can identify:

- **Major roads** (likely arterials): Named roads that appear in multiple routes, have higher step distances, or have multiple lanes implied
- **Local/residential roads**: Roads that appear only in the immediate vicinity of the property
- **Intersection types**: The `maneuver` field distinguishes controlled intersections (turn, straight) from uncontrolled merges

The Roads API adds value primarily for **speed limits** (which require an Asset Tracking license) and for **improving polyline accuracy** if needed.

## Source Assessment

- **Confidence: High** for pricing (based on Google's March 2025 billing documentation available in multiple archived sources).
- **Confidence: High** for API response capabilities (from official documentation for all APIs discussed).
- **Confidence: High** for `@vis.gl/react-google-maps` status (npm stats, GitHub activity, Google documentation linkage).
- **Confidence: Medium** for actual cost per analysis (depends on implementation details -- how many direction queries, whether alternatives are used, whether Roads API is included).

## Recommendation

**Enable these APIs (in order of priority):**

1. **Geocoding API** -- Required. Minimum cost, high value.
2. **Routes API (ComputeRoutes)** -- Required. Core routing engine. Use the new API, not the legacy Directions API.
3. **Maps JavaScript API** -- Required. Interactive map for the frontend. Use `@vis.gl/react-google-maps` for React integration.
4. **Roads API** -- Optional. Add if speed limits are needed. Note the Asset Licensing requirement for speed limits.
5. **Places API** -- Optional, low priority. Only useful for resolving road names from Roads API place IDs, not for road discovery itself.

**What is NOT needed:**
- Distance Matrix API (individual routes are better for this use case)
- Places API Nearby Search (not designed for road discovery)

**For the initial build**, start with Geocoding + Routes API + Maps JavaScript API only. This covers the full workflow: address -> coordinates -> route computation with steps/polylines -> interactive display. The ~$0.03/analysis baseline supports extensive testing and development with minimal cost.

**Add Roads API only** when speed limit data becomes a product requirement, and accept the Asset Tracking license implications.

## Gaps / Risks

- **Asset Tracking license for speed limits**: Google requires an Asset Tracking license for the Roads API speedLimits endpoint. The cost and availability of this license is not documented in standard pricing pages. Contact Google Sales for specifics.
- **Routes API field mask complexity**: The Routes API requires explicit field masks, which adds development overhead but also provides cost control. The learning curve is moderate.
- **Pricing model transition**: Google changed pricing in March 2025 and may continue adjusting. The per-SKU free tier model is new and billing edge cases (e.g., partial month usage) are not well-documented in community resources.
- **Roads API road name resolution**: Getting a road name from a Roads API `placeId` requires an additional Places API Place Details call ($5/1K), meaning the true cost of road naming is higher than the Roads API price alone.
