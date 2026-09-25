import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/admin";

export const metadata: Metadata = { title: "Administración", robots: { index: false, follow: false } };

const NAV = [
  { href: "/admin", label: "Resumen" },
  { href: "/admin/sources", label: "Fuentes" },
  { href: "/admin/sources/status", label: "Estado de fuentes" },
  { href: "/admin/candidates", label: "Candidatos" },
  { href: "/admin/events", label: "Eventos" },
  { href: "/admin/add-event", label: "Agregar evento" },
  { href: "/admin/runs", label: "Corridas" },
];
const ADMIN_NAV = [
  { href: "/admin/users", label: "Usuarios" },
  { href: "/admin/connections", label: "Conexiones Meta" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const u = await requireRole("EDITOR");
  const links = u.role === "ADMIN" ? [...NAV, ...ADMIN_NAV] : NAV;
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 lg:grid lg:grid-cols-[13rem_1fr] lg:gap-8">
      <nav aria-label="Administración" className="mb-6 flex gap-1 overflow-x-auto lg:mb-0 lg:flex-col">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="shrink-0 rounded-lg px-3 py-2 text-sm font-semibold text-ink transition hover:bg-white">{l.label}</Link>
        ))}
        <p className="mt-3 hidden px-3 text-xs text-cacao/70 lg:block">Rol: {u.role}</p>
      </nav>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
