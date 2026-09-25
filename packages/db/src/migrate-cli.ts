import { createDb } from "./client";

// Las migraciones (DDL) las ejecuta el rol ADMINISTRADOR (DATABASE_ADMIN_URL). El rol de la aplicación (DATABASE_URL) no puede crear tablas.
const url = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;
const { close, kind } = await createDb({ url, migrate: true });
console.log(`Migraciones aplicadas (${kind})`);
await close();
