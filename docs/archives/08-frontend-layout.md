# Topic 8: Frontend Layout

## Decision Needed
How to arrange the input form, map, and results on screen for a sign placement optimization tool that follows a pipeline (geocode -> find roads -> compute routes -> generate candidates -> score -> LLM review -> display on map).

## Findings

### The Dominant Pattern: Map + Sidebar Split Layout

Across route planners, delivery optimizers, store locators, and logistics dashboards, the dominant UI pattern is a **split-panel layout**: a sidebar panel on one side and the map filling the remaining space. Examples include VORP (Vehicle Optimal Route Planner), TMS logistics dashboards, and Google Maps itself.

**Key characteristics of well-working implementations:**
- Sidebar scrolls independently while the map stays fixed (overflow-y: auto + height: 100vh)
- Sidebar width is typically 320-480px, with 360px as the most common
- Map fills remaining space using flex: 1
- Results in the sidebar are synced with markers on the map (click marker -> highlight card, click card -> pan map)
- Route sequencing is visually indicated with numbered stops

### Three-Snap-Point Bottom Sheets for Mobile

On mobile viewports (<768px), the industry standard (Google Maps, Apple Maps) is a **bottom sheet with three snap states**:
- **Peek** (15-25% of viewport): Shows handle + title + one summary line; map is fully interactive
- **Half** (40-50% of viewport): Shows results list with details; map partially visible, shifts up
- **Full** (85-90% of viewport): Full scrollable content; map hidden or minimized

The sheet is typically draggable, non-modal (map behind remains interactive), and the map center self-adjusts when the sheet opens or resizes.

### LLM Recommendation Display: Should Fit in Sidebar Cards

Research on LLM output length for recommendation tasks shows:
- For recommendation-style prompts, ~200-1000 output tokens is typical (roughly 150-750 words)
- "Concise Thoughts" research (arXiv:2407.19825) shows constraining reasoning to 30-100 words can actually improve accuracy
- For sign placement recommendations, each candidate likely produces 2-5 sentences of reasoning (50-200 words), which fits comfortably in a sidebar card
- Longer analysis can use expandable sections ("Show reasoning" toggle) rather than always-visible text

This means sidebar cards with fixed-height previews and optional expansion are the right approach - no need for full-page overlays for LLM output.

### Common Layout Antipatterns to Avoid

- **Modal overlays for map results**: Interrupt the map interaction flow; users should be able to click in/out of results while the map remains visible
- **Map as a small inset rather than primary visual**: The map is the core output display, it should be the largest element
- **Global CSS box-sizing: border-box without override**: Google Maps JS API does not support border-box on its internal elements; requires `#map img { max-width: none; }` fix
- **Info windows as primary result display**: Good for quick context, but rich content needs the sidebar; use info windows for preview, sidebar for details

### Google's Recommended Practices for Maps UI

- Use custom CSS containers for the map, do not reference Google's internal class names
- Set `#map img { max-width: none; }` to prevent CSS framework conflicts
- Handle window resize events to re-center the map
- Use `fitBounds` with padding to account for sidebar overlay width when auto-zooming
- Do not override or modify built-in JavaScript prototypes
- For 50+ markers, use MarkerClusterer for performance

### Mobile Agent Use Case Considerations

A real estate agent using this on a phone the morning of an open house needs:
- Large tap targets (minimum 44px)
- Minimal typing - address autocomplete with Google Places API is critical
- Ability to see the map (where signs go) and the list (addresses + instructions) simultaneously
- At peek state, the bottom sheet should show the most critical info: total signs needed, next address
- Full-screen map view when scrolling the map, with a handle to pull up results
- Portrait orientation assumed; landscape on phone is rare for this use case

## Source Assessment

- **High confidence**: Map+sidebar split is the standard pattern across logistics, route planning, and store locator applications
- **High confidence**: Bottom sheet with snap points is the standard mobile pattern (Google Maps, Apple Maps, numerous case studies)
- **Medium-High confidence**: LLM recommendation output fits in sidebar cards - based on academic research on recommendation context length and output token estimates
- **Medium confidence**: Mobile real estate agent use case requirements are inferred from general mobile UX best practices and the tool's intended workflow, not directly tested
- **High confidence**: Google Maps API CSS conflict gotchas are well-documented (Google's own best practices page, developer forums)

## Recommendation

**Desktop (>=1024px): 3-panel layout with a thin input panel on the left and a scrollable results sidebar on the right.**

```
+------------+---------------------------+------------------+
| Input Panel|         MAP               | Results Sidebar  |
| (280px)    |                           | (360px)          |
| - Address  |  - Pin drops             | - Card per       |
| - Params   |  - Route lines           |   candidate      |
| - Go btn   |  - Heat/score overlay    | - Score badge    |
|            |                           | - LLM snippet    |
|            |                           | - Expand button  |
+------------+---------------------------+------------------+
```

- Input panel stays thin and collapsed by default on smaller screens, collapsible with a hamburger toggle
- Results sidebar is scrollable with synced map interaction
- Map fills remaining space

**Tablet (768-1023px): Collapsible sidebar.** The map takes primary focus. A floating button or edge handle opens an overlay sidebar. Results can be a bottom sheet on portrait tablets.

**Mobile (<768px): Map-first with overlay bottom sheet.** The map fills the screen. Results appear as a three-snap bottom sheet (peek/half/full). The input is a floating action button or minimal top bar that slides into a full-screen form.

**LLM output display:** Each result card shows a 2-3 line preview (score, address, one-line summary). A "Show reasoning" button expands the card to show the full LLM analysis inline, avoiding modal interruptions while keeping the map visible.

## Gaps / Risks

- No direct testing with real estate agents to validate the mobile workflow assumptions
- The three-panel layout may feel cramped on screens between 1024-1280px; actual breakpoints need tuning with real content
- If LLM output is longer than expected (>500 words per candidate), the inline expand pattern may need reconsideration (could switch to a slide-over detail panel)
- The input-to-map-to-results flow requires careful loading state management: the sequence (geocode -> find roads -> compute routes -> generate candidates -> score -> LLM review) means multiple progressive steps. Each intermediate state should show visual progress on both map and sidebar
- No research was found on accessibility patterns specific to map+results split views with screen readers; this needs dedicated testing
