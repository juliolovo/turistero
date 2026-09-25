import { randomBytes } from "node:crypto";
import postgres from "postgres";
import { createDb, type DbHandle } from "./client";

/**
 * Base de datos para PRUEBAS. Sin configuración usa PGlite en memoria (rápido, sin dependencias).
 * Con `TEST_DATABASE_URL` (una URL con permiso CREATEDB, p. ej. el superusuario del Postgres de docker-compose)
 * crea una base de datos EFÍMERA en ese servidor Postgres real para cada llamada y la elimina al cerrar:
 *
 *   TEST_DATABASE_URL=postgres://postgres:...@127.0.0.1:5433/postgres npm test
 *
 * Así las mismas pruebas de integración se ejecutan contra Postgres de verdad (migraciones incluidas).
 * No se exporta desde el índice del paquete: no debe formar parte del bundle de producción.
 */
export async function createTestDb(): Promise<DbHandle> {
  const base = process.env.TEST_DATABASE_URL;
  if (!base) return createDb({ url: "", migrate: true }); // "" fuerza PGlite aunque exista DATABASE_URL

  const name = `turistero_test_${randomBytes(6).toString("hex")}`;
  const admin = postgres(base, { max: 1, onnotice: () => {} });
  await admin.unsafe(`CREATE DATABASE ${name}`);
  const u = new URL(base);
  u.pathname = `/${name}`;
  const handle = await createDb({ url: u.toString(), migrate: true });
  return {
    ...handle,
    close: async () => {
      await handle.close();
      await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await admin.end();
    },
  };
}

export const usingRealPostgres = () => !!process.env.TEST_DATABASE_URL;
