# Topic 9: Tech Stack

## Decision Needed
Frontend framework, backend language/runtime, monorepo vs separate services, given a self-hosted Hetzner VPS deployment target.

## Findings

### Frontend Framework: Next.js vs Separate React Frontend

**Next.js + Google Maps JS API integration status:**
- The Google Maps JavaScript API **cannot be server-side rendered** -- it depends on browser globals (`window`, `document`). Map components must use the `'use client'` directive in Next.js App Router
- The official React wrapper (`@vis.gl/react-google-maps`) documents this clearly and provides `'use client'` patterns for Next.js
- The broader Next.js app can remain as Server Components; only the map component needs client-side rendering
- No fundamental friction, but developers must be aware of the client boundary

### The React Google Maps Library Decision

**@vis.gl/react-google-maps** is the clear winner for new projects in 2025/2026:

| Factor | @vis.gl/react-google-maps | @react-google-maps/api |
|---|---|---|
| **Governance** | OpenJS Foundation (neutral, same org as Node.js), provisioned by Google Maps Platform | Single individual owner |
| **Maintenance** | Active (v1.7.1 as of Nov 2025), React 19 support | Slower cadence, React 19 issues reported |
| **Google backing** | Officially promoted by Google Maps Platform blog | Community-driven, no official Google involvement |
| **AdvancedMarker** | Full support with React children as content | Not natively supported |
| **deck.gl integration** | First-class | Not designed for it |
| **SSR support** | StaticMap component (v1.5.0+) | None |
| **TypeScript** | Full comprehensive types | Good but less comprehensive |
| **Bundle size** | Smaller core, extensible via examples | Moderate |

The official Google Maps Platform blog states: *"The @vis.gl/react-google-maps library, developed by Google Maps Platform and the vis.gl team, continues to provide a powerful and streamlined way to integrate Google Maps into React."*

**Recommendation:** Use `@vis.gl/react-google-maps` for the map layer.

### TypeScript

There is no reason not to use TypeScript for this project:
- Both candidate React wrappers have full TypeScript support
- The pipeline (geocode -> roads -> routes -> candidates -> LLM) benefits from typed interfaces at every stage
- No runtime overhead in production (compiled away)
- Catches coordinate type mismatches (string vs number), undefined optional fields, and API response shape changes at compile time
- The only hypothetical argument against TS (faster prototyping) is irrelevant here because the API shapes are well-known and the pipeline stages have clear input/output contracts

### Backend: Next.js API Routes vs Separate Backend

Given the self-hosted Hetzner VPS deployment:

**Key constraint removed: no Vercel function timeouts**
- Vercel Hobby: 10s timeout limit
- Vercel Pro: 30s (60s with add-on)
- Self-hosted: no hard limit (bounded only by proxy config, e.g. nginx `proxy_read_timeout`)
- This matters because the full pipeline (geocoding multiple addresses + Overpass API queries + Directions API + LLM call) could easily exceed 10-30 seconds

**Performance comparison on VPS (Better Stack Community benchmarks):**

| Metric | Next.js Default Server | Next.js + Fastify Custom Server | Separate Fastify Backend |
|---|---|---|---|
| SSR throughput | ~51 req/s | ~271 req/s (5x faster) | ~487 req/s |
| p50 latency | 12.4ms | 4.1ms | -- |
| Memory | ~320MB | ~210MB | Minimal |
| Cold start | ~1200ms | ~450ms | Instant |

**Architecture considerations:**

Next.js on VPS advantages:
- Single process, single deployment
- End-to-end TypeScript (server + client)
- Fast prototyping for MVP
- Built-in API routes for the pipeline orchestration

Separate backend advantages:
- The pipeline is fundamentally backend work (server-side API orchestration); Next.js API routes add unnecessary abstraction
- Background job processing (BullMQ + Redis) is natural with a persistent backend process
- No framework lock-in for the backend (could swap Python later for ML extensions)
- Better performance for raw API serving (no SSR overhead for what is essentially data endpoints)

**However**, for an MVP:
- A single Next.js app on the Hetzner VPS is significantly simpler to deploy and maintain
- The performance advantage of a separate backend only matters at scale
- Next.js API routes running as a long-lived Node process (not serverless functions) have no real timeout issues on a VPS
- If the pipeline becomes a bottleneck, it can be extracted into a worker later

### Background Job Requirements

The pipeline takes a few seconds to potentially over a minute depending on:
- Number of addresses being analyzed (geocoding N addresses is N API calls)
- Overpass API query time (varies by region)
- LLM processing time (can be 5-30 seconds for thorough analysis)

**Current estimate:** A typical analysis of one street with ~20 candidate locations probably takes 8-20 seconds total. This is within what a synchronous API route can handle on a VPS (no hard timeout). However:

- If the user waits synchronously for 20+ seconds, they need good loading UI (progress indicators per pipeline stage, streaming where possible)
- If analysis time grows (multi-street, multi-property analysis), the pipeline may need async job queues
- BullMQ + Redis is the standard pattern for Node.js background jobs

**Verdict for MVP:** Start with synchronous API routes. Add BullMQ async processing only if analysis times prove too long for synchronous wait. The self-hosted VPS gives the flexibility to make this decision later without platform constraints.

### Monorepo Structure

A monorepo (one repo, shared config, potentially multiple packages) is standard practice. Options:
- **Turborepo**: Well-suited for a Next.js app with shared types package
- **pnpm workspaces**: Simpler, enough for two-package setup (frontend + shared types)
- **Nx**: Overkill for this project size

**Recommendation:** Start without a formal monorepo tool. A single Next.js app with a `/src/lib` directory for shared types and API utilities is simplest. If the backend separates, adopt pnpm workspaces at that point.

### Deployment on Hetzner VPS

- Docker Compose is the standard approach for self-hosting Next.js on a VPS
- Single Dockerfile for a Next.js app; nginx reverse proxy with Let's Encrypt (Caddy is simpler)
- If background jobs are added: Docker Compose with services: `nextjs`, `bullmq-worker`, `redis`, `nginx`
- Hetzner CX22 (2 vCPU, 4GB RAM, ~$8-10/month) is sufficient for the MVP

## Source Assessment

- **High confidence**: `@vis.gl/react-google-maps` is the recommended React library for Google Maps (Google officially backs it, active maintenance, OpenJS Foundation governance)
- **High confidence**: TypeScript is the right choice (no valid counterarguments for this project type)
- **High confidence**: Self-hosting removes Vercel's 10-30s time limit constraints
- **Medium confidence**: Next.js on VPS vs separate backend recommendation - the research supports both; the decision depends on whether the team values deployment simplicity (Next.js monolith) or architectural flexibility (separate backend)
- **Medium confidence**: Pipeline timing estimates are speculative without profiling real API calls with the Overpass API
- **Low confidence**: Background job necessity - depends entirely on how many addresses are analyzed per run and how long Overpass API queries take in practice

## Recommendation

**MVP Tech Stack (simplest path):**

| Layer | Choice | Rationale |
|---|---|---|
| **Frontend** | Next.js 14+ (App Router) | Single deployable, good DX, no architectural complexity |
| **Map** | @vis.gl/react-google-maps | Official Google-backed React wrapper, best maintained |
| **Language** | TypeScript (entire stack) | Type safety across pipeline stages, zero downsides |
| **Backend** | Next.js API routes (initially) | Low complexity for MVP; long-running process on VPS has no 10s limit |
| **Async jobs** | Deferred (BullMQ if needed) | Start sync, add async only if pipeline proves too slow |
| **Deployment** | Docker Compose on Hetzner CX22 | ~$8-10/month, single docker-compose.yml |
| **Monorepo** | Single Next.js app, then pnpm workspaces if backend splits | Avoid over-engineering monorepo tooling at MVP stage |

**If the backend grows beyond MVP (recommended evolution path):**

Migrate the pipeline orchestration (geocode -> roads -> routes -> candidates -> LLM) into a separate Fastify server. Keep Next.js as the frontend. Use Docker Compose to run both. The `@vis.gl/react-google-maps` map integration stays the same; only the API call destinations change.

## Gaps / Risks

- The Overpass API query performance is unknown for this specific use case (finding roads near addresses). If Overpass queries are slow (5+ seconds each), the synchronous approach becomes problematic and async jobs may be needed earlier
- No Oracle Database driver compatibility needed (good - one less dependency)
- LLM streaming (token-by-token response) through Next.js API routes is well-supported via the Web Streams API but requires careful implementation to avoid tying up the event loop during the 5-30 second forward-proxy LLM call
- If the tool ever needs to handle simultaneous users, SQLite locking and Next.js single-process limitations could become bottlenecks; this is a future concern, not an MVP concern
- Docker on Hetzner requires basic DevOps knowledge; the team should be comfortable with Dockerfiles and docker-compose.yml
- Cold start for `@vis.gl/react-google-maps` (loading the Maps JS API) is ~1-2 seconds on first visit; this is acceptable but needs a loading skeleton
