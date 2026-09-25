import { defineConfig } from "vitest/config";

// Las pruebas de integración recorren decenas de fuentes y, contra un Postgres real (npm run test:pg), tardan más que el límite por defecto (5 s).
export default defineConfig({ test: { testTimeout: 30_000, hookTimeout: 60_000 } });
