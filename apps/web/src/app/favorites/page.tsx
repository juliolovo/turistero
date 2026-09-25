import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getFavoriteEvents, getFavoriteState } from "@/lib/favorites";
import { EventCard } from "@/components/event-card";
import { EmptyState } from "@/components/states";
import { apiConfigured } from "@/lib/session-api";

export const metadata: Metadata = { title: "Favoritos" };

export default async function Favorites() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/favorites");
  if (!apiConfigured()) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <EmptyState emoji="🔌" title="Favoritos no disponible" hint="La API no está configurada en este entorno." />
      </div>
    );
  }
  const [events, fav] = await Promise.all([getFavoriteEvents(session.user.id), getFavoriteState()]);
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-4 font-display text-3xl font-extrabold text-ink">Tus favoritos</h1>
      {events.length === 0 ? (
        <EmptyState emoji="♡" title="Aún no tienes favoritos" hint="Toca el corazón en cualquier evento para guardarlo aquí." action={{ label: "Explorar eventos", href: "/" }} />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((e) => <EventCard key={e.id} event={e} fav={fav} />)}
        </div>
      )}
    </div>
  );
}
