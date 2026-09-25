import type { IncomingMessage, ServerResponse } from "node:http";
import { createDb } from "@turistero/db";
import { createApp } from "../src/app";

// Punto de entrada serverless (Vercel). Requiere DATABASE_URL (Postgres/Neon); las migraciones se corren aparte (`npm run db:migrate`).
let app: ReturnType<typeof createApp> | undefined;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (!process.env.DATABASE_URL) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: { code: "CONFIG", message: "Falta DATABASE_URL" } }));
    return;
  }
  app ??= createApp({
    db: (await createDb({ migrate: false })).db,
    serviceToken: process.env.API_SERVICE_TOKEN,
    jwtSecret: process.env.API_JWT_SECRET,
    adminEmails: process.env.ADMIN_EMAILS?.split(",").map((s) => s.trim()).filter(Boolean),
    corsOrigins: process.env.CORS_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean),
  });
  app(req as never, res as never);
}
