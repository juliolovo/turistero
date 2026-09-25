"use client";

import Link from "next/link";
import { LayoutGrid, List } from "lucide-react";
import type { ViewMode } from "@turistero/types";

/** Único componente cliente de la lista: persiste la preferencia en cookie (leída en el servidor, sin parpadeo). */
export function ViewToggle({ current, hrefs }: { current: ViewMode; hrefs: Record<ViewMode, string> }) {
  const remember = (v: ViewMode) => () => {
    try {
      document.cookie = `view=${v}; path=/; max-age=31536000; samesite=lax`;
    } catch {}
  };
  const item = (v: ViewMode, label: string, Icon: typeof List) => (
    <Link
      href={hrefs[v]}
      onClick={remember(v)}
      aria-current={current === v ? "true" : undefined}
      scroll={false}
      className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${current === v ? "bg-ink text-white" : "text-ink hover:bg-ink/10"}`}
    >
      <Icon className="size-4" aria-hidden />
      {label}
    </Link>
  );
  return (
    <div role="group" aria-label="Modo de visualización" className="inline-flex rounded-full border border-ink/15 bg-white p-1">
      {item("cards", "Cards", LayoutGrid)}
      {item("list", "Lista", List)}
    </div>
  );
}
