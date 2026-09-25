import { createDb, seedMockEvents, seedSources } from "@turistero/db";
import { createSafeFetcher } from "@turistero/discovery";
import { createApp } from "./app";
import { runScheduledTick } from "./tick";

const port = Number(process.env.PORT ?? 4000);
const handle = await createDb({ migrate: true, dataDir: process.env.PGLITE_DIR });

// Desarrollo local sin Postgres: BD PGlite con semilla. En producción se usa DATABASE_URL y se siembra aparte.
if (handle.kind === "pglite" && process.env.SEED_ON_START !== "0") {
  await seedSources(handle.db);
  if (process.env.SEED_MOCKS !== "0") await seedMockEvents(handle.db);
}

const app = createApp({
  db: handle.db,
  serviceToken: process.env.API_SERVICE_TOKEN,
  jwtSecret: process.env.API_JWT_SECRET,
  adminEmails: process.env.ADMIN_EMAILS?.split(",").map((s) => s.trim()).filter(Boolean),
  allowDevAuth: process.env.ALLOW_DEV_AUTH === "1" && process.env.NODE_ENV !== "production",
  corsOrigins: process.env.CORS_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean),
});

app.listen(port, () => console.log(`API en http://localhost:${port} (db: ${handle.kind})`));

if (process.env.ENABLE_LOCAL_CRON === "1") {
  // Servidor propio (sin Vercel Cron): cada 10 minutos evalúa qué toca; la política de cortesía evita repeticiones.
  const deps = { db: handle.db, fetcher: createSafeFetcher() };
  const t = setInterval(() => {
    runScheduledTick(deps, { budgetMs: 120_000 }).then((r) => r.checked && console.log("[cron]", JSON.stringify(r))).catch((e) => console.log("[cron] falló:", (e as Error).message));
  }, 10 * 60_000);
  t.unref();
}
