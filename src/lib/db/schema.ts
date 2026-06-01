import { sql } from "drizzle-orm";
import { integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const analyses = sqliteTable("analyses", {
  id: text("id").primaryKey(),
  address: text("address").notNull(),
  formattedAddress: text("formatted_address"),
  lat: real("lat").notNull(),
  lng: real("lng").notNull(),
  signCount: integer("sign_count").notNull(),
  status: text("status").default("complete"),
  degradationLevel: integer("degradation_level").default(0),
  resultJson: text("result_json").notNull(),
  mapsCost: real("maps_cost").default(0),
  llmCost: real("llm_cost").default(0),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  expiresAt: text("expires_at").default(sql`(datetime('now', '+30 days'))`),
});

export const placements = sqliteTable("placements", {
  id: text("id").primaryKey(),
  analysisId: text("analysis_id")
    .notNull()
    .references(() => analyses.id),
  sortOrder: integer("sort_order").notNull(),
  lat: real("lat").notNull(),
  lng: real("lng").notNull(),
  description: text("description"),
  reasoning: text("reasoning"),
  score: real("score"),
  placementType: text("placement_type"),
  flag: text("flag"),
  isSelected: integer("is_selected").default(1),
});

export const rateLimits = sqliteTable(
  "rate_limits",
  {
    ip: text("ip").notNull(),
    date: text("date").notNull(),
    count: integer("count").default(1),
  },
  (table) => [primaryKey({ columns: [table.ip, table.date] })],
);

export const schema = {
  analyses,
  placements,
  rateLimits,
};

export const migrationSql = `
CREATE TABLE IF NOT EXISTS analyses (
  id TEXT PRIMARY KEY,
  address TEXT NOT NULL,
  formatted_address TEXT,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  sign_count INTEGER NOT NULL,
  status TEXT DEFAULT 'complete',
  degradation_level INTEGER DEFAULT 0,
  result_json TEXT NOT NULL,
  maps_cost REAL DEFAULT 0,
  llm_cost REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT DEFAULT (datetime('now', '+30 days'))
);

CREATE TABLE IF NOT EXISTS placements (
  id TEXT PRIMARY KEY,
  analysis_id TEXT NOT NULL REFERENCES analyses(id),
  sort_order INTEGER NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  description TEXT,
  reasoning TEXT,
  score REAL,
  placement_type TEXT,
  flag TEXT,
  is_selected INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS rate_limits (
  ip    TEXT NOT NULL,
  date  TEXT NOT NULL,
  count INTEGER DEFAULT 1,
  PRIMARY KEY (ip, date)
);
`;
