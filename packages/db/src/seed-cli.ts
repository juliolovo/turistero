import { createDb } from "./client";
import { seedMockEvents, seedSources } from "./seed";

const withMocks = process.argv.includes("--mocks");
const { db, close, kind } = await createDb({ url: process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL, migrate: true, dataDir: process.env.PGLITE_DIR });
console.log(`DB: ${kind}`);
console.log("sources:", await seedSources(db));
if (withMocks) console.log("mock events:", await seedMockEvents(db));
await close();
