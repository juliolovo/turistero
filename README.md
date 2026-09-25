# Turistero

Agrega en un solo lugar los **viajes, tours y eventos** que publican tus operadoras y lugares favoritos (Facebook, Instagram, webs), sin tener que revisarlos uno a uno. Multi-país por diseño; Nicaragua (Managua, León…) es el catálogo semilla.

> **Estado**: fases 1–7 implementadas (web, API, BD, auth, discovery, admin, cron, tests). Lo que falta para producción real está en [Pendiente](#pendiente).
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
npm run e2e        # Playwright con Chrome instalado; levanta API :4100 y web :3100
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
Auth.js v5, sesión JWT. En cada login la web llama a `/api/internal/users/sync` (token de servicio) y guarda `{uid, role}`. Vinculación por correo solo si el proveedor lo verifica (Google); `ADMIN_EMAILS` solo concede ADMIN con correo verificado. Roles: `USER` (favoritos, filtros guardados), `EDITOR` (eventos, fuentes, candidatos, corridas), `ADMIN` (usuarios, borrado, import, conexiones).
- **Google**: Google Cloud Console → Credenciales → ID de cliente OAuth (web). Redirect: `http://localhost:3000/api/auth/callback/google`. `AUTH_GOOGLE_ID/SECRET`.
- **Facebook**: developers.facebook.com → app + *Facebook Login*; redirect `http://localhost:3000/api/auth/callback/facebook`; `AUTH_FACEBOOK_ID/SECRET`. Para producción: modo *Live*, política de privacidad y URL de eliminación de datos.
- **Desarrollo sin credenciales**: `ALLOW_DEV_LOGIN=1` (web) + `ALLOW_DEV_AUTH=1` (API) habilita “Entrar como usuario de prueba”; el usuario `admin` es ADMIN si `ADMIN_EMAILS=admin@dev.local`. Ignorados en producción.
- Si la API ya no reconoce la cookie (BD reiniciada), la web cierra la sesión sola (`/auth/expired`).

## Mis fuentes y mi agenda (`/my`)
Cada usuario arma su propia lista: **fuentes propias** (pega el sitio, RSS, Facebook o Instagram de una operadora; máx. 50) y **suscripciones** a fuentes del catálogo compartido. En la home, el chip **⭐ Mi agenda** (`?mine=1`) muestra solo lo de esas fuentes.
- Lo que se descubre en una fuente propia es **privado**: solo lo ve su dueño (ni el personal de moderación lo lista). Si una fuente del catálogo encuentra después el mismo evento, se hace público; una fuente privada nunca se añade a un evento público. Al eliminar la fuente se van sus eventos privados.
- Las fuentes privadas no aparecen en el catálogo, ni en el export, ni son accesibles por id (404). Revisión manual limitada a una cada 5 min por fuente; el cron también las revisa.
- Limitación actual: Facebook/Instagram de fuentes propias usan la conexión de Meta del administrador (`/admin/connections`); hasta que exista esa conexión quedan `AUTH_REQUIRED`. Sitios web y RSS funcionan ya. Una conexión de Meta por usuario requiere el flujo OAuth (App Review).

## Administración (`/admin`, EDITOR+)
Resumen · **Fuentes** (editar, activar/desactivar, revisar ahora, abrir Facebook/Instagram, eliminar (ADMIN), historial, import/export) · **Estado de fuentes** (`/admin/sources/status`: última revisión, publicaciones revisadas, eventos, motivo; racha de fallos) · **Candidatos** (aprobar, rechazar, fusionar sin pisar URLs) · **Eventos** (aprobar, ocultar, editar, fusionar duplicados) · **Agregar evento** (URL o texto) · **Corridas** (`/admin/runs`, *Ejecutar búsqueda ahora*) · Usuarios y Conexiones Meta (ADMIN).

## Cron
Lunes, miércoles y viernes **05:15 America/Managua** (= 11:15 UTC; Managua no usa horario de verano).
- **Vercel**: `apps/api/vercel.json` define tres disparos (11:15, 11:25, 11:35 UTC) sobre `GET /api/cron/discovery` (`Authorization: Bearer $CRON_SECRET`). Cada ejecución tiene presupuesto de tiempo (`CRON_BUDGET_MS`, 45 s) y solo procesa fuentes no revisadas en las últimas 6 h, así que las siguientes continúan lo pendiente.
- **Servidor propio**: `ENABLE_LOCAL_CRON=1` arranca un planificador en proceso (tolera reinicios: corre al volver si se perdió la hora).
- **Manual**: *Ejecutar búsqueda ahora* en el admin (no depende del cron).

## Despliegue en Vercel
- **web**: proyecto con root `apps/web`. Variables: `API_URL`, `API_SERVICE_TOKEN`, `API_JWT_SECRET`, `AUTH_SECRET`, `AUTH_GOOGLE_*`, `AUTH_FACEBOOK_*`, `NEXT_PUBLIC_SITE_URL`.
- **api**: proyecto con root `apps/api` (`api/index.ts` + `vercel.json`). Variables: `DATABASE_URL`, `API_SERVICE_TOKEN`, `API_JWT_SECRET`, `ADMIN_EMAILS`, `CORS_ORIGINS`, `CRON_SECRET`, `TOKEN_ENCRYPTION_KEY`. Migraciones aparte (`npm run db:migrate`).
- `sitemap.xml` excluye los datos de ejemplo; genera `JSON-LD Event`, metadata y canonical por evento.

## API (resumen)
Listados paginados `{ items, page, pageSize, total }`; entrada validada con Zod; errores `{ error: { code, message } }`. Ver `apps/api/src/app.ts` para la lista completa: eventos, fuentes (+`/export`, `/import`, `/status`, `/:id/check`, `/:id/checks`), candidatos, corridas, favoritos, usuarios, filtros guardados, conexiones, `events/from-source-content`, `events/:id/merge`, `cron/discovery`.
Auth de la API: `Bearer $API_SERVICE_TOKEN` (servidor a servidor), `Bearer <JWT>` de usuario (HS256, `iss=turistero-web`, `aud=turistero-api`) o, solo en desarrollo, `x-dev-user: id:ROLE`.

## Pruebas
`npm test`: **config** (fechas/zonas/títulos), **event-parser** (fechas, precios, clasificación, deduplicación, HTML, extracción), **discovery** (fetch seguro/SSRF/robots, adaptadores, Graph API simulada), **API** (integración con PGlite: eventos, fuentes, auth/JWT/roles, discovery de punta a punta, cron, conexiones cifradas). `npm run e2e`: home, filtros, búsqueda, lista/cards, detalle, login, favoritos, admin, móvil, teclado.

## Pendiente
- Flujo OAuth “Conectar Meta” en la UI (requiere App Review y confirmar scopes vigentes) y proveedor real para `SearchAdapter`.
- Investigar Instagram/web oficiales de las fuentes sin URLs y verificar sus vínculos.
- Conexión de Meta por usuario (hoy se usa la del administrador) y más países/ciudades (el catálogo de lugares aún es solo Nicaragua).
- Recomendaciones más allá de “También podría interesarte” (por ahora: recencia + ciudad).
- Paginación en la home (hoy hasta 100 eventos) y caché de listados en producción.
