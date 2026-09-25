# Guion del screencast para App Review

Meta pide un video **por permiso** (puede ser el mismo video mostrando todo). Graba en inglés o con subtítulos en inglés, en resolución legible, con el navegador en modo normal (URL visible). Duración recomendada: 2–4 minutos.

1. **Contexto (10 s).** Muestra la home de Turistero (`https://TU-WEB`). Di: "Turistero aggregates public event announcements from pages the user chooses."
2. **Login (20 s).** Ve a `/login` → *Continue with Meta (Facebook)*. Se ve el diálogo de Facebook con los permisos solicitados (`public_profile`, `email`). Acepta. Se ve el nombre del usuario en la barra superior. *(Demuestra `public_profile` y `email`.)*
3. **Conexión (30 s).** Entra como administrador a `/admin/connections`. Muestra que el token se guarda **cifrado** y que no se vuelve a mostrar. Muestra la lista de Páginas / cuenta de Instagram que el usuario administra. *(Demuestra `pages_show_list` e `instagram_basic`.)*
4. **Agregar una fuente (30 s).** En `/my` agrega la URL de una Página de Facebook / cuenta de Instagram profesional pública. Explica: "Only pages the user adds are read; at most once a day."
5. **Lectura (40 s).** Pulsa *Buscar ahora*. Se ve "Revisando ahora…" y luego la novedad "N eventos nuevos". Abre `/admin/sources/status` (o `/my`) y muestra el estado de la lectura. *(Demuestra `pages_read_engagement` / Page Public Content Access / Business Discovery.)*
6. **Resultado (30 s).** Abre la agenda (`/?mine=1`), abre un evento y pulsa **Ver publicación original**: lleva a la publicación en Facebook/Instagram. Señala la atribución.
7. **Eliminación de datos (20 s).** Muestra `/privacy`, `/terms` y `/data-deletion`. Explica que el callback de eliminación y de desautorización están implementados.
8. **Cierre (5 s).** "We never post, message or read private content, and we do not scrape."

Consejos: usa una cuenta de prueba, oculta tokens y secretos en pantalla, no muestres datos personales de terceros.
