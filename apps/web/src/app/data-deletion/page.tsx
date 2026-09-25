import type { Metadata } from "next";

export const metadata: Metadata = { title: "Eliminación de datos", robots: { index: false } };

const contact = process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "contacto@ejemplo.com";
const LABEL: Record<string, string> = {
  COMPLETED: "Completada: eliminamos los datos asociados a tu cuenta.",
  NOT_FOUND: "No encontramos datos asociados a esa cuenta (quizá ya se habían eliminado).",
  PENDING: "En proceso.",
};

/** Página de instrucciones y de estado que Meta enlaza tras una solicitud de eliminación (`?code=...`). */
export default async function DataDeletion({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  let status: string | null = null;
  if (code && /^[a-zA-Z0-9]{8,64}$/.test(code) && process.env.API_URL) {
    try {
      const r = await fetch(`${process.env.API_URL}/api/meta/data-deletion/${encodeURIComponent(code)}`, { cache: "no-store" });
      if (r.ok) status = ((await r.json()) as { status: string }).status;
    } catch {
      /* sin API: solo se muestran las instrucciones */
    }
  }
  return (
    <article className="mx-auto max-w-3xl space-y-4 px-4 py-10 leading-relaxed">
      <h1 className="font-display text-4xl font-extrabold text-ink">Eliminación de datos</h1>
      {code && (
        <p role="status" className="rounded-xl bg-white px-4 py-3">
          Solicitud <code className="font-mono">{code}</code>: <strong>{status ? (LABEL[status] ?? status) : "no encontramos esa solicitud."}</strong>
        </p>
      )}
      <h2 className="font-display text-2xl font-bold text-ink">Cómo eliminar tus datos</h2>
      <ol className="list-decimal space-y-2 pl-6">
        <li><strong>Si entraste con Facebook</strong>: en Facebook ve a Configuración → Apps y sitios web, elige Turistero y pulsa <em>Eliminar</em>. Facebook nos avisa y borramos tus datos automáticamente; puedes volver a esta página con el código de confirmación para ver el estado.</li>
        <li><strong>Desde tu cuenta</strong>: en “Mis fuentes” puedes eliminar tus fuentes propias (y sus eventos privados). Los favoritos se quitan con el corazón.</li>
        <li><strong>Cualquier otro método de acceso</strong>: escribe a <a className="font-semibold text-rose-deep underline" href={`mailto:${contact}`}>{contact}</a> desde el correo de tu cuenta y eliminaremos tu cuenta y todos sus datos.</li>
      </ol>
      <p>Al eliminar tu cuenta se borran: tu perfil, favoritos, filtros, fuentes propias, eventos privados, horario, avisos y las conexiones a terceros asociadas. Los eventos públicos del catálogo no contienen datos personales.</p>
    </article>
  );
}
