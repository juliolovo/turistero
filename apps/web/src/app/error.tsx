"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-20 text-center">
      <p aria-hidden className="text-5xl">📡</p>
      <h1 className="mt-3 font-display text-3xl font-bold text-ink">No pudimos cargar los eventos</h1>
      <p className="mt-2">Revisa tu conexión e inténtalo otra vez.</p>
      <button onClick={reset} className="mt-5 rounded-full bg-ink px-5 py-2.5 font-semibold text-white hover:bg-rose-deep">
        Reintentar
      </button>
    </div>
  );
}
