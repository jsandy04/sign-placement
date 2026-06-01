# Sign Placement Optimizer

An AI-powered tool that helps real estate agents determine the optimal locations for open house directional signs. Give it a property address and the number of signs you have — it uses Google Maps data and an LLM to compute the highest-value placement plan and displays it on an interactive map.

## Table of Contents

- [Problem](#problem)
- [How It Works](#how-it-works)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Architecture](#architecture)
- [API Reference](#api-reference)
- [Scoring Algorithm](#scoring-algorithm)
- [LLM Prompt Design](#llm-prompt-design)
- [Frontend Layout](#frontend-layout)
- [Database Schema](#database-schema)
- [Environment Variables](#environment-variables)
- [MVP Scope](#mvp-scope)
- [Future Roadmap](#future-roadmap)
- [Cost Estimates](#cost-estimates)

---

## Problem

Real estate agents hosting an open house need to place directional signs that guide potential buyers from nearby major roads to the property. Today, this is done by intuition — the agent drives the route, guesses where signs should go, and hopes buyers find their way.

The result is often:
- Signs placed too late for drivers to react
- Missing decision points where people get lost
- Clusters of signs at low-value locations while critical turns are unmarked
- No awareness of visibility, speed limits, or legal restrictions

**This tool replaces guesswork with an algorithmic, data-driven placement plan** — backed by real routing data, traffic patterns, and LLM reasoning.

### User Persona

**Primary user**: A residential real estate agent preparing for a weekend open house. They have 3-12 directional signs, know the listing address, and want a placement plan they can hand to an assistant or execute themselves. They are not technical — the interface must be simple and the output actionable.

---

## How It Works

```
Agent enters address + number of signs
              │
              ▼
     ┌─────────────────┐
     │  1. Geocode      │  Address → lat/lng via Google Geocoding API
     └────────┬────────┘
              │
              ▼
     ┌─────────────────┐
     │  2. Find Roads   │  Identify 2-4 major approach roads near the property
     └────────┬────────┘  via Google Places API + road classification
              │
              ▼
     ┌─────────────────┐
     │  3. Compute      │  For each approach road → property, get driving
     │     Routes       │  directions. Extract every turn, roundabout,
     └────────┬────────┘  and intersection as a decision point.
              │
              ▼
     ┌─────────────────┐
     │  4. Generate     │  At each decision point, generate 1-3 candidate
     │     Candidates   │  coordinates (before / at / after the turn).
     └────────┬────────┘  Add the property itself as the final sign.
              │
              ▼
     ┌─────────────────┐
     │  5. Score        │  Rank every candidate on: criticality, traffic,
     │     Candidates   │  visibility, spacing, safety, speed.
     └────────┬────────┘
              │
              ▼
     ┌─────────────────┐
     │  6. LLM Review   │  Send top candidates + context to LLM for
     │                  │  final ranking, explanations, and flagging.
     └────────┬────────┘
              │
              ▼
     ┌─────────────────┐
     │  7. Select Top N │  Return the best N placements, route polyline,
     │     + Display    │  and reasoning. Render on interactive map.
     └─────────────────┘
```

### Domain Rules (from real estate industry best practices)

These rules inform the scoring algorithm and LLM prompt:

1. **Directional trail**: Signs form a path from the nearest major road to the property — each sign answers "where do I go next?"
2. **One sign per turn**: At minimum, place a sign at every key intersection where the driver must make a decision
3. **3-5 signs minimum**: More for winding streets, gated communities, or limited visibility
4. **Placement hierarchy**: High-traffic intersections → neighborhood entrances → mid-route markers → crossroads/roundabouts → directly in front of property
5. **Positioning**: Signs angled ~45° to the curb, 24-36" off ground, visible from both approach directions
6. **Legal constraints**: Municipal ordinances, HOA rules, and private property restrictions — flagged by the system

---

## Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Framework** | Next.js 15 (App Router) + TypeScript | Full-stack in a single deployable codebase; API routes handle the pipeline server-side |
| **Map UI** | `@vis.gl/react-google-maps` | Official Google library with first-class React support |
| **LLM** | OpenAI GPT-4o (or Anthropic Claude) | Reasoning over spatial data + natural language explanations |
| **Maps Data** | Google Maps Platform (Geocoding, Directions, Places, Roads) | All location, routing, and road metadata |
| **Database** | SQLite via `better-sqlite3` | Zero-infrastructure, fast, perfect for single-session MVP |
| **Styling** | Tailwind CSS | Rapid iteration, small production bundle |
| **Auth** | None for MVP; Clerk for Phase 2 | Deferred until user accounts are needed |

### Why Next.js over Python/FastAPI?

The heavy spatial computation lives in Google's APIs — our backend orchestrates and scores, it doesn't crunch GIS rasters. Next.js gives us one TypeScript codebase, one deploy target (Vercel), and shared types between frontend and API routes. For an MVP built by a small team, this eliminates an entire class of integration bugs.

---

## Getting Started

### Prerequisites

- Node.js 20+
- npm (or pnpm / yarn)
- A Google Cloud Platform account with billing enabled
- An OpenAI Platform account (or Anthropic account for Claude)

### 1. API Key Setup

#### Google Maps Platform

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select an existing one)
3. Enable the following APIs:
   - **Maps JavaScript API** — interactive map in the browser
   - **Geocoding API** — convert addresses to coordinates
   - **Directions API** — compute driving routes and turn-by-turn steps
   - **Places API** — find nearby roads, intersections, and points of interest
   - **Roads API** — get speed limits and road classifications (recommended)
4. Create an API key with HTTP referrer restrictions:
   - **Server key**: Restrict to your server IP or leave unrestricted for local dev
   - **Browser key**: Restrict to `http://localhost:3000/*` (dev) and your production domain
5. See [`docs/google-maps-setup.md`](docs/google-maps-setup.md) for step-by-step screenshots

#### OpenAI

1. Go to [platform.openai.com](https://platform.openai.com/)
2. Create an API key at [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
3. Add credits to your account (GPT-4o costs ~$0.01 per analysis)

### 2. Install & Run

```bash
# Clone the repo
git clone <repo-url>
cd sign-placement

# Install dependencies
npm install

# Copy the environment template
cp .env.local.example .env.local

# Edit .env.local with your API keys (see Environment Variables section below)
# Then start the dev server:
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 3. Verify Everything Works

1. Enter a real address in the search box and select a sign count
2. Click "Analyze" — you should see loading states for each pipeline step
3. After ~3-5 seconds, the map populates with numbered pins and a route polyline
4. The right panel shows each placement with LLM-generated reasoning
5. Try sharing the URL — it encodes the analysis ID for others to view

---

## Project Structure

```
sign-placement/
├── README.md
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.ts
├── .env.local.example            # Template — copy to .env.local and fill in keys
│
├── src/
│   ├── app/                      # Next.js App Router
│   │   ├── layout.tsx            # Root layout (metadata, fonts, providers)
│   │   ├── page.tsx              # Main page: input form + map + results
│   │   ├── loading.tsx           # Suspense fallback during page load
│   │   ├── error.tsx             # Error boundary
│   │   │
│   │   ├── api/
│   │   │   ├── analyze/
│   │   │   │   ├── route.ts      # POST — runs the full placement pipeline
│   │   │   │   └── [id]/
│   │   │   │       ├── route.ts  # GET — retrieve a previous analysis
│   │   │   │       └── placements/
│   │   │   │           └── route.ts  # PUT — manually adjust a placement
│   │   │   └── geocode/
│   │   │       └── route.ts      # GET — geocode proxy for address autocomplete
│   │   │
│   │   └── results/
│   │       └── [id]/
│   │           └── page.tsx      # Shareable results view (no input form)
│   │
│   ├── components/
│   │   ├── map/
│   │   │   ├── MapView.tsx       # Google Map wrapper with all markers
│   │   │   ├── SignMarker.tsx    # Numbered, color-coded sign pin
│   │   │   ├── PropertyMarker.tsx # House icon at the destination
│   │   │   └── RoutePolyline.tsx # Highlighted driving route overlay
│   │   │
│   │   ├── input/
│   │   │   ├── InputPanel.tsx    # Left sidebar: form container
│   │   │   ├── AddressAutocomplete.tsx  # Google Places-powered address input
│   │   │   └── SignCountSlider.tsx      # Number of signs selector (1-12)
│   │   │
│   │   ├── results/
│   │   │   ├── ResultsPanel.tsx  # Right sidebar: placement list
│   │   │   ├── PlacementCard.tsx # Single placement: number, description, reasoning
│   │   │   └── ExportView.tsx    # Print-friendly layout
│   │   │
│   │   └── ui/                   # Shared primitives (Button, Card, Badge, etc.)
│   │
│   ├── lib/
│   │   ├── pipeline/             # Core orchestration logic
│   │   │   ├── orchestrator.ts   # Coordinates all pipeline steps
│   │   │   ├── geocoder.ts       # Step 1: address → { lat, lng }
│   │   │   ├── roads.ts          # Step 2: find approach roads near property
│   │   │   ├── routing.ts        # Step 3: Directions API + decision point extraction
│   │   │   ├── candidates.ts     # Step 4: generate candidate coordinates
│   │   │   ├── scorer.ts         # Step 5: weighted scoring algorithm
│   │   │   └── optimizer.ts      # Step 7: select optimal N from ranked list
│   │   │
│   │   ├── services/             # External API clients
│   │   │   ├── google-maps.ts    # Unified Google Maps client (all endpoints)
│   │   │   └── llm.ts            # OpenAI/Claude client for reasoning
│   │   │
│   │   ├── rules/                # Constraint and strategy rules
│   │   │   ├── safety.ts         # Sight-line, sidewalk, median checks
│   │   │   ├── legal.ts          # Municipal/HOA/private-property flag rules
│   │   │   └── placement.ts      # Industry placement strategy rules
│   │   │
│   │   ├── db/                   # Database layer
│   │   │   ├── schema.ts         # Schema definition + migration runner
│   │   │   └── queries.ts        # Typed CRUD operations
│   │   │
│   │   ├── types/
│   │   │   └── index.ts          # Shared TypeScript interfaces
│   │   │
│   │   └── utils/
│   │       ├── geo.ts            # Haversine distance, bearing, midpoint
│   │       └── format.ts         # Address formatting, ordinal numbers, etc.
│   │
│   └── styles/
│       └── globals.css           # Tailwind directives + custom map overrides
│
├── docs/
│   └── google-maps-setup.md      # Screenshot walkthrough of API key setup
│
└── tests/
    ├── pipeline/
    │   ├── scorer.test.ts
    │   ├── candidates.test.ts
    │   └── optimizer.test.ts
    └── services/
        └── google-maps.test.ts
```

---

## Architecture

### System Diagram

```
┌─────────────────────────────────────────────────────────┐
│                     FRONTEND (Browser)                   │
│                                                         │
│  ┌───────────┐   ┌──────────────────┐  ┌────────────┐   │
│  │  Input    │   │    Map View      │  │  Results   │   │
│  │  Panel    │   │                  │  │  Panel     │   │
│  │           │   │  ┌────────────┐  │  │            │   │
│  │ Address ──┼───┼──▶ Property  │  │  │ Sign #1 ●  │   │
│  │ Sign Cnt  │   │  │   Marker   │  │  │ "Right turn│   │
│  │ [Analyze] │   │  └────────────┘  │  │  at Oak St"│   │
│  │           │   │  ┌────────────┐  │  │            │   │
│  │           │   │  │ Sign Pins  │  │  │ Sign #2 ●  │   │
│  │           │   │  │ ① ② ③ ④   │  │  │ "Before the│   │
│  │           │   │  └────────────┘  │  │ roundabout"│   │
│  │           │   │  ┌────────────┐  │  │            │   │
│  │           │   │  │ Route Line │  │  │ ...        │   │
│  │           │   │  └────────────┘  │  │            │   │
│  └───────────┘   └──────┬───────────┘  └─────┬──────┘   │
│                         │                     │          │
│                    Google Maps           Results from   │
│                    JS API                API response   │
└─────────────────────────┼─────────────────────┼─────────┘
                          │                     │
                    ┌─────┴─────────────────────┴─────┐
                    │     POST /api/analyze            │
                    │     { address, signCount }       │
                    └─────────────────┬───────────────┘
                                      │
┌─────────────────────────────────────┼───────────────────┐
│                        BACKEND (Next.js Server)          │
│                                      │                   │
│  ┌───────────────────────────────────┴───────────────┐  │
│  │              Pipeline Orchestrator                 │  │
│  │  orchestrator.ts                                   │  │
│  │                                                    │  │
│  │  geocode() → findRoads() → getRoutes() →           │  │
│  │  generateCandidates() → scoreCandidates() →        │  │
│  │  llmEvaluate() → selectTopN() → storeResult()      │  │
│  └────┬──────┬──────────┬──────────┬─────────────────┘  │
│       │      │          │          │                     │
│  ┌────┴──┐ ┌─┴──────┐ ┌─┴──────┐ ┌─┴──────────┐        │
│  │Google │ │Scoring │ │  LLM   │ │  SQLite    │        │
│  │ Maps  │ │Engine  │ │Service │ │  Database  │        │
│  │Client │ │        │ │        │ │            │        │
│  └───────┘ └────────┘ └────────┘ └────────────┘        │
│       │           │          │          │                │
└───────┼───────────┼──────────┼──────────┼────────────────┘
        │           │          │          │
   ┌────┴────┐ ┌────┴────┐ ┌───┴────┐ ┌──┴──────────┐
   │ Google  │ │ Scoring │ │ OpenAI │ │ SQLite File  │
   │ Cloud   │ │ Rules   │ │  API   │ │ (local disk) │
   └─────────┘ └─────────┘ └────────┘ └──────────────┘
```

### Pipeline Steps in Detail

#### Step 1: Geocode Input
```
Input:  { address: "123 Main St, Anytown, USA", signCount: 5 }
Output: { lat: 40.7128, lng: -74.0060, formattedAddress, placeId }
```
Calls Google Geocoding API. Validates the address resolves to a real location.

#### Step 2: Find Major Approach Roads
Uses Google Places API "nearby search" around the property to find roads classified as primary, secondary, or tertiary. Identifies the 2-4 nearest arterial roads that would feed traffic into the neighborhood. Criteria:
- Road classification from Roads API (primary/secondary/tertiary)
- Distance from property (target: 0.25-2 miles out)
- Intersection density (more intersections = more traffic = better sign placement value)

#### Step 3: Compute Routes & Extract Decision Points
For each approach road found in Step 2, calls Directions API to get the driving route to the property. Parses the route response to extract **decision points** — locations where a driver must make a choice:

- Every turn instruction (left, right, straight through an intersection)
- Roundabouts and traffic circles
- Neighborhood entrance (road name change, speed limit drop, road width change)
- Fork or merge points

Each decision point includes: coordinates, the maneuver type, the road names involved, and distance from prior point.

#### Step 4: Generate Candidate Sign Locations
For each decision point, generates 1-3 precise candidate coordinates:
- **Before the turn** (~100-300ft prior, so drivers can read and react)
- **At the intersection** (high-visibility corner placement)
- **After the turn** (~50-100ft past, as confirmation)

Distance adjustments based on speed limit from Roads API:
- ≤25 mph: 100ft before, 50ft after
- 25-40 mph: 200ft before, 75ft after
- ≥40 mph: 300ft before, 100ft after

The property itself is always added as the final candidate (type: `property`).

#### Step 5: Score Candidates
See [Scoring Algorithm](#scoring-algorithm) below for the full weighted model.

#### Step 6: LLM Evaluation
The top 2-3x candidates (relative to sign count) are sent to the LLM along with:
- Full route context (road names, turn sequence, distances)
- Map of scored candidates with their factor breakdowns
- Property details (address, open house date/time if provided)
- Industry placement rules

The LLM returns a ranked selection with natural-language reasoning. See [LLM Prompt Design](#llm-prompt-design).

#### Step 7: Select & Return
The orchestrator takes the LLM's ranking, applies the optimizer to ensure spacing constraints, selects the top N candidates (where N = sign count), stores the result in SQLite, and returns the full `SignPlacementResult` to the frontend.

---

## API Reference

### `POST /api/analyze`

Run the full placement pipeline.

**Request:**
```json
{
  "address": "123 Main St, Springfield, IL",
  "signCount": 5,
  "openHouseDate": "2026-06-07T13:00:00Z"
}
```

**Response:**
```json
{
  "id": "analysis_abc123",
  "placements": [
    {
      "order": 1,
      "location": { "lat": 39.7817, "lng": -89.6501 },
      "description": "Right turn from W Jefferson St onto N Grand Ave",
      "reasoning": "This is the first decision point drivers encounter coming from the main arterial. Placing a sign 200ft before the turn on Jefferson gives drivers time to slow and prepare for the right. Jefferson has a 35mph limit so early placement is important.",
      "score": 87,
      "flag": "none",
      "type": "intersection"
    }
  ],
  "route": {
    "approachRoad": "W Jefferson St",
    "distance": 1.8,
    "duration": 6,
    "polyline": "encoded_polyline_string"
  },
  "fullReasoning": "## Sign Placement Analysis for 123 Main St...\n\n### Overall Strategy\nThis property sits 1.8 miles inside the Leland Grove neighborhood..."
}
```

**Error Response:**
```json
{
  "error": "GEOCODE_FAILED",
  "message": "Could not resolve address. Please check the address and try again."
}
```

### `GET /api/analyze/[id]`

Retrieve a previous analysis by ID.

**Response:** Same shape as POST response above.

### `PUT /api/analyze/[id]/placements`

Manually adjust a placement (reorder, move pin, or remove).

**Request:**
```json
{
  "placementId": "placement_xyz",
  "location": { "lat": 39.7820, "lng": -89.6498 }
}
```

### `GET /api/geocode?q=123+Main+St`

Proxy for Google Places Autocomplete. Returns address suggestions.

---

## Scoring Algorithm

Each candidate sign location receives a composite score from 0-100 using a weighted multi-factor model:

| Factor | Weight | Description | Data Source |
|--------|--------|-------------|-------------|
| **Decision-point criticality** | 30% | Is this a turn, roundabout, or fork? Straight continuations score lower. | Directions API maneuver type |
| **Traffic volume proxy** | 25% | Arterial roads score higher than residential streets. Intersection density in the area boosts score. | Roads API classification + Places API nearby POIs |
| **Visibility** | 15% | Straight road segments with clear sight lines score higher than curves or hills. | Road geometry from Directions API polyline (curvature analysis) |
| **Sign spacing** | 15% | Penalty for candidates too close to other selected signs (< 500ft). Bonus for well-distributed coverage. | Haversine distance between candidates |
| **Safety/legal compliance** | 10% | Penalty for: medians, utility poles, private property, school zones, blocked sight lines. | Rules engine (safety.ts, legal.ts) |
| **Approach speed** | 5% | Lower speed limits allow drivers more time to read signs — better placement value. Higher speeds require earlier placement but reduce readability. | Roads API speed limits |

### Scoring Formula

```
score = (criticality × 0.30) + (traffic × 0.25) + (visibility × 0.15) + (spacing × 0.15) + (safety × 0.10) + (speedScore × 0.05)
```

Where each sub-score is normalized to 0-100. Flags are applied multiplicatively: a `legal` or `safety` flag reduces the final score by 50%, and the flag is surfaced in the UI.

### Optimizer Constraints

After scoring, the optimizer enforces:
- Minimum 300ft between any two selected sign locations
- At least one sign within 200ft of the property (the final marker)
- At least one sign on or near each approach road
- Maximum 2 signs per intersection (one before, one after — never both on the same corner)

---

## LLM Prompt Design

The LLM (GPT-4o or Claude) receives a structured prompt with these sections:

### System Prompt

```
You are an expert real estate sign placement strategist. Your job is to evaluate candidate sign locations for an open house and select the optimal placements.

You apply these rules:
1. Signs form a directional trail from the nearest major road to the property.
2. One sign per turn — every decision point needs a marker.
3. Signs should be placed BEFORE the turn (100-300ft prior depending on speed limit).
4. High-traffic intersections are the most valuable placement spots.
5. The final sign must be directly in front of the property.
6. Avoid placing signs on medians, utility poles, private property, or anywhere that violates municipal codes.
7. Consider visibility from both approach directions.
8. Space signs at least 300ft apart when possible.

For each placement you select, provide:
- The sign's position in the sequence (1 = farthest from property, N = at property)
- A clear description of the location (road names, which corner, what the driver sees)
- A brief reasoning explaining WHY this spot was chosen (traffic volume, decision criticality, visibility advantage)
- Any safety or legal concern you want the agent to know about
```

### User Prompt Template

```
Property: {{formattedAddress}}
Neighborhood: {{neighborhood}}
Number of signs available: {{signCount}}
Open house: {{openHouseDateTime}}

Approach roads feeding into the neighborhood:
{{#each approachRoads}}
- {{name}} ({{classification}}, {{distanceFromProperty}}mi from property, ~{{trafficVolume}} daily)
{{/each}}

Driving route from {{primaryApproachRoad}} to property:
{{#each routeSteps}}
{{stepNumber}}. {{maneuver}} — {{instruction}} ({{distance}} from prior step, speed limit: {{speedLimit}}mph)
{{/each}}

Candidate sign locations (pre-scored by algorithm):
{{#each candidates}}
{{id}}. [Score: {{score}}] {{locationDescription}}
   Type: {{type}} | Coordinates: {{lat}}, {{lng}}
   Criticality: {{criticality}}/100 | Traffic: {{traffic}}/100 | Visibility: {{visibility}}/100
   Flags: {{flags}}
{{/each}}

Task:
1. Select the best {{signCount}} locations from the candidates above.
2. Rank them in driving order (1 = farthest/closest to the approach road, {{signCount}} = at the property).
3. For each selected location, provide:
   - The candidate ID you selected
   - A human-readable description (e.g., "Right turn from Oak St onto Elm Ave — place sign on the northeast corner, 150ft before the turn")
   - Your reasoning for choosing this specific candidate over nearby alternatives
4. Note any concerns the agent should be aware of (visibility issues, legal restrictions, construction).
5. Suggest optimal setup timing if an open house time was provided.

Format your response as JSON matching the SignPlacement schema.
```

---

## Frontend Layout

### Main Page (Desktop)

```
┌──────────────────────────────────────────────────────────────┐
│  Header: [Logo] Sign Placement Optimizer                     │
├──────────┬──────────────────────────────┬────────────────────┤
│          │                              │                    │
│  Input   │                              │   Results          │
│  Panel   │        Map View              │   Panel            │
│          │                              │                    │
│ ┌──────┐ │                              │ ┌────────────────┐ │
│ │Addr..│ │    ┌─────┐    ①              │ │ Sign 1 ●       │ │
│ └──────┘ │    │ 🏠  │   /│\             │ │ W Jefferson →  │ │
│          │    └─────┘  / │ \            │ │ N Grand Ave    │ │
│ Signs:   │            /  │  \           │ │ "Right turn..." │ │
│ [5]  ▲▼  │       ②───┘   │   └──③      │ ├────────────────┤ │
│          │    intersec.   │   intersec. │ │ Sign 2 ●       │ │
│ [Analyze]│               │             │ │ MacArthur Blvd  │ │
│          │               │   ┌─────┐   │ │ at roundabout   │ │
│          │               └───┤ 🏡  │   │ │ "Entering..."   │ │
│          │                   └─────┘   │ ├────────────────┤ │
│          │                   ④property │ │ Sign 3 ●       │ │
│          │                              │ │ ...            │ │
│          │                              │ └────────────────┘ │
│          │                              │ [Export] [Share]   │
├──────────┴──────────────────────────────┴────────────────────┤
│  Status bar: "Analysis complete · 5 signs placed · 1.8mi    │
│   route · $0.12 API cost"                                    │
└──────────────────────────────────────────────────────────────┘
```

### Component States

| Component | Empty | Loading | Success | Error |
|-----------|-------|---------|---------|-------|
| **Map** | Default viewport (US center) | Skeleton with pulsing placeholder | Map + pins + route polyline | Fallback with error message |
| **Input Panel** | Form ready, address field focused | Analyze button shows spinner + step progress | Collapsed to summary bar | Form remains, error inline |
| **Results Panel** | Hidden | Skeleton cards with pulse animation | Scrollable placement list | Hidden, error shown in map |
| **Placement Card** | N/A | N/A | Number, description, reasoning, score badge | N/A |

### Color Coding for Sign Pins

| Type | Color | Icon |
|------|-------|------|
| Intersection | Blue (#2563EB) | ① ② ③ |
| Entrance | Green (#16A34A) | ① ② ③ |
| Mid-route | Amber (#D97706) | ① ② ③ |
| Roundabout | Purple (#7C3AED) | ① ② ③ |
| Property | Red (#DC2626) | 🏡 |
| Flagged (safety/legal) | Orange with warning badge | ⚠① |

---

## Database Schema

### SQLite (MVP)

```sql
CREATE TABLE analyses (
  id               TEXT PRIMARY KEY,
  address          TEXT NOT NULL,
  formatted_address TEXT,
  lat              REAL NOT NULL,
  lng              REAL NOT NULL,
  sign_count       INTEGER NOT NULL,
  open_house_date  TEXT,
  status           TEXT DEFAULT 'pending',
  raw_result       TEXT,  -- JSON blob of full pipeline output
  created_at       TEXT DEFAULT (datetime('now'))
);

CREATE TABLE placements (
  id              TEXT PRIMARY KEY,
  analysis_id     TEXT NOT NULL REFERENCES analyses(id),
  sort_order      INTEGER NOT NULL,
  lat             REAL NOT NULL,
  lng             REAL NOT NULL,
  description     TEXT,
  reasoning       TEXT,
  score           REAL,
  placement_type  TEXT,
  flag            TEXT,
  is_selected     INTEGER DEFAULT 1
);

CREATE INDEX idx_placements_analysis ON placements(analysis_id, sort_order);
```

`raw_result` stores the complete pipeline output as a JSON string, enabling full result reconstruction without re-running the pipeline. The `placements` table provides a structured query surface for individual placement adjustments.

---

## Environment Variables

```bash
# .env.local — copy from .env.local.example and fill in your keys

# Google Maps Platform (server-side key)
# Create at: https://console.cloud.google.com/apis/credentials
GOOGLE_MAPS_API_KEY=AIza...

# Google Maps Platform (client-side key — exposed to browser)
# Restrict this key to your domain and the Maps JavaScript API only
NEXT_PUBLIC_GOOGLE_MAPS_KEY=AIza...

# LLM Provider (choose one)
OPENAI_API_KEY=sk-...
# or
# ANTHROPIC_API_KEY=sk-ant-...

# Database path (defaults to ./data/sign-placement.db if unset)
DATABASE_URL=file:./data/sign-placement.db

# Optional: Auth (Phase 2)
# CLERK_SECRET_KEY=sk_test_...
# NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
```

### .env.local.example (committed to repo)

```bash
# Google Maps Platform
GOOGLE_MAPS_API_KEY=
NEXT_PUBLIC_GOOGLE_MAPS_KEY=

# LLM Provider — use OpenAI (GPT-4o) or Anthropic (Claude)
OPENAI_API_KEY=

# Database
DATABASE_URL=file:./data/sign-placement.db
```

---

## MVP Scope

### In Scope (Build Now)

1. **Single-page app**: Address input + sign count selector + interactive map
2. **Full analysis pipeline**: Geocode → find roads → compute routes → generate candidates → score → LLM select → display
3. **Interactive map**: Google Map with property marker, numbered sign pins (color-coded by type), and highlighted route polyline
4. **Results panel**: Ordered list of placements with LLM-generated reasoning for each
5. **Shareable results**: Each analysis gets a unique URL (`/results/[id]`) that can be shared
6. **Persist to SQLite**: Analyses stored locally, retrievable by ID
7. **No authentication**: Single-instance, no user accounts

### Out of Scope (Phase 2+)

- Drag-to-adjust pins on the map
- Manual add/remove sign locations
- Printable sign placement map + instructions
- User accounts and saved analysis history
- HOA / municipal ordinance database lookup
- Live traffic data integration (time-of-day optimization)
- Mobile-responsive design (desktop-first for MVP)
- PDF export
- Multi-agent support (brokerage-level accounts)

---

## Future Roadmap

### Phase 2: Polish & Practicality
- Drag-to-adjust pins with re-scoring on move
- Manual add/remove sign locations
- Print-friendly export with turn-by-turn setup instructions
- Mobile-responsive layout for in-car use
- Undo/redo on placement adjustments

### Phase 3: Intelligence & Data
- Historical traffic data integration (Google Maps traffic patterns by time/day)
- Municipal ordinance database (pre populated with common restrictions by city)
- HOA rule awareness (user can input known restrictions)
- "Rain check" — weather-aware placement (windy = more secure staking needed, rainy = waterproof signs only)
- Competitive analysis: avoid placing signs where competing open house signs are likely

### Phase 4: Platform
- User accounts via Clerk (save history, preferences, default sign counts)
- Brokerage team accounts (shared placement plans)
- MLS integration (auto-pull upcoming open houses)
- Sign inventory tracking (how many signs are deployed right now?)
- Analytics dashboard (which placements drove the most traffic? — requires QR codes on signs or similar tracking)

---

## Cost Estimates

### Per-Analysis API Cost

| API | Calls per Analysis | Cost per Call | Subtotal |
|-----|-------------------|---------------|----------|
| Geocoding API | 1 | $0.005 | $0.005 |
| Places API (Nearby Search) | 2-3 | $0.032 | $0.08 |
| Directions API | 2-4 | $0.005 | $0.02 |
| Roads API | 1-2 | $0.005 | $0.01 |
| LLM (GPT-4o, ~2K input + ~500 output tokens) | 1 | ~$0.01 | $0.01 |
| **Total per analysis** | | | **~$0.13** |

### Monthly Cost Scenarios

| Usage Level | Analyses/Month | Monthly Cost |
|-------------|---------------|--------------|
| Single agent (weekend open houses only) | 20 | ~$2.60 |
| Small brokerage (10 agents) | 200 | ~$26.00 |
| Large brokerage (100 agents) | 2,000 | ~$260.00 |

Google Maps Platform offers a $200 monthly credit. For a single agent or small brokerage, the service would effectively run within the free tier.

### Hosting

- **Vercel Hobby**: Free (personal use, single developer)
- **Vercel Pro**: $20/month (team, higher limits, analytics)
- **SQLite**: $0 (local disk, no managed database cost)

---

## Contributing

This project follows a README-first development approach. The README is the canonical spec — if a feature isn't documented here, it doesn't exist.

### Development workflow

1. Pick a feature from the [MVP Scope](#mvp-scope) or [Future Roadmap](#future-roadmap)
2. Update this README if the feature changes the API, schema, or component tree
3. Write the implementation
4. Write tests covering the scoring algorithm, pipeline steps, or UI components
5. Open a PR referencing the relevant section of this README

### Code conventions

- TypeScript strict mode enabled
- All API routes return typed responses (use shared types from `src/lib/types/`)
- Pipeline steps are pure functions where possible — makes unit testing trivial
- Google Maps API calls are centralized in `src/lib/services/google-maps.ts`
- LLM calls are centralized in `src/lib/services/llm.ts`
- Tailwind utility classes only — no custom CSS except map container overrides

---

## License

MIT
