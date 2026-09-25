import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import { migrate as migratePg } from "drizzle-orm/postgres-js/migrator";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export interface DbHandle {
  db: Db;
  close: () => Promise<void>;
  kind: "postgres" | "pglite";
}

const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../drizzle");

/**
 * Con DATABASE_URL usa Postgres (Neon/Supabase). Sin ella usa PGlite (Postgres en proceso):
 * - `dataDir` persiste en disco para desarrollo local;
 * - sin `dataDir` es en memoria, ideal para tests.
 */
export async function createDb(opts: { url?: string; dataDir?: string; migrate?: boolean } = {}): Promise<DbHandle> {
  const url = opts.url ?? process.env.DATABASE_URL;
  if (url) {
    const client = postgres(url, { max: 5, prepare: false });
    const db = drizzlePg(client, { schema });
    if (opts.migrate) await migratePg(db, { migrationsFolder });
    return { db: db as unknown as Db, close: () => client.end(), kind: "postgres" };
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const client = new PGlite(opts.dataDir);
  const db = drizzlePglite(client, { schema });
  if (opts.migrate ?? true) await migratePglite(db, { migrationsFolder });
  return { db: db as unknown as Db, close: () => client.close(), kind: "pglite" };
}
