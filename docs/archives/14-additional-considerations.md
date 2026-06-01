# 14. Additional Considerations

**Last updated:** 2026-05-31

**Goal:** Cover operational, legal, competitive, privacy, accessibility, compatibility, and observability topics not addressed by the original 10-item research plan.

---

## Table of Contents

1. [Google Maps API Terms of Service Compliance](#1-google-maps-api-terms-of-service-compliance)
2. [Competitive Landscape](#2-competitive-landscape)
3. [Privacy Considerations](#3-privacy-considerations)
4. [Accessibility Requirements](#4-accessibility-requirements)
5. [Browser Compatibility](#5-browser-compatibility)
6. [Monitoring and Observability (MVP-level)](#6-monitoring-and-observability-mvp-level)

---

## 1. Google Maps API Terms of Service Compliance

This project relies on the Google Maps Platform (Geocoding API, Routes API, and Maps JavaScript API). Several ToS provisions affect design decisions.

### 1.1 Can We Store / Cache Geocoding Results?

**Short answer:** Yes, with a 30-day limit.

The **Google Maps Platform Service Specific Terms** (last modified June 30, 2025) state:

> "Customer may temporarily cache latitude (lat) and longitude (lng) values from the Geocoding API for up to 30 consecutive calendar days, after which Customer must delete the cached latitude and longitude values."

Source: [Google Maps Platform Service Specific Terms](https://cloud.google.com/archive/maps-platform/terms/maps-service-terms-20250630)

**Implications for this tool:**

- **Place IDs can be stored indefinitely.** Store the `place_id` from geocoding results as a long-term cross-reference.
- **Lat/lng coordinates may be cached for up to 30 days.** After that, re-geocode the address to obtain fresh coordinates.
- If you want long-term storage without re-geocoding, only store `place_id` values. Re-resolve to lat/lng as needed.
- **Do not pre-fetch, index, or cache any other content** (route polylines, maps tiles, etc.) except Place IDs.

**Recommended strategy:**

```
┌─────────────┐    store place_id    ┌──────────────┐
│ Geocode API │ ───────────────────► │ Database     │ (indefinite)
│             │    store lat/lng     │              │ (max 30 days)
│             │ ───────────────────► │              │
└─────────────┘                      └──────────────┘
                                          │
                                    After 30 days:
                                    re-geocode using
                                    stored place_id
```

### 1.2 Can We Display Google Maps Data with Our Own Markers and Overlays?

**Yes, with attribution requirements.**

The Maps JavaScript API terms allow displaying map tiles with custom markers, polylines, info windows, and overlays. The key requirements are:

- **Attribution must remain visible and unobscured.** The built-in Google logo and data credits in the map UI must not be hidden or covered by any custom content.
- **No logo modification.** The Google logo must maintain its aspect ratio, colors, and minimum size (16dp height).
- **Custom markers are allowed.** You can add any number of custom markers, polylines, and info windows on top of Google Maps tiles. This is the standard pattern for mapping applications.
- **Clear separation:** When overlaying custom data, it should be clear to users which content is from Google and which is your own (this is typically obvious from context).

Source: [Google Maps API Policy documentation](https://developers-dot-devsite-v2-prod.appspot.com/maps/documentation/geocoding/policies?hl=en)

### 1.3 Attribution Requirements

- Display the Google Maps logo (or plain "Google Maps" text if space is constrained).
- Google's third-party data provider attributions must also be displayed.
- Attribution should be displayed in the bottom-right corner of the map by default.
- Do not modify, wrap, or localize attribution text.
- Minimum font: Roboto (or any sans-serif), weight 400, size 12sp-16sp.

Source: [Google Maps JavaScript API Policies](https://developers.google.com/maps/documentation/javascript/policies?hl=en)

### 1.4 Restrictions on Using Maps Data to Generate "Recommendations"

This is the most significant compliance risk for this project.

The **Google Maps Platform Terms of Service** and **Acceptable Use Policy** restrict:

1. **No new products or services based on Google Maps:** You cannot "redistribute or sell any part of Google Maps or create a new product or service based on Google Maps" (Section 2, Prohibited Conduct).

2. **No augmenting other mapping datasets:** You cannot "use Google Maps to create or augment any other mapping-related dataset (including a mapping or navigation dataset, business listings database, mailing list or telemarketing list) for use in a service that is a substitute for, or a substantially similar service to, Google Maps."

3. **No derivative works:** "You must not copy, translate, modify, or create a derivative work (including creating or contributing to a database) of, or publicly display any Content or any part thereof except as explicitly permitted."

4. **No data extraction:** Prohibited from extracting, scraping, or harvesting Google Maps data at scale.

Source: [Google Maps End User Additional Terms of Service](https://www.google.com/intl/pt_AU/help/terms_maps/)
Source: [Google Maps Platform Acceptable Use Policy](https://cloud.google.com/maps-platform/terms/aup)

**Risk analysis for this tool:**

| Activity | Risk Level | Notes |
|----------|-----------|-------|
| Geocoding an address the user provides | Low | Standard API use, no caching violation if 30-day rule followed |
| Computing a route to the property | Low | Standard API use |
| Placing custom markers on Google Maps | Low | Explicitly allowed |
| **Recommending sign placements based on route + road geometry** | **Medium** | The "no derivative works" clause is the concern. However, the tool is not creating a mapping dataset -- it is providing per-address advice that is ephemeral. This is similar to route optimization tools that use Google Maps data as input and output a list of stops. |
| Storing route polyline data long-term | High | Route data cannot be cached. Must be re-requested each time. |
| Using Google Maps data to power a "recommendation engine" offered as a standalone product | High | Could be seen as creating a new product based on Google Maps content. |

**Recommended mitigation:**

1. **Treat route polylines as ephemeral.** Request the route each time an analysis is run. Store only the sign coordinate output (which is derived data, not Google Maps content).
2. **Display results on a Google Map.** Consuming the tool's recommendations requires viewing them on a Google Map, which keeps usage within the "with a Google map" paradigm.
3. **Do not store or index road geometry.** Road names extracted from the polyline for LLM context can be stored as part of the analysis result (this is metadata, not map content).
4. **Consider adding a splash screen or EULA** that notes "Recommendations are for reference only" to further distinguish the tool from a mapping/navigation product.
5. **Consult legal counsel** before monetizing or distributing the tool. The boundary between "acceptable use for route planning" and "prohibited derivative dataset" is not firmly established in case law.

### 1.5 Pricing Impact

Pricing as of 2025-2026 (post-Google pricing overhaul):

| API | SKU Tier | Free Tier | Price per 1K (0-100K) |
|-----|---------|-----------|----------------------|
| Geocoding API | Essentials | 10,000/month | $5.00 |
| Compute Routes Essentials | Essentials | 10,000/month | $5.00 |
| Maps JavaScript API (Dynamic Maps) | Essentials | 10,000/month | $7.00 |

**Per-analysis cost estimate:**

- 1 geocode call + 1 route call + 1 map load = ~$0.017 per analysis at 0-100K volume.
- At 1,000 analyses/month: ~$17/month.
- Stay within the free tier for up to ~10,000 analyses/month (if you also bundle the $200/mo subscription).

Source: [Google Maps API Pricing 2026](https://www.woosmap.com/blog/google-maps-api-pricing-breakdown)
Source: [Google Maps Platform Pricing Overview](https://developers.google.com/maps/billing-and-pricing/overview?hl=en)

---

## 2. Competitive Landscape

### 2.1 Direct Competitors

No dedicated sign placement optimization tool was found on the market. Searches for "real estate sign placement optimization software," "sign placement route planning," and related terms returned no direct competitor. This is a greenfield product category.

### 2.2 Adjacent Products

| Product | Category | Overlap with Sign Placement Tool |
|---------|----------|----------------------------------|
| **Simply Signs** (custom app by Zazz) | Signage logistics (delivery, installation, removal) | Handles the operational side (drivers, inventory) but does not optimize placement locations. |
| **SignTraker** ([signtraker.com](https://www.signtraker.com/)) | Sign post installation software | Tracks physical sign installations but doesn't suggest where to place them. |
| **ListingAI** ([listingai.co](https://www.listingai.co/features/signs)) | Smart sign riders with NFC | Focuses on sign hardware (NFC tags, digital riders) rather than placement optimization. |
| **Mapsly** ([mapsly.com](https://mapsly.com/)) | CRM-integrated route optimization | Multi-stop route optimization for field sales. Could be adapted for sign placement route planning, but not specialized for it. |
| **Route4Me** | Route optimization | General-purpose route optimization. Could manually encode sign placement as route stops, but no real estate domain features. |

### 2.3 Indirect Competitors

| Product | What It Does | Why It's Not a Competitor |
|---------|-------------|--------------------------|
| **Canva / Vistaprint** | Sign design and printing | Design side only. No placement optimization. |
| **Real estate CRMs** (Salesforce, HubSpot, Follow Up Boss, BoomTown) | Lead management, marketing campaigns | No geospatial sign placement features. Some have map views of listings (for context) but no routing or placement logic. |
| **Google Maps / Waze** | Navigation | General navigation. No open house sign placement awareness. |
| **Territory planning tools** (Maptive, eSpatial, Badger Maps) | Sales territory mapping | Focus on sales territory boundaries, not per-property sign placement. Could be adapted somewhat. |

### 2.4 Differentiation Strategy

This tool occupies a unique niche. Key differentiators:

1. **Domain-specific placement logic:** Not just route optimization -- understands the four-layer sign placement model (major road / decision point / near property / at home).
2. **One-click analysis:** Enter an address, get a plan. No route planning expertise required.
3. **LLM-powered review:** The final LLM step provides reasoning and catch edge-case suggestions that pure algorithmic approaches miss.
4. **Visual output on map:** Agents don't need to read turn-by-turn directions; they see exactly where to put each sign.

### 2.5 Build vs. Buy Recommendation

Build. No off-the-shelf product provides this capability. The core pipeline (geocode -> route -> extract road segments -> score -> place signs) is relatively compact and can be built with standard mapping APIs. The LLM review layer is a differentiator that no existing tool offers.

---

## 3. Privacy Considerations

### 3.1 Is a Property Address PII?

**Short answer:** Under CCPA/CPRA, a property address is personal information but is generally exempted because it is "publicly available information from government records."

**Detail:**

- **CCPA/CPRA definition:** "Postal address" is listed as a category of personal information (Cal. Civ. Code 1798.140(o)(1)).
- However, **publicly available information from government records is excluded** from the definition (Cal. Civ. Code 1798.140(o)(2)).
- **Most property addresses** are recorded in county assessor and property tax records, which are public records. Therefore, a property address collected from or verified against public records is exempt from CCPA/CPRA treatment as personal information.
- **AB 874 (2019)** clarified that the public record exemption applies regardless of whether the purpose for use is contemplated by the originating government record.
- **CPRA (2023 update)** further broadened this exclusion.

**Under GDPR:**
- A property address associated with an identifiable person could be personal data.
- However, if the property address is used in a business context (real estate listing), the business-to-business exemption under Art. 2(2)(c) may apply for communications related to the business.
- **Cross-border risk is low** if the tool operates in the US. Deploy with privacy-preserving defaults if the tool is offered to EU users.

Sources: [CCPA Private Right of Action and Public Record Guidance](https://www.jdsupra.com/legalnews/pii-compliance-requirements-best-6872060/), [Captain Compliance CPRA Personal Information Guide](https://captaincompliance.com/education/cpra-personal-information/)

### 3.2 Data Retention Policy

**Recommended policy:**

| Data Type | Retention Period | Rationale |
|-----------|-----------------|-----------|
| Input address | Not stored, or deleted after analysis completes | No ongoing business need to retain |
| Geocoded lat/lng | 30 days max (per Google ToS) or delete immediately after analysis | Google ToS compliance |
| Place ID | Indefinite (per Google ToS exception) | Useful for re-geocoding |
| Analysis result (sign placements) | 30 days; then delete or anonymize by removing address and exact coordinates | De-risk; stale results are not useful |
| Route polyline | Not stored (ephemeral) | Google ToS prohibits caching |
| LLM reasoning text | 30 days; then delete | Useful for debugging but grows stale |

**Reasonable compromise:** Store analysis results for 30 days (so agents can revisit a plan during the open house window), then purge. If users want long-term storage, allow them to export an image or PDF report (which they own and manage).

### 3.3 Sharing Result URLs

**Risk:** If result URLs contain the property address (e.g., `/analysis/123-Main-St-Portland-OR`), sharing the URL with a colleague or client exposes the address.

**Mitigations:**

1. **Use opaque IDs in URLs**, not address-based slugs. E.g., `/analysis/abc123def` instead of `/analysis/123-Main-St`.
2. **Add optional password protection** to analysis results.
3. **Use ephemeral share links** with expiration (e.g., 24 hours).
4. **Warn users before sharing** a link containing client address data.

### 3.4 GDPR / CCPA Compliance Checklist

- [ ] Privacy policy published on the site.
- [ ] Users can request deletion of their analysis data.
- [ ] Data retention schedule documented and enforced (cron job or app logic).
- [ ] No storage of geolocation data beyond the 30-day window.
- [ ] Use of standard web analytics (no selling of user data for advertising).
- [ ] Cookie consent banner with opt-outs (if analytics cookies are used).
- [ ] The tool is offered to business users (agents/agencies), not directly to consumers, which limits CCPA consumer rights exposure.

---

## 4. Accessibility Requirements

### 4.1 WCAG Considerations for a Map-Heavy Application

Maps present well-known accessibility challenges under WCAG 2.1/2.2. The Bureau of Internet Accessibility and Google's own guidance highlight four key areas:

**1. Keyboard Accessibility (WCAG 2.1 SC 2.1.1)**
- The map canvas must be navigable with keyboard alone.
- Google Maps JavaScript API supports: Tab to focus first marker, arrow keys to cycle, Enter/Space to activate.
- The Google Maps Advanced Marker element supports `gmpClickable: true` for keyboard interaction.
- **CRITICAL:** Do not create keyboard traps (WCAG SC 2.1.2). Users must be able to Tab out of the map area.

**2. Don't Rely on Color Alone (WCAG 2.1 SC 1.4.1)**
- Sign markers must use icons or patterns alongside color (e.g., a pin icon with a numeral).
- Ensure color contrast for text on markers (SC 1.4.3).

**3. Text Alternatives (WCAG 2.1 SC 1.1.1)**
- **Text-based list pattern:** Provide a browsable, searchable text list of all sign placements alongside the map. This is the most commonly recommended pattern for map accessibility.
- Each marker needs an accessible name (use the `title` attribute on markers, which screen readers read).
- Custom screen reader labels can be added via `aria-label` on Advanced Marker elements.

**4. Zoom and Resize (WCAG 2.1 SC 1.4.4)**
- Users must be able to zoom the map to at least 200% without loss of content or functionality.
- The map container should not lock zoom. Use browser-native zoom where possible.

Sources:
- [Google Maps JavaScript API - Accessible Markers](https://developers.google.cn/maps/documentation/javascript/advanced-markers/accessible-markers?authuser=0&hl=en)
- [BOIA - Interactive Maps and Accessibility: 4 Tips](https://www.boia.org/blog/interactive-maps-and-accessibility-4-tips)

### 4.2 Screen Reader Compatibility

**Current state of Google Maps + screen readers:**

- Google Maps announces each marker with its title and navigation instructions (e.g., "[title] to navigate. Press the arrow keys.").
- The interactive map canvas has limited built-in screen reader support for individual markers.
- Industry best practice: **treat the interactive map as media content** (like an image with a long description). Provide the text list as the primary accessible path.

**Implementation requirements:**

1. A full text-based sign placement table rendered in HTML (not an image, not a canvas).
2. Semantic HTML: use `ul`/`ol` for the sign list, `h1`-`h6` for section headers, proper `label` elements for form inputs.
3. ARIA roles: `role="application"` on the map container, `role="list"` on the sign list.
4. Focus management: when a user clicks a sign in the text list, the corresponding map marker should receive focus.
5. Announce pipeline progress: use a `role="status"` or `aria-live="polite"` region to announce "Geocoding... Routing... Analyzing... Plan ready."

### 4.3 Keyboard Navigation for the Analysis Pipeline

The entire pipeline should be usable without a mouse:

| Action | Keyboard Equivalent |
|--------|-------------------|
| Enter property address | Standard text input (Tab to reach) |
| Trigger analysis | Button (Tab + Enter/Space) |
| View sign results | Tab through text list |
| View on map | Map navigation via arrow keys (built into Google Maps) |
| Export/share results | Button (Tab + Enter/Space) |
| Adjust sign count | Slider (arrow keys), number input (type), or buttons (+/-) |

**Form-level accessibility:**
- All inputs need visible labels (not just placeholder text).
- Submit button with clear text (not an icon-only button without accessible name).
- Loading state announced: "Analyzing property..." via `aria-live` region.
- Error messages associated with inputs via `aria-describedby`.

---

## 5. Browser Compatibility

### 5.1 What Browsers Do Real Estate Agents Use?

No survey specifically targeting real estate agent browser preferences was found. Extrapolating from general real estate technology trends:

- **Real estate agents are heavy mobile users:** NAR (National Association of Realtors) surveys consistently show agents rely on smartphones for field work (listings, showings, directions).
- **Desktop usage:** Agents working from an office or home likely use whatever their brokerage provides, which skews toward Chrome (dominant market share) and Safari (standard on MacBooks, which are common in the real estate industry).
- **Likely browser distribution estimate (extrapolated):**
  - Chrome: 60-65% (desktop + Android)
  - Safari: 25-30% (macOS + iOS -- Macs are common in real estate)
  - Firefox / Edge: 5-10%
  - Other: < 3%

Given the high prevalence of Macs in the real estate industry, **Safari support is critical.**

Source: General real estate tech surveys and common knowledge about the industry; no agent-specific browser survey found.

### 5.2 Google Maps JavaScript API Browser Support Matrix

According to Google's official browser support page (October 2025):

| Browser | Desktop | Mobile |
|---------|---------|--------|
| Chrome | Two latest major versions | Current version (Android) |
| Safari | Two latest major versions | Current + previous iOS version |
| Firefox | Two latest major versions | Current version |
| Edge | Two latest major versions | - |

Source: [Google Maps JavaScript API Browser Support](https://developers.google.com/maps/documentation/javascript/browsersupport?hl=en)

### 5.3 Known Safari Issues (and Mitigations)

**1. `overscroll-behavior` bug (FIXED in March 2025)**
- Maps JavaScript API v3.60.6 (March 27, 2025) fixed a Safari-specific issue where pages using `overscroll-behavior` did not scroll correctly.
- Keep the API version >= 3.60.6.

**2. Intelligent Tracking Prevention (ITP)**
- Safari may block or delay Google Maps API requests if the domain is flagged for tracking.
- **Mitigation:** Ensure your domain is properly configured in the Google Cloud Console (authorized JavaScript origins). Avoid loading third-party tracking scripts on the same page as the map.

**3. WebGL rendering**
- Safari can fall back to a software WebGL renderer, causing slower map rendering.
- **Mitigation:** Consider using the raster map renderer as a fallback. Serve vector maps with a WebGL feature check.

**4. iOS WKWebView touch conflicts**
- Maps embedded in WKWebView (common in real estate apps) can have touch/gesture conflicts.
- **Mitigation:** Add `touch-action: none` to the map container. Use Google's gesture handling options.

**5. CSS scroll containment**
- Safari handles `overflow: hidden` and scroll containers slightly differently.
- **Mitigation:** Test with Safari's "Develop > Show Responsive Design Mode" for various iOS devices.

### 5.4 Recommended Testing Matrix

Before production deployment, verify the following at minimum:

| Browser/OS | What to Test |
|-----------|-------------|
| Chrome (latest, macOS) | Full pipeline: geocode -> route -> analyze -> display map with markers + text list |
| Firefox (latest, macOS) | Same as Chrome |
| Safari (latest, macOS) | Same + verify no scroll/gesture issues + verify ITP does not block API calls |
| Safari (previous major version, macOS) | Same as Safari latest |
| Chrome (Android) | Mobile layout: responsive map, touch interaction, smaller screen layout |
| Safari (iOS, latest) | Mobile layout + iOS WebView behavior if applicable |

---

## 6. Monitoring and Observability (MVP-level)

### 6.1 What to Log During the Pipeline

Every pipeline execution should produce a structured log entry with the following fields:

| Field | Example | Purpose |
|-------|---------|---------|
| `pipeline_id` | `abc123def` | Trace a single analysis through all steps |
| `address` | `123 Main St, Portland, OR` | Identify the input (log the address, not the exact coordinates for privacy) |
| `timestamp` | `2026-05-31T14:30:00Z` | When the analysis started |
| `total_duration_ms` | `4523` | End-to-end latency |
| `step_durations` | `{geocode: 320, route: 1850, extract: 420, score: 890, llm: 1043}` | Per-step latency breakdown |
| `api_calls` | `{geocode: 1, route: 1, snap: 1, llm: 1}` | Count of external API calls |
| `api_tokens` | `{llm_input: 2450, llm_output: 890}` | LLM token usage |
| `sign_count` | `10` | Number of signs in the final output |
| `automated_checks` | `{snap_road: pass, sequence: pass, spacing: pass, destination: pass, route_coherence: pass, no_go: pass}` | Automated validation results |
| `errors` | `null` or `[{step: "geocode", error: "REQUEST_DENIED"}]` | Any errors encountered |
| `llm_valid` | `true` | Whether LLM output passed structural checks |

**Total log volume estimate:**
- ~1 KB per analysis (text).
- At 1,000 analyses/day: ~1 MB/day = ~30 MB/month.
- Negligible storage cost.

### 6.2 Cost Tracking

**Per-analysis cost should be tracked for each API:**

| Cost Item | How to Calculate |
|-----------|-----------------|
| Google Geocoding | $5.00 / 1,000 requests |
| Google Compute Routes | $5.00 / 1,000 requests (Essentials tier) |
| Google Maps JS (map load) | $7.00 / 1,000 loads |
| LLM API | Model-specific (e.g., Claude Sonnet ~$3/M input, $15/M output tokens) |
| Snap-to-road (if used) | $5.00 / 1,000 requests |

**Estimated total cost per analysis:**

```
Geocode               $0.005
Route (Essentials)    $0.005
Map load              $0.007
LLM (2K in + 500 out) $0.013
Snap-to-road          $0.005
                     ─────────
Total per analysis:  ~$0.035
Total for 1000/mo:  ~$35.00
```

**Cost alerting thresholds:**
- Alert if any single analysis costs > $0.10 (suggests an error loop or excessive LLM tokens).
- Alert if daily API spend exceeds $5.00.
- Alert if LLM token usage per analysis exceeds 10x the median (suggests a buggy prompt expansion).

### 6.3 Free / Cheap Monitoring Tools for Self-Hosted VPS

The recommended stack is **Prometheus + Grafana + Loki** (the "LGTM" stack), running on the same VPS as the application. Total RAM: ~1 GB.

| Component | Role | RAM | Cost |
|-----------|------|-----|------|
| **Prometheus** | Time-series metrics collection | 256-512 MB | Free/OSS |
| **Grafana** | Dashboards and visualization | 128-256 MB | Free/OSS |
| **Loki** | Log aggregation (cheaper than Elasticsearch) | 128-256 MB | Free/OSS |
| **Promtail** | Log collector that ships logs to Loki | ~64 MB | Free/OSS |
| **Node Exporter** | System metrics (CPU, RAM, disk, network) | ~30 MB | Free/OSS |

**Docker Compose setup:** The entire stack fits in a single `docker-compose.yml` file. Provisioning a handful of JSON dashboard templates in Grafana covers the metrics above.

**Setup time:** ~1 hour for a working dashboard with pipeline metrics and API cost tracking.

**Alternatives:**
- **VictoriaMetrics:** Drop-in Prometheus replacement, uses ~50% less RAM (128-256 MB).
- **Uptime Kuma:** Simple HTTP health check monitor (~50 MB RAM). Good for basic "is it running?" monitoring.
- **Healthchecks.io:** Free (up to 20 checks) SaaS for cron job monitoring. No server needed.

### 6.4 Alerting (MVP)

With the Prometheus + Grafana stack, set up these five essential alerts:

| Alert | Rule | Impact |
|-------|------|--------|
| **Pipeline failure** | `pipeline_errors_total > 0` in the last 5 minutes | Users can't generate plans |
| **High latency** | P99 pipeline duration > 30 seconds | User-facing slowdown |
| **API spend spike** | Daily API cost > 2x rolling 7-day average | Unexpected bill |
| **LLM quality drop** | LLM validation failure rate > 10% | Quality degradation |
| **Disk space** | Disk usage > 85% | Data loss risk -->

### 6.5 Dashboard (MVP)

A single Grafana dashboard with:

1. **Pipeline success rate** (gauge, last hour)
2. **Pipeline duration P50 and P99** (time series, last 24h)
3. **API calls breakdown by service** (stacked bar, last 24h)
4. **Estimated cost per day** (time series, last 7 days)
5. **Sign count distribution** (histogram, last 24h)
6. **Automated check pass/fail rates** (table, last 24h)
7. **LLM token usage** (time series, last 24h)

---

## Summary of Action Items

| Topic | Action | Priority |
|-------|--------|----------|
| Google ToS | Implement 30-day max caching for geocoding lat/lng; store place IDs indefinitely | High |
| Google ToS | Consult legal counsel before monetizing recommendation output | High |
| Competitive | Proceed with build (no direct competitor exists) | Medium |
| Privacy | Use opaque IDs in result URLs; implement 30-day data retention | High |
| Privacy | Deploy privacy policy with data retention schedule | Medium |
| Accessibility | Implement text-list pattern alongside map; test with screen reader | High |
| Accessibility | Ensure keyboard-only pipeline interaction | Medium |
| Browser | Test on Safari (both macOS and iOS) before production launch | High |
| Browser | Keep Maps JS API >= v3.60.6 for Safari fix | Low |
| Monitoring | Deploy Prometheus + Grafana + Loki on VPS | Medium |
| Monitoring | Implement per-analysis cost tracking and alerts | Medium |

---

## Sources

### Google Maps ToS / Legal
- [Google Maps Platform Service Specific Terms (June 30, 2025)](https://cloud.google.com/archive/maps-platform/terms/maps-service-terms-20250630)
- [Google Maps End User Additional Terms of Service](https://www.google.com/intl/pt_AU/help/terms_maps/)
- [Google Maps Platform Acceptable Use Policy](https://cloud.google.com/maps-platform/terms/aup)
- [Google Maps API Policies and Attributions](https://developers-dot-devsite-v2-prod.appspot.com/maps/documentation/geocoding/policies?hl=en)
- [Google Maps API Pricing 2026 (Woosmap)](https://www.woosmap.com/blog/google-maps-api-pricing-breakdown)

### Accessibility
- [Google Maps JavaScript API - Accessible Markers](https://developers.google.cn/maps/documentation/javascript/advanced-markers/accessible-markers?authuser=0&hl=en)
- [BOIA - Interactive Maps and Accessibility: 4 Tips](https://www.boia.org/blog/interactive-maps-and-accessibility-4-tips)

### Browser Support
- [Google Maps JavaScript API Browser Support](https://developers.google.com/maps/documentation/javascript/browsersupport?hl=en)
- [Google Maps JavaScript API Release Notes](https://developers.google.cn/maps/documentation/javascript/releases?authuser=19&hl=sr)

### Privacy / PII
- [JD Supra - PII Compliance Requirements](https://www.jdsupra.com/legalnews/pii-compliance-requirements-best-6872060/)
- [Captain Compliance - CPRA Personal Information Guide](https://captaincompliance.com/education/cpra-personal-information/)

### Observability
- [Dev.to - Cost-Effective Observability: The 80/20 Stack for Startups](https://dev.to/samson_tanimawo/cost-effective-observability-the-8020-stack-for-startups-1go7)
- [HackerNoon - How I Built a 1 GB Observability Stack](https://hackernoon.com/lite/how-i-built-a-1-gb-observability-stack-for-my-go-startup-using-prometheus-loki-and-grafana?ref=hackernoon)
- [ServerLabs - Log Like a Pro: Open-Source Stack from NUCs to Racks](https://serverlabs.com.au/blogs/guides/log-like-a-pro-the-open-source-stack-that-scales-from-nucs-to-racks)
