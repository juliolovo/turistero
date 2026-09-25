# Inicio de sesión: proveedores y configuración

Turistero usa **Auth.js v5** (sesión JWT). En cada acceso la web sincroniza al usuario con la API. Métodos disponibles:

| Método | Variables (web) | ¿Correo verificado? |
|---|---|---|
| Usuario y contraseña | — (siempre disponible) | ❌ (no enviamos correos) |
| Google | `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | ✅ |
| Meta (Facebook) | `AUTH_FACEBOOK_ID`, `AUTH_FACEBOOK_SECRET` | ❌ |
| Microsoft | `AUTH_MICROSOFT_ENTRA_ID_ID`, `AUTH_MICROSOFT_ENTRA_ID_SECRET`, `AUTH_MICROSOFT_ENTRA_ID_ISSUER` (opc.) | ❌ |
| Apple | `AUTH_APPLE_ID`, `AUTH_APPLE_SECRET` | ✅ |
| Instagram | **no existe como login** (solo cuentas profesionales, ver `meta-app/README.md`) | — |

Además de estas variables: `AUTH_SECRET` (`openssl rand -base64 32`), `AUTH_TRUST_HOST=true` en hosting propio, y `API_URL`, `API_SERVICE_TOKEN`, `API_JWT_SECRET` (iguales que en la API).
Un botón sin credenciales aparece **desactivado**.

## Reglas de seguridad
- Los correos se vinculan entre proveedores **solo si el proveedor lo verifica** (Google, Apple). Facebook y Microsoft pueden devolver correos no verificados: nunca vinculan cuentas ni conceden ADMIN.
- **Anti pre-secuestro:** si alguien registra un correo con contraseña y luego el dueño real entra con Google/Apple con ese correo, la contraseña anterior se **invalida**.
- `ADMIN_EMAILS` solo concede ADMIN con correo **verificado** (Google/Apple).
- Contraseñas: scrypt (N=2¹⁵), mínimo 10 caracteres con letras y números (o frase de 14+), lista de comunes, bloqueo 15 min tras 5 fallos, tiempo de respuesta constante aunque el correo no exista. **No hay recuperación por correo** (no enviamos emails todavía): quien la olvide entra por un proveedor social.

## Google
1. <https://console.cloud.google.com> → *APIs y servicios → Pantalla de consentimiento OAuth* (externa; agrega la política y términos: `/privacy`, `/terms`).
2. *Credenciales → Crear credenciales → ID de cliente de OAuth → Aplicación web*.
3. Orígenes: `https://TU-WEB` · URI de redirección: `https://TU-WEB/api/auth/callback/google` (y `http://localhost:3000/api/auth/callback/google`).

## Meta (Facebook)
Es la **misma app** que usa la lectura de páginas: sigue [`meta-app/README.md`](../meta-app/README.md). Redirect: `https://TU-WEB/api/auth/callback/facebook`.

## Microsoft (cuentas personales y de trabajo)
1. <https://entra.microsoft.com> → *Identidad → Aplicaciones → Registros de aplicaciones → Nuevo registro*.
2. *Tipos de cuenta compatibles*: elige según quieras (recomendado para público general: **cuentas personales de Microsoft**; o "cualquier directorio y cuentas personales").
3. *URI de redirección* (plataforma **Web**): `https://TU-WEB/api/auth/callback/microsoft-entra-id` (y la de `http://localhost:3000/...`).
4. *Certificados y secretos → Nuevo secreto de cliente*: copia el **Valor** (solo se ve una vez) → `AUTH_MICROSOFT_ENTRA_ID_SECRET`. *ID de aplicación (cliente)* → `AUTH_MICROSOFT_ENTRA_ID_ID`.
5. `AUTH_MICROSOFT_ENTRA_ID_ISSUER`: por defecto `https://login.microsoftonline.com/consumers/v2.0` (cuentas personales). Para una sola organización usa `https://login.microsoftonline.com/<TENANT_ID>/v2.0`. ⚠️ Con la app multi-inquilino ("common") Auth.js no valida el emisor de un modo fijo: usa `consumers` o un tenant concreto.
6. Los secretos caducan (máx. 24 meses): recuérdalo en el calendario.

## Apple (Sign in with Apple)
Requiere una cuenta de **Apple Developer Program** (de pago) y un dominio HTTPS público (Apple **no** acepta `localhost` como redirect).
1. <https://developer.apple.com/account> → *Certificates, Identifiers & Profiles → Identifiers*: crea un **App ID** con la capacidad *Sign in with Apple*, y luego un **Services ID** (p. ej. `com.tuempresa.turistero.web`) → configúralo: dominio `TU-WEB` y *Return URL* `https://TU-WEB/api/auth/callback/apple`.
2. *Keys → nueva clave* con *Sign in with Apple* asociada a tu App ID; descarga el `.p8` (solo se descarga una vez) y anota el **Key ID**; tu **Team ID** aparece arriba a la derecha.
3. Genera el secreto (JWT, caduca ≤ 6 meses):
   ```bash
   APPLE_TEAM_ID=... APPLE_KEY_ID=... APPLE_SERVICE_ID=com.tuempresa.turistero.web \
     node scripts/apple-client-secret.mjs ruta/AuthKey_XXXX.p8
   ```
4. `AUTH_APPLE_ID` = Services ID · `AUTH_APPLE_SECRET` = el JWT. Renuévalo cada ~5 meses.
5. Apple solo entrega nombre y correo la **primera** vez que la persona autoriza la app; Turistero los guarda en ese momento. El correo puede ser un alias de *Hide My Email*.

## Desarrollo local sin credenciales
`ALLOW_DEV_LOGIN=1` (web) + `ALLOW_DEV_AUTH=1` (API) habilitan "Entrar como usuario de prueba" (el usuario `admin` es ADMIN si `ADMIN_EMAILS=admin@dev.local`). Se ignoran en producción.

## Primer administrador
Define `ADMIN_EMAILS=tu-correo@gmail.com` en la API y entra con **Google/Apple** usando ese correo (verificado): tu usuario recibe ADMIN. Después gestiona roles en `/admin/users`.
