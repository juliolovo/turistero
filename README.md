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
Node ≥ 24 (LTS; probado con 24 y 26) y npm. Postgres 18 (Docker) para las pruebas reales. No necesitas Postgres para desarrollar.
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
- 20 de las 22 fuentes tienen ya algún enlace. Los enlaces salen de búsquedas web públicas (2026-09-25) y `verified` significa que el nombre que muestra la propia cuenta coincide con la entidad y la ciudad; lo dudoso queda `unverified` con su nota (p. ej. el Instagram de Cántabar/“Canta Bar”, o el de El Paso, que puede no ser el de León). **La Sanatura** y **Sabu Tours** no aparecieron en las búsquedas.
- Stereo Beso (94.5 FM, Estelí) entra por su **web** de próximos eventos, que sí se puede leer sin API.
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

### Meta (Facebook / Instagram): dos usos distintos de la misma app
1. **Iniciar sesión con Facebook** (`AUTH_FACEBOOK_ID/SECRET`, permisos `public_profile` y `email`): solo identifica a la persona; no necesita token ni "conexión". **Instagram no se ofrece como login**: la API de Meta para Instagram solo admite cuentas profesionales (Business/Creator).
2. **Leer publicaciones** (Graph API) con **una sola conexión** (la del administrador, `/admin/connections`): todas las llamadas a las APIs de Meta (para todas las fuentes de Facebook e Instagram, propias o del catálogo) usan ese token. No hace falta una conexión por usuario.
   - **Botón "Conectar con Meta"**: OAuth con `state` anti-CSRF de un solo uso → la API canjea el código con el secreto de la app, obtiene un token de larga duración (~60 días), detecta tus Páginas y tu cuenta de Instagram profesional y guarda todo **cifrado** (`TOKEN_ENCRYPTION_KEY`). Botón **Probar** para validarlo, aviso 7 días antes de vencer y **Reconectar**. Alternativa manual: pegar un token.
   - Facebook: leer Páginas de terceros requiere la función *Page Public Content Access* (App Review de Meta). Instagram: Business Discovery lee cuentas profesionales públicas usando el IG User ID de tu cuenta profesional.
   - Meta **no** expone la lista de páginas que alguien sigue: la lista se arma pegando URLs/nombres; los "posibles lugares nuevos" salen de menciones y enlaces en lo revisado y de búsquedas.
   - Los códigos de error de Graph API se traducen a estados de auditoría (mejor esfuerzo; verifica contra la documentación vigente de Meta; versión con `META_GRAPH_VERSION`, por defecto `v21.0`).

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
- `npm test`: **config**, **event-parser** (fechas, precios, clasificación, deduplicación, HTML, extracción), **discovery** (fetch seguro/SSRF/robots, adaptadores, Graph API simulada), **API** (integración: eventos, fuentes, auth/JWT/roles, discovery de punta a punta, cron, conexiones cifradas, "Conectar con Meta"), **meta-app** (scripts) y el **detector de secretos**. Sin configuración usa PGlite en memoria.
- `npm run test:pg`: las pruebas de **permisos de roles** y **toda la API contra Postgres 18 real** (Docker; ver `docs/DATABASE.md`).
- `npm run e2e`: Playwright con Chrome (home, paginación, filtros, búsqueda, lista/cards, detalle, login y registro, favoritos, mis fuentes/horario, admin, "Conectar con Meta" con Graph API simulada, móvil, teclado) y **accesibilidad automática (axe-core, WCAG AA)** en las pantallas principales.
- CI (`.github/workflows/`): typecheck, tests, build, Postgres real, E2E y escaneo de secretos del historial; validado con `actionlint`.

## Pendiente (depende de ti o de servicios externos)
- Crear la **app de Meta** y pegar su ID/secreto (guía en [`meta-app/`](meta-app/README.md)); **App Review + verificación del negocio** para usarla con otras personas o leer Páginas ajenas.
- Crear las credenciales de **Google, Microsoft y Apple** ([`docs/AUTH.md`](docs/AUTH.md)).
- **Producción**: Neon (o Supabase), dos proyectos de Vercel y variables ([`docs/AI-RUNBOOK.md`](docs/AI-RUNBOOK.md)); revisar `/privacy` y `/terms` con tus datos reales.
- Recuperación de contraseña y verificación de correo (requieren un servicio de correo).
- Proveedor real para `SearchAdapter` (descubrir fuentes nuevas por búsqueda).
- Confirmar las fuentes marcadas `unverified` y aportar los enlaces de **La Sanatura** y **Sabu Tours** (no aparecen en búsquedas públicas).
- Más países y ciudades (el catálogo de lugares es solo Nicaragua) y recomendaciones más allá de "También podría interesarte".
- Verificado solo con **simulaciones**: las APIs reales de Meta y de los proveedores de login, los pipelines de GitHub en ejecución real y el empaquetado en Vercel.
