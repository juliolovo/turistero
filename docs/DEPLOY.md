# Despliegue: Neon (Postgres) + Vercel + GitHub Actions

> **Para que una IA lo ejecute paso a paso:** [`AI-RUNBOOK.md`](AI-RUNBOOK.md). **Elegir base de datos (Neon o Supabase, con recomendación):** [`DATABASE.md`](DATABASE.md). **Seguridad y secretos:** [`../SECURITY.md`](../SECURITY.md).
>
> Esta guía **no despliega nada por sí sola**. Los pipelines ya existen en `.github/workflows/` pero el de despliegue está apagado hasta que actives `DEPLOY_ENABLED=true`.

## Arquitectura de producción
```
GitHub ── CI (typecheck, tests, build, E2E)
   │  push a main + DEPLOY_ENABLED=true
   ├─► migrar BD (drizzle) ─► Neon Postgres
   ├─► Vercel proyecto "turistero-api"  (root apps/api → función serverless api/index.js)
   └─► Vercel proyecto "turistero-web"  (root apps/web → Next.js)

Planificador: Vercel Cron diario (apps/api/vercel.json)  +  GitHub Actions cada hora (scheduled-discovery.yml)
```
Web y API son **dos proyectos de Vercel del mismo repositorio**. La web habla con la API por HTTPS; la API es la única que toca la base de datos.

## 1. Base de datos en Neon
> **Roles de la base de datos:** la API usa un rol de solo filas (`DATABASE_URL`) y las migraciones un rol migrador (`DATABASE_MIGRATOR_URL`). Sigue [`DATABASE.md`](DATABASE.md) (crea el rol con `packages/db/sql/02-app-role.sql`); esta sección es un resumen.

1. <https://neon.tech> → crear proyecto (elige región cercana a tus funciones de Vercel, p. ej. `us-east-1`).
2. Copia la **connection string *pooled*** (host con `-pooler`) → será `DATABASE_URL`. Debe terminar en `?sslmode=require`.
3. Desde tu máquina, una sola vez:
   ```bash
   export DATABASE_URL="postgres://...neon.tech/neondb?sslmode=require"
   npm ci
   npm run db:migrate     # crea/actualiza las tablas (packages/db/drizzle)
   npm run db:seed        # carga config/sources.json (SIN eventos de ejemplo)
   ```
   Después, cada vez que cambies `packages/db/src/schema.ts`: `npm run db:generate` → revisa el SQL → commit; el pipeline aplica `db:migrate` antes de desplegar.
4. Neon crea ramas de base de datos: úsalas para *preview* (una rama por PR) si quieres; no es obligatorio.

> Postgres estándar (Supabase, RDS, etc.) también sirve: solo cambia `DATABASE_URL`. Usa la conexión con *pooler* (PgBouncer) porque las funciones serverless abren muchas conexiones; el cliente ya usa `prepare: false` por compatibilidad.

## 2. Secretos que debes generar
```bash
openssl rand -base64 32   # AUTH_SECRET
openssl rand -base64 32   # API_SERVICE_TOKEN
openssl rand -base64 32   # API_JWT_SECRET
openssl rand -base64 32   # TOKEN_ENCRYPTION_KEY   (¡no la pierdas! cifra los tokens de Meta guardados)
openssl rand -base64 24   # CRON_SECRET
```
Guárdalos en un gestor de contraseñas. Si pierdes `TOKEN_ENCRYPTION_KEY`, los tokens guardados no se pueden descifrar (hay que reconectar).

## 3. Proyecto de Vercel: API (`turistero-api`)
1. Vercel → *Add New → Project* → importa el repositorio de GitHub.
2. **Root Directory:** `apps/api` · activa **"Include source files outside of the Root Directory"** (necesario: usa `packages/*`).
3. *Framework Preset:* **Other**. Los comandos salen de `apps/api/vercel.json` (`npm run build:vercel` → `api/index.js`). *Install Command:* `npm install` (Vercel detecta los workspaces).
4. **Environment Variables (Production):**
   | Variable | Valor |
   |---|---|
   | `DATABASE_URL` | connection string de Neon (pooled) |
   | `API_SERVICE_TOKEN` | el generado (igual que en la web) |
   | `API_JWT_SECRET` | el generado (igual que en la web) |
   | `TOKEN_ENCRYPTION_KEY` | el generado |
   | `CRON_SECRET` | el generado (Vercel Cron lo envía como `Authorization: Bearer`) |
   | `ADMIN_EMAILS` | tu correo de Google/Apple (recibirá ADMIN) |
   | `CORS_ORIGINS` | `https://TU-WEB` |
   | `NEXT_PUBLIC_SITE_URL` | `https://TU-WEB` (url de estado de eliminación de datos) |
   | `META_APP_SECRET` | App Secret de la Meta App (verifica callbacks) |
   | `META_GRAPH_VERSION` | `v21.0` (⚠️ confirma la versión vigente) |
   | `MIN_RECHECK_HOURS` | `24` (opcional: una lectura por fuente al día) |
   No definas `ALLOW_DEV_AUTH` ni `ALLOW_DEV_LOGIN` en producción.
5. Deploy. Prueba `https://TU-API/health` → `{"ok":true}`. Dominio: `api.tu-dominio.com`.

## 4. Proyecto de Vercel: web (`turistero-web`)
1. Otro proyecto del mismo repo. **Root Directory:** `apps/web` · "Include source files outside of the Root Directory" activado · *Framework:* Next.js.
2. **Environment Variables (Production):**
   | Variable | Valor |
   |---|---|
   | `API_URL` | `https://TU-API` |
   | `API_SERVICE_TOKEN`, `API_JWT_SECRET` | iguales que en la API |
   | `AUTH_SECRET` | el generado |
   | `NEXT_PUBLIC_SITE_URL` | `https://TU-WEB` |
   | `NEXT_PUBLIC_CONTACT_EMAIL` | correo de contacto (aparece en privacidad) |
   | `AUTH_GOOGLE_ID/SECRET`, `AUTH_FACEBOOK_ID/SECRET`, `AUTH_MICROSOFT_ENTRA_ID_*`, `AUTH_APPLE_*` | los que vayas a usar → [`AUTH.md`](AUTH.md) |
3. Deploy. Dominio: `tu-dominio.com`. Agrega las **URLs de redirección** de cada proveedor con ese dominio.

## 5. Primer arranque
1. Entra con Google/Apple usando el correo de `ADMIN_EMAILS` → eres ADMIN (`/admin`).
2. `/admin/sources` → revisa el catálogo; `/admin/runs` → **Ejecutar búsqueda ahora** una vez para comprobar.
3. Conecta Meta (cuando tengas token): `/admin/connections`. Guía completa: [`meta-app/README.md`](../meta-app/README.md).
4. Comprueba `/privacy`, `/terms`, `/data-deletion`.

## 6. Planificador (cron)
La API expone `GET /api/cron/discovery` (protegido por `CRON_SECRET`); es **idempotente** y decide qué toca según el horario de cada persona (por defecto lun/mié/vie 05:15 America/Managua) y los reintentos.
- **Vercel Cron** (`apps/api/vercel.json`): una vez al día a las 11:20 UTC (= 05:20 Managua). Sirve en el plan Hobby (solo permite cron diario) y cubre el horario por defecto.
- **GitHub Actions** (`scheduled-discovery.yml`): cada hora. Necesario si las personas eligen otras horas o para los reintentos. Actívalo con: variable `DISCOVERY_CRON_ENABLED=true`, variable `API_URL` y secreto `CRON_SECRET`.
- **Vercel Pro:** cambia `"20 11 * * *"` por `"0 * * * *"` y no necesitas GitHub Actions.
- **Servidor propio:** `ENABLE_LOCAL_CRON=1` (revisa cada 10 min).
Límite por corrida: `CRON_BUDGET_MS` (45 s por defecto; sube si tu plan de Vercel lo permite). Lo que no alcance queda para la siguiente llamada.

## 7. GitHub: pipelines
Archivos en `.github/workflows/`:
| Workflow | Cuándo | Qué hace |
|---|---|---|
| `ci.yml` | cada push/PR | `npm ci`, typecheck, tests (PGlite en memoria), build web y función API, y E2E con Chrome |
| `deploy.yml` | push a `main` / manual, **solo si `DEPLOY_ENABLED=true`** | verifica → migra Neon → despliega API → despliega web |
| `scheduled-discovery.yml` | cada hora, **solo si `DISCOVERY_CRON_ENABLED=true`** | llama al planificador |

**Secretos** (*Settings → Secrets and variables → Actions → Secrets*): `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID_API`, `VERCEL_PROJECT_ID_WEB`, `DATABASE_MIGRATOR_URL`, `CRON_SECRET`.
**Variables:** `DEPLOY_ENABLED`, `DISCOVERY_CRON_ENABLED`, `API_URL`.
Obtén los ids con `npx vercel link` dentro de cada app (archivo `.vercel/project.json`) o en *Project Settings → General*. El token en <https://vercel.com/account/tokens>.

> Alternativa sin Actions: activa la integración Git de Vercel en ambos proyectos (despliega solo en cada push). Entonces ejecuta las migraciones a mano (`npm run db:migrate`) o desde `deploy.yml` manualmente.

## 8. Lista de comprobación posterior
- [ ] `https://TU-API/health` responde.
- [ ] Login con al menos un proveedor + usuario/contraseña.
- [ ] `/admin/sources/status` muestra el estado de todas las fuentes.
- [ ] Meta: callbacks probados con *Send test* del Dashboard.
- [ ] Copias de seguridad: Neon conserva historial (*point-in-time restore*); anota el periodo de tu plan.
- [ ] Alertas: revisa los logs de Vercel (`vercel logs`) tras la primera corrida programada.

## 9. Reversión
- **Web/API:** en Vercel → *Deployments → Promote to Production* sobre un despliegue anterior.
- **Base de datos:** las migraciones son aditivas; para volver atrás usa una rama/restauración de Neon a un punto anterior y redepliega la versión previa.

## Versión de Node en Vercel
`engines.node` es `26.x` en `package.json`, `apps/api` y `apps/web`, y Vercel la respeta. Si al desplegar Vercel rechaza 26 (⚠️ verifica que su lista de runtimes ya lo incluya), cambia `engines` a `24.x` (LTS) en esos tres archivos.
