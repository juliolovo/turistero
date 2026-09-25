import { BRAND } from "@turistero/config";

export function Footer() {
  return (
    <footer className="bg-ink text-white/75">
      <div className="mx-auto max-w-6xl space-y-2 px-4 py-8 text-sm">
        <p className="font-display text-lg font-bold text-white">{BRAND.name}</p>
        <p>{BRAND.tagline}</p>
        <p>
          Cada evento enlaza a su publicación original. Los datos marcados como <strong className="text-mango">ejemplo</strong> son ficticios y
          existen solo para desarrollo.
        </p>
      </div>
    </footer>
  );
}
