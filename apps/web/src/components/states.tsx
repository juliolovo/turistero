import Link from "next/link";

export function EmptyState({ emoji, title, hint, action }: { emoji: string; title: string; hint?: string; action?: { label: string; href: string } }) {
  return (
    <div className="grain rounded-2xl border border-dashed border-ink/25 bg-white/60 px-6 py-14 text-center">
      <p aria-hidden className="text-5xl">{emoji}</p>
      <p className="mt-3 font-display text-2xl font-bold text-ink">{title}</p>
      {hint && <p className="mt-1 text-cacao/80">{hint}</p>}
      {action && (
        <Link href={action.href} className="mt-5 inline-block rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-deep">
          {action.label}
        </Link>
      )}
    </div>
  );
}
