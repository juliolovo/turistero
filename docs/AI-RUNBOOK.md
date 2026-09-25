# Runbook de despliegue para una IA (Vercel + Neon/Supabase + GitHub)

Objetivo: dejar Turistero en producción **sin filtrar ningún secreto**. Este documento está escrito para que un agente de IA lo ejecute paso a paso junto con la persona dueña del proyecto. Léelo entero antes de empezar y lee `AGENTS.md` (reglas críticas).

Leyenda: 🧑 = solo un humano puede hacerlo (pídeselo y espera) · 🤖 = lo puedes hacer tú · ✅ = comprobación obligatoria antes de seguir · ⛔ = detente y pregunta.

## 0. Reglas de oro (no negociables)
1. **Nunca** muestres, registres ni pegues un secreto (tokens, contraseñas, cadenas de conexión, claves). Nada de `echo $SECRET`, `cat .env*`, `vercel env pull` a la terminal visible, ni `set -x` cerca de secretos.
2. Los secretos se generan en variables de la shell y se entregan **por tubería** al destino, sin escribirlos en archivos ni pasar por la conversación: `openssl rand -base64 32 | vercel env add NOMBRE production`.
3. Si necesitas un valor que solo el humano tiene (token de Vercel, cadena de Neon…), pídele que lo **exporte en su terminal** (`read -rs VAR && export VAR`) o que lo pegue directamente en el panel del proveedor. Tú solo usas la variable de entorno; nunca la repites.
4. Antes de cualquier `git commit`/`git push`: `npm run secrets:check` (✅ debe decir "Sin secretos"). No uses `--no-verify`.
5. No cambies visibilidad del repo, ni borres proyectos/bases, ni pagues nada sin confirmación explícita del humano en ese momento.
6. Si un secreto se filtró (aunque sea a un log): 🧑 rótalo de inmediato (ver `SECURITY.md`).

## 1. Datos que debes pedir al humano (no son secretos)
| Dato | Ejemplo | Para qué |
|---|---|---|
| Dominio de la web | `turistero.com` | `NEXT_PUBLIC_SITE_URL`, redirects OAuth |
| Dominio de la API | `api.turistero.com` | `API_URL`, callbacks de Meta |
| Proveedor de BD | `neon` (recomendado) o `supabase` | ver `docs/DATABASE.md` |
| Correo del administrador | (Gmail/Apple verificado) | `ADMIN_EMAILS` (⚠️ es dato personal: va en variables de Vercel, no en Git) |
| Correo de contacto público | | `NEXT_PUBLIC_CONTACT_EMAIL` |
| ¿Qué proveedores de login? | google, meta, microsoft, apple | ver `docs/AUTH.md` |

## 2. Cuentas y permisos previos 🧑
El humano debe tener cuenta (con 2FA) en: **GitHub**, **Vercel**, **Neon** o **Supabase**. Para el login: Google Cloud, Meta for Developers, Microsoft Entra, Apple Developer (solo los que use). ⛔ No crees cuentas por él.

## 3. Comprobar el repositorio 🤖
```bash
git status --short                 # limpio
npm ci
npm run typecheck && npm test      # ✅ todo en verde
npm run secrets:check              # ✅ sin secretos
npm run secrets:history            # ✅ sin secretos en el historial
```
Si algo falla: ⛔ corrige antes de desplegar.

## 4. Base de datos
Sigue `docs/DATABASE.md`.
1. 🧑 Crea el proyecto en Neon (recomendado) o Supabase y obtén la **cadena con pooler**.
2. 🧑 Exporta la cadena en tu terminal sin mostrarla: `read -rs DATABASE_URL && export DATABASE_URL`.
3. 🤖 `npm run db:migrate` y `npm run db:seed` (sin `--mocks`).
4. ✅ Verifica sin imprimir la cadena: `node -e "const p=require('postgres')(process.env.DATABASE_URL);p\`select count(*)::int n from source\`.then(r=>{console.log('fuentes:',r[0].n);return p.end()})"` → debe imprimir el número de fuentes (22).
5. 🤖 `unset DATABASE_URL` al terminar.

## 5. Vercel: dos proyectos del mismo repositorio
🧑 En Vercel: *Add New → Project* → importa `github.com/<usuario>/turistero` **dos veces**:
| Proyecto | Root Directory | Framework | Nota |
|---|---|---|---|
| `turistero-api` | `apps/api` | Other | activar **Include source files outside of the Root Directory**. Usa `apps/api/vercel.json` (build `npm run build:vercel`, cron diario) |
| `turistero-web` | `apps/web` | Next.js | activar **Include source files outside of the Root Directory** |

Si prefieres CLI 🤖 (con `VERCEL_TOKEN` exportado por el humano): `vercel link` dentro de cada `apps/*` y configura `rootDirectory` en *Project Settings → General* (la CLI no lo cambia; si lo automatizas con la API de Vercel, el token va en una variable de entorno, jamás en un archivo).

✅ Comprueba que ambos proyectos tienen el repo conectado y el Root Directory correcto.

## 6. Variables de entorno de producción 🤖 (canalizadas)
Genera y envía cada secreto **sin mostrarlo**. Los **mismos** valores van en API y web donde se indica (guarda una copia en el gestor de contraseñas del humano: ⛔ tú no la conservas).
```bash
# Los secretos se generan en VARIABLES de la shell (memoria), se envían por tubería y se descartan. Nada toca el disco.
gen() { openssl rand -base64 32; }

API_SERVICE_TOKEN=$(gen); API_JWT_SECRET=$(gen)   # se comparten entre API y web

# API (proyecto turistero-api)
cd apps/api
printf %s "$API_SERVICE_TOKEN"  | vercel env add API_SERVICE_TOKEN production
printf %s "$API_JWT_SECRET"     | vercel env add API_JWT_SECRET production
gen | tr -d '\n' | vercel env add TOKEN_ENCRYPTION_KEY production   # solo la API; el humano debe respaldarla (ver abajo)
CRON_SECRET=$(gen); printf %s "$CRON_SECRET" | vercel env add CRON_SECRET production
printf %s "$DATABASE_URL"       | vercel env add DATABASE_URL production      # el humano la exportó en el paso 4
printf %s "https://<web>"       | vercel env add CORS_ORIGINS production
printf %s "https://<web>"       | vercel env add NEXT_PUBLIC_SITE_URL production
printf %s "<correo-admin>"      | vercel env add ADMIN_EMAILS production
printf %s "24"                  | vercel env add MIN_RECHECK_HOURS production

# Web (proyecto turistero-web)
cd ../web
printf %s "$API_SERVICE_TOKEN"  | vercel env add API_SERVICE_TOKEN production
printf %s "$API_JWT_SECRET"     | vercel env add API_JWT_SECRET production
gen | tr -d '\n' | vercel env add AUTH_SECRET production
printf %s "https://<api>"       | vercel env add API_URL production
printf %s "https://<web>"       | vercel env add NEXT_PUBLIC_SITE_URL production
printf %s "<contacto>"          | vercel env add NEXT_PUBLIC_CONTACT_EMAIL production
cd ../..

# Descartar SIEMPRE (las variables de shell no se imprimen ni se guardan)
unset API_SERVICE_TOKEN API_JWT_SECRET CRON_SECRET DATABASE_URL
```
⚠️ `TOKEN_ENCRYPTION_KEY` y `CRON_SECRET` deben poder recuperarse: 🧑 cópialos del panel de Vercel (*Settings → Environment Variables → ojo*) a su gestor de contraseñas **sin pasar por el chat**. Si `TOKEN_ENCRYPTION_KEY` se pierde, hay que reconectar Meta.
Proveedores de login y Meta (los valores los pega el humano en el panel de Vercel o los exporta él; ver `docs/AUTH.md` y `meta-app/README.md`): `AUTH_GOOGLE_ID/SECRET`, `AUTH_FACEBOOK_ID/SECRET` (web) + `META_APP_ID`, `META_APP_SECRET` (**API**), `AUTH_MICROSOFT_ENTRA_ID_*`, `AUTH_APPLE_*`.
❌ **No definas** `ALLOW_DEV_AUTH` ni `ALLOW_DEV_LOGIN` en producción.
✅ Verifica los **nombres** (no los valores): `vercel env ls production` en cada proyecto.

## 7. Primer despliegue
1. 🤖 `git push` (los hooks ya validaron secretos) o 🧑 *Deploy* en Vercel. Orden: **API primero**, luego web.
2. ✅ `curl -fsS https://<api>/health` → `{"ok":true}`.
3. ✅ `curl -fsS https://<web>/` → 200; abre `/login` y `/privacy`.
4. ✅ Cron de Vercel: en el proyecto API → *Settings → Cron Jobs* aparece `/api/cron/discovery`. Prueba manual:
   `curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<api>/api/cron/discovery` (el humano tiene `CRON_SECRET`; tú no lo imprimas) → JSON con `checked`.
5. 🧑 Entra con el correo de `ADMIN_EMAILS` (Google/Apple) → debes ver `/admin`.

## 8. Meta (Facebook/Instagram) 🧑 + 🤖
Sigue `meta-app/README.md`:
1. 🧑 Crea la app, configura los valores de `meta-app/app-manifest.json` (privacidad, términos, callbacks, **redirect URIs**: `https://<web>/api/auth/callback/facebook` y `https://<web>/admin/connections/meta/callback`).
2. 🧑 Pon `META_APP_ID`/`META_APP_SECRET` en Vercel (API) y `AUTH_FACEBOOK_ID/SECRET` (web).
3. 🧑 En `/admin/connections` pulsa **Conectar con Meta** → autoriza → aparecen la Página y la cuenta de Instagram; pulsa **Probar**. ✅ "El token es válido".
4. ⛔ Para pasar a modo Live hace falta App Review y verificación del negocio (`meta-app/review/checklist.md`).

## 9. GitHub Actions (opcional) 🧑/🤖
Secretos y variables (nombres en `docs/DEPLOY.md` §7). Créalos **sin mostrar** el valor:
```bash
gh secret set VERCEL_TOKEN            # pega el token cuando lo pida (entrada oculta)
gh secret set DATABASE_URL
gh secret set CRON_SECRET
gh variable set DEPLOY_ENABLED --body true
gh variable set DISCOVERY_CRON_ENABLED --body true
gh variable set API_URL --body "https://<api>"
```
✅ `gh secret list` (muestra nombres, no valores). Activa `DEPLOY_ENABLED` solo cuando el humano lo confirme.

## 10. Verificación final ✅
- [ ] `/admin/sources/status` muestra todas las fuentes con su estado.
- [ ] *Ejecutar búsqueda ahora* en `/admin/runs` termina sin errores inesperados.
- [ ] `npm run secrets:history` limpio; GitHub *Security → Secret scanning* sin alertas.
- [ ] Nada sensible en logs de Vercel (`vercel logs`).
- [ ] 🧑 Guardó `TOKEN_ENCRYPTION_KEY` y demás secretos en su gestor de contraseñas.

## 11. Reversión
- Web/API: Vercel → *Deployments → Promote to Production* sobre uno anterior.
- Base de datos: restauración/rama de Neon a un punto anterior; redepliega la versión previa.
- Secreto comprometido: rotar (`SECURITY.md`), redesplegar, y `vercel env rm` del valor viejo.

## 12. Cuándo detenerte y preguntar ⛔
Tests o escáner de secretos fallan · el humano no confirma dominios/proveedores · una acción cuesta dinero o es irreversible · aparece un secreto en una salida · cualquier paso que requiera aceptar términos o verificar identidad.
