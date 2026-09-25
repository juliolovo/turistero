import Link from "next/link";
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
      <p className="flex flex-wrap gap-4 pt-2">
          <Link href="/privacy" className="underline underline-offset-4 hover:text-white">Privacidad</Link>
          <Link href="/terms" className="underline underline-offset-4 hover:text-white">Condiciones</Link>
          <Link href="/data-deletion" className="underline underline-offset-4 hover:text-white">Eliminar mis datos</Link>
        </p>
      </div>
    </footer>
  );
}
