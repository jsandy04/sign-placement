// Eval address set — diverse Phoenix-metro property types so we can see how the trail logic
// behaves across real situations, not just one suburban subdivision.
//
// NOTE: swap these for REAL listing addresses you know when you can — the closer to real
// inventory, the better the signal. `count` is the sign budget requested for that run.
export const EVAL_ADDRESSES = [
  // --- Suburban subdivision (the "happy path") ---
  { category: "subdivision", count: 8, address: "7413 W Wescott Dr, Glendale, AZ 85308" },
  { category: "subdivision", count: 8, address: "9875 W Hatcher Rd, Peoria, AZ 85345" },
  { category: "subdivision", count: 5, address: "7413 W Wescott Dr, Glendale, AZ 85308" },
  { category: "subdivision", count: 12, address: "7413 W Wescott Dr, Glendale, AZ 85308" },

  // --- House directly on / facing a major arterial (no neighborhood turn-in) ---
  { category: "on-arterial", count: 8, address: "4455 E Camelback Rd, Phoenix, AZ 85018" },
  { category: "on-arterial", count: 8, address: "5757 N Scottsdale Rd, Scottsdale, AZ 85250" },

  // --- Apartment / condo complex (single entrance, no single front door) ---
  { category: "apartment", count: 8, address: "2150 E Bell Rd, Phoenix, AZ 85022" },
  { category: "apartment", count: 8, address: "16626 N 43rd Ave, Glendale, AZ 85306" },

  // --- Dense urban grid (downtown) ---
  { category: "urban", count: 8, address: "2 N Central Ave, Phoenix, AZ 85004" },

  // --- Gated / master-planned (Scottsdale) ---
  { category: "gated", count: 10, address: "10040 E Happy Valley Rd, Scottsdale, AZ 85255" },

  // --- Rural / isolated (arterial far away) ---
  { category: "rural", count: 8, address: "28990 N 152nd St, Scottsdale, AZ 85262" },
  { category: "rural", count: 8, address: "47600 N Black Canyon Hwy, New River, AZ 85087" },
];
