# App Review — textos de justificación (español)

> Meta revisa en inglés: usa [`use-case-en.md`](use-case-en.md) al enviar. Esta versión es para que tú entiendas qué se está declarando.

**Qué es Turistero:** una web que ayuda a encontrar tours, viajes y eventos que publican operadoras y lugares. Cada persona arma su lista de páginas públicas que ya sigue (p. ej. la Página de Facebook o la cuenta profesional de Instagram de una operadora). Turistero lee solo los anuncios públicos de esas páginas, extrae fecha, lugar y precio, y los muestra en una agenda que **siempre enlaza a la publicación original**. No publica, no envía mensajes, no lee contenido privado y **no hace scraping**: usa solo las APIs oficiales, como máximo una vez por fuente al día.

| Permiso / función | Para qué lo usamos |
|---|---|
| `public_profile`, `email` | Identificar a la persona y crear su cuenta (nombre, foto y correo de contacto). |
| `pages_show_list` | Que la persona elija cuál de **sus** Páginas / cuenta de Instagram vinculada usa como conexión. |
| `instagram_basic` | Obtener el ID de **su** cuenta profesional de Instagram, necesario para llamar a Business Discovery. |
| `pages_read_engagement` | Leer publicaciones públicas de Páginas que administra o agregó a su lista, solo para detectar eventos. |
| Page Public Content Access | Leer publicaciones públicas de Páginas de terceros (operadoras) que la persona agregó a su lista. |

**Datos:** tokens cifrados (AES-256-GCM); se eliminan al desautorizar o pedir la eliminación (callbacks implementados). Política, términos e instrucciones de eliminación publicados.
