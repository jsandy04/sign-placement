import Database from "better-sqlite3";
import { and, lt, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { nanoid } from "nanoid";
import { analyses, migrationSql, placements, schema } from "./schema";
import type { SignPlacement, SignPlacementResult } from "@/lib/types";

type AnalysisStatus = "complete" | "degraded";

export interface InsertAnalysisInput {
  id?: string;
  address: string;
  formattedAddress?: string;
  lat: number;
  lng: number;
  signCount: number;
  status?: AnalysisStatus;
  degradationLevel?: number;
  result: SignPlacementResult;
  mapsCost?: number;
  llmCost?: number;
  placements?: SignPlacement[];
}

let dbInstance: ReturnType<typeof drizzle<typeof schema>> | undefined;
let sqliteInstance: Database.Database | undefined;

function databasePath() {
  const databaseUrl = process.env.DATABASE_URL ?? "file:./data/sign-placement.db";

  if (!databaseUrl.startsWith("file:")) {
    throw new Error("DATABASE_URL must use the file: scheme for SQLite");
  }

  return resolve(process.cwd(), databaseUrl.slice("file:".length));
}

function getDb() {
  if (!dbInstance) {
    const path = databasePath();
    mkdirSync(dirname(path), { recursive: true });
    sqliteInstance = new Database(path);
    sqliteInstance.exec(migrationSql);
    dbInstance = drizzle(sqliteInstance, { schema });
  }

  return dbInstance;
}

export function insertAnalysis(input: InsertAnalysisInput) {
  const db = getDb();
  const id = input.id ?? nanoid(10);
  const result = { ...input.result, id };
  const selectedPlacements = input.placements ?? result.placements;

  db.transaction((tx) => {
    tx.insert(analyses).values({
      id,
      address: input.address,
      formattedAddress: input.formattedAddress,
      lat: input.lat,
      lng: input.lng,
      signCount: input.signCount,
      status: input.status ?? "complete",
      degradationLevel: input.degradationLevel ?? result.degradationLevel,
      resultJson: JSON.stringify(result),
      mapsCost: input.mapsCost ?? result.costs.maps,
      llmCost: input.llmCost ?? result.costs.llm,
    }).run();

    if (selectedPlacements.length > 0) {
      tx.insert(placements)
        .values(
          selectedPlacements.map((placement) => ({
            id: placement.id,
            analysisId: id,
            sortOrder: placement.sortOrder,
            lat: placement.lat,
            lng: placement.lng,
            description: placement.description,
            reasoning: placement.reasoning,
            score: placement.score,
            placementType: placement.placementType,
            flag: placement.flag,
            isSelected: placement.isSelected ? 1 : 0,
          })),
        )
        .run();
    }
  });

  return result;
}

export function getAnalysis(id: string) {
  const db = getDb();
  const [row] = db
    .select({ resultJson: analyses.resultJson })
    .from(analyses)
    .where(and(eq(analyses.id, id), sql`${analyses.expiresAt} > datetime('now')`))
    .limit(1)
    .all();

  if (!row) {
    return null;
  }

  return JSON.parse(row.resultJson) as SignPlacementResult;
}

export function cleanupExpired() {
  const db = getDb();
  const expiredRows = db
    .select({ id: analyses.id })
    .from(analyses)
    .where(lt(analyses.expiresAt, sql`datetime('now')`))
    .all();
  const expiredIds = expiredRows.map((row) => row.id);

  if (expiredIds.length === 0) {
    return 0;
  }

  db.transaction((tx) => {
    for (const id of expiredIds) {
      tx.delete(placements).where(eq(placements.analysisId, id)).run();
      tx.delete(analyses).where(eq(analyses.id, id)).run();
    }
  });

  return expiredIds.length;
}
