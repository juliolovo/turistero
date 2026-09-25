import { createDb } from "./client";

const { close, kind } = await createDb({ migrate: true });
console.log(`Migraciones aplicadas (${kind})`);
await close();
