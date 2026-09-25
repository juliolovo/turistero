import type { Metadata } from "next";
import Link from "next/link";
import { BRAND } from "@turistero/config";

export const metadata: Metadata = { title: "Condiciones de uso" };

/** Condiciones de uso básicas. Revísalas con tus datos reales antes de producción. */
export default function Terms() {
  const h2 = "mt-8 font-display text-2xl font-bold text-ink";
  return (
    <article className="mx-auto max-w-3xl space-y-3 px-4 py-10 leading-relaxed">
      <h1 className="font-display text-4xl font-extrabold text-ink">Condiciones de uso</h1>
      <p className="text-sm text-cacao/70">Última actualización: septiembre de 2026.</p>
      <p>{BRAND.name} es un agregador: muestra información sobre eventos y viajes publicada por terceros y enlaza siempre a la publicación original.</p>
      <h2 className={h2}>Información de terceros</h2>
      <p>Los datos (fechas, precios, lugares) provienen de las fuentes y pueden cambiar o contener errores. Confirma siempre con el organizador antes de comprar o viajar. Los eventos marcados “Por confirmar” o con confianza baja no están verificados.</p>
      <h2 className={h2}>Uso aceptable</h2>
      <ul className="list-disc space-y-1 pl-6">
        <li>Agrega solo páginas y sitios públicos. No uses el servicio para acosar, suplantar o recopilar datos personales de terceros.</li>
        <li>Las revisiones son deliberadamente pocas (una por fuente al día): no intentes eludir esos límites.</li>
        <li>Cada cuenta es personal; eres responsable de tu contraseña.</li>
      </ul>
      <h2 className={h2}>Contenido y marcas</h2>
      <p>Los nombres, logotipos e imágenes pertenecen a sus titulares. Mostramos miniaturas públicas con atribución a su fuente; si eres titular y quieres que retiremos algo, escríbenos.</p>
      <h2 className={h2}>Disponibilidad</h2>
      <p>El servicio se ofrece “tal cual”, sin garantía de disponibilidad. Podemos modificar o suspender funciones (por ejemplo, si una API de terceros cambia).</p>
      <p>Consulta también la <Link className="font-semibold text-rose-deep underline" href="/privacy">política de privacidad</Link>.</p>
    </article>
  );
}
