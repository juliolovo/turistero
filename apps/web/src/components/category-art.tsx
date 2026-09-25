import type { CategoryId } from "@turistero/types";
import { getCategory } from "@turistero/config";

/**
 * Ilustración generada por categoría, usada cuando el evento NO tiene imagen.
 * Es explícitamente un fondo decorativo, nunca una foto simulada del evento.
 */
export function CategoryArt({ category, className = "" }: { category: CategoryId; className?: string }) {
  const c = getCategory(category);
  return (
    <div
      role="img"
      aria-label={`Ilustración de la categoría ${c.label} (el evento no incluye imagen)`}
      className={`tint relative isolate grid place-items-center overflow-hidden ${className}`}
      style={{ ["--hue" as string]: c.hue, background: "linear-gradient(135deg, var(--tint), var(--tint-deep))" }}
    >
      <svg aria-hidden className="absolute inset-0 -z-10 size-full opacity-25" preserveAspectRatio="xMidYMid slice">
        <defs>
          <pattern id={`p-${category}`} width="28" height="28" patternUnits="userSpaceOnUse" patternTransform="rotate(-20)">
            <circle cx="4" cy="4" r="2.2" fill="white" />
            <rect x="16" y="14" width="10" height="3" rx="1.5" fill="white" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#p-${category})`} />
      </svg>
      <span aria-hidden className="text-6xl drop-shadow-[0_4px_0_rgba(0,0,0,0.18)] sm:text-7xl">
        {c.emoji}
      </span>
    </div>
  );
}
