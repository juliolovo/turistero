// Utilidades compartidas por los scripts de la Meta App. Sin dependencias (Node >= 20).
// Nunca imprime tokens ni secretos.

export const BASE = () => (process.env.META_GRAPH_BASE ?? "https://graph.facebook.com").replace(/\/$/, "");
export const VERSION = () => process.env.META_GRAPH_VERSION ?? "v21.0";

export function redact(text, secrets) {
  let out = String(text);
  for (const s of secrets) if (s && s.length > 6) out = out.split(s).join("«oculto»");
  return out;
}

/** Llama a la Graph API. Devuelve { ok, status, json }. */
export async function graph(path, params = {}, { version = VERSION(), fetchImpl = fetch } = {}) {
  const url = new URL(`${BASE()}/${version}/${path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  const res = await fetchImpl(url, { headers: { accept: "application/json" } });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* respuesta no JSON */
  }
  return { ok: res.ok && !json?.error, status: res.status, json };
}

/** Traduce un error de Graph API a un diagnóstico accionable en español. */
export function diagnose(error, httpStatus = 400) {
  const code = error?.code;
  if ([190, 102, 463, 467].includes(code)) return { status: "AUTH_REQUIRED", hint: "El token es inválido o venció. Genera uno nuevo en el Graph API Explorer y usa `npm run meta:token`." };
  if ([4, 17, 32, 341, 613].includes(code) || httpStatus === 429) return { status: "RATE_LIMITED", hint: "Límite de peticiones. Espera un rato; Turistero solo reintenta una vez tras 1 hora." };
  if ([10, 200, 210, 283, 3].includes(code)) return { status: "ACCESS_RESTRICTED", hint: "Falta un permiso o una función (p. ej. Page Public Content Access). En modo desarrollo solo funciona con Páginas donde tengas rol; para Páginas ajenas hace falta App Review + verificación del negocio." };
  if ([100, 110].includes(code)) return { status: "ACCESS_RESTRICTED", hint: "Meta no permite leer ese perfil: no existe, es privado o (Instagram) no es una cuenta profesional." };
  return { status: "ERROR", hint: `Error de Graph API${code ? ` (${code})` : ""}: ${error?.message ?? httpStatus}` };
}

export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) out[key] = true;
      else {
        out[key] = next;
        i++;
      }
    } else out._.push(a);
  }
  return out;
}
