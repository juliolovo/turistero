import Link from "next/link";

export const STATUS_META: Record<string, { icon: string; label: string; tone: string }> = {
  SUCCESS: { icon: "✅", label: "Correcta", tone: "bg-lagoon/15 text-lagoon" },
  NO_EVENTS: { icon: "⚪", label: "Sin eventos verificables", tone: "bg-cal-2 text-cacao" },
  NO_RECENT_CONTENT: { icon: "⚪", label: "Sin contenido reciente", tone: "bg-cal-2 text-cacao" },
  AUTH_REQUIRED: { icon: "🔐", label: "Requiere autenticación", tone: "bg-mango/40 text-ink" },
  ACCESS_RESTRICTED: { icon: "⚠️", label: "Acceso restringido", tone: "bg-mango/40 text-ink" },
  RATE_LIMITED: { icon: "⏳", label: "Límite de peticiones", tone: "bg-mango/40 text-ink" },
  NOT_FOUND: { icon: "❓", label: "No encontrada", tone: "bg-rose/15 text-rose-deep" },
  ERROR: { icon: "❌", label: "Error", tone: "bg-rose/15 text-rose-deep" },
};

export function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <span className="rounded-full bg-cal-2 px-2.5 py-0.5 text-xs font-semibold">Sin revisar</span>;
  const m = STATUS_META[status] ?? { icon: "•", label: status, tone: "bg-cal-2" };
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${m.tone}`}>{m.icon} {m.label}</span>;
}

export function Flash({ ok, error }: { ok?: string; error?: string }) {
  if (!ok && !error) return null;
  return (
    <p role={error ? "alert" : "status"} className={`mb-4 rounded-lg px-4 py-3 text-sm font-medium ${error ? "bg-rose/15 text-rose-deep" : "bg-lagoon/15 text-lagoon"}`}>
      {error ?? ok}
    </p>
  );
}

export function fmtDateTime(iso: string | null | undefined, tz = "America/Managua") {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short", timeZone: tz }).format(new Date(iso));
}

export function relTime(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return "nunca";
  const m = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "hace un momento";
  if (m < 60) return `hace ${m} min`;
  if (m < 60 * 24) return `hace ${Math.round(m / 60)} h`;
  return `hace ${Math.round(m / 1440)} d`;
}

export const btn = "rounded-full border border-ink/25 bg-white px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-ink";
export const btnPrimary = "rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-deep";
export const btnDanger = "rounded-full border border-rose-deep/40 bg-white px-3 py-1.5 text-xs font-semibold text-rose-deep transition hover:bg-rose/10";
export const field = "w-full rounded-lg border border-ink/20 bg-white px-3 py-2 text-sm";

export function Th({ children }: { children?: React.ReactNode }) {
  return <th scope="col" className="whitespace-nowrap px-3 py-2 text-left font-semibold">{children}</th>;
}

export function ExtLink({ href, children }: { href: string | null | undefined; children: React.ReactNode }) {
  if (!href) return <span className="text-cacao/70">—</span>;
  return <a href={href} target="_blank" rel="noopener noreferrer" className="font-semibold text-rose-deep underline underline-offset-2">{children}</a>;
}

export { Link };
