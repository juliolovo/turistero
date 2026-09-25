"use client";

import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";
import { setFavorite } from "@/app/actions";

/** ♡ / ♥ con actualización optimista. Por encima del enlace-tarjeta (z-10). */
export function FavoriteButton({ eventId, initial, loggedIn, title }: { eventId: string; initial: boolean; loggedIn: boolean; title: string }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [on, setOn] = useOptimistic(initial, (_s, v: boolean) => v);

  const toggle = () => {
    if (!loggedIn) return router.push(`/login?callbackUrl=${encodeURIComponent(window.location.pathname + window.location.search)}`);
    start(async () => {
      setOn(!on);
      const r = await setFavorite(eventId, !on);
      if (!r.ok) setOn(on);
      router.refresh();
    });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      aria-label={on ? `Quitar de favoritos: ${title}` : `Guardar en favoritos: ${title}`}
      className="relative z-10 grid size-10 place-items-center rounded-full bg-white/95 text-rose-deep shadow transition hover:scale-110"
    >
      <Heart className="size-5" fill={on ? "currentColor" : "none"} aria-hidden />
    </button>
  );
}
