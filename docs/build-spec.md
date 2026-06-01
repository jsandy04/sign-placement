# Build Spec: Sign Placement Optimizer

**Purpose**: Executable build instructions for a Claude Code session. Every decision is locked — no questions, no ambiguity. Environment variables are the only external dependency.

## Architecture Overview

```
Browser                          Next.js Server (Hetzner VPS)
───────                          ──────────────────────────
┌──────────┐  ┌──────────────┐  ┌─────────────────────────┐
│ Input    │  │ Map View     │  │ POST /api/analyze        │
│ Panel    │  │ (Google Maps)│  │                          │
│          │  │              │  │ Pipeline:                │
│ Address  │  │ • Property   │  │ 1. Geocode address       │
│ Sign cnt │  │ • Sign pins  │  │ 2. Find approach roads   │
│ [Analyze]│  │ • Route line │  │ 3. Compute routes        │
└──────────┘  └──────┬───────┘  │ 4. Generate candidates   │
                     │          │ 5. Filter (hard constr.)  │
              ┌──────┴───────┐ │ 6. LLM re-rank + explain  │
              │ Results      │ │ 7. Select optimal N       │
              │ Panel        │ │ 8. Store + return result  │
              │              │ └───────────────────────────┘
              │ Sign #1 ●    │
              │ Sign #2 ●    │  GET /api/analyze/[id]
              │ ...          │  → Load persisted result
              │ [Share]      │
              └──────────────┘
```

## Tech Stack (Locked)

| Layer | Choice | Version |
|-------|--------|---------|
| Framework | Next.js App Router | 15.x |
| Language | TypeScript (strict) | 5.x |
| Map UI | `@vis.gl/react-google-maps` | 1.x |
| Styling | Tailwind CSS | 4.x |
| Database | SQLite via `better-sqlite3` | latest |
| ORM | Drizzle ORM | latest |
| LLM | Claude Sonnet 4.6 via `@anthropic-ai/sdk` | latest |
| Maps APIs | Geocoding + Routes + Maps JavaScript + Places | — |
| Deployment | Docker Compose on Hetzner VPS | — |

## API Key Model

All API keys are operator-owned and configured server-side. Users bring nothing. This keeps the tool friction-free for small-circle use. BYOK and account management are explicitly out of scope until after the initial version proves useful in the real world.

Rate limiting (see API Routes below) protects against runaway costs.

## Environment Variables (.env.local)

```bash
# Server-side Google Maps key (Geocoding + Routes APIs enabled)
GOOGLE_MAPS_API_KEY=

# Browser-side Google Maps key (Maps JavaScript API + Places API enabled)
# Restrict this key to your production domain in Google Cloud Console
NEXT_PUBLIC_GOOGLE_MAPS_KEY=

# Anthropic API key for Claude Sonnet 4.6
ANTHROPIC_API_KEY=

# SQLite database path (default: ./data/sign-placement.db)
DATABASE_URL=file:./data/sign-placement.db

# Google Maps Map ID (for vector rendering + cloud-based map styling)
# Create at: Google Cloud Console → Maps → Map Styles → Create Map ID (type: JavaScript, Vector)
NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID=

# Rate limit: max analyses per IP per day (default: 10)
RATE_LIMIT_PER_IP_PER_DAY=10
```

## Google Cloud Setup (one-time operator task)

1. Create project at https://console.cloud.google.com
2. Enable billing (required even for free tier)
3. Enable APIs: **Geocoding API**, **Routes API**, **Maps JavaScript API**, **Places API**
   - Places API is required for the `AddressAutocomplete` widget (uses the `places` library loaded via the Maps JS API bootstrap URL)
   - Places Autocomplete sessions are billed per-request (~$0.003 per session); negligible at this usage scale
4. Create two API keys:
   - **Server key** (restricted to your VPS IP, Geocoding + Routes APIs enabled) → `GOOGLE_MAPS_API_KEY`
   - **Browser key** (restricted to your production domain, Maps JavaScript API + Places API enabled) → `NEXT_PUBLIC_GOOGLE_MAPS_KEY`
     - Load the Maps JS API with: `https://maps.googleapis.com/maps/api/js?key=KEY&libraries=places`
5. Set a daily spending cap of $10 in Google Cloud Console

## Anthropic Setup (one-time operator task)

1. Create account at https://console.anthropic.com
2. Generate API key → `ANTHROPIC_API_KEY`
3. Add credits (pay-as-you-go). Expected cost: ~$0.023/analysis at Claude Sonnet 4.6 rates.

---

## Project Structure

```
sign-placement/
├── .env.local                    # API keys (gitignored)
├── .env.local.example            # Template (committed)
├── README.md                     # Points to this build spec
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.ts
├── docker-compose.yml            # Hetzner deployment
├── Dockerfile
├── data/                         # SQLite file location (gitignored)
│   └── .gitkeep
├── src/
│   ├── app/
│   │   ├── layout.tsx            # Root layout, metadata, Tailwind import
│   │   ├── page.tsx              # Main page: orchestrates InputPanel + MapView + ResultsPanel
│   │   ├── loading.tsx           # Suspense fallback
│   │   ├── error.tsx             # Error boundary
│   │   ├── globals.css           # Tailwind directives + map fix (#map img { max-width: none })
│   │   ├── api/
│   │   │   └── analyze/
│   │   │       ├── route.ts      # POST: run pipeline, return result
│   │   │       └── [id]/
│   │   │           └── route.ts  # GET: retrieve persisted analysis
│   │   └── results/
│   │       └── [id]/
│   │           └── page.tsx      # Shareable results view (map + pins, no input form)
│   ├── components/
│   │   ├── map/
│   │   │   ├── MapView.tsx       # Google Map wrapper ('use client')
│   │   │   ├── SignMarker.tsx    # Numbered pin, color-coded by type
│   │   │   ├── PropertyMarker.tsx # House icon at destination
│   │   │   └── RoutePolyline.tsx # Highlighted driving route
│   │   ├── input/
│   │   │   ├── InputPanel.tsx    # Address autocomplete + sign count + analyze button
│   │   │   ├── AddressAutocomplete.tsx  # Google Places Autocomplete widget (requires Places API enabled, Places library loaded in Maps JS API bootstrap)
│   │   │   └── SignCountSelector.tsx    # Number input (1-12)
│   │   ├── results/
│   │   │   ├── ResultsPanel.tsx  # Scrollable placement list
│   │   │   ├── PlacementCard.tsx # Sign number, description, reasoning, score badge, expand toggle
│   │   │   └── PipelineProgress.tsx  # Step-by-step progress during analysis
│   │   └── ui/                   # Shared: Button, Card, Badge, Spinner, ExpandToggle
│   ├── lib/
│   │   ├── pipeline/
│   │   │   ├── orchestrator.ts   # Coordinates all 8 steps, returns SignPlacementResult
│   │   │   ├── geocoder.ts       # Step 1: address → {lat, lng, formatted}
│   │   │   ├── approach-roads.ts # Step 2: find 3 major roads using Routes API reverse directions
│   │   │   ├── routing.ts        # Step 3: compute routes, extract steps + polylines
│   │   │   ├── decision-points.ts # Step 3b: extract turns from step maneuvers + polyline bearing changes
│   │   │   ├── candidates.ts     # Step 4: generate candidate coords at each decision point
│   │   │   ├── hard-constraints.ts # Step 5: filter safety/legal/offset/spacing violations
│   │   │   ├── scorer.ts         # Step 5b: score filtered candidates with 5-factor weighted model
│   │   │   ├── optimizer.ts      # Step 7: greedy spacing-aware selection of top N
│   │   │   └── llm.ts           # Step 6: send scored candidates to Claude, parse structured response
│   │   ├── services/
│   │   │   ├── google-maps.ts    # Unified Google Maps client: geocode(), computeRoutes()
│   │   │   └── llm-client.ts     # Anthropic SDK wrapper: rankCandidates(), parseOutput()
│   │   ├── rules/
│   │   │   ├── safety.ts         # Sight triangle, fire hydrant, sidewalk checks
│   │   │   ├── legal.ts          # Default municipal constraint rules
│   │   │   └── placement.ts      # Offset distances, spacing rules (from research)
│   │   ├── db/
│   │   │   ├── schema.ts         # Drizzle schema + migration
│   │   │   └── queries.ts        # insertAnalysis, getAnalysis, cleanupExpired
│   │   ├── types/
│   │   │   └── index.ts          # All shared interfaces
│   │   └── utils/
│   │       ├── geo.ts            # Haversine, bearing, polyline decode, point-to-line distance
│   │       └── format.ts         # Address formatting, ordinal numbers
│   └── hooks/
│       ├── useAnalysis.ts        # Manages pipeline state, API call, progress
│       └── useMapBounds.ts       # Fit map to markers + route
└── tests/
    └── pipeline/
        ├── scorer.test.ts
        ├── candidates.test.ts
        ├── optimizer.test.ts
        └── hard-constraints.test.ts
```

---

## Pipeline: Exact Implementation

### Step 1: Geocode

**Input**: `address: string`
**API**: Geocoding API
**Output**: `{ lat, lng, formattedAddress, placeId }`

```typescript
// src/lib/pipeline/geocoder.ts
export async function geocode(address: string): Promise<GeocodedAddress>
```

- Call `https://maps.googleapis.com/maps/api/geocode/json?address=...&key=...`
- If status is `ZERO_RESULTS` → throw `GeocodeError` with user message
- If `partial_match` is true AND result type is below `street_address` precision → warn but proceed
- Cache result for 30 days (TTL) keyed on normalized address

### Step 2: Find Approach Roads

**Input**: `{ lat, lng }`
**API**: Routes API (reverse direction — drive FROM the property TO cardinal points to discover roads)
**Output**: Array of 3 approach road entries `{ name, lat, lng, distance }`

```typescript
// src/lib/pipeline/approach-roads.ts
export async function findApproachRoads(origin: LatLng): Promise<ApproachRoad[]>
```

- Drive 1.5 miles in 4 directions (N, S, E, W) using Routes API
- Extract the road names from the first step of each route
- Sort by estimated road class (derived from step distance/duration heuristic)
- Return top 3

### Step 3: Compute Routes + Extract Decision Points

**Input**: `{ propertyCoords, approachRoads[] }`
**API**: Routes API (each approach road → property)
**Output**: `{ steps[], polylinePoints[], decisionPoints[] }`

```typescript
// src/lib/pipeline/routing.ts
export async function computeRoutes(property: LatLng, approaches: ApproachRoad[]): Promise<RouteData[]>

// src/lib/pipeline/decision-points.ts
export function extractDecisionPoints(route: RouteData): DecisionPoint[]
```

- Call Routes API (`computeRoutes`) for each approach road → property
- Set `polylineQuality=HIGH_QUALITY` for dense polyline points
- Extract step maneuvers: every `turn-*`, `roundabout-*`, `fork-*`, `merge`, `name-change`
- If step count < 5: enable polyline fallback mode
  - Decode each step's `polyline.points`
  - Compute bearing between consecutive points
  - Flag points where bearing change > 30° over 50ft segment as additional decision points
  - Apply noise filter: remove turns that return to original heading within 200ft (chicanes)
- Each decision point: `{ lat, lng, maneuverType, roadName, distanceFromPrior, speedEstimate }`

### Step 4: Generate Candidate Locations

**Input**: `DecisionPoint[]`
**Output**: `CandidateLocation[]`

```typescript
// src/lib/pipeline/candidates.ts
export function generateCandidates(points: DecisionPoint[]): CandidateLocation[]
```

For EACH decision point, generate 1-3 candidates:
- **Before turn**: distance = AASHTO-recommended offset. Formula:
  ```
  offset_ft = max(speed_mph × 6, 100)
  ```
  Place candidate this distance back along the approach polyline from the decision point.
  This formula is derived from AASHTO stopping sight distance (SSD) tables: perception-reaction distance (1.47 × speed × 2.5s) + braking distance (speed² / 30 × coefficient). For 25-45 mph residential/arterial roads, the `speed × 6 ft` approximation covers this with a 100ft floor for safety. Source: AASHTO Geometric Design of Highways and Streets (Green Book), 7th ed., Chapter 3.
- **At intersection**: place at decision point coordinates (high-visibility corner)
- **After turn**: 50ft past the turn (confirmation marker)
- Final candidate: property coordinates (type: `property`)

Speed estimation from step data (no Roads API needed):
```
Step distance > 0.5mi AND duration > 60s → 45 mph
Step distance 0.1-0.5mi AND duration 15-60s → 35 mph
Step distance < 0.1mi AND duration < 15s → 25 mph
Step maneuver is RAMP_LEFT/RAMP_RIGHT → 55 mph
Step maneuver is MERGE → 65 mph
```

### Step 5: Hard Constraint Filter

**Input**: `CandidateLocation[]`
**Output**: `FilteredCandidate[]` (typically 5-15 from 15-40 raw)

```typescript
// src/lib/pipeline/hard-constraints.ts
export function applyHardConstraints(candidates: CandidateLocation[]): FilteredCandidate[]
```

Remove candidates that violate:
1. **Safety**: within 25ft sight triangle of intersection, within 15ft of fire hydrant, within standard sidewalk corridor (5ft from curb, usable as default); all inferred from road geometry, not external data — approximate, flag with low confidence only
2. **Legal (default rules)**: on road median, within 10ft of roadway edge, on utility easements (inferred: proximate to overhead power lines is not detectable without imagery — skip); private property access is assumed for sign placement (standard real estate practice)
3. **Offset**: candidate distance-to-turn less than minimum AASHTO offset for estimated speed → reject
4. **Spacing**: within 50ft of another candidate → keep the one with higher score, discard other

### Step 5b: Score Candidates

```typescript
// src/lib/pipeline/scorer.ts
export function scoreCandidates(filtered: FilteredCandidate[]): ScoredCandidate[]
```

Five weighted factors (0-100 each, normalized):

| Factor | Weight | How Computed |
|--------|--------|-------------|
| Decision-point criticality | 30% | Maneuver type (fork=100, turn=85, roundabout=80, merge=60, straight=40, name-change=30) |
| Traffic volume | 25% | Estimated road class (arterial=100, collector=65, residential=35) |
| Visibility quality | 20% | Straight-line segment length before turn (longer=better), polyline curvature |
| Approach speed alignment | 15% | How well the offset distance matches AASHTO recommendation for estimated speed |
| Sign spacing | 10% | Distance to nearest other selected candidate (500ft+=100, 50ft=0, linear between) |

Score = weighted sum. Max 100.

### Step 6: LLM Re-rank + Explain

**Input**: `ScoredCandidate[]` (top 2-3× signCount, per turn)
**API**: Anthropic Claude Sonnet 4.6
**Output**: `LLMRankedResult`

```typescript
// src/lib/pipeline/llm.ts
export async function llmEvaluate(candidates: ScoredCandidate[], context: RouteContext): Promise<LLMRankedResult>
```

**System Prompt** (locked):
```
You are an expert real estate sign placement strategist. Signs form a directional trail from the nearest major road to the property. You will receive pre-scored candidate sign locations for each turn along the route.

Rules:
1. One sign per turn. Select exactly one sign for each turn.
2. Place signs BEFORE the turn, not at the turn.
3. High-traffic intersections are most valuable — prioritize candidates at or near major intersections.
4. Final sign must be at the property address.
5. All candidates have been pre-validated for code compliance, physical feasibility, and spatial constraints. Do NOT re-check these.
6. Space selected signs well apart — do not select two signs within 100 feet of each other unless they serve different turns.
7. If no candidate adequately serves a given turn, flag the gap rather than forcing a suboptimal selection.

Scoring methodology: Each candidate has been scored on decision-point criticality (30%), traffic volume (25%), visibility quality (20%), approach speed alignment (15%), and sign spacing (10%). Understand these weights when evaluating the pre-scored list. Prefer higher-scored candidates but override when you identify qualitative factors the scoring missed.
```

**Temperature**: 0.2
**Max tokens**: 2000
**Structured output**: Use Anthropic tool use with `strict: true`, schema below

**LLM JSON Schema**:
```json
{
  "type": "object",
  "properties": {
    "overall_assessment": { "type": "string" },
    "selected_signs": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "turn_number": { "type": "integer" },
          "candidate_id": { "type": "string" },
          "rationale": { "type": "string" },
          "confidence": { "type": "number" },
          "flagged_alternatives": { "type": "array", "items": { "type": "string" } }
        },
        "required": ["turn_number", "candidate_id", "rationale", "confidence"]
      }
    },
    "gaps_or_warnings": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "turn_number": { "type": "integer" },
          "issue": { "type": "string" },
          "suggestion": { "type": "string" }
        },
        "required": ["turn_number", "issue"]
      }
    },
    "route_coherence_check": {
      "type": "object",
      "properties": {
        "passes": { "type": "boolean" },
        "notes": { "type": "string" }
      },
      "required": ["passes", "notes"]
    }
  },
  "required": ["overall_assessment", "selected_signs", "gaps_or_warnings", "route_coherence_check"]
}
```

**Retry logic**: Max 3 attempts. If schema violation on attempt 1, feed error back as healing retry. If all 3 fail → degrade to deterministic scoring (skip LLM, use raw scorer output).

### Step 7: Select Optimal N

```typescript
// src/lib/pipeline/optimizer.ts
export function selectTopN(candidates: ScoredCandidate[], llmResult: LLMRankedResult, n: number): SignPlacement[]
```

- Take LLM-ranked selections
- Apply spacing-aware greedy algorithm:
  1. Start with LLM's top pick
  2. For each next candidate: if within 50ft (hard minimum) of any already-selected → skip
  3. If 50-500ft from nearest selected: apply linear soft penalty (-0.1 at 50ft, -0.0 at 500ft)
  4. Re-sort by adjusted score, pick next highest
  5. Repeat until N selected
- Final position = property (position N)

### Step 8: Store + Return

```typescript
// src/lib/pipeline/orchestrator.ts
export async function analyze(input: AnalyzeInput): Promise<SignPlacementResult>
```

- Store result in SQLite with short ID (nanoid, 10 chars)
- Return full result to frontend
- Result URL: `/results/[id]`

## Database Schema

```sql
-- src/lib/db/schema.ts
CREATE TABLE analyses (
  id TEXT PRIMARY KEY,              -- nanoid, 10 chars
  address TEXT NOT NULL,
  formatted_address TEXT,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  sign_count INTEGER NOT NULL,
  status TEXT DEFAULT 'complete',   -- 'complete' or 'degraded'
  degradation_level INTEGER DEFAULT 0,
  result_json TEXT NOT NULL,        -- Full SignPlacementResult JSON
  maps_cost REAL DEFAULT 0,
  llm_cost REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT DEFAULT (datetime('now', '+30 days'))
);

CREATE TABLE placements (
  id TEXT PRIMARY KEY,
  analysis_id TEXT NOT NULL REFERENCES analyses(id),
  sort_order INTEGER NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  description TEXT,
  reasoning TEXT,
  score REAL,
  placement_type TEXT,             -- 'intersection' | 'entrance' | 'midroute' | 'roundabout' | 'property'
  flag TEXT,                       -- 'none' | 'safety' | 'legal' | 'visibility'
  is_selected INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS rate_limits (
  ip    TEXT NOT NULL,
  date  TEXT NOT NULL,     -- YYYY-MM-DD
  count INTEGER DEFAULT 1,
  PRIMARY KEY (ip, date)
);
```

## API Routes

### `POST /api/analyze`

**Rate limiting**: Max `RATE_LIMIT_PER_IP_PER_DAY` (default: 10) requests per IP per day. Tracked in SQLite using a `rate_limits` table (`ip`, `date`, `count`). No external dependency needed.

```typescript
// Request
{ address: string; signCount: number }

// Response (200)
{
  id: string;
  placements: SignPlacement[];
  route: { approachRoad: string; distance: number; duration: number; polyline: string };
  fullReasoning: string;
  degradationLevel: number;
  costs: { maps: number; llm: number };
}

// Response (422) — geocoding failed
{ error: "GEOCODE_FAILED"; message: "We couldn't find this address. Please check the address and try including the ZIP code." }

// Response (429) — rate limit exceeded
{ error: "RATE_LIMIT_EXCEEDED"; message: "You've reached the daily limit. Try again tomorrow." }

// Response (500) — unrecoverable
{ error: "PIPELINE_FAILED"; message: "Something went wrong. Please try again." }
```

### `GET /api/analyze/[id]`

Returns the full stored `SignPlacementResult` or 404 if expired/not found.

---

## Error Handling: Degradation Hierarchy

| Level | Condition | Behavior | User Sees |
|-------|-----------|----------|-----------|
| 0 | All systems normal | Full pipeline | Map + pins + explanations |
| 1 | One approach route failed | Process remaining 2 routes | Info banner: "2 of 3 routes analyzed" |
| 2 | Step count < 5, polyline active | More candidates, noise filter active | (No user-visible change) |
| 3 | LLM all retries failed | Deterministic scoring fallback | Warning: "Detailed descriptions unavailable. Using standard ranking." |
| 4 | 2+ routes failed (1 left) | Single-route analysis | Warning: "Limited analysis — fewer routes available." |
| 5 | All routes failed | Intersection-based fallback only | Warning: "Route data unavailable. Showing intersection estimates." |
| 6 | Geocoding failed | Cannot proceed | Error: "Address not found. Check the address." |

- **Only Level 6 is fatal.** Levels 1-5 still return placements.
- Each API call has retry with exponential backoff (1s base, 16s max, 3 retries for Maps; 1.5s base, 30s max, 3 attempts for LLM).
- Total pipeline timeout: 60 seconds. After 60s, return whatever partial results exist.

---

## Frontend Component Specs

### Map Rendering

- Use **vector map rendering** (`mapId` required). Set `renderingType: "VECTOR"` on the Map component. This enables GPU-accelerated rendering, smooth zoom/pan, and tilt/perspective.
- Use a **Cloud-based Map Style** via a Map ID created in Google Cloud Console (Maps > Map Styles). The style should: mute background colors, emphasize road hierarchy (arterials darker/wider than residential), suppress irrelevant POI clutter, and keep labels readable. Reference the Map ID via `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` env var.
- The Maps JS API bootstrap URL must include the `places` library: `&libraries=places`. Street View is built into the core Maps JS API and does not require a separate library.

### Main Page Layout (`src/app/page.tsx`)

Desktop (≥1024px) — default state (no selection):
```
┌──────────┬───────────────────────────────────┬──────────────────┐
│ Input    │              Map                  │ Results          │
│ Panel    │                                   │ Panel            │
│ (280px)  │  • Property marker                │ (360px)          │
│          │  • Numbered sign pins             │                  │
│ Addr: ██ │  • Route polyline                 │ Sign 1 ●         │
│ Signs: 5 │  • Vector rendering + custom style│ "Right turn..."  │
│          │                                   │                  │
│ [Analyze]│                                   │ Sign 2 ●         │
│          │                                   │ "At roundabout"  │
│ Status:  │                                   │                  │
│ Step 4/8 │                                   │ Sign 3 ● ...     │
└──────────┴───────────────────────────────────┴──────────────────┘
```

Desktop — sign selected state:
```
┌──────────┬───────────────────────────────────┬──────────────────┐
│ Input    │              Map                  │ Results          │
│ Panel    │          (top ~60%)               │ Panel            │
│ (280px)  │  • Selected pin highlighted       │ (360px)          │
│          ├───────────────────────────────────┤                  │
│          │       Street View Panel           │ Sign 1 ● ← active│
│          │       (bottom ~40%, animated      │ reasoning shown  │
│          │        slide-up from collapsed)   │                  │
│          │  Heading: driver approach angle   │ Sign 2 ●         │
│          │  [◀ Prev sign] [Next sign ▶]      │                  │
└──────────┴───────────────────────────────────┴──────────────────┘
```

Mobile (<768px): Map fills screen. Results as 3-snap bottom sheet (peek/half/full). Input as floating button that slides into form. Street View opens as a full-screen sheet when triggered from a placement card.

### Component States

| Component | Empty | Loading | Success | Error |
|-----------|-------|---------|---------|-------|
| **MapView** | Default viewport (Phoenix area), vector style applied | Skeleton with pulsing marker | Pins + route polyline, vector rendering active | Map with error banner overlay |
| **InputPanel** | Form ready, address field auto-focused | Button shows spinner + current pipeline step | Collapsed to "New Analysis" link | Form remains, error inline |
| **ResultsPanel** | Hidden | Loading skeleton cards | Scrollable placement cards | Hidden, error shown in map |
| **PlacementCard** | N/A | N/A | Sign #, type icon, description, "Show reasoning" toggle, score badge, "Street View" button | N/A |
| **StreetViewPanel** | Hidden (collapsed) | Panorama loading spinner | Live interactive Street View panorama at sign location | "Street View unavailable at this location" message |

### Sign Pin Color Coding

| Type | Background | Text |
|------|-----------|------|
| Intersection | Blue (#2563EB) | White |
| Entrance | Green (#16A34A) | White |
| Mid-route | Amber (#D97706) | Black |
| Roundabout | Purple (#7C3AED) | White |
| Property | Red (#DC2626) | White |
| Flagged | Orange (#EA580C) | Warning icon |

Selected pin gets a white halo ring and scales up 1.2x.

### Key Interactions
- Click sign pin → highlight placement card in sidebar + open Street View panel oriented toward approach direction
- Click placement card → pan map to that pin + open Street View panel
- Street View panel: interactive panorama (not static image) — user can look around freely. Initial heading computed from approach bearing (direction driver comes from toward the turn).
- "Street View" button on PlacementCard checks metadata first (free, no quota) — hides button if no coverage
- Prev/Next sign buttons in Street View panel cycle through placements without closing the panel
- Pin positions are NOT draggable in MVP (Phase 2 feature)
- "Share" button copies `/results/[id]` URL to clipboard

---

## Build Order

### Phase A: Scaffold (do first)
1. `npx create-next-app@latest sign-placement --typescript --tailwind --app --src-dir`
2. Install deps: `npm install @vis.gl/react-google-maps @anthropic-ai/sdk better-sqlite3 drizzle-orm nanoid`
3. Install dev deps: `npm install -D @types/better-sqlite3 drizzle-kit vitest`
4. Create `.env.local` and `.env.local.example`
5. Create directory structure (all folders)

### Phase B: Types + Database (do second)
1. `src/lib/types/index.ts` — all interfaces
2. `src/lib/db/schema.ts` — Drizzle schema + migration
3. `src/lib/db/queries.ts` — insert + get + cleanup

### Phase C: Utilities (do third)
1. `src/lib/utils/geo.ts` — Haversine, bearing, polyline decode
2. `src/lib/utils/format.ts` — address formatting

### Phase D: Services (do fourth)
1. `src/lib/services/google-maps.ts` — geocode() + computeRoutes()
2. `src/lib/services/llm-client.ts` — rankCandidates() with structured output

### Phase E: Pipeline (do fifth)
1. `src/lib/rules/safety.ts` + `legal.ts` + `placement.ts`
2. `src/lib/pipeline/geocoder.ts`
3. `src/lib/pipeline/approach-roads.ts`
4. `src/lib/pipeline/routing.ts` + `decision-points.ts`
5. `src/lib/pipeline/candidates.ts`
6. `src/lib/pipeline/hard-constraints.ts`
7. `src/lib/pipeline/scorer.ts`
8. `src/lib/pipeline/llm.ts`
9. `src/lib/pipeline/optimizer.ts`
10. `src/lib/pipeline/orchestrator.ts`

### Phase F: API Routes (do sixth)
1. `src/app/api/analyze/route.ts` — POST handler
2. `src/app/api/analyze/[id]/route.ts` — GET handler

### Phase G: Frontend (do seventh)
1. `src/components/ui/*` — Button, Card, Badge, Spinner, ExpandToggle
2. `src/components/input/AddressAutocomplete.tsx`
3. `src/components/input/SignCountSelector.tsx`
4. `src/components/input/InputPanel.tsx`
5. `src/components/map/PropertyMarker.tsx`
6. `src/components/map/SignMarker.tsx` — selected state: white halo + 1.2x scale
7. `src/components/map/RoutePolyline.tsx`
8. `src/components/map/StreetViewPanel.tsx` — interactive panorama, approach heading, prev/next controls, metadata check before render, graceful no-coverage state
9. `src/components/map/MapView.tsx` — vector rendering (`renderingType: "VECTOR"`), Map ID from `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`, map+streetview split layout when sign selected
10. `src/components/results/PlacementCard.tsx`
11. `src/components/results/PipelineProgress.tsx`
12. `src/components/results/ResultsPanel.tsx`
13. `src/hooks/useAnalysis.ts`
14. `src/hooks/useMapBounds.ts`
15. `src/hooks/useStreetView.ts` — manages selected sign state, heading computation from approach bearing, metadata check
16. `src/app/page.tsx` — wire it all together
17. `src/app/results/[id]/page.tsx` — shareable view
18. `src/app/layout.tsx` — metadata + globals
19. `src/app/globals.css` — Tailwind + map fix

### Phase H: Tests (do eighth)
1. `tests/pipeline/scorer.test.ts`
2. `tests/pipeline/candidates.test.ts`
3. `tests/pipeline/optimizer.test.ts`
4. `tests/pipeline/hard-constraints.test.ts`

### Phase I: Deployment (do last)
1. `Dockerfile`
2. `docker-compose.yml`
3. Run validation against 5 test addresses in Maricopa County

---

## Test Addresses (Maricopa County / Peoria AZ area)

Run the pipeline against these 5 addresses to validate:

| # | Address | Type | What It Tests |
|---|---------|------|---------------|
| 1 | 8840 W Meadowbrook Ave, Peoria, AZ 85345 | Suburban grid | Standard neighborhood with multiple approach roads |
| 2 | 26701 N 83rd Ave, Peoria, AZ 85383 | Near roundabout | Happy Valley Rd / 83rd Ave roundabout area |
| 3 | 9295 W Caron Dr, Peoria, AZ 85345 | Cul-de-sac | Dead-end residential, limited access points |
| 4 | 6750 W Thunderbird Rd, Peoria, AZ 85381 | Arterial adjacent | Property on or near a major arterial road |
| 5 | 9800 W Northern Ave, Peoria, AZ 85345 | Commercial-area | Near busy intersection, mixed-use neighborhood |

---

## Validation Checklist Before "Done"

- [ ] All 5 test addresses return valid placements (no Level 6 failures)
- [ ] Pins appear at correct intersections/turns on the Google Map
- [ ] Route polyline follows actual street geometry
- [ ] LLM reasoning text references real road names (no hallucination)
- [ ] Share URL loads on a different device/browser
- [ ] Mobile layout doesn't break (test at 375px width)
- [ ] Pipeline fails gracefully with invalid address (shows clear error)
- [ ] Pipeline fails gracefully with missing API key (shows clear error at startup)
- [ ] Loading states show meaningful progress (not frozen spinner)
- [ ] Per-analysis cost is logged and < $0.10 total
