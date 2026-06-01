// Per-city ordinance guidance for the launch markets (greater Phoenix / Maricopa County, AZ).
// We deliberately do NOT auto-determine legal compliance — the liability of being wrong
// exceeds the UX benefit. Instead we surface the relevant city's rules so the agent can
// self-verify. Sourced from docs/domain-rules-answers.md §4.

interface CityOrdinance {
  city: string;
  summary: string;
  removalReminder: string;
  url: string;
}

const CITY_ORDINANCES: CityOrdinance[] = [
  {
    city: "Phoenix",
    summary:
      "Phoenix: signs in the public right-of-way generally require an encroachment permit. Directional signs max ~6 sq ft. Verify before placing.",
    removalReminder: "Remove signs promptly after the open house.",
    url: "https://phoenix.municipal.codes/ZO/1308",
  },
  {
    city: "Glendale",
    summary:
      "Glendale (most restrictive): no signs in the public right-of-way; annual permit + site plan required; max 8 signs per subdivision; off-site signs max 4 sq ft / 3 ft tall.",
    removalReminder: "Weekend directional signs allowed Fri 4:00 PM → Mon 8:00 AM only — remove by Monday 8:00 AM.",
    url: "http://glendale-az.elaws.us/code/coor_art7",
  },
  {
    city: "Peoria",
    summary:
      "Peoria (most permissive): residential roadway directional signs allowed in the ROW with restrictions; no permit; max 6 sq ft / 3 ft tall; not in medians or on utility poles; 1 sign per turning movement.",
    removalReminder: "Signs allowed only 3 hours before and 3 hours after the event — remove within 3 hours of closing.",
    url: "http://peoria-az.elaws.us/code/cc_ch21_sure_sico_sec21-833",
  },
  {
    city: "Scottsdale",
    summary:
      "Scottsdale: signs prohibited in the public right-of-way — off-premise directional signs only on private residential lots. Max 6 signs within ½ mile; max 6 sq ft / 3 ft tall; must include a directional arrow.",
    removalReminder: "Signs allowed 7:00 AM – 8:00 PM only — remove by 8:00 PM.",
    url: "https://www.scottsdaleaz.gov/codes-and-ordinances/signs/real-estate-and-development-signs",
  },
];

// Generic checks we can't verify automatically (no public GIS data for the launch markets).
const GENERIC_WARNINGS = [
  "Check for fire hydrants within 15 ft of each sign location before placing.",
  "Keep signs clear of sidewalks and pedestrian paths (4 ft minimum clear width).",
  "This property may be in an HOA — confirm the community's sign rules before placing.",
  "Signs on a residential frontage require the property owner's permission.",
];

export const LIABILITY_DISCLAIMER =
  "The agent is solely responsible for verifying that all sign placements comply with local ordinances, HOA rules, and property owner permissions. This tool provides recommendations only and does not guarantee legal compliance.";

function matchCity(formattedAddress: string | undefined): CityOrdinance | null {
  if (!formattedAddress) {
    return null;
  }

  return CITY_ORDINANCES.find((ordinance) => formattedAddress.includes(ordinance.city)) ?? null;
}

// Returns the agent-facing compliance warnings for a result: the matched city's ordinance
// summary + removal reminder (or a county fallback), followed by the generic safety checks.
export function buildComplianceWarnings(formattedAddress: string | undefined): string[] {
  const warnings: string[] = [];
  const city = matchCity(formattedAddress);

  if (city) {
    warnings.push(city.summary, city.removalReminder);
  } else {
    warnings.push(
      "Arizona law prohibits real-estate signs in the public right-of-way outside city limits (unincorporated Maricopa County). Place only on private property with permission.",
    );
  }

  warnings.push(...GENERIC_WARNINGS);

  return warnings;
}
