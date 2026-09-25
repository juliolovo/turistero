import { EmptyState } from "@/components/states";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <EmptyState emoji="🧭" title="No encontramos esa página" hint="Puede que el evento ya haya pasado o se haya ocultado." action={{ label: "Volver a los eventos", href: "/" }} />
    </div>
  );
}
