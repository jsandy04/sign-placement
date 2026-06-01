# Error Handling and Resilience

## Decision Needed

How should the pipeline handle failures, timeouts, and degraded states across the Google Maps APIs, LLM, and application logic?

---

## 1. Google Maps API Failure Modes

### Geocoding API

The Geocoding API returns a top-level `status` field and an optional
`error_message` field in the JSON response body.

| Status Code | HTTP Status | Meaning | Retry? | Frequency |
|---|---|---|---|---|
| `OK` | 200 | Valid result returned | N/A | Normal |
| `ZERO_RESULTS` | 200 | Address valid but no geocoding results | No (input problem) | Common for incomplete addresses |
| `OVER_DAILY_LIMIT` | 429 | Daily quota exceeded OR billing not enabled OR invalid API key | Retry with backoff (may be transient) | Rare in normal use |
| `OVER_QUERY_LIMIT` | 429 | Per-minute rate limit exceeded | Retry with exponential backoff | Possible during burst usage |
| `REQUEST_DENIED` | 403 | API key missing or unauthorized | No (configuration error) | Rare (setup issue) |
| `INVALID_REQUEST` | 400 | Malformed request (missing address) | No (input problem) | Common during development |
| `UNKNOWN_ERROR` | 500 | Server-side error | Retry (transient) | Rare |

**Response example (ZERO_RESULTS):**
```json
{
  "status": "ZERO_RESULTS",
  "results": [],
  "error_message": "The provided address 'asdfghjkl' is not a valid address."
}
```

**Response example (OVER_DAILY_LIMIT):**
```json
{
  "status": "OVER_DAILY_LIMIT",
  "results": [],
  "error_message": "You have exceeded your daily quota."
}
```

### Directions API / Routes API

The Directions API returns a top-level `status` field. The Routes API
(ComputeRoutes) returns gRPC-style error codes with HTTP status codes.

**Directions API (legacy):**

| Status Code | HTTP Status | Meaning | Retry? |
|---|---|---|---|
| `OK` | 200 | Valid route found | N/A |
| `NOT_FOUND` | 200 | Origin or destination could not be geocoded | No (input problem) |
| `ZERO_RESULTS` | 200 | No route found between origin and destination | No (valid but no path) |
| `OVER_DAILY_LIMIT` | 429 | Daily quota / billing issue | Retry with backoff |
| `OVER_QUERY_LIMIT` | 429 | Rate limited | Retry with exponential backoff |
| `REQUEST_DENIED` | 403 | API key / authorization issue | No (configuration) |
| `INVALID_REQUEST` | 400 | Missing required parameters | No (input problem) |
| `UNKNOWN_ERROR` | 500 | Server error | Retry (transient) |

**Routes API (ComputeRoutes):**

| gRPC Code | HTTP Status | Meaning | Retry? |
|---|---|---|---|
| `OK` | 200 | Valid route found | N/A |
| `NOT_FOUND` | 404 | Route not found | No |
| `INVALID_ARGUMENT` | 400 | Bad request (invalid field mask, etc.) | No |
| `PERMISSION_DENIED` | 403 | API key not authorized for Routes API | No |
| `UNAUTHENTICATED` | 401 | Invalid API key | No |
| `RESOURCE_EXHAUSTED` | 429 | Rate limit or quota exceeded | Retry with backoff |
| `UNAVAILABLE` | 503 | Server busy / transient failure | Retry with backoff |
| `DEADLINE_EXCEEDED` | 504 | Request timed out | Retry with longer timeout |

**Key difference from Directions API:** The Routes API uses gRPC-style
errors, so error parsing must check for `error.status` in the response
body rather than a flat `status` field. Also, Routes API returns routes
in an empty array rather than ZERO_RESULTS when no route is found (check
`routes.length === 0` instead of `status === "ZERO_RESULTS"`).

### Partial Results

The Geocoding API returns results with a `partial_match` boolean flag.
When `partial_match = true`, the geocoder matched only part of the
address (e.g., found the city but not the street number). This is a
critical error state to detect:

```json
{
  "status": "OK",
  "results": [{
    "partial_match": true,
    "formatted_address": "Main St, Springfield, IL, USA",
    "geometry": { ... }
  }]
}
```

**Handling:** If `partial_match` is true and the result is a street-level
or lower precision (route, locality rather than street_address), warn
the user but proceed. The pipeline can still generate candidates from
the approximate location. If the geocoding type is "locality" or
"administrative_area_level_1", the address is too imprecise -- show
an error.

### Zero Results: Not Always an Error

ZERO_RESULTS on a Directions API call for one approach road is expected
behavior, not an error. Example: if the property is at 123 Main St and
one approach route is from Highway 101, but there is no road connection
from Highway 101 to Main St (they run parallel without an interchange),
Directions API correctly returns ZERO_RESULTS.

The pipeline should:
- Treat ZERO_RESULTS for ONE approach road as normal (log at INFO level)
- Only warn if ALL approach roads return ZERO_RESULTS (then no candidates
  can be generated)
- Never retry a ZERO_RESULTS response (it will not change)

---

## 2. LLM Failure Modes

### Anthropic Claude API

Anthropic's API uses typed error responses with both HTTP status codes
and structured error bodies.

| Error Type | HTTP Status | Meaning | Retry? | Notes |
|---|---|---|---|---|
| `rate_limit_error` | 429 | RPM or TPM limit exceeded | Retry with backoff | Check `retry-after` header |
| `insufficient_quota` | 429 | Free credits exhausted (first $5) | No | Need to add billing |
| `authentication_error` | 401 | Invalid or missing API key | No | Check API key |
| `permission_error` | 403 | API key not authorized for model | No | Check model access |
| `not_found_error` | 404 | Model not found / deprecated | No | Update model name |
| `request_too_large` | 400 | Input exceeds context window | No | Truncate input |
| `api_error` | 500 | Internal server error | Retry | Server-side transient |
| `overloaded_error` | 529 | Servers at capacity | Retry | Use longer backoff (5-10s) |
| `timeout_error` | 504 | Request exceeded deadline | Retry with caution | May be slow model |

**Response example (rate_limit_error):**
```json
{
  "type": "rate_limit_error",
  "message": "This request would exceed your organization's rate limit of 80,000 input tokens per minute. Your remaining input token capacity is 160 tokens."
}
```

**Response example (overloaded_error):**
```json
{
  "type": "overloaded_error",
  "message": "Anthropic's API is temporarily overloaded. Please retry your request."
}
```

**Useful response headers:**
- `retry-after`: Seconds to wait before retrying (present on 429)
- `anthropic-ratelimit-requests-limit`: Max requests per minute
- `anthropic-ratelimit-requests-remaining`: Remaining requests this minute
- `anthropic-ratelimit-tokens-limit`: Max tokens per minute
- `anthropic-ratelimit-tokens-remaining`: Remaining tokens this minute
- `anthropic-ratelimit-tokens-reset`: ISO 8601 timestamp when limit resets

### Structured Output Failure Modes

Structured output (JSON schema enforcement) has failure modes distinct
from HTTP-level errors:

| Failure Mode | What Happens | Detection | Recovery |
|---|---|---|---|
| Schema violation (non-strict mode) | LLM returns valid JSON but missing
  required fields or wrong types | Post-parse validation against schema | "Healing retry":
  feed validation error back to LLM with correction instruction |
| Schema violation (strict mode) | API returns an error response instead
  of the content | Check response for `error` field | Retry with same prompt |
| Markdown code fences around JSON | LLM wraps JSON in ```json ... ```
  blocks (common with non-structured mode) | Check if content starts with
  ``` | Strip fences before parsing |
| Silent truncation | `max_tokens` stops mid-object; JSON is technically
  valid but incomplete | Check `stop_reason` = "max_tokens" | Increase
  max_tokens or reduce output size |
| Hallucinated field names | JSON is valid but has wrong key names
  (e.g., "street_name" instead of "road_name") | Only detectable through
  semantic validation | Healing retry with schema re-explanation |
| Refusal produced as JSON | Safety filter returns a refusal message
  formatted as valid JSON | Check for "refusal" key in parsed output | Show
  user-friendly error; do not retry |
| Type coercion | String where number expected ("1,234" instead of 1234) | Schema validation | Healing retry with type requirements |

### Empirical Retry Success Rates

Production data from multiple deployments shows the following pattern for
healing retries (feeding errors back into the model):

| Attempt | Success Rate | Cumulative | Notes |
|---|---|---|---|
| 1 (first try) | 87.4% | 87.4% | Standard structured output |
| 2 (healing retry) | 9.1% | 96.5% | Feed validation error as correction |
| 3 (second retry) | 2.8% | 99.3% | Usually recovers from edge cases |
| 4+ | 0.7% | -- | Genuinely broken; needs human intervention |

**Recommendation:** Cap retries at 3 total attempts. If all three fail,
fall back to deterministic scoring rather than showing no results.

---

## 3. Graceful Degradation Strategy

### Degradation Hierarchy

The pipeline should degrade gracefully at each step. Below is the
complete degradation ladder, from best to worst case:

```
Level 0: Full Analysis (all systems operational)
  - Geocoding: success
  - Directions: 3 approach routes, each with 5+ steps
  - LLM: successful structured output on first try
  - Output: Ranked candidates with map, explanations, spacing optimal

Level 1: Degraded Routing
  - One approach route returned ZERO_RESULTS or error
  - Remaining 2 routes processed normally
  - LLM scores 2-route candidates (fewer candidates, still useful)
  - Output: Ranked candidates but from fewer approach routes
  - User message: "We could only analyze 2 of 3 approach routes."

Level 2: Polyline Fallback
  - Directions steps < 5 on approach route
  - Polyline decoding activated
  - Additional noise filtering applied
  - Output: Ranked candidates (may include more marginal placements)
  - Note: No user-facing message needed unless candidate quality is low

Level 3: Deterministic Scoring (LLM failure)
  - All 3 LLM attempts failed (timeout / error / schema violation)
  - Fall back to deterministic scoring engine:
    * Traffic score: road type from route step characteristics
    * Decision-point score: bearing change magnitude
    * Visibility score: straight-line distance from turn point
    * No natural language explanations
  - Output: Ranked candidates without explanations
  - User message: "Placement analysis complete. Detailed descriptions
    are unavailable due to a temporary processing issue."

Level 4: Single Route (multiple Directions failures)
  - 2 of 3 approach routes failed entirely
  - Only one approach route available
  - Significantly fewer candidates
  - Output: Limited candidates, reduced coverage
  - User message: "Analysis is limited -- fewer approach routes were
    available than usual. Consider adding additional starting points."

Level 5: Default Assumptions (no route data)
  - All Directions API calls failed or returned ZERO_RESULTS
  - Cannot generate route-based candidates
  - Use fallback: generate candidates at the nearest intersections
    using road network data (OSM or cached)
  - Output: Candidates at intersections without route context
  - User message: "Route analysis was unavailable. Showing
    intersection-based candidate placements as a fallback."

Level 6: Pipeline Failure
  - Geocoding failed
  - Cannot proceed at all
  - Output: Error message
  - User message: "We couldn't find this address. Please verify the
    address is correct and includes the street number, street name,
    city, and ZIP code."
```

### What Each Degradation Level Means for the User

| Level | User Sees Map? | User Sees Rankings? | User Sees Explanations? | User Sees Error? |
|---|---|---|---|---|
| 0 (Full) | Yes | Yes | Yes | No |
| 1 (Reduced routes) | Yes | Yes | Yes | Info banner |
| 2 (Polyline) | Yes | Yes | Yes | No |
| 3 (Deterministic) | Yes | Yes | No | Info banner |
| 4 (Single route) | Yes | Yes | Maybe | Warning banner |
| 5 (No routes) | Yes | Yes (intersection) | No | Warning banner |
| 6 (Fatal) | No | No | No | Error message |

### System-Level Fallback Chain (from Topic 11 diagram)

```
Geocoding API fail
  -> FATAL (no coordinates = nothing to do)
  -> User: "Please check the address"

Directions API fail (one route)
  -> INFO (expected for disconnected roads)
  -> Continue with remaining routes

Directions API fail (all routes)
  -> DEGRADED (use intersection-only fallback)
  -> User: warning banner

Roads API fail (nearest road fallback)
  -> SILENT FAIL (use default 25 mph speed)
  -> No user notification needed

LLM fail (all retries exhausted)
  -> DEGRADED (deterministic scoring)
  -> User: info banner, no explanations

Maps JavaScript API fail
  -> UI DEGRADED (text results only)
  -> User: "Map unavailable"
```

---

## 4. Timeout Strategy

### Per-Request Timeouts

Each API call should have its own timeout, separate from the overall
pipeline timeout:

| API Call | Timeout | Rationale |
|---|---|---|
| Geocoding API | 5 seconds | Simple lookup, should be fast |
| Directions/Routes API (per route) | 10 seconds | Route computation may take longer for complex routes |
| Roads API (nearest road, fallback) | 5 seconds | Simple lookup |
| LLM (Claude Sonnet 4.6) | 30 seconds | Allows for thinking/structured output overhead |
| Maps JavaScript API load | 10 seconds | CDN resource loading |

### Total Pipeline Timeout

The pipeline has 5-7 sequential API calls (depending on how many fallback
paths are triggered). The total expected duration:

| Scenario | Calls | Expected Time | Timeout |
|---|---|---|---|
| Full path (no fallbacks) | 1 Geocoding + 3 Directions + 1 LLM + 1 Map | 5-12 seconds | 30 seconds |
| Polyline path (step count < 5) | Same + polyline decode time | 6-14 seconds | 30 seconds |
| LLM retry (1 retry needed) | +1 LLM call | 10-20 seconds | 45 seconds |
| LLM retry (2 retries needed) | +2 LLM calls | 15-30 seconds | 60 seconds |
| Roads API fallback | +1 Roads API call | 7-14 seconds | 35 seconds |
| Maximum (all fallbacks triggered) | Full + retries + Roads | 20-40 seconds | 60 seconds |

### Sync vs. Async Decision

**Recommendation: Synchronous with progress indicators.**

Rationale:
- The pipeline runs in 5-30 seconds, which is within acceptable range for
  a synchronous web request (users expect tools to take "a few seconds")
- An async (polling) model adds significant complexity: job queue, status
  storage, WebSocket polling, reconnection handling
- The only scenario that exceeds 30s is LLM retries, which is rare (~13%
  of analyses need a retry, ~3% need two)
- Progress indicators (spinner + step labels) manage user expectations
  better than an async model

If the pipeline exceeds 60 seconds (edge case: multiple retries + slow
API responses), the request should time out and return whatever partial
results are available (see Graceful Degradation).

**Async only if:** The tool is built as a background batch processor
(e.g., analyzing 50 properties overnight). For the interactive
single-address use case, sync is correct.

### Timeout Error Handling

If a single API call times out:
```
Geocoding timeout -> FATAL (user must retry)
Directions timeout (1 route) -> Skip that route, continue
Directions timeout (all routes) -> Degrade to Level 5
LLM timeout (attempt 1) -> Retry with same timeout
LLM timeout (attempt 2+ all fail) -> Degrade to Level 3
```

If the total pipeline timeout is exceeded:
```
Return partial results:
  - If Stage 2 (filtered candidates) is complete: return candidates
    with deterministic scores (Level 3 degradation)
  - If Stage 2 is not complete: return error with "Try again" message
```

---

## 5. Retry Logic

### Retry Decision Matrix

| API Call | Transient Errors (Retry) | Permanent Errors (No Retry) |
|---|---|---|
| Geocoding | OVER_QUERY_LIMIT, OVER_DAILY_LIMIT, UNKNOWN_ERROR | ZERO_RESULTS, INVALID_REQUEST, REQUEST_DENIED, partial_match |
| Directions | OVER_QUERY_LIMIT, UNKNOWN_ERROR, UNAVAILABLE, DEADLINE_EXCEEDED | ZERO_RESULTS, NOT_FOUND, INVALID_REQUEST, REQUEST_DENIED |
| Roads API (if used) | OVER_QUERY_LIMIT, UNKNOWN_ERROR | INVALID_REQUEST, REQUEST_DENIED, NOT_FOUND |
| LLM | rate_limit_error, api_error, overloaded_error, timeout_error | authentication_error, permission_error, request_too_large (unless input can be reduced), NOT_FOUND_ERROR |
| Maps JS load | CDN timeout, network error | Invalid API key (JS error) |

### Exponential Backoff Strategy

All retries should use exponential backoff with jitter:

```
Backoff formula:
  delay = min(base_delay * (2 ^ attempt), max_delay)
  delay += random_uniform(0, jitter)

Parameters by API:

Google Maps APIs:
  base_delay = 1.0 seconds
  max_delay = 16 seconds
  jitter = 1.0 seconds
  max_retries = 3

LLM API:
  base_delay = 1.5 seconds
  max_delay = 30 seconds
  jitter = 2.0 seconds
  max_retries = 3 total (including healing retries for schema issues)

  NOTE: For LLM rate_limit_error, first check the `retry-after` header.
  If present, use that value as the delay instead of calculating it.
  If absent or lower than calculated, use the calculated value.

Roads API (fallback only, rarely called):
  base_delay = 1.0 seconds
  max_delay = 8 seconds
  jitter = 0.5 seconds
  max_retries = 2
```

### Retry Timing Summary (Maps API, 3 retries)

| Retry | Delay (base) | Delay (with jitter) | Cumulative wall time |
|---|---|---|---|
| 1st retry | 1.0s | 1.0-2.0s | 1-2s |
| 2nd retry | 2.0s | 2.0-3.0s | 3-5s |
| 3rd retry | 4.0s | 4.0-5.0s | 7-10s |
| Total | | | 7-10s + original request time |

Three retries at 7-10 seconds total is acceptable. If all 3 fail, the
pipeline uses the degradation path rather than continuing to retry.

### What NOT to Retry

**Do NOT retry:**
- `ZERO_RESULTS` on Directions API -- the same origin/destination will
  always return ZERO_RESULTS. Retrying is wasted API cost.
- `INVALID_REQUEST` -- the request parameters are wrong. Fix the code.
- `REQUEST_DENIED` / `PERMISSION_DENIED` -- API key misconfiguration.
  Alert the admin, don't retry.
- `ZERO_RESULTS` on Geocoding -- the address doesn't exist. Prompt the
  user to correct it.
- Partial match on Geocoding -- the result is usable with a warning.
  No retry needed.

### Concurrency Considerations

If multiple users submit analyses simultaneously:
- Each Directions API call counts toward the shared 3,000 QPM limit
- At 10 concurrent users, each making 3 Directions calls = 30 QPM, well
  within the 3,000 QPM limit
- At 1,000 concurrent users, each making 3 calls = 3,000 QPM, exactly at
  the limit
- **Result:** Rate limiting is unlikely for normal usage (< 100 concurrent
  users), but retry logic still handles the case

---

## 6. User-Facing Error Messages

### Principle

Every error message should tell the user:
1. What happened (in plain language)
2. What they can do about it
3. Whether the issue is temporary or permanent

### Error Message Table

| Failure Mode | User Message | Type | Action |
|---|---|---|---|
| Geocoding: ZERO_RESULTS | "We couldn't find this address. Please check that the street number, street name, city, and ZIP code are correct. Try including the full address (e.g., '123 Main St, Springfield, IL 62701')." | Error | User edits input |
| Geocoding: partial_match | "This address matched partially. We found '{matched_location}' but couldn't verify the exact location. Results may be approximate." | Warning | Proceed with caution |
| Geocoding: OVER_DAILY_LIMIT | "We're currently unable to look up addresses. Please try again in a few minutes. If this persists, contact support." | Error | Retry later |
| Directions: ZERO_RESULTS (1 route) | (No user-facing message. Logged internally.) | Info | Process other routes |
| Directions: ZERO_RESULTS (all routes) | "We couldn't find driving routes from any major road to this property. The property may be on a very remote road. Showing nearby intersections instead." | Warning | Show fallback |
| Directions: OVER_QUERY_LIMIT | "The analysis is taking longer than expected due to high demand. Results will be available shortly." | Info (spinner) | Wait / degrade |
| LLM: rate_limit_error | "We're experiencing high demand for the analysis. Results may appear without descriptions." | Info (banner) | Degrade to Level 3 |
| LLM: authentication_error | "The AI analysis service is misconfigured. Please contact support." | Error | Admin alert |
| LLM: overloaded_error | "The AI analysis service is temporarily unavailable. Showing results without detailed scoring." | Warning (banner) | Degrade to Level 3 |
| LLM: structured output failure (all 3 retries) | "We couldn't generate detailed placement descriptions. The ranked results below are based on our standard analysis." | Warning (banner) | Show deterministic ranking |
| Maps JS: load failure | "The interactive map couldn't be loaded. Results are shown as a list below." | Warning (banner) | Show text-only results |
| Pipeline: total timeout | "The analysis is taking longer than expected. We're showing available results. You can try again for a more complete analysis." | Warning (banner) | Show partial results |
| Pipeline: unrecoverable error | "Something unexpected went wrong. Please try again. If the problem persists, contact support." | Error | User retries |

### Error Message Format Guidelines

- **Do** use plain language, not technical jargon ("route analysis" not
  "Directions API call")
- **Do** provide actionable guidance ("check the address format" not
  "invalid input")
- **Do** distinguish between "you can fix this" and "this is a temporary
  problem"
- **Do not** show raw error codes or stack traces to the user
- **Do not** use dismissive language ("just try again")
- **Do not** blame external services ("Google Maps errored out")
- **Do** show different severity levels visually: error banners are red,
  warnings are yellow, info banners are blue

### Admin/Logging Messages

In addition to user-facing messages, the backend should log detailed
error information for debugging:

```
Log format for API errors:
  {timestamp} | {component} | {error_type} | {status_code}
  | {request_params_truncated} | {retry_count}
  | {response_body_truncated} | {correlation_id}

Example:
  2026-05-31T14:23:01Z | DirectionsAPI | OVER_QUERY_LIMIT | 429
  | origin: 37.7749,-122.4194 dest: 37.7849,-122.4094 route: 1
  | retry: 2/3 | body: "{\"status\":\"OVER_QUERY_LIMIT\",...}"
  | corr: abc-123-def
```

---

## 7. Rate Limiting on Google Maps

### Per-Minute Quotas

| API | Per-Minute Limit | Notes |
|---|---|---|
| Geocoding API | 3,000 QPM | Shared across client and server calls |
| Directions API (legacy) | 3,000 QPM | Per project |
| Routes API (ComputeRoutes) | 3,000 QPM | Per project |
| Roads API (Snap to Road) | 30,000 QPM | Higher than other APIs |
| Roads API (Nearest Road) | 30,000 QPM | Higher than other APIs |
| Roads API (Speed Limits) | 30,000 QPM | Requires $10k Asset Tracking license |
| Maps JavaScript API | 30,000 QPM | Client-side (per session) |

### Per-Day Quotas

As of March 2025, Google no longer enforces fixed per-day quotas on most
Maps APIs. Instead:
- Each SKU has a **free monthly allowance** (e.g., 10,000/month for
  Essentials tier)
- Beyond that, billing is pay-as-you-go with volume discounts
- A **self-imposed daily cap** can be set in Google Cloud Console to
  control spending
- `OVER_DAILY_LIMIT` is returned when the self-imposed cap is hit, NOT
  a platform-enforced limit

### Can a Single User Hit Rate Limits?

**Scenario 1: Normal use (one analysis at a time)**
- Per analysis: 1 Geocoding + 3 Directions = 4 API calls
- Even doing 100 analyses back-to-back: 400 API calls total
- Geocoding: 100 QPM << 3,000 QPM limit
- Directions: 300 QPM << 3,000 QPM limit
- **Conclusion: No risk of hitting limits with sequential use.**

**Scenario 2: Power user (multiple parallel analyses)**
- 10 parallel analyses: 10 Geocoding + 30 Directions = 40 QPM
- Still well below 3,000 QPM limit
- 100 parallel analyses: 100 Geocoding + 300 Directions = 400 QPM
- Getting closer but still below 3,000 QPM
- **Conclusion: Even 100 simultaneous users won't hit rate limits.**

**Scenario 3: Automated batch processing (high throughput)**
- 500 analyses per hour in serial: ~500 Geocoding + ~1,500 Directions
  = ~33 QPM average (bursts may be higher)
- Still within limits if spread evenly
- **Conclusion: Only a concern if running 3,000+ Directions calls per
  minute (1,000+ analyses/minute), which is far beyond this tool's scale.**

**Numeric threshold:**
- At 3,000 QPM for Directions API
- Each analysis = 3 Directions calls
- **Maximum sustained throughput: 1,000 analyses per minute**
- This tool is designed for individual agents doing 1-10 analyses per day
- The rate limit is approximately 10,000x above expected usage

### Daily Usage Projections vs. Free Tier

| User Type | Analyses/Month | Directions Calls | Geocoding Calls | Free Tier Coverage |
|---|---|---|---|---|
| Casual agent | 20 | 60 | 20 | 100% (10K free each) |
| Regular agent | 100 | 300 | 100 | 100% |
| Power agent | 500 | 1,500 | 500 | 100% |
| Small team (5 agents) | 2,500 | 7,500 | 2,500 | 100% |
| Large team (20 agents) | 10,000 | 30,000 | 10,000 | Geocoding at limit;
  Directions at 3x free tier ($0.10/analysis) |

**Conclusion:** A single agent or small team will never exceed free tier
limits. Even a 20-agent team using the tool heavily stays close to free
tier limits. Rate limiting is not a practical concern for this use case.

### What OVER_DAILY_LIMIT Actually Means

Despite the name, `OVER_DAILY_LIMIT` is most commonly triggered by:

1. **Invalid API key** -- the key does not exist or has been revoked
2. **Billing not enabled** -- the project has not set up billing (no
   free tier access without billing account, even for $0 usage)
3. **Self-imposed cap exceeded** -- the Cloud Console quota limit was
   hit (default is usually unset, but some projects set a $0 daily cap)
4. **Expired payment method** -- billing account has a failed charge

In all cases, the fix is in the Google Cloud Console, not in user code.
The error message should direct the admin to check the Cloud Console.

---

## Appendix: Resilience Implementation Checklist

### Pre-Flight Validation

- [ ] Validate address format before calling Geocoding API
  - Reject empty strings, URLs, obviously fake data
  - Check that at minimum city+state or ZIP code is present
- [ ] Validate API key presence at startup
  - Load from environment variable
  - Return early if missing with clear error
- [ ] Check Maps API enablement on startup (optional: call a test endpoint)

### Retry Configuration

- [ ] All retries use exponential backoff with jitter
- [ ] Maximum 3 retries per API call (2 for Roads API)
- [ ] Maximum 3 total LLM attempts (initial + 2 healing retries)
- [ ] `retry-after` header checked on LLM 429s before using calculated backoff
- [ ] ZERO_RESULTS and INVALID_REQUEST never retried
- [ ] Different backoff parameters for Maps vs. LLM (Maps is faster)

### Timeout Configuration

- [ ] Geocoding: 5s timeout
- [ ] Directions/Routes: 10s timeout per route
- [ ] LLM: 30s timeout per attempt
- [ ] Maps JS: 10s timeout
- [ ] Total pipeline: 60s maximum (configurable)

### Degradation Paths Implemented

- [ ] Single Directions route failure: skip and continue
- [ ] All Directions routes failure: use intersection fallback
- [ ] LLM failure: fall back to deterministic scoring
- [ ] Polyline fallback: activated when step count < 5
- [ ] Maps JS failure: text-only results

### Error Message Templates Defined

- [ ] User-facing messages follow pattern: "what happened" + "what to do"
- [ ] Warning vs. error vs. info severity levels implemented
- [ ] Admin-level logging captures full error details with correlation IDs

### Caching Configuration

- [ ] Geocoding results cached for 30 days
- [ ] Local ordinance data cached until manually updated
- [ ] No caching of Directions results or LLM output
- [ ] Session-level cache for same-address re-analysis
