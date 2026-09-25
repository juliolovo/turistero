#!/usr/bin/env node
// Ejecuta las pruebas contra un Postgres REAL (el de docker-compose.yml): la API completa (base efímera por archivo de
// pruebas) y las pruebas de permisos de roles. Levanta el contenedor si no está arriba.
//
//   npm run test:pg
//
// Usa las credenciales locales por defecto de docker-compose.yml (solo para el contenedor local; puedes
// sobrescribirlas con PG_SUPERUSER_PASSWORD, ADMIN_DB_PASSWORD, MIGRATOR_DB_PASSWORD, APP_DB_PASSWORD y PG_PORT).
import { spawnSync } from "node:child_process";

const env = process.env;
const port = env.PG_PORT ?? "5433";
const db = env.DB_NAME ?? "turistero_db_dev";
const su = env.PG_SUPERUSER_PASSWORD ?? "turistero_postgres_pwd";
const adminUser = env.ADMIN_DB_USER ?? "turistero_admin_usr", adminPwd = env.ADMIN_DB_PASSWORD ?? "turistero_admin_pwd";
const migUser = env.MIGRATOR_DB_USER ?? "turistero_migrator_usr", migPwd = env.MIGRATOR_DB_PASSWORD ?? "turistero_migrator_pwd";
const appUser = env.APP_DB_USER ?? "turistero_app_usr", appPwd = env.APP_DB_PASSWORD ?? "turistero_app_pwd";

const run = (cmd, args, extraEnv = {}) => spawnSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32", env: { ...env, ...extraEnv } }).status ?? 1;

if (run("docker", ["compose", "up", "-d", "--wait"])) {
  console.error("No se pudo levantar Postgres con docker compose (¿está Docker en marcha?).");
  process.exit(1);
}
const testEnv = {
  TEST_DATABASE_URL: `postgres://postgres:${su}@127.0.0.1:${port}/postgres`,
  TEST_ADMIN_DATABASE_URL: `postgres://${adminUser}:${adminPwd}@127.0.0.1:${port}/${db}`,
  TEST_MIGRATOR_DATABASE_URL: `postgres://${migUser}:${migPwd}@127.0.0.1:${port}/${db}`,
  TEST_APP_DATABASE_URL: `postgres://${appUser}:${appPwd}@127.0.0.1:${port}/${db}`,
};
const a = run("npm", ["run", "test", "-w", "@turistero/db"], testEnv);
const b = run("npm", ["run", "test", "-w", "@turistero/api"], testEnv);
process.exit(a || b);
