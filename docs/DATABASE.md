# Base de datos: ¿Neon o Supabase?

Turistero necesita **Postgres estándar** y nada más: usa Drizzle ORM + un cliente `postgres` (postgres.js) y **no** usa Supabase Auth, Storage ni Realtime (el login lo hace Auth.js y los tokens se cifran en nuestra propia tabla). Por eso ambas opciones funcionan con **solo cambiar `DATABASE_URL`**.

## Recomendación: **Neon**
| Criterio | Neon | Supabase |
|---|---|---|
| Encaja con Vercel + funciones serverless | ✅ Diseñado para serverless: pooler integrado, arranque rápido, integración nativa en el Marketplace de Vercel que crea `DATABASE_URL` por ti | ✅ Funciona con el *Transaction pooler* (Supavisor), pero hay que usar la cadena correcta |
| Coste inicial | Plan gratuito con *scale-to-zero* (⚠️ límites vigentes en su página de precios) | Plan gratuito; ⚠️ los proyectos gratuitos **se pausan tras un periodo de inactividad** y hay que reactivarlos: mal encaje con un cron que corre pocos días a la semana |
| Ramas de base de datos (una por PR / pruebas) | ✅ nativas y baratas | Ramas de pago |
| Extras que Turistero no usa | — | Auth, Storage, Realtime, Edge Functions (solo aportarían complejidad) |
| Copias / restauración | Historial y *point-in-time restore* según plan | Copias diarias en planes de pago |
| Portabilidad | Postgres estándar | Postgres estándar |

**Elige Supabase** solo si ya lo usas para otra cosa o quieres su panel/otros servicios. Si más adelante quieres cambiar, basta con volcar (`pg_dump`) y restaurar en el otro; el código no cambia.

## Regla de oro de la conexión en serverless
Las funciones de Vercel abren muchas conexiones cortas → usa **siempre la cadena con pooler**:
- **Neon:** host con `-pooler` (p. ej. `ep-xxx-pooler.us-east-2.aws.neon.tech`), `?sslmode=require`.
- **Supabase:** *Connection string → Transaction pooler* (puerto **6543**), `?sslmode=require`. La conexión directa (5432) es solo para migraciones desde una máquina con IPv6/IPv4 add-on.
El cliente ya usa `prepare: false` (necesario con poolers en modo transacción).

## Variables
`DATABASE_URL` únicamente (en la **API**; la web nunca toca la base de datos). Es un secreto: vive en Vercel/GitHub Secrets, jamás en Git.

## Crear la base de datos (una persona; requiere cuenta)
### Neon
1. <https://neon.tech> → registrarse → **Create project** (nombre `turistero`, región cercana a tus funciones de Vercel, p. ej. `aws-us-east-2`/`us-east-1`, Postgres 16 o superior).
2. *Dashboard → Connect* → activa **Pooled connection** → copia la cadena (empieza con `postgresql://` y contiene `-pooler`).
3. Alternativa recomendada: en Vercel → *Storage / Marketplace → Neon* → conectar al proyecto **turistero-api**: Vercel inyecta `DATABASE_URL` sola.
CLI (opcional): `npm i -g neonctl` → `neonctl auth` → `neonctl projects create --name turistero` → `neonctl connection-string --pooled` (imprime un secreto: no lo pegues en chats ni logs).

### Supabase
1. <https://supabase.com> → **New project** (guarda la *Database password* en un gestor de contraseñas; se muestra una sola vez).
2. *Project → Connect → Transaction pooler* → copia la cadena y sustituye `[YOUR-PASSWORD]`.
CLI (opcional): `supabase login` → `supabase projects create turistero --org-id <ORG> --db-password <PASSWORD> --region <REGION>`.

## Crear las tablas y cargar el catálogo
Desde tu máquina, una vez, sin dejar la cadena en el historial de la terminal:
```bash
# Pega la cadena cuando se te pida (no se muestra ni se guarda):
read -rs DATABASE_URL && export DATABASE_URL
npm ci
npm run db:migrate          # aplica packages/db/drizzle/*.sql (aditivo)
npm run db:seed             # carga config/sources.json (SIN eventos de ejemplo)
unset DATABASE_URL
```
Verificar: en el panel SQL de Neon/Supabase, `select count(*) from source;` → 22 (o el número de fuentes de `config/sources.json`).

En adelante, los cambios de esquema los aplica el pipeline (`deploy.yml` → job *migrate*) con el secreto `DATABASE_URL` de GitHub Actions.

## Copias de seguridad y datos sensibles
La base contiene: cuentas (correos, hash scrypt de contraseñas), tokens de Meta **cifrados**, fuentes privadas y preferencias de cada persona. Trátala como datos personales:
- Restringe el acceso al panel de la base a ti; activa 2FA en la cuenta del proveedor.
- Los volcados (`pg_dump`) contienen datos personales: **no los versiones** (el `.gitignore` bloquea `*.dump`, `*.sql.gz`, `backups/`).
- `TOKEN_ENCRYPTION_KEY` **no** se guarda en la base: si se pierde, los tokens de Meta guardados no se pueden recuperar (hay que reconectar).
