# Sign Placement Optimizer

An AI-powered tool that helps real estate agents determine the optimal locations for open house directional signs. The agent inputs the property address and how many signs they have — the system uses Google Maps data and an LLM to find the highest-value sign placements and displays them on an interactive map with numbered pin drops.

## Problem

Real estate agents hosting an open house need to place directional signs that guide potential buyers from nearby major roads to the property. Today, this is done by intuition — the agent drives the route, guesses where signs should go, and hopes buyers find their way.

## How It Works

```
Agent enters address + number of signs
              │
              ▼
     ┌─────────────────┐
     │  1. Geocode      │  Address → coordinates via Google Maps
     └────────┬────────┘
              │
              ▼
     ┌─────────────────┐
     │  2. Find         │  Identify major approach roads near the
     │     Approach     │  property that feed traffic into the area
     │     Roads        │
     └────────┬────────┘
              │
              ▼
     ┌─────────────────┐
     │  3. Compute      │  Get driving directions from approach
     │     Routes       │  roads to the property. Extract every
     │                  │  turn, intersection, and roundabout as
     └────────┬────────┘  a decision point.
              │
              ▼
     ┌─────────────────┐
     │  4. Generate     │  At each decision point, generate
     │     Candidate    │  candidate sign coordinates (before
     │     Locations    │  the turn, at the intersection, after).
     └────────┬────────┘  Property itself is the final sign.
              │
              ▼
     ┌─────────────────┐
     │  5. Score +      │  Backend scoring logic ranks candidates
     │     Filter       │  on traffic, visibility, safety, spacing.
     │                  │  Safety/legal rules flag problem spots.
     └────────┬────────┘
              │
              ▼
     ┌─────────────────┐
     │  6. LLM Review   │  LLM evaluates scored candidates, applies
     │                  │  placement strategy, generates reasoning
     │                  │  and explanations for each recommendation.
     └────────┬────────┘
              │
              ▼
     ┌─────────────────┐
     │  7. Display on   │  Best N placements rendered on an
     │     Map          │  interactive map with numbered pin drops
     │                  │  and the driving route highlighted.
     └─────────────────┘
```

## Role Split

| Component | Responsibility |
|-----------|---------------|
| **LLM** | Reasoning, explanation, recommendation language — why each spot was chosen |
| **Google Maps Platform** | Location data, routing, road classification, traffic, visual map rendering |
| **Backend** | Scoring logic, safety/legal rules, candidate filtering, pipeline orchestration |

## Domain Rules

From [real estate sign placement best practices](https://www.oakleysign.com/ready-agent-blog/where-to-put-open-house-signs/):

1. **Directional trail**: Signs form a path from the nearest major road to the property
2. **One sign per turn**: Place a sign at every key intersection where the driver must make a decision
3. **3-5 signs minimum**: More for winding streets, gated communities, or limited visibility
4. **Placement hierarchy**: High-traffic intersections → neighborhood entrances → mid-route markers → crossroads/roundabouts → directly in front of property
5. **Positioning**: Signs angled ~45° to the curb, 24-36" off ground, visible from both approach directions
6. **Legal constraints**: Municipal ordinances, HOA rules, and private property restrictions must be considered

## Building

This project is built from a comprehensive build specification. See **[docs/build-spec.md](docs/build-spec.md)** for the full technical blueprint:

- Locked tech stack and architecture
- Exact scoring algorithm weights and computation methods
- LLM system prompt and structured output schema (verbatim)
- Database schema, API route designs, and error degradation hierarchy
- Frontend component specs (desktop + mobile layouts)
- Build order in 9 phases with a validation checklist

Research documents that informed the build spec are archived in [`docs/archives/`](docs/archives/).

## Deployment

Self-hosted on Hetzner VPS via Docker Compose. Users bring their own API keys (Google Maps Platform + LLM provider).
