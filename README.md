# Turistero

Agrega en un solo lugar los **viajes, tours y eventos** que publican tus operadoras y lugares favoritos (Facebook, Instagram, webs), sin tener que revisarlos uno a uno. Multi-país por diseño; Nicaragua (Managua, León…) es el catálogo semilla.

> **Estado**: fases 1–7 implementadas más agenda personal, horarios por usuario, avisos, 5 métodos de acceso, Meta App documentada y pipelines. Lo que falta para producción real está en [Pendiente](#pendiente).
> Guías: [`docs/AI-RUNBOOK.md`](docs/AI-RUNBOOK.md) (despliegue paso a paso para una IA) · [`docs/DATABASE.md`](docs/DATABASE.md) (Neon vs Supabase) · [`SECURITY.md`](SECURITY.md) (secretos y reglas) · [`docs/DEPLOY.md`](docs/DEPLOY.md) (Neon + Vercel + GitHub) · [`docs/AUTH.md`](docs/AUTH.md) (proveedores de login) · [`meta-app/README.md`](meta-app/README.md) (Meta App: qué se puede y qué no, registro y App Review).
> Los eventos que ves con la semilla de desarrollo son **datos de ejemplo** (`isMock`): se rotulan “Ejemplo” en la UI, no se indexan y jamás enlazan a una publicación inventada.

## Principios (no negociables)
- **Sin scraping agresivo ni evasión.** Sitios web públicos: `robots.txt`, User-Agent identificable, timeouts, límites de tamaño, espaciado por host y bloqueo de SSRF. **Facebook/Instagram: solo API oficial de Meta con credenciales autorizadas**; sin credenciales el estado es `AUTH_REQUIRED` y no se consulta nada.
- **Nunca se inventa información.** Sin fecha reconocible no hay evento. Lo dudoso baja a confianza `LOW` y queda en revisión (no público).
- **El origen siempre es visible.** `originalPostUrl` es nullable y **nunca** se rellena con la URL del perfil (`EVENT_SOURCE_URL` vs `PROFILE_URL`). Sin enlace directo se muestra “Sin enlace directo”.
- **Auditoría total.** Cada corrida registra *todas* las fuentes activas (`source_check`); ninguna desaparece del reporte.
- **Sin secretos en Git.** Tokens de Meta cifrados en BD (AES-256-GCM); `sources.json` solo lleva configuración pública.

## Arquitectura
```
apps/web        Next.js 16 (App Router, RSC, Tailwind v4, Auth.js v5)   -> lee la API (o mocks si no hay API_URL)
apps/api        Express 5 + Zod + pino + jose                           -> REST /api/*, cron, planificador
packages/types         tipos de dominio            packages/schemas   Zod (DTOs, sources.json)
packages/config        categorías+emoji, lugares, fechas/zonas, brand
packages/event-parser  fechas/horas/precios en español, clasificación, deduplicación, JSON-LD/OpenGraph, confianza
packages/discovery     adaptadores (Website, RSS, Facebook, Instagram, Manual, Search) + fetch seguro
packages/db            Drizzle ORM: esquema, migraciones, consultas, cifrado de tokens, seed
packages/mocks         eventos de ejemplo
config/sources.json    catálogo de fuentes versionado (semilla / respaldo)
e2e/                   Playwright (usa el Chrome instalado)
meta-app/              guía + manifiesto + textos de App Review + scripts de verificación de la Meta App
docs/                  DEPLOY.md, AUTH.md      .github/workflows  CI, deploy (apagado por defecto), cron horario
```
Decisiones: **Drizzle** (ligero, SQL-first, Neon) · **PGlite** en dev/tests y Postgres real con `DATABASE_URL` (mismo esquema y migraciones) · web y API separados, la web firma un JWT de 2 min para hablar con la API en nombre del usuario y **el rol se lee siempre de la BD** · npm workspaces (sin pnpm).

## Requisitos y ejecución local
Node ≥ 20 (probado con 26) y npm. No necesitas Postgres para desarrollar.
```bash
npm install
npm run api        # API en :4000 (PGlite + semilla de fuentes y eventos de ejemplo; lee apps/api/.env.local)
npm run dev        # web en :3000 (lee apps/web/.env.local)
npm test           # unit + integración (config, event-parser, discovery, API)
npm run typecheck
npm run db:up       # Postgres local en Docker (BD turistero_db_dev, roles admin y app) — ver docs/DATABASE.md
npm run test:pg    # pruebas de roles + API completa contra Postgres real (Docker)
npm run e2e        # Playwright con Chrome instalado; levanta API :4100 y web :3100
npm run meta:check # verifica tu token y tu Meta App (solo lectura; ver meta-app/README.md)
```
Sin `API_URL` la web funciona sola con mocks en memoria. Copia `.env.example` para ver todas las variables.

## Base de datos
```bash
npm run db:generate   # nueva migración tras editar packages/db/src/schema.ts
npm run db:migrate    # aplica migraciones (DATABASE_URL o PGlite)
npm run db:seed       # carga config/sources.json (añade -- --mocks para eventos de ejemplo)
```
Producción: crea una base en Neon/Supabase, define `DATABASE_URL`, `db:migrate` y `db:seed` (sin `--mocks`).

## Fuentes
`config/sources.json` es semilla y respaldo (22 fuentes). Cada una: `id, name, aliases, type, country, city, categories, active, priority, urls{website,facebook,instagram,tiktok,rss}, verification, lastReviewedAt, notes`.
- `verification: "verified"` solo cuando se comprobó que la URL pertenece a esa entidad. **No se vincula Instagram↔Facebook por parecido de nombre**: p. ej. `@larutanicaragua` no se asocia a Ruta Segura.
- Nombres de las páginas de Facebook tomados del título público de cada página: TAVÚ - Tours & Travel (id 61577210645241), NicaRoad, Wanderlust Travel, Transporte Dávila & Tours, Finding Adventures Nicaragua (León), Ruta Segura, Teatro Nacional Rubén Darío. **Multicentro Las Brisas** (id 100064698308827) queda `unverified`. Sin Instagram/web oficial vinculados todavía.
- Alias (Mamuth/Mamut/Black Mamut…) no fusionan negocios distintos sin verificar.

**Agregar una fuente**: `/admin/sources` → *Agregar fuente*, o `POST /api/sources`, o editar `sources.json` y `npm run db:seed`.
**Exportar**: botón *Exportar JSON* (`GET /api/sources/export`). **Importar** (ADMIN): `/admin/sources` → *Importar sources.json* (`merge` no pisa lo existente; `replace-matching` sobrescribe por id).

## Discovery (cómo funciona)
Para cada fuente activa se ejecutan los adaptadores aplicables y se combinan (`checkSourceContent`):
| Adaptador | Qué hace |
|---|---|
| `WebsiteAdapter` | Portada + hasta 4 subpáginas de eventos del mismo dominio: JSON-LD `schema.org/Event`, OpenGraph, feed RSS anunciado. Recoge perfiles sociales nuevos → candidatos |
| `RSSAdapter` | Feed RSS/Atom declarado en `urls.rss` |
| `FacebookAdapter` | Graph API `/{page}/posts` con token autorizado; guarda `permalink_url` real |
| `InstagramAdapter` | Business Discovery (cuentas profesionales) con el IG User ID conectado; guarda `permalink` real |
| `ManualAdapter` | Un editor pega una URL pública o el texto de una publicación (`/admin/add-event`) |
| `SearchAdapter` | Descubre fuentes nuevas con un proveedor de búsqueda pluggable (sin proveedor configurado devuelve `ACCESS_RESTRICTED`) |

Luego `event-parser` extrae título, fecha/hora (español informal: “viernes 25 de septiembre 8 PM”, “mañana”, “este sábado”…), lugar, ciudad, precio (`C$` = NIO, `$`/`US$` = USD, “entrada libre”), categoría y **confianza** (`HIGH` fecha+hora+lugar+categoría claros · `MEDIUM` incompleto · `LOW` ambiguo). Público: HIGH y MEDIUM; LOW queda `PENDING` para revisión. La **deduplicación** (título normalizado + día + lugar + similitud) fusiona el mismo evento visto en varias fuentes conservando **todas** (`event_source`).
Estados de auditoría: `SUCCESS · NO_EVENTS · NO_RECENT_CONTENT · ACCESS_RESTRICTED · AUTH_REQUIRED · RATE_LIMITED · NOT_FOUND · ERROR`.

### Meta (Facebook / Instagram)
- **Login**: Google y Facebook (`public_profile`, `email`). **Instagram no se ofrece como login**: la API de Meta para Instagram solo admite cuentas profesionales (Business/Creator).
- **Lectura de contenido** (Fase 4, `/admin/connections`, solo ADMIN): pegas un token y su ID; se guarda **cifrado** con `TOKEN_ENCRYPTION_KEY`.
  - Facebook: requiere la función *Page Public Content Access* (App Review de Meta) para leer Páginas de terceros.
  - Instagram: Business Discovery lee cuentas profesionales públicas usando el IG User ID de una cuenta profesional tuya y un token de Facebook Login.
  - Meta **no** expone la lista de páginas que alguien sigue: la lista se arma pegando URLs/nombres; los “posibles lugares nuevos” salen de menciones y enlaces en lo revisado y de búsquedas.
  - Los códigos de error de Graph API se traducen a estados de auditoría (mejor esfuerzo; verifica contra la documentación vigente de Meta y ajusta `GRAPH_VERSION` con `META_GRAPH_VERSION`, por defecto `v21.0`).
  - Aún no hay flujo OAuth de “conectar Meta” en la UI: requiere App Review y verificar los scopes vigentes. Mientras, `META_FB_TOKEN` / `META_IG_TOKEN` + `META_IG_USER_ID` permiten probar.

## Auth
Cinco métodos: **usuario y contraseña**, **Google**, **Meta (Facebook)**, **Microsoft** y **Apple** (Instagram no es un login: solo cuentas profesionales). Detalle, credenciales y reglas de seguridad en [`docs/AUTH.md`](docs/AUTH.md). Roles: `USER` (favoritos, fuentes propias, horario), `EDITOR` (eventos, fuentes, candidatos, corridas), `ADMIN` (usuarios, borrado, import, conexiones).
- Vinculación por correo solo con proveedores que lo verifican (Google, Apple); anti pre-secuestro de cuentas con contraseña; bloqueo tras 5 intentos fallidos.
- En desarrollo: `ALLOW_DEV_LOGIN=1` (web) + `ALLOW_DEV_AUTH=1` (API); el usuario `admin` es ADMIN si `ADMIN_EMAILS=admin@dev.local`.
- Si la API ya no reconoce la cookie (BD reiniciada), la web cierra la sesión sola (`/auth/expired`).

## Mis fuentes y mi agenda (`/my`)
Cada usuario arma su propia lista: **fuentes propias** (pega el sitio, RSS, Facebook o Instagram de una operadora; máx. 50) y **suscripciones** a fuentes del catálogo compartido. En la home, el chip **⭐ Mi agenda** (`?mine=1`) muestra solo lo de esas fuentes.
- Lo que se descubre en una fuente propia es **privado**: solo lo ve su dueño (ni el personal de moderación lo lista). Si una fuente del catálogo encuentra después el mismo evento, se hace público; una fuente privada nunca se añade a un evento público. Al eliminar la fuente se van sus eventos privados.
- Las fuentes privadas no aparecen en el catálogo, ni en el export, ni son accesibles por id (404). Revisión manual limitada a una cada 5 min por fuente; el cron también las revisa.
- Limitación actual: Facebook/Instagram de fuentes propias usan la conexión de Meta del administrador (`/admin/connections`); hasta que exista esa conexión quedan `AUTH_REQUIRED`. Sitios web y RSS funcionan ya. Una conexión de Meta por usuario requiere el flujo OAuth (App Review).

## Administración (`/admin`, EDITOR+)
Resumen · **Fuentes** (editar, activar/desactivar, revisar ahora, abrir Facebook/Instagram, eliminar (ADMIN), historial, import/export) · **Estado de fuentes** (`/admin/sources/status`: última revisión, publicaciones revisadas, eventos, motivo; racha de fallos) · **Candidatos** (aprobar, rechazar, fusionar sin pisar URLs) · **Eventos** (aprobar, ocultar, editar, fusionar duplicados) · **Agregar evento** (URL o texto) · **Corridas** (`/admin/runs`, *Ejecutar búsqueda ahora*) · Usuarios y Conexiones Meta (ADMIN).

## Revisión programada (cron), cortesía y avisos
Nada se revisa "a cada rato" ni con un navegador: solo **peticiones HTTP puntuales** (sin Chrome), respetando `robots.txt`, con espera entre peticiones al mismo sitio y APIs oficiales de Meta.
- **Una lectura por fuente al día** (`MIN_RECHECK_HOURS=24`) y, si falla por algo temporal (red, límite de peticiones), **un reintento pasada 1 hora**. `AUTH_REQUIRED`, `ACCESS_RESTRICTED` y `NOT_FOUND` no se reintentan. Vale también para **Buscar ahora**.
- **Horario por persona** (`/my` → *¿Cuándo revisar?*): días, hora y zona horaria; por defecto **lunes, miércoles y viernes 05:15**. Cada fuente propia se revisa en el horario de su dueño; el catálogo compartido, lun/mié/vie 05:15 America/Managua.
- **Planificador** `GET /api/cron/discovery` (`Bearer $CRON_SECRET`): idempotente; decide qué toca. Se llama con **Vercel Cron** (diario, plan Hobby), **GitHub Actions** (cada hora, `scheduled-discovery.yml`) o `ENABLE_LOCAL_CRON=1` (proceso propio). Ver `docs/DEPLOY.md` §6.
- **Alertas**: mientras se revisa, la fuente muestra “🔎 revisando ahora” (la página se actualiza sola); al terminar recibes *Novedades* (“🆕 N eventos nuevos en X”, “⚠️ no pudimos revisar X”) y el menú muestra cuántas no has leído. Al iniciar una revisión programada se te avisa “Estamos revisando ahora tus fuentes”.
- **Auditoría** (`/admin/sources/status`): todas las fuentes activas quedan registradas en cada corrida.

## Despliegue en Vercel (resumen; guía completa en [`docs/DEPLOY.md`](docs/DEPLOY.md))
- **web**: proyecto con root `apps/web`. Variables: `API_URL`, `API_SERVICE_TOKEN`, `API_JWT_SECRET`, `AUTH_SECRET`, `AUTH_GOOGLE_*`, `AUTH_FACEBOOK_*`, `NEXT_PUBLIC_SITE_URL`.
- **api**: proyecto con root `apps/api` (`api/index.ts` + `vercel.json`). Variables: `DATABASE_URL`, `API_SERVICE_TOKEN`, `API_JWT_SECRET`, `ADMIN_EMAILS`, `CORS_ORIGINS`, `CRON_SECRET`, `TOKEN_ENCRYPTION_KEY`. Migraciones aparte (`npm run db:migrate`).
- `sitemap.xml` excluye los datos de ejemplo; genera `JSON-LD Event`, metadata y canonical por evento.

## API (resumen)
Listados paginados `{ items, page, pageSize, total }`; entrada validada con Zod; errores `{ error: { code, message } }`. Ver `apps/api/src/app.ts` para la lista completa: eventos, fuentes (+`/export`, `/import`, `/status`, `/:id/check`, `/:id/checks`), candidatos, corridas, favoritos, usuarios, filtros guardados, conexiones, `events/from-source-content`, `events/:id/merge`, `cron/discovery`.
Auth de la API: `Bearer $API_SERVICE_TOKEN` (servidor a servidor), `Bearer <JWT>` de usuario (HS256, `iss=turistero-web`, `aud=turistero-api`) o, solo en desarrollo, `x-dev-user: id:ROLE`.

## Pruebas
`npm test`: **config** (fechas/zonas/títulos), **event-parser** (fechas, precios, clasificación, deduplicación, HTML, extracción), **discovery** (fetch seguro/SSRF/robots, adaptadores, Graph API simulada), **API** (integración con PGlite: eventos, fuentes, auth/JWT/roles, discovery de punta a punta, cron, conexiones cifradas). `npm run e2e`: home, filtros, búsqueda, lista/cards, detalle, login, favoritos, admin, móvil, teclado.

## Pendiente
- Registrar la Meta App y pasar App Review (todo lo necesario está en [`meta-app/`](meta-app/README.md)); flujo OAuth “Conectar Meta” en la UI, que depende de esa aprobación; proveedor real para `SearchAdapter`.
- Recuperación de contraseña y verificación de correo (requieren un servicio de correo).
- Registrar los proveedores de login (Google, Microsoft, Apple) con tus credenciales y desplegar (pipelines listos, apagados).
- Investigar Instagram/web oficiales de las fuentes sin URLs y verificar sus vínculos.
- Conexión de Meta por usuario (hoy se usa la del administrador) y más países/ciudades (el catálogo de lugares aún es solo Nicaragua).
- Recomendaciones más allá de “También podría interesarte” (por ahora: recencia + ciudad).
- Paginación en la home (hoy hasta 100 eventos) y caché de listados en producción.
