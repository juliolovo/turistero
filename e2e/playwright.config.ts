import { defineConfig } from "@playwright/test";

const API = "http://localhost:4100";
const WEB = "http://localhost:3100";
const secrets = {
  API_SERVICE_TOKEN: "e2e-service-token-0123456789abcdef",
  API_JWT_SECRET: "e2e-jwt-secret-0123456789abcdef0123456789",
};

/**
 * E2E con el Chrome ya instalado (channel "chrome": sin descargar navegadores).
 * Levanta la API (PGlite en memoria + datos de ejemplo) y la web en modo dev, con login de desarrollo habilitado.
 * Nunca usar estos ajustes en producción.
 */
export default defineConfig({
  testDir: "./tests",
  timeout: 90_000,
  expect: { timeout: 25_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: WEB, channel: "chrome", trace: "retain-on-failure", locale: "es" },
  webServer: [
    {
      // Graph API simulada (solo para las pruebas de "Conectar con Meta")
      command: "node fake-meta-graph.mjs",
      url: "http://localhost:4300/health",
      reuseExistingServer: false,
      timeout: 30_000,
      env: { FAKE_META_PORT: "4300" },
    },
    {
      command: "npm run start -w @turistero/api",
      url: `${API}/health`,
      reuseExistingServer: false,
      timeout: 240_000,
      env: { ...secrets, PORT: "4100", ALLOW_DEV_AUTH: "1", ADMIN_EMAILS: "admin@dev.local", CORS_ORIGINS: WEB, CRON_SECRET: "e2e-cron-secret-0123456789", LOG_LEVEL: "warn", META_APP_ID: "1234567890", META_APP_SECRET: "e2e-app-secret-0123456789", TOKEN_ENCRYPTION_KEY: "e2e-clave-de-cifrado-0123456789", META_GRAPH_BASE: "http://localhost:4300" },
    },
    {
      // `next dev`: el login de desarrollo está deshabilitado en builds de producción
      command: "npm run dev -w @turistero/web -- -p 3100",
      url: WEB,
      reuseExistingServer: false,
      timeout: 240_000,
      env: { ...secrets, API_URL: API, AUTH_SECRET: "e2e-auth-secret-0123456789abcdef0123456789", AUTH_TRUST_HOST: "true", ALLOW_DEV_LOGIN: "1", NEXT_PUBLIC_SITE_URL: WEB, META_APP_ID: "1234567890" },
    },
  ],
});
