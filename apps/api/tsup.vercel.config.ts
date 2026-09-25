import { defineConfig } from "tsup";

/**
 * Empaqueta la API como una función serverless de Vercel: `api/index.js` (ESM), con los paquetes del monorepo
 * (@turistero/*, código TypeScript) incluidos dentro del bundle. Las dependencias de npm quedan como externas
 * (Vercel las instala). PGlite solo se carga en desarrollo, así que no forma parte del despliegue.
 */
export default defineConfig({
  entry: { index: "src/vercel-entry.ts" },
  outDir: "api",
  format: ["esm"],
  platform: "node",
  target: "node20",
  splitting: false,
  clean: false,
  noExternal: [/^@turistero\//],
  external: ["@electric-sql/pglite"],
  sourcemap: false,
});
