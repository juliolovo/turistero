# Checklist antes de enviar a App Review

## Cuenta y negocio
- [ ] Cuenta de desarrollador verificada.
- [ ] App asociada a un Business Portfolio.
- [ ] **Verificación del negocio** iniciada/completada (obligatoria para Page Public Content Access). ⚠️ Confirma si tu país/tipo de negocio califica.

## App (Settings → Basic)
- [ ] Icono 1024×1024, nombre, categoría, correo de contacto.
- [ ] Privacy Policy URL responde 200 en HTTPS: `https://TU-WEB/privacy`.
- [ ] Terms URL: `https://TU-WEB/terms`.
- [ ] User data deletion callback: `https://TU-API/api/meta/data-deletion` (usa "Send test" del Dashboard y confirma que responde `{url, confirmation_code}`).
- [ ] Facebook Login: redirect URIs y deauthorize callback configurados.

## Producto listo para revisar
- [ ] Web y API desplegadas en HTTPS (ver `docs/DEPLOY.md`), `META_APP_SECRET` en la API.
- [ ] Un usuario de prueba con email + contraseña para el revisor (`REVIEWER_EMAIL` / `REVIEWER_PASSWORD`), sin datos reales.
- [ ] El flujo demuestra cada permiso solicitado (si no se ve en el video, Meta lo rechaza).
- [ ] **Solo se piden los permisos que se usan** (ver `app-manifest.json`).

## Envío
- [ ] Un texto de justificación por permiso (`use-case-en.md`).
- [ ] Screencast según `screencast-script.md`.
- [ ] Instrucciones de prueba claras (pasos de `use-case-en.md`).
- [ ] Al aprobarse: cambiar la app a **Live**, regenerar tokens y probar `npm run meta:check`.
- [ ] Marcar en el calendario el *Data Use Checkup* anual.
