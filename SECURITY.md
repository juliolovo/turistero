# Seguridad

## Reglas para no subir información sensible
Este repositorio es público. **Nada de lo siguiente puede entrar a Git, ni siquiera "temporalmente":**
- Archivos `.env` (solo se versiona `.env.example`, con valores de ejemplo), claves `.pem/.p8/.key`, credenciales JSON de proveedores, volcados o copias de la base de datos.
- Tokens de acceso (Meta, GitHub, Vercel, Neon, Supabase…), secretos de OAuth (Google, Microsoft, Apple, Meta), `AUTH_SECRET`, `TOKEN_ENCRYPTION_KEY`, `API_JWT_SECRET`, `API_SERVICE_TOKEN`, `CRON_SECRET`, contraseñas y cadenas de conexión con contraseña.
- Datos personales reales (correos, teléfonos, identificadores de usuarios).

### Defensas automáticas (no las desactives)
1. **`.gitignore`** bloquea los nombres de archivo peligrosos.
2. **Hook `pre-commit`** (`.githooks/`, se activa con `npm install`): `scripts/check-secrets.mjs --staged` rechaza el commit si detecta secretos, archivos prohibidos o correos reales.
3. **Hook `pre-push`**: revisa todo lo versionado antes de subir.
4. **CI** (`.github/workflows/secret-scan.yml`): escanea el árbol y **todo el historial** en cada push y PR.
5. **GitHub secret scanning + push protection** activados en el repositorio.
6. Los tokens de terceros se guardan **cifrados** (AES-256-GCM) en la base de datos, nunca en archivos.

Comandos: `npm run secrets:check` (árbol versionado) · `npm run secrets:history` (historial completo) · `npm test` (incluye las pruebas del detector).
Saltarse los hooks (`--no-verify`) no está permitido; si el detector marca un falso positivo, usa `secret-scan:allow` en la línea (con motivo) o `scripts/secret-scan.config.json`.

### Dónde viven los secretos
| Entorno | Dónde |
|---|---|
| Desarrollo local | `apps/api/.env.local`, `apps/web/.env.local` (ignorados por Git) |
| Producción | Variables de entorno de Vercel (o el gestor de secretos del hosting) |
| CI/CD | *GitHub → Settings → Secrets and variables → Actions* |
| Tokens de Meta | Base de datos, cifrados, desde `/admin/connections` |

Genera secretos así, sin mostrarlos ni guardarlos en disco: `openssl rand -base64 32 | vercel env add NOMBRE production`.

## Si algo se filtra
1. **Rota la credencial de inmediato** (bórrala del proveedor y crea otra). Borrar el commit **no** basta: el valor ya se considera comprometido.
2. Reemplaza el valor en Vercel/GitHub y redepliega.
3. Elimínalo del historial solo *después* de rotar (`git filter-repo`), y avisa a quien haya clonado el repo.
4. Si era `TOKEN_ENCRYPTION_KEY`, los tokens guardados quedan expuestos: reconecta Meta y vuelve a cifrar.
5. Si era un token de Meta, revócalo en *Facebook → Configuración → Apps y sitios web* y genera otro.

## Reportar una vulnerabilidad
Abre un *Security advisory* privado en GitHub (*Security → Report a vulnerability*) en lugar de un issue público. Incluye pasos para reproducir y el impacto. No pruebes contra datos de otras personas.

## Postura de la aplicación (resumen)
Roles con mínimo privilegio (rol leído siempre de la BD), JWT de sesión firmado y de vida corta entre web y API, contraseñas con scrypt y bloqueo por intentos, `state` anti-CSRF en OAuth, firma HMAC verificada en los callbacks de Meta, protección SSRF y `robots.txt` en el lector de sitios web, sin scraping de Facebook/Instagram, límites de lectura (una por fuente al día). Ver `README.md` y `docs/AUTH.md`.
