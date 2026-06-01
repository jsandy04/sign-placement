# Scoring Algorithm Factors and Weights

## Decision Needed

What factors should determine a good open house directional sign location, and what relative weights should each factor carry in the scoring algorithm?

## Findings

### Factor 1: Traffic Volume
Every industry source emphasizes placing signs on major roads and high-traffic intersections. The Showable.co guide (an industry-standard training resource) advises "2-3 signs at major intersections" and Curb Hero recommends 25-35 signs covering "all intersections and routes leading to main highways" (Curb Hero, 2024). HomeLight quotes top-selling agent Mike Montpetit: "Closer to a busy street is better." Agents consistently rank traffic volume as the primary driver of open house attendance.

**Confidence: High**

### Factor 2: Decision-Point Criticality
The "breadcrumb trail" method is the most universally recommended strategy across all sources. Every guide stresses placing a sign at every turn, intersection, or stop sign where a driver could guess wrong. Showable.co: "If you can imagine getting confused as a first-time visitor, add another sign." HomeLight's sign guide calls this "the most important rule" (HomeLight, 2024). The National Association of Realtors identifies that 4% of buyers discover homes through directional signs, reinforcing that route continuity directly affects conversion.

**Confidence: High**

### Factor 3: Visibility / Unobstructed View
All guides stress avoiding obstructions: mailboxes, parked cars, foliage, fire hydrants, telephone poles. Agents also consider sun direction and glare. The Brown Team guide and UPrinting guide specifically warn against "hidden" signs. However, most visibility factors are binary (obstructed or not) rather than gradations, making a weight-based scoring approach potentially less useful than a pass/fail filter.

**Confidence: High** (that visibility matters); **Medium** (that it works well as a scored weight rather than a filter)

### Factor 4: Sign Spacing (Avoiding Gaps vs. Avoiding Clustering)
Two distinct spacing concerns exist:

- **Gap avoidance**: Sources stress that signs must be close enough to maintain the breadcrumb trail. The rule is "each sign should be visible from the previous one" (Buse Agency). There is no quantified minimum gap for continuity -- it varies by road geometry.
- **Clustering avoidance**: Multiple signs at the same intersection can cause confusion. However, agents do sometimes place multiple signs at complex intersections to guide traffic from multiple directions (see Topic 7 findings). Research on driver cognition confirms that temporary sign clustering reduces individual sign effectiveness -- the Summala study found that "single roadwork signs were glanced at more often and for longer" (Transportation Research Part F).

The weight of spacing as a scoring factor depends on whether the system enforces minimum spacing separately (see Topic 7). If spacing is enforced as a hard constraint, its weight in scoring diminishes.

**Confidence: Medium** -- sources agree spacing matters but disagree on how to quantify it.

### Factor 5: Safety and Legal Compliance
Consistent across all sources: "Check local ordinances." Common restrictions include:
- No placement within sight-visibility triangles at intersections (typically 15-25 ft)
- No attachment to government sign posts, utility poles, or medians
- 4-10 ft setback from roadway surface
- Time restrictions (often 9 AM - 9 PM day of open house only)
- Sign size limits (4-6 sq ft typical)
- Permits required in some jurisdictions

Legal compliance is typically a hard constraint (permit/ban) rather than a gradable factor. The NAR advises that municipalities cannot enforce content-based sign restrictions after Reed v. Town of Gilbert (2015) but can neutrally regulate time, place, and manner.

**Confidence: High** (that compliance matters); **High** (that it is best treated as a hard constraint, not a scoring weight)

### Factor 6: Approach Speed
No real estate agent source explicitly factors approach speed into sign placement decisions. However, traffic engineering literature (AASHTO Green Book) provides clear evidence that speed dramatically affects how far in advance a sign must be placed for a driver to safely read and react to it. The conspicuity research shows that at 62 mph (100 km/h), drivers only have approximately 1 second to semantically process a sign before passing it (SAFEye study). This suggests speed should inform offset distances (see Topic 6) rather than being a standalone scoring weight.

**Confidence: Medium** -- speed matters for placement geometry, but agents do not consciously factor it as a location quality metric.

### No Formal Industry Framework Exists
Despite extensive searching across agent forums, training materials, sign vendor guides, and professional associations, **no formal scoring framework for sign placement exists** in the real estate industry. All guidance is heuristic and experiential. This means any proposed weight system must be constructed from first principles and expert judgment rather than derived from an existing standard.

## Source Assessment

### Confidence Ratings by Source Type

| Source Type | Confidence | Reasoning |
|---|---|---|
| Agent training guides (Showable.co, HomeLight, Curb Hero) | High | Consistent messaging across multiple independent sources; reflects practitioner consensus |
| Agent forum wisdom (ActiveRain, LabCoat Agents) | Medium-High | Experiential and anecdotal, but aligns with formal guides |
| Traffic engineering literature (AASHTO, MUTCD, conspicuity research) | High | Peer-reviewed or codified standards; directly applicable to visibility and offset decisions |
| Sign vendor guides (UPrinting, PackEze) | Medium | Commercial motivation to sell more signs may inflate quantity recommendations |
| Municipal codes | High | Legal fact; directly constrains what is permissible |

### Contradictions

1. **Number of signs**: Curb Hero recommends 25-35 signs; Showable.co recommends 10-15; LabCoat Agents recommends 6-8 large plus smaller. This range likely reflects different property types (rural vs. suburban vs. urban). The tool should allow the algorithm to adjust based on setting type, not prescribe a single count.

2. **Spacing importance**: Some agents treat spacing as a hard rule (every turn needs a sign) while others treat it as a soft suggestion. The more successful agents cited across multiple sources tend to follow the "every turn" rule rigidly.

3. **Branding on signs**: Some sources recommend minimal text ("OPEN HOUSE" + arrow only), while others suggest adding agent name, phone, QR codes. For directional (not yard) signs, the consensus leans minimal. This affects what the scoring algorithm considers "good" -- a sign with excessive text may be less effective.

## Recommendation

Use a **scoring framework with two layers**:

### Layer 1: Hard Constraints (Pass/Fail)
These should eliminate locations, not score them:
- Legal compliance (right-of-way, sight triangle, setback, time restrictions)
- Safety (pedestrian/bike lane obstruction, sight line obstruction)
- Private property without permission

### Layer 2: Weighted Scoring Factors

| Factor | Weight | Rationale |
|---|---|---|
| Decision-point criticality | 30% | Supported by universal agent consensus; directly maps to whether a location fills a gap in the route |
| Traffic volume | 25% | Broadly supported; correlates with exposure |
| Visibility quality | 20% | Partially supported; treated as filter by agents but gradations exist (clear vs. partially obstructed vs. fully obstructed) |
| Approach speed alignment | 15% | Indirectly supported via engineering data; ensures sign is placed far enough before turn for speed |
| Sign spacing from other selected signs | 10% | Weakest support; spacing is typically addressed through separate constraint enforcement |

### Deviations from the Original Hypothesis
- **Decision-point criticality**: Keep at 30% -- this is correct.
- **Traffic volume**: Keep at 25% -- this is correct.
- **Visibility**: Increase from 15% to 20% -- sources treat this as more important than originally hypothesized.
- **Sign spacing**: Decrease from 15% to 10% -- spacing is better handled via separate minimum-distance enforcement (see Topic 7) than as a scoring factor.
- **Safety/legal compliance**: Move from scoring factor (10%) to hard constraint -- this is a pass/fail gate, not a scorer. Legal violations are non-negotiable.
- **Approach speed**: Match original 5% weight or use as input into offset distance calculation (see Topic 6).

## Gaps / Risks

1. **No empirical validation**: The weight system is derived from practitioner consensus and engineering principles, not controlled experiments. A/B testing across different weight configurations would significantly increase confidence.

2. **Municipal variability**: Legal constraints differ by jurisdiction. The tool needs a per-city rule configuration or a national default with caveats.

3. **Road directionality**: The algorithm must consider which side of the road is appropriate for each approach direction. No source quantifies this decision factor.

4. **Time of day / lighting**: Glare, shadows, and ambient light affect sign visibility but no source provides a systematic way to factor these.

5. **Competing signs**: If another agent's sign already occupies a location, the value of co-locating vs. finding an alternative is unclear from existing research.
