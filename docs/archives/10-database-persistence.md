# Topic 10: Database and Persistence

## Decision Needed
Whether to persist anything in an MVP, and if so, what and how.

## Findings

### Cost of Re-running Analysis

**Google Maps API costs (post-March 2025 pricing):**
- Geocoding API: $5.00 per 1,000 requests (Essentials tier), with 10,000 free per month
- Routes API (Directions replacement): $5.00 per 1,000 requests, with 10,000 free per month
- Dynamic Maps (display): $7.00 per 1,000 loads, with 10,000 free per month

**Per-analysis cost estimate:**
- One analysis with 20 candidate locations:
  - 1 geocoding call for the target address: $0.005
  - 1 Directions call (routes to all candidates): $0.005 (or $0.01 for a Route Matrix)
  - 1 Dynamic Maps load (user viewing results): $0.007
  - Total Maps cost per analysis: roughly $0.01-0.02

**LLM analysis cost:**
- Using GPT-4o mini (good enough for this task): $0.15/M input tokens, $0.60/M output tokens
- If each analysis sends ~2000 input tokens and generates ~500 output tokens: ~$0.0006 per analysis
- Using Claude 3.5 Sonnet: $3.00/M input, $15.00/M output: ~$0.0135 per analysis

**Total per analysis: approximately $0.01-0.03 with a cheap LLM, $0.02-0.05 with a premium LLM.**

At these costs, re-running analysis for every page load is **financially viable for light use** (~$1-5 for 100 analyses). However, this assumes all addresses analyzed are unique. If the same address is analyzed 10 times during development or by the same user, that's wasted money.

### Caching Intermediate API Responses

Caching geocoding and Directions API responses provides several benefits:
- **Cost reduction**: Every cache hit eliminates a paid API call. Geocoding caching is documented as Google's own #1 optimization recommendation (via Sanborn, a Google Cloud Partner)
- **Latency reduction**: In-memory cache hits are milliseconds vs 200-2000ms for API calls
- **Rate limit avoidance**: Google enforces 3,000 QPM on geocoding; caching prevents `OVER_QUERY_LIMIT` errors
- **Cache hit rates >90%**: In practice, especially when users analyze the same addresses, nearby addresses round to similar coordinates, or developers iterate during testing

Google's geocoding ToS allows caching lat/lng results for up to 30 days; `place_id` can be cached indefinitely.

**Recommendation: Cache geocoding and Directions responses in MVP.** Even a simple in-memory cache reduces costs meaningfully. For persistence across server restarts, an SQLite cache is trivially maintainable.

### Shareable URLs: What Persistence Is Needed

If the tool needs shareable result URLs (a likely requirement for real estate agents sharing with clients or colleagues):

**Option 1: Full URL encoding** - Fails. A typical analysis result JSON for 20 candidates is several KB. URL length limits (varies by browser, ~2000 chars for IE, ~8000 for most modern browsers) make this impractical even with compression.

**Option 2: Short ID + stored result** - The standard pattern. Store the result JSON with a short random ID (nanoid or UUID). The URL contains only the ID: `signplacement.app/results/abc123xyz`. When loaded, the server looks up the result from storage. This requires persistence.

**Minimum needed for shareable URLs:**
- Store: result JSON blob + creation timestamp + short unique ID
- No user accounts required
- Result data is self-contained (no relational structure needed)
- A TTL-based cleanup of old results (30-90 days) prevents unlimited storage growth

### SQLite vs File-Based JSON vs PostgreSQL for This Use Case

For a self-hosted, single-user (or small team) MVP on a Hetzner VPS:

| Factor | JSON Files | SQLite | PostgreSQL |
|---|---|---|---|
| **Setup complexity** | Zero (just write files) | Zero (single file, no server) | Moderate (install, configure, pool) |
| **Query capability** | Load and filter in code | Full SQL with indexes | Full SQL with advanced features |
| **Atomic writes** | No (partial write = corruption) | Yes (ACID, WAL mode) | Yes |
| **Concurrent access** | Dangerous (corruption risk) | WAL mode handles readers + 1 writer | Full concurrent access |
| **Backup** | rsync files | Copy single .db file | pg_dump |
| **Performance (single user)** | Fast for small datasets | Extremely fast (in-process, no network) | Fast but has TCP overhead |
| **RAM usage** | Minimal | Minimal (file cache) | Moderate (shared_buffers) |
| **Scalability limit** | Becomes slow >1000 records | Handles millions of records | Handles billions |

**SQLite is decisively better than JSON files** for this use case:
- Atomic writes prevent corruption if a write is interrupted (critical for share URLs)
- SQL queries (`SELECT * FROM results WHERE id = ?`) are simpler and faster than parsing and searching JSON files
- WAL mode allows concurrent reads while a write is happening
- A 64MB cache setting handles result storage easily (thousands of analyses at ~10-50KB each)
- No database server to manage - just a file

**SQLite is sufficient vs PostgreSQL** for MVP:
- Single-writer locking is irrelevant (single user or small team)
- No need for row-level security, advanced JSON indexing, or replication
- If scale demands emerge later, migration via an ORM (Prisma/Drizzle) is a one-line config change
- The SQLite forum and numerous case studies confirm SQLite handles millions of records on a single VPS with WAL PRAGMAs

### What Persistence Is Actually Needed for MVP

Three categories of data this tool could persist:

1. **Intermediate API cache** (geocoding, directions responses): Strongly recommended. Reduces cost and latency. SQLite is ideal for this.

2. **Analysis results** (for shareable URLs): Only needed if share URLs are an MVP feature. If shareability is deferred, results don't need persistence at MVP.

3. **Analysis history / user preferences**: Not needed for MVP. Historical analysis data and user preferences can be added later.

**If shareable URLs are deferred:** The MVP has no persistence requirement beyond an optional API cache. Everything can be ephemeral (compute results, display on map, discard on page refresh).

**If shareable URLs are needed at MVP:** The minimum persistence is a single table:

```sql
CREATE TABLE analysis_results (
  id TEXT PRIMARY KEY,           -- short nanoid (e.g., "abc123xyz")
  created_at TEXT NOT NULL,      -- ISO 8601 timestamp
  expires_at TEXT NOT NULL,      -- auto-cleanup timestamp (30-90 days)
  input_data TEXT NOT NULL,      -- JSON: the input (address, params)
  result_data TEXT NOT NULL      -- JSON: the full analysis result
);

CREATE INDEX idx_results_expires ON analysis_results(expires_at);
```

That's it. One table, one index. No relations, no joins, no user accounts.

### Practical SQLite Setup for Self-Hosted VPS

For Node.js, `better-sqlite3` is the recommended SQLite driver (synchronous but fast, no event loop blocking for the tiny queries this tool needs). Recommended production PRAGMAs:

```sql
PRAGMA journal_mode = WAL;      -- Concurrent reads + writes
PRAGMA busy_timeout = 5000;     -- Wait 5s if locked
PRAGMA synchronous = NORMAL;    -- Safe with WAL, 2x faster than FULL
PRAGMA cache_size = -64000;     -- 64MB page cache
PRAGMA foreign_keys = ON;       -- Enforce FK constraints (for later)
```

For an ORM, Drizzle ORM has excellent SQLite support and makes future migration to PostgreSQL straightforward. Prisma also supports SQLite but has larger overhead.

### Estimated Storage Requirements

- One analysis result: ~10-50KB as JSON (address, candidate locations, scores, LLM text)
- API cache entries: ~1-2KB each (lat/lng pairs, place IDs)
- 1000 analyses stored + 5000 cache entries: ~50-150MB total
- Well within SQLite's comfortable range (handles terabytes; degrades gracefully in multi-GB range)

## Source Assessment

- **High confidence**: Per-analysis cost is $0.01-0.05 based on published Google Maps API pricing and known LLM token costs
- **High confidence**: Geocoding/Directions caching is high-ROI (Google's own recommendation, multiple project case studies)
- **High confidence**: SQLite is sufficient for MVP storage on a single-user VPS (SQLite production case studies, performance benchmarks, community consensus)
- **High confidence**: URL-encoded results are impractical for multi-candidate analysis data (URL length limits)
- **Medium confidence**: Shareable URLs are needed for real estate use case - inferred from domain knowledge, not directly researched
- **Medium confidence**: 30-day TTL for cached results is reasonable - Google allows 30-day geocoding cache; similar duration for analysis results seems appropriate

## Recommendation

**Layered persistence strategy for MVP:**

1. **YES -- Cache API responses immediately.** Implement a simple geocoding/Directions API cache using SQLite. This pays for itself in cost savings and latency reduction from day one. The overhead is minimal (one table, one helper function).

2. **DEFER -- Full analysis result persistence unless share URLs are required.** If shareable URLs are a launch requirement, add a single `analysis_results` table as described above. If not, defer entirely -- results are ephemeral, and the tool re-computes on every visit.

3. **NO -- User accounts, history, preferences, or relational data at MVP.** These can be layered on top of the existing SQLite database later if needed. The schema is trivial to extend.

**The database choice is SQLite** (via `better-sqlite3`), stored as a file in a persistent volume on the Hetzner VPS. This costs nothing to operate, requires no server process, and backs up with a single `cp` command.

**If shareable URLs are deferred:** The entire data layer at MVP is a SQLite file with one table for the API cache. The rest is in-memory computation. This is the simplest possible persistence strategy.

**Future evolution path:** If the tool grows to multiple users or needs concurrent access patterns that SQLite cannot handle, migration to PostgreSQL via Drizzle ORM is a one-line config change. This should not be done at MVP.

## Gaps / Risks

- No measurement of actual Overpass API query costs (Overpass is free but rate-limited; the real question is whether rate limits make caching essential)
- The exact size of a full analysis result JSON is unknown without building the pipeline; if results are larger than 50KB each, storage estimates change
- If the tool processes batch analyses (e.g., 50 addresses at once across a whole neighborhood), per-analysis costs scale linearly -- this could change the cost-benefit of caching
- Google's ToS for caching geocoding results should be reviewed in detail; 30-day cache is allowed but specific terms vary by API
- SQLite on a Docker volume can have subtle issues with WAL files on networked filesystems; for a single VPS with a bind mount, this should not be a problem, but worth noting
- The share URL feature implicitly requires that the analysis result is stable and reproducible; if the pipeline changes (scoring algorithm, LLM prompt), old share URLs produce results computed with the old pipeline -- version-stamping stored results may be needed
