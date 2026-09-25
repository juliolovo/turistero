"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Mientras hay una revisión en curso, vuelve a pedir la página cada pocos segundos (sin recargar). */
export function AutoRefresh({ active, everyMs = 4000, maxMs = 120_000 }: { active: boolean; everyMs?: number; maxMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const started = Date.now();
    const t = setInterval(() => {
      if (Date.now() - started > maxMs) return clearInterval(t);
      router.refresh();
    }, everyMs);
    return () => clearInterval(t);
  }, [active, everyMs, maxMs, router]);
  return null;
}
