# Meta App de Turistero (Facebook + Instagram)

Esta carpeta contiene **todo lo necesario para registrar una sola app en Meta for Developers** y usarla con Turistero: guía, valores exactos para el Dashboard, textos para la revisión (App Review), scripts de verificación y los *callbacks* que Meta exige (ya implementados en la API).

> **Importante — qué puedo y qué no puedo hacer por ti.** Meta no permite crear apps por código: la app se crea a mano en <https://developers.facebook.com>. Yo dejé lista la parte de este repo (callbacks, páginas de privacidad, scripts, textos de revisión) para que solo tengas que **registrarla y pegar los valores** de [`app-manifest.json`](app-manifest.json).
>
> Los nombres de menús y permisos de Meta cambian con frecuencia. Lo marcado con ⚠️ es lo que **debes confirmar en el Dashboard** el día que lo hagas.

## 1. ¿Es una sola app para Facebook e Instagram?
**Sí.** Una app de Meta con estos productos/casos de uso:
- **Facebook Login** → iniciar sesión (ya está en Turistero) y token para leer Páginas.
- **Instagram API** (con *Facebook Login*) → lectura de cuentas de Instagram **profesionales**, incluida *Business Discovery*.
- La función **Page Public Content Access** → leer publicaciones públicas de Páginas de terceros.

No existe un "login con Instagram" para usuarios comunes: la API de Instagram solo funciona con cuentas **profesionales** (Business o Creator). Por eso Turistero **no** ofrece "Continuar con Instagram".

## 2. Qué se puede y qué no (según la documentación de Meta)
| Quiero… | ¿Se puede? | Cómo / requisito |
|---|---|---|
| Que la gente entre con su cuenta de Facebook | ✅ | Facebook Login, permisos `public_profile` y `email` (`email` puede pedir revisión) |
| Leer el feed de **mis propias** Páginas | ✅ | `pages_show_list` + `pages_read_engagement`; en modo desarrollo funciona con tu rol de admin/tester |
| Leer publicaciones **públicas de cualquier Página** de terceros (una operadora) | ⚠️ solo con aprobación | Función **Page Public Content Access** → requiere **App Review + verificación del negocio**. Antes de aprobarla, solo funciona con Páginas cuyos administradores tengan rol en tu app |
| Leer el Instagram de **otra cuenta profesional** (operadora con Business/Creator) | ✅ (la vía más práctica) | **Business Discovery** con el token de *tu* cuenta profesional de Instagram (vinculada a una Página) — ⚠️ confirma permisos exactos (`instagram_basic`, `pages_show_list`) y si tu caso necesita revisión |
| Leer Instagram de una cuenta **personal** o privada | ❌ | La API solo admite cuentas profesionales públicas |
| Saber a **quién sigo** en Instagram / qué Páginas **sigo** en Facebook | ❌ | No existe endpoint. Meta solo expone, con permiso `user_likes` (⚠️ requiere revisión y Meta ha ido restringiéndolo), las Páginas que a la persona **le gustan** — no las que sigue — y aun así leer sus publicaciones requiere Page Public Content Access |
| Leer grupos, historias, mensajes, muro de personas | ❌ | No permitido |
| Leer Facebook/Instagram **sin API** (scraping, Chrome automatizado) | ❌ | Prohibido por los Términos de la Plataforma de Meta y frágil; **Turistero no lo hace** |

### Entonces, ¿cuál es tu mejor camino?
1. **Ahora mismo (sin App Review):** deja la app en *modo desarrollo*, agrégate como admin/tester y usa **Business Discovery** sobre las cuentas de Instagram de las operadoras que sean profesionales (la gran mayoría). Sirve para tu uso personal y el de las personas que agregues como *testers*.
2. **Además**, lee siempre lo que las operadoras publican en su **sitio web / RSS / JSON-LD** (Turistero ya lo hace) y pega enlaces con **Agregar evento** en `/admin/add-event`.
3. **Si quieres abrirlo a usuarios generales o leer Páginas de Facebook arbitrarias:** hay que pasar **App Review** y **verificación del negocio** (ver §6). Puede tardar semanas y Meta puede rechazar casos de uso de agregación; los textos ya están en [`review/`](review).

> Plataformas de terceros que "ya lo hacen" (Apify, Phantombuster, etc.) suelen hacer scraping, lo que viola los términos de Meta y arriesga que bloqueen tus cuentas. No las recomiendo.

## 3. Requisitos previos
- Una cuenta personal de Facebook (para entrar a Meta for Developers).
- Una **Página de Facebook** tuya (puede ser de prueba) y una **cuenta de Instagram profesional** (Business/Creator) **vinculada a esa Página**. Sirve para obtener el *IG User ID* que usa Business Discovery.
- Un **Business Portfolio** (Meta Business Suite) — necesario para la verificación del negocio.
- El dominio público de tu web y de tu API (ver [`docs/DEPLOY.md`](../docs/DEPLOY.md)); para desarrollo sirve `http://localhost`.

## 4. Registro paso a paso
1. Entra a <https://developers.facebook.com> → **Get Started** y completa el registro de desarrollador (verifica correo/teléfono).
2. **Create App** → elige los casos de uso ("Authenticate and request data from users with Facebook Login" y el de Instagram / "Manage messaging & content on Instagram"). ⚠️ El asistente cambia de nombre: lo importante es terminar con **Facebook Login** e **Instagram API con Facebook Login** añadidos. Asócialo a tu Business Portfolio.
3. **App settings → Basic** (valores en [`app-manifest.json`](app-manifest.json)):
   - *Privacy Policy URL*: `https://TU-WEB/privacy` · *Terms of Service URL*: `https://TU-WEB/terms`
   - *User data deletion* → **Data deletion request URL**: `https://TU-API/api/meta/data-deletion`
   - Icono 1024×1024, categoría, correo de contacto.
   - Copia **App ID** y **App Secret**.
4. **Facebook Login → Settings**:
   - *Valid OAuth Redirect URIs*: `https://TU-WEB/api/auth/callback/facebook` y, para desarrollo, `http://localhost:3000/api/auth/callback/facebook`
   - *Deauthorize callback URL*: `https://TU-API/api/meta/deauthorize`
5. **App roles**: agrégate como *Administrator* y añade *Testers* (personas que probarán mientras la app está en desarrollo).
6. Pega en Turistero (`apps/web/.env.local` o variables de Vercel):
   ```env
   AUTH_FACEBOOK_ID=<App ID>
   AUTH_FACEBOOK_SECRET=<App Secret>
   ```
   y en la API (`apps/api/.env.local`): `META_APP_SECRET=<App Secret>` (verifica las firmas de los callbacks), `NEXT_PUBLIC_SITE_URL=https://TU-WEB`.
7. **Obtén un token** en *Tools → Graph API Explorer*: elige tu app, *User Token*, marca `pages_show_list`, `instagram_basic` (y `pages_read_engagement` si lees tus Páginas) y genera el token.
8. **Verifícalo** con el script (no imprime el token):
   ```bash
   META_APP_ID=... META_APP_SECRET=... META_ACCESS_TOKEN=... npm run meta:check
   ```
   Te dice si el token es válido, cuándo vence, qué permisos tiene, qué Páginas administras y **cuál es tu IG User ID**. Para probar Business Discovery contra una operadora:
   ```bash
   npm run meta:check -- --ig-user-id 1784... --discover ronkonrolas
   ```
9. **Cambia a token de larga duración** (~60 días) y guárdalo:
   ```bash
   META_APP_ID=... META_APP_SECRET=... npm run meta:token -- <token-corto>
   ```
   Pega el resultado en Turistero → `/admin/connections` (proveedor *instagram*, ID externo = tu IG User ID). Se guarda **cifrado**. Vuelve a repetir antes de los 60 días (la conexión mostrará "token vencido" si falla).

## 5. Permisos y funciones que se piden
Ver [`app-manifest.json`](app-manifest.json). Resumen:
- **Sin revisión:** `public_profile`.
- **Con revisión (acceso avanzado) para usuarios que no son tú/testers:** `email`, `pages_show_list`, `instagram_basic`, `pages_read_engagement`.
- **Función:** *Page Public Content Access* (revisión + verificación del negocio).
- **No se piden:** `user_posts`, `user_friends`, `user_likes`, mensajería, publicación. Pedir menos permisos aumenta las probabilidades de aprobación.

## 6. App Review (cuando quieras pasar de modo desarrollo a Live)
1. **Verifica el negocio** (Business Settings → Security Center). ⚠️ Pide documentos legales de una empresa; confirma si tu país/tipo de negocio califica.
2. Prepara: política de privacidad y términos publicados, callback de eliminación de datos funcionando (`/api/meta/data-deletion`), icono, cuenta de prueba con datos.
3. Graba el screencast siguiendo [`review/screencast-script.md`](review/screencast-script.md) y pega el texto de [`review/use-case-es.md`](review/use-case-es.md) / [`use-case-en.md`](review/use-case-en.md) (Meta lo lee en inglés: usa el segundo).
4. Sigue [`review/checklist.md`](review/checklist.md) y envía. Cuando se apruebe, pasa la app a **Live**.
5. Cada año Meta pide un *Data Use Checkup*: responde a tiempo o la app se restringe.

## 7. Cómo usa Turistero la app (uso responsable)
- **Solo API oficial**, nunca navegador automatizado ni scraping de facebook.com / instagram.com.
- **Solo las páginas que cada persona agrega**; Turistero no rastrea perfiles al azar.
- **Como máximo una lectura por fuente al día**, más un único reintento una hora después si falla por un problema temporal. `AUTH_REQUIRED` / `ACCESS_RESTRICTED` **no** se reintentan. Configurable por usuario (días y hora) en `/my`.
- Los tokens se guardan **cifrados** (AES-256-GCM) y se eliminan si la persona desautoriza la app o pide borrar sus datos.
- Cada lectura queda **auditada** (`/admin/sources/status`) con su estado; nada "desaparece".

## 8. Callbacks ya implementados en este repo
| Meta pide | Endpoint en la API | Archivo |
|---|---|---|
| Data deletion request callback | `POST /api/meta/data-deletion` → `{ url, confirmation_code }` | `apps/api/src/meta-callbacks.ts` |
| Estado de la eliminación | `GET /api/meta/data-deletion/:code` (y página `/data-deletion?code=…`) | `apps/web/src/app/data-deletion` |
| Deauthorize callback | `POST /api/meta/deauthorize` | `apps/api/src/meta-callbacks.ts` |
| Política de privacidad / Términos | `/privacy`, `/terms` | `apps/web/src/app/{privacy,terms}` |

La firma (`signed_request`, HMAC-SHA256 con tu App Secret) se verifica antes de tocar datos; hay pruebas automáticas en `apps/api/src/accounts.test.ts`.

## 9. Si algo falla
| Síntoma / código de Graph API | Significa | Qué hacer |
|---|---|---|
| `190` | Token inválido o vencido | Genera otro y repite `meta:token` |
| `10`, `200`, `210` | Falta permiso o función (p. ej. Page Public Content Access) | Revisa §2 y §6; en desarrollo, usa Páginas donde tengas rol |
| `100` al usar Business Discovery | La cuenta no existe, es privada o no es profesional | Prueba con otra cuenta o usa su sitio web |
| `4`, `17`, `32`, `613` | Límite de peticiones | Espera; Turistero ya reintenta solo una vez tras 1 h |
| Callback de eliminación falla en el Dashboard | URL pública incorrecta o `META_APP_SECRET` distinto | Prueba con "Send test" del Dashboard y revisa los logs de la API |
