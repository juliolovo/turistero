import type { Metadata } from "next";
import Link from "next/link";
import { BRAND } from "@turistero/config";

export const metadata: Metadata = { title: "Política de privacidad" };

const contact = process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "contacto@ejemplo.com";

/**
 * Política de privacidad (requerida por Meta, Google, Microsoft y Apple para publicar la app).
 * Revísala con tus datos reales (responsable, correo de contacto, jurisdicción) antes de producción.
 */
export default function Privacy() {
  const h2 = "mt-8 font-display text-2xl font-bold text-ink";
  return (
    <article className="mx-auto max-w-3xl space-y-3 px-4 py-10 leading-relaxed">
      <h1 className="font-display text-4xl font-extrabold text-ink">Política de privacidad</h1>
      <p className="text-sm text-cacao/70">Última actualización: septiembre de 2026.</p>
      <p>{BRAND.name} reúne en un solo lugar los viajes, tours y eventos que publican operadoras y lugares. Esta política explica qué datos tratamos, para qué y cómo puedes controlarlos.</p>

      <h2 className={h2}>Qué datos recibimos</h2>
      <ul className="list-disc space-y-1 pl-6">
        <li><strong>Cuenta</strong>: nombre, correo e imagen de perfil que nos entregan Google, Meta (Facebook), Microsoft o Apple, o el correo y la contraseña que tú eliges. Las contraseñas se guardan con un hash scrypt; nadie puede leerlas.</li>
        <li><strong>Tu uso</strong>: favoritos, filtros guardados, tus fuentes propias (enlaces que agregas), tu horario de revisión y los avisos que generamos para ti.</li>
        <li><strong>Contenido público</strong> de las páginas y sitios que tú (o el catálogo) indican: publicaciones sobre eventos. Conservamos siempre el enlace a la publicación original.</li>
      </ul>

      <h2 className={h2}>Qué NO hacemos</h2>
      <ul className="list-disc space-y-1 pl-6">
        <li>No vendemos ni compartimos tus datos con terceros con fines publicitarios.</li>
        <li>No leemos tu muro, mensajes, amigos ni contenido privado de Facebook o Instagram.</li>
        <li>No hacemos scraping de Facebook ni Instagram: solo usamos las APIs oficiales de Meta, con permisos que tú autorizas, y solo sobre las páginas que agregas.</li>
        <li>Los eventos que aparecen en tus fuentes propias son <strong>privados</strong>: solo los ves tú.</li>
      </ul>

      <h2 className={h2}>Datos de Meta (Facebook e Instagram)</h2>
      <p>Iniciar sesión con Meta solo solicita tu perfil público y tu correo. Si el administrador conecta una cuenta de Meta para leer páginas públicas, el token de acceso se guarda cifrado (AES-256-GCM) y solo se usa para consultar publicaciones públicas de las páginas configuradas, como máximo una vez al día por fuente. Puedes retirar la autorización en tu configuración de Facebook (Apps y sitios web) y solicitar la eliminación de tus datos como se explica abajo.</p>

      <h2 className={h2}>Conservación y eliminación</h2>
      <p>Conservamos tus datos mientras tengas cuenta. Puedes eliminar tus fuentes, favoritos y avisos en cualquier momento, y pedir la eliminación completa de tu cuenta escribiendo a <a className="font-semibold text-rose-deep underline" href={`mailto:${contact}`}>{contact}</a> o, si entraste con Facebook, desde Facebook (Configuración → Apps y sitios web → Eliminar). Consulta <Link className="font-semibold text-rose-deep underline" href="/data-deletion">cómo eliminar tus datos</Link>.</p>

      <h2 className={h2}>Seguridad</h2>
      <p>Tráfico cifrado (HTTPS), contraseñas con scrypt, bloqueo temporal tras intentos fallidos, tokens de terceros cifrados en la base de datos y acceso por roles.</p>

      <h2 className={h2}>Contacto</h2>
      <p>Responsable del tratamiento: el operador de {BRAND.name}. Escríbenos a <a className="font-semibold text-rose-deep underline" href={`mailto:${contact}`}>{contact}</a>.</p>
    </article>
  );
}
