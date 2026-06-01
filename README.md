# Sign Placement Optimizer

An AI-powered tool that helps real estate agents determine the optimal locations for open house directional signs. The agent inputs the property address and how many signs they have — the system uses Google Maps data and an LLM to find the highest-value sign placements and displays them on an interactive map with pin drops.

## Problem

Real estate agents hosting an open house need to place directional signs that guide potential buyers from nearby major roads to the property. Today, this is done by intuition — the agent drives the route, guesses where signs should go, and hopes buyers find their way. The result is often:

- Signs placed too late for drivers to react
- Missing decision points where people get lost
- Clusters of signs at low-value locations while critical turns are unmarked
- No awareness of visibility, speed limits, or legal restrictions

### Who This Is For

A residential real estate agent preparing for a weekend open house. They have a fixed number of directional signs, know the listing address, and want a placement plan they can execute themselves or hand to an assistant. They are not technical — the interface must be simple and the output actionable.

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

### Role Split

| Component | Responsibility |
|-----------|---------------|
| **LLM** | Reasoning, explanation, recommendation language — why each spot was chosen |
| **Google Maps Platform** | Location data, routing, road classification, traffic, visual map rendering |
| **Backend** | Scoring logic, safety/legal rules, candidate filtering, pipeline orchestration |

### Input

- Property address
- Number of signs available

### Output

- Interactive map with numbered pin drops at recommended sign locations
- The driving route highlighted from the major approach road to the property
- Reasoning/explanation for each placement from the LLM

## Domain Rules

These come from [real estate sign placement best practices](https://www.oakleysign.com/ready-agent-blog/where-to-put-open-house-signs/):

1. **Directional trail**: Signs form a path from the nearest major road to the property — each sign answers "where do I go next?"
2. **One sign per turn**: At minimum, place a sign at every key intersection where the driver must make a decision
3. **3-5 signs minimum**: More for winding streets, gated communities, or limited visibility
4. **Placement hierarchy**: High-traffic intersections → neighborhood entrances → mid-route markers → crossroads/roundabouts → directly in front of property
5. **Positioning**: Signs angled ~45° to the curb, 24-36" off ground, visible from both approach directions
6. **Legal constraints**: Municipal ordinances, HOA rules, and private property restrictions must be considered

## Estimated API Cost Per Analysis

Based on current Google Maps Platform pricing:

| API | Calls per Analysis | Cost per Call | Subtotal |
|-----|--------------------|---------------|----------|
| Geocoding API | 1 | $0.005 | $0.005 |
| Places API (Nearby Search) | 2–3 | $0.032 | ~$0.08 |
| Directions API | 2–4 | $0.005 | ~$0.02 |
| Roads API | 1–2 | $0.005 | ~$0.01 |
| LLM (provider TBD) | 1 | TBD | TBD |
| **Total (Maps only)** | | | **~$0.11** |

Google Maps Platform includes a $200/month free credit. At ~$0.11/analysis, that covers ~1,800 analyses before any Maps cost is incurred.

## Open Decisions

The following need to be decided before building:

- **Tech stack**: Frontend framework, backend language
- **LLM provider**: OpenAI, Anthropic, or other
- **Which Google Maps APIs** are needed and which are nice-to-have
- **Scoring algorithm**: What factors, what weights
- **LLM prompt design**: System prompt, user prompt template, context window strategy
- **Frontend layout**: How the map, inputs, and results are arranged
- **Database**: What to persist (if anything), schema design
- **Auth**: Needed for MVP or deferred?
- **MVP scope**: What's in, what's out

## Decided

- **Deployment**: Hetzner VPS (self-hosted)
