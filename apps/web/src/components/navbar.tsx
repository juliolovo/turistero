import Link from "next/link";
import { Heart, LogIn, LogOut, MapPinned } from "lucide-react";
import { BRAND } from "@turistero/config";
import { auth, signOut } from "@/auth";
import { apiAs, apiConfigured } from "@/lib/session-api";

const links = [
  { href: "/#eventos", label: "Eventos" },
  { href: "/?category=tours#eventos", label: "Tours" },
  { href: "/#ciudades", label: "Ciudades" },
  { href: "/favorites", label: "Favoritos", icon: Heart },
];

export async function Navbar() {
  const session = await auth();
  const user = session?.user;
  const staff = user?.role === "EDITOR" || user?.role === "ADMIN";
  let unread = 0;
  if (user && apiConfigured()) {
    try {
      const r = await apiAs(user.id, "/my/notifications/unread-count");
      if (r.ok) unread = ((await r.json()) as { unread: number }).unread;
    } catch {
      /* sin API: sin contador */
    }
  }
  const myLabel = unread > 0 ? `Mis fuentes (${unread})` : "Mis fuentes";

  return (
    <header className="bg-ink text-white">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-display text-xl font-extrabold tracking-tight">
          <span aria-hidden className="grid size-8 place-items-center rounded-lg bg-rose text-ink">
            <MapPinned className="size-5" />
          </span>
          {BRAND.name}
        </Link>
        <nav aria-label="Principal" className="ml-auto hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-full px-3 py-1.5 text-sm text-white/85 transition hover:bg-white/10 hover:text-white">
              {l.label}
            </Link>
          ))}
          {user && <Link href="/my" className="rounded-full px-3 py-1.5 text-sm text-white/85 transition hover:bg-white/10 hover:text-white">{myLabel}</Link>}
          {staff && (
            <Link href="/admin" className="rounded-full px-3 py-1.5 text-sm text-mango transition hover:bg-white/10">Admin</Link>
          )}
        </nav>
        {user ? (
          <form
            className="ml-auto flex items-center gap-2 md:ml-2"
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <span className="hidden max-w-32 truncate text-sm text-white/85 sm:inline" title={user.email ?? undefined}>{user.name ?? user.email}</span>
            <button className="inline-flex items-center gap-2 rounded-full border border-white/30 px-4 py-2 text-sm font-semibold transition hover:bg-white/10">
              <LogOut className="size-4" aria-hidden />
              Salir
            </button>
          </form>
        ) : (
          <Link href="/login" className="ml-auto inline-flex items-center gap-2 rounded-full bg-mango px-4 py-2 text-sm font-semibold text-ink transition hover:brightness-95 md:ml-2">
            <LogIn className="size-4" aria-hidden />
            Entrar
          </Link>
        )}
      </div>
      <nav aria-label="Principal móvil" className="flex gap-1 overflow-x-auto px-3 pb-2 md:hidden">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="shrink-0 rounded-full bg-white/10 px-3 py-1 text-sm">
            {l.label}
          </Link>
        ))}
        {user && <Link href="/my" className="shrink-0 rounded-full bg-white/10 px-3 py-1 text-sm">{myLabel}</Link>}
        {staff && <Link href="/admin" className="shrink-0 rounded-full bg-mango px-3 py-1 text-sm text-ink">Admin</Link>}
      </nav>
    </header>
  );
}
