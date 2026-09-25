import type { ViewMode } from "@turistero/types";

export function EventsSkeleton({ view }: { view: ViewMode }) {
  return (
    <div role="status" aria-label="Cargando eventos" className={view === "list" ? "space-y-2" : "grid gap-5 sm:grid-cols-2 lg:grid-cols-3"}>
      {Array.from({ length: view === "list" ? 8 : 6 }).map((_, i) =>
        view === "list" ? <div key={i} className="skeleton h-12" /> : (
          <div key={i} className="overflow-hidden rounded-2xl bg-white p-0">
            <div className="skeleton aspect-[16/10] rounded-none" />
            <div className="space-y-2 p-4">
              <div className="skeleton h-4 w-1/3" />
              <div className="skeleton h-6 w-4/5" />
              <div className="skeleton h-4 w-2/3" />
            </div>
          </div>
        ),
      )}
    </div>
  );
}
