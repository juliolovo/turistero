# Guía para agentes de IA (y para personas nuevas)

Turistero: agregador de viajes y eventos. Monorepo npm workspaces: `apps/web` (Next.js 16), `apps/api` (Express 5), `packages/*`, `e2e`, `meta-app`, `docs`. Lee `README.md` primero.

## Reglas críticas — información sensible
1. **Nunca** imprimas, registres, commitees ni pegues en un chat/PR/issue: tokens, secretos, contraseñas, cadenas de conexión con contraseña, claves privadas, `.env*`. Si un valor se mostró por accidente, trátalo como filtrado y **rótalo**.
2. Los secretos viven en `apps/*/.env.local` (ignorados), en variables de Vercel/GitHub o cifrados en la BD. Para crearlos usa canalizaciones sin mostrar el valor: `openssl rand -base64 32 | vercel env add NOMBRE production`.
3. Antes de cada commit/push corre `npm run secrets:check` (los hooks también lo hacen). **Nunca** uses `--no-verify` ni desactives `core.hooksPath`. El repo es **público**.
4. No agregues correos reales, teléfonos ni datos personales a código, docs, tests ni fixtures: usa `@example.com` / `@dev.local`.
5. No hagas scraping de Facebook/Instagram ni automatices navegadores contra ellos. Solo API oficial de Meta, con credenciales autorizadas. Respeta los límites (una lectura por fuente al día).
6. Acciones que **solo un humano** puede hacer (no las intentes): crear cuentas (Neon/Supabase/Vercel/Meta/Google/Microsoft/Apple), aceptar términos, verificar el negocio, pasar App Review, pagar planes, crear tokens personales. Pide al usuario que las haga y que te pase **solo** los identificadores no secretos.
7. No despliegues a producción ni cambies visibilidad/ajustes del repo sin que el usuario lo pida explícitamente en esa conversación.

## Comandos
```bash
npm install            # instala y activa los hooks de seguridad (.githooks)
npm run api            # API :4000 (PGlite en memoria, datos de ejemplo)   ← lee apps/api/.env.local
npm run dev            # web :3000                                          ← lee apps/web/.env.local
npm run typecheck      # tsc en todos los paquetes
npm test               # unitarios + integración + detector de secretos
npm run e2e            # Playwright (usa Chrome instalado; levanta API :4100, web :3100 y una Graph API simulada :4300)
npm run secrets:check  # detector de secretos sobre lo versionado
npm run db:generate    # nueva migración tras editar packages/db/src/schema.ts
npm run db:migrate     # aplica migraciones (DATABASE_URL o PGlite)
```

## Convenciones
- TypeScript estricto; validación de entrada con Zod (`packages/schemas`); consultas en `packages/db`; lógica de descubrimiento en `packages/discovery` y `packages/event-parser`.
- Toda funcionalidad nueva lleva pruebas (Vitest en paquetes/API, Playwright en `e2e/`). No des por terminado algo sin correrlas.
- Nunca se inventan eventos; `originalPostUrl` nunca se sustituye por el perfil; el origen siempre es visible.
- Cambios de esquema: solo con `db:generate` (migraciones aditivas).
- Next.js 16 tiene cambios respecto a versiones anteriores: consulta `node_modules/next/dist/docs/` antes de usar APIs nuevas (ver `apps/web/AGENTS.md`).
- En Windows/Git Bash, evita comandos multilínea con comillas complejas; escribe los scripts en archivos.

## Guías operativas
- Despliegue paso a paso (para una IA): [`docs/AI-RUNBOOK.md`](docs/AI-RUNBOOK.md)
- Base de datos (Neon vs Supabase): [`docs/DATABASE.md`](docs/DATABASE.md) · Vercel + GitHub: [`docs/DEPLOY.md`](docs/DEPLOY.md)
- Login: [`docs/AUTH.md`](docs/AUTH.md) · Meta App: [`meta-app/README.md`](meta-app/README.md) · Seguridad: [`SECURITY.md`](SECURITY.md)
