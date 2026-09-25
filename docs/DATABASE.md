# Base de datos: Postgres local (Docker), Neon o Supabase

Turistero necesita **Postgres estándar** y nada más (Drizzle ORM + cliente `postgres`). No usa Supabase Auth/Storage/Realtime: el login lo hace Auth.js y los tokens de Meta se cifran en nuestra propia tabla. Por eso local, Neon y Supabase funcionan igual: solo cambian las URLs.

## Modelo de permisos (dos roles, menor privilegio)
| Rol | Nombre local | Puede | No puede | Dónde se usa |
|---|---|---|---|---|
| **Administrador** | `turistero_admin_usr` | Crear/alterar/eliminar tablas; ejecutar migraciones; es dueño de la BD | — | **Solo** `npm run db:migrate` / `db:seed` y el pipeline de despliegue. Variable `DATABASE_ADMIN_URL` |
| **Aplicación** | `turistero_app_usr` | `SELECT`, `INSERT`, `UPDATE`, `DELETE` sobre las tablas y usar secuencias | Crear, alterar o eliminar tablas · `TRUNCATE` · crear esquemas, roles o bases de datos · ver el historial de migraciones (`drizzle`) · conectarse a otras bases | La API en runtime. Variable `DATABASE_URL` |

Así, si la API se compromete (inyección SQL, secreto filtrado), el atacante **no puede borrar ni alterar el esquema**. La web nunca toca la BD.
Los scripts que crean los roles están en [`packages/db/sql/`](../packages/db/sql) (`01-admin-role.sql`, `02-app-role.sql`) y son los mismos en local y en Neon/Supabase; hay pruebas automáticas que verifican todo lo anterior (`packages/db/src/roles.test.ts`).

## 1) Local con Docker (desarrollo y pruebas)
Requisitos: Docker. Base de datos `turistero_db_dev` en un Postgres 18 que escucha **solo en 127.0.0.1:5433** (no 5432, para no chocar con un Postgres que ya tengas).
```bash
npm run db:up        # levanta el contenedor; la 1.ª vez crea la BD y los dos roles
npm run db:reset     # lo destruye y lo recrea desde cero (borra los datos locales)
npm run db:psql      # consola psql como superusuario del contenedor
npm run db:down      # lo apaga (los datos se conservan en el volumen)
```
Credenciales **solo locales** (definidas en `docker-compose.yml`; no reutilices estas contraseñas en ningún otro sitio):

| Rol | Usuario | Contraseña |
|---|---|---|
| Superusuario del contenedor | `postgres` | `turistero_postgres_pwd` |
| Administrador (DDL) | `turistero_admin_usr` | `turistero_admin_pwd` |
| Aplicación (solo filas) | `turistero_app_usr` | `turistero_app_pwd` |

```bash
# Migrar y cargar el catálogo como ADMINISTRADOR (la app no puede crear tablas)
export DATABASE_ADMIN_URL="postgres://turistero_admin_usr:turistero_admin_pwd@127.0.0.1:5433/turistero_db_dev"
npm run db:migrate && npm run db:seed          # (db:seed -- --mocks añade eventos de ejemplo)

# Ejecutar la API como el rol de la APLICACIÓN: en apps/api/.env.local
# DATABASE_URL=postgres://turistero_app_usr:turistero_app_pwd@127.0.0.1:5433/turistero_db_dev
npm run api
```
Sin `DATABASE_URL`, la API usa PGlite (Postgres embebido en memoria) y se migra sola: cómodo para empezar, pero **no** ejercita los permisos reales.

### Probar contra Postgres real
```bash
npm run test:pg      # levanta el contenedor y corre: pruebas de permisos de roles + toda la suite de la API contra Postgres 18
```
Cada archivo de pruebas de la API crea una base de datos efímera (`turistero_test_xxxx`) con `TEST_DATABASE_URL` y la elimina al terminar (ver `packages/db/src/testing.ts`). `npm test` (sin variables) usa PGlite y omite las pruebas de roles.

> Windows: los scripts de `docker/` y `packages/db/sql/` deben tener saltos de línea **LF** (`.gitattributes` lo fuerza). Si ves `bad interpreter: /bin/sh^M`, ejecuta `git add --renormalize .` y `npm run db:reset`.

## 2) Producción: ¿Neon o Supabase? Recomendación: **Neon**
| Criterio | Neon | Supabase |
|---|---|---|
| Encaja con Vercel + serverless | ✅ Pensado para serverless: pooler integrado, arranque rápido, integración en el Marketplace de Vercel | ✅ Funciona con el *Transaction pooler* (Supavisor) |
| Coste inicial | Plan gratuito con *scale-to-zero* (⚠️ límites vigentes en su página de precios) | Plan gratuito; ⚠️ los proyectos gratuitos **se pausan tras inactividad**: mal encaje con un cron que corre pocos días |
| Ramas de BD (una por PR / pruebas) | ✅ nativas | De pago |
| Extras que Turistero no usa | — | Auth, Storage, Realtime, Edge Functions |
| Portabilidad | Postgres estándar | Postgres estándar |

Elige Supabase solo si ya lo usas para otra cosa. Cambiar después es un `pg_dump` + restaurar; el código no cambia.

**Conexión en serverless:** las funciones abren muchas conexiones cortas → usa siempre la URL **con pooler** (Neon: host con `-pooler`; Supabase: *Transaction pooler*, puerto 6543). El cliente ya usa `prepare: false`, necesario con poolers en modo transacción.

### Crear la BD y los roles en Neon (una persona; requiere cuenta)
1. <https://neon.tech> → **Create project** (`turistero`, región cercana a tus funciones de Vercel). Neon crea el rol dueño `neondb_owner` y la base `neondb`.
2. Copia la URL **directa** del dueño (sin `-pooler`) para migraciones y la **con pooler** para la app. En Neon el rol dueño hace de **administrador**.
3. Crea el rol de la aplicación con el mismo script de local, **sin dejar contraseñas en el historial de la terminal**:
   ```bash
   read -rs ADMIN_URL                       # pega la URL directa de neondb_owner (no se muestra)
   APP_PWD=$(openssl rand -base64 32 | tr -d '/+=' | cut -c1-32)   # contraseña larga y aleatoria; guárdala en tu gestor
   psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -v db=neondb -v admin_role=neondb_owner \
        -v app_role=turistero_app_usr -v app_pwd="$APP_PWD" -f packages/db/sql/02-app-role.sql
   ```
4. Migra y carga el catálogo como administrador: `DATABASE_ADMIN_URL="$ADMIN_URL" npm run db:migrate && DATABASE_ADMIN_URL="$ADMIN_URL" npm run db:seed`.
5. Arma la URL de la app: la **con pooler** de Neon, cambiando usuario y contraseña por `turistero_app_usr` / `$APP_PWD` → es la `DATABASE_URL` de la **API en Vercel**. Vuelve a ejecutar `02-app-role.sql` después de futuras migraciones **no** hace falta (los permisos por defecto cubren las tablas nuevas).
6. Comprueba los permisos: `DATABASE_URL="<url app>" node -e "…"` o ejecuta `roles.test.ts` apuntando `TEST_ADMIN_DATABASE_URL`/`TEST_APP_DATABASE_URL` a esa base (⚠️ crea y borra una tabla temporal; úsalo antes de tener datos reales).

### Supabase (alternativa)
El rol `postgres` hace de administrador; crea `turistero_app_usr` con el mismo `02-app-role.sql` (`admin_role=postgres`, `db=postgres`). Para la URL de la app usa el *Transaction pooler* (⚠️ el usuario lleva el formato `turistero_app_usr.<project-ref>`; confírmalo en *Connect*).

## Dónde va cada variable
| Variable | Valor | Dónde |
|---|---|---|
| `DATABASE_URL` | **rol de la aplicación**, con pooler | API (Vercel) · `apps/api/.env.local` |
| `DATABASE_ADMIN_URL` | rol administrador, conexión directa | **solo** GitHub Actions (secreto) y tu terminal al migrar. **Nunca** en Vercel |
| `TEST_DATABASE_URL` | superusuario local (CREATEDB) | solo pruebas locales |
Son secretos: viven en Vercel/GitHub Secrets o en `.env.local`, jamás en Git (el detector lo impide; ver `SECURITY.md`).

## Copias de seguridad y datos sensibles
La base contiene cuentas (correos, hash scrypt), tokens de Meta **cifrados**, fuentes privadas y preferencias. Trátala como datos personales: 2FA en el proveedor, acceso solo tuyo, y **no versiones volcados** (`.gitignore` bloquea `*.dump`, `*.sql.gz`, `backups/`). `TOKEN_ENCRYPTION_KEY` no se guarda en la base: si se pierde, hay que reconectar Meta.
