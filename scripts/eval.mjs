// Sign-placement eval harness.
//
// Runs every address in eval-addresses.mjs through the real /api/analyze pipeline (same path
// the UI uses), then scores the output so we can spot systemic issues across property types
// instead of eyeballing one map at a time.
//
// Usage (dev server must be running on :3000):
//   npm run dev          # in one terminal
//   npm run eval         # in another
//
// Optional: BASE_URL=http://localhost:3001 npm run eval
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { EVAL_ADDRESSES } from "./eval-addresses.mjs";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const HERE = dirname(fileURLToPath(import.meta.url));

// Distance bands (ft) used to judge WHERE signs land relative to the house.
const NEAR_HOUSE_FT = 800; // ~last block / inside the neighborhood near the door
const FAR_FT = 2_640; // 0.5 mi — beyond this is arterial / approach territory

function haversineFt(a, b) {
  const R = 20_902_231; // earth radius in feet
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function analyze(address, signCount) {
  const res = await fetch(`${BASE_URL}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, signCount }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 160)}`);
  }
  return res.json();
}

function scoreResult(item, result) {
  const placements = result.placements ?? [];
  const property = placements.find((p) => p.placementType === "property");
  const signs = placements.filter((p) => p.placementType !== "property");

  // Per-approach distribution.
  const byApproach = {};
  for (const p of signs) {
    const k = p.approachIndex ?? 0;
    byApproach[k] = (byApproach[k] ?? 0) + 1;
  }
  const approachCounts = Object.values(byApproach);

  // Distance-from-house bands (only meaningful if we have a property anchor).
  let near = 0;
  let mid = 0;
  let far = 0;
  let maxFt = 0;
  if (property) {
    for (const p of signs) {
      const d = haversineFt(property, p);
      maxFt = Math.max(maxFt, d);
      if (d <= NEAR_HOUSE_FT) near += 1;
      else if (d <= FAR_FT) mid += 1;
      else far += 1;
    }
  }

  // Placement-type breakdown.
  const types = {};
  for (const p of placements) {
    types[p.placementType] = (types[p.placementType] ?? 0) + 1;
  }

  // "available" routes are discovered-but-unfunded approaches we surface on purpose (faded, with a
  // "needs +N signs" hint) — they're EXPECTED to have no signs, so they're not phantom routes. Only
  // funded routes should carry signs; a funded route with none is the real phantom case.
  const allRoutes = result.routes ?? [];
  const fundedRoutes = allRoutes.filter((route) => route.status !== "available");
  const availableRoutes = allRoutes.length - fundedRoutes.length;
  const routesReported = fundedRoutes.length;
  const routesWithSigns = Object.keys(byApproach).length;

  // Flags = the things we actually care about going wrong.
  const flags = [];
  if (placements.length < item.count) flags.push(`COUNT_SHORT(${placements.length}/${item.count})`);
  if (property && near === 0 && signs.length > 0) flags.push("NONE_NEAR_HOUSE");
  if (routesReported > routesWithSigns) flags.push(`PHANTOM_ROUTES(${routesWithSigns}/${routesReported})`);
  if (approachCounts.length > 1 && Math.min(...approachCounts) <= 1 && Math.max(...approachCounts) >= 4) {
    flags.push("LOPSIDED");
  }
  if (!property) flags.push("NO_PROPERTY_SIGN");
  if ((result.degradationLevel ?? 0) >= 3) flags.push(`DEGRADED(${result.degradationLevel})`);

  return {
    routesReported,
    routesWithSigns,
    availableRoutes,
    byApproach,
    placed: placements.length,
    near,
    mid,
    far,
    maxFt: Math.round(maxFt),
    types,
    degradationLevel: result.degradationLevel ?? 0,
    flags,
  };
}

async function main() {
  const rows = [];
  for (const item of EVAL_ADDRESSES) {
    process.stdout.write(`• [${item.category}] ${item.address} (n=${item.count}) ... `);
    try {
      const result = await analyze(item.address, item.count);
      const score = scoreResult(item, result);
      rows.push({ ...item, ok: true, score });
      console.log(score.flags.length ? `⚠ ${score.flags.join(" ")}` : "ok");
    } catch (error) {
      rows.push({ ...item, ok: false, error: String(error.message ?? error) });
      console.log(`ERROR ${error.message ?? error}`);
    }
  }

  // Report table.
  console.log("\n" + "=".repeat(110));
  console.log("EVAL REPORT");
  console.log("=".repeat(110));
  const header = [
    "category".padEnd(13),
    "n".padStart(3),
    "placed".padStart(6),
    "routes".padStart(7),
    "dist(N/M/F)".padStart(12),
    "maxft".padStart(6),
    "flags",
  ].join(" ");
  console.log(header);
  console.log("-".repeat(110));
  for (const row of rows) {
    if (!row.ok) {
      console.log(`${row.category.padEnd(13)} ${String(row.count).padStart(3)}  ERROR: ${row.error}`);
      continue;
    }
    const s = row.score;
    // funded-with-signs / funded-reported (+N surfaced "available" approaches)
    const routes = `${s.routesWithSigns}/${s.routesReported}${s.availableRoutes ? `+${s.availableRoutes}` : ""}`;
    const dist = `${s.near}/${s.mid}/${s.far}`;
    console.log(
      [
        row.category.padEnd(13),
        String(row.count).padStart(3),
        String(s.placed).padStart(6),
        routes.padStart(7),
        dist.padStart(12),
        String(s.maxFt).padStart(6),
        s.flags.join(" ") || "ok",
      ].join(" "),
    );
  }

  // Aggregate signal.
  const ok = rows.filter((r) => r.ok);
  const flagTally = {};
  for (const r of ok) for (const f of r.score.flags) {
    const key = f.split("(")[0];
    flagTally[key] = (flagTally[key] ?? 0) + 1;
  }
  console.log("-".repeat(110));
  console.log(
    `Ran ${rows.length} | ok ${ok.length} | errors ${rows.length - ok.length} | flag tally:`,
    Object.keys(flagTally).length ? flagTally : "none",
  );
  console.log(
    "Legend: dist(N/M/F) = signs Near(<=800ft) / Mid / Far(>0.5mi) from house. routes = funded-withSigns/funded-reported(+N surfaced-but-unfunded approaches).",
  );

  const outPath = join(HERE, "eval-results.json");
  writeFileSync(outPath, JSON.stringify(rows, null, 2));
  console.log(`\nRaw results written to ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
