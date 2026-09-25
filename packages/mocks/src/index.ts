import type { CategoryId, EventItem, EventSourceRef, SourcePlatform } from "@turistero/types";
import { getPlace, startOfDayUtc, zonedParts, zonedTimeToUtc } from "@turistero/config";

/**
 * DATOS DE EJEMPLO (isMock: true). Ninguno es información real ni confirmada por las fuentes.
 * Los nombres de venues/operadoras se usan solo para dar realismo al diseño.
 * Las fechas son relativas a "hoy" para que la demo siempre muestre los próximos 7 días.
 */

const PROFILES: Record<string, { id: string; name: string; platform: SourcePlatform; url: string }> = {
  rkr: { id: "ron-kon-rolas", name: "Ron Kon Rolas", platform: "facebook", url: "https://www.facebook.com/ronkonrolas.bar.en.managua" },
  rutasegura: { id: "ruta-segura-nicaragua", name: "Ruta Segura Nicaragua", platform: "facebook", url: "https://www.facebook.com/rutasegurani" },
  finding: { id: "finding-adventures-nicaragua", name: "Finding Adventure", platform: "facebook", url: "https://www.facebook.com/finding.adventure" },
  wander: { id: "wanderlust-travel", name: "Wanderlust Nica", platform: "facebook", url: "https://www.facebook.com/wanderlustNica" },
  nicaroad: { id: "nicaroad", name: "NicaRoad", platform: "facebook", url: "https://www.facebook.com/NicaRoad" },
  tnrd: { id: "teatro-nacional-ruben-dario", name: "Teatro Nacional Rubén Darío", platform: "facebook", url: "https://www.facebook.com/tnrd.oficial" },
  demo: { id: "demo", name: "Fuente de ejemplo", platform: "manual", url: "" },
};

interface Seed {
  title: string;
  category: CategoryId;
  day: number; // offset desde hoy
  time: string; // HH:MM local
  venue: string;
  place: string;
  src: keyof typeof PROFILES;
  desc: string;
  price?: { currency: "NIO" | "USD"; min: number; max?: number } | "free";
  hoursAgoDiscovered?: number;
  organizer?: string;
  address?: string;
}

const SEEDS: Seed[] = [
  { title: "Tributo a Metallica", category: "rock", day: 1, time: "20:00", venue: "Ron Kon Rolas", place: "managua", src: "rkr", desc: "Noche de covers de los clásicos de Metallica con banda local en vivo. Puertas abren a las 7:00 PM.", price: { currency: "NIO", min: 200 }, hoursAgoDiscovered: 10 },
  { title: "Tour Cerro Negro con bajada en tabla", category: "tours", day: 2, time: "05:00", venue: "Salida desde León", place: "leon", src: "finding", desc: "Ascenso guiado al volcán Cerro Negro y descenso en tabla. Incluye transporte, tabla y equipo de protección.", price: { currency: "USD", min: 35 }, hoursAgoDiscovered: 20, organizer: "Finding Adventure" },
  { title: "Noche de Salsa", category: "dance", day: 2, time: "19:00", venue: "Salón por confirmar", place: "managua", src: "demo", desc: "Clase introductoria de salsa a las 7:00 PM y pista abierta después.", price: { currency: "NIO", min: 150 }, hoursAgoDiscovered: 30 },
  { title: "La Sopa Borracha", category: "theater", day: 3, time: "18:00", venue: "Teatro Nacional Rubén Darío", place: "managua", src: "tnrd", desc: "Función de teatro en la sala principal. Ejemplo de descripción: duración aproximada de 90 minutos, apto mayores de 12 años.", price: { currency: "NIO", min: 250, max: 400 }, hoursAgoDiscovered: 60 },
  { title: "Tour Volcán Masaya de atardecer", category: "tours", day: 0, time: "15:30", venue: "Parque Nacional Volcán Masaya", place: "masaya", src: "rutasegura", desc: "Visita al cráter Santiago y sendero corto. Recogida en Managua y regreso después de la observación nocturna de lava.", price: { currency: "USD", min: 30 }, hoursAgoDiscovered: 5, organizer: "Ruta Segura Nicaragua" },
  { title: "Excursión a Isla de Ometepe (2 días)", category: "tours", day: 5, time: "06:00", venue: "Salida desde Managua", place: "managua", src: "wander", desc: "Ferry desde San Jorge, hospedaje y guía. Ejemplo de itinerario: Ojo de Agua y mirador.", price: { currency: "USD", min: 120, max: 160 }, hoursAgoDiscovered: 8, organizer: "Wanderlust Nica" },
  { title: "Free Walking Tour Centro Histórico", category: "tours", day: 0, time: "09:00", venue: "Catedral de León", place: "leon", src: "demo", desc: "Recorrido a pie por el centro histórico. Se agradece propina voluntaria al guía.", price: "free", hoursAgoDiscovered: 200 },
  { title: "Tour Laguna de Apoyo y kayak", category: "tours", day: 4, time: "08:00", venue: "Laguna de Apoyo", place: "granada", src: "nicaroad", desc: "Jornada de kayak y baño en la laguna. Almuerzo no incluido.", price: { currency: "USD", min: 45 }, hoursAgoDiscovered: 40, organizer: "NicaRoad" },
  { title: "Jueves de Rock Local", category: "rock", day: 0, time: "20:30", venue: "Ron Kon Rolas", place: "managua", src: "rkr", desc: "Tres bandas locales en escenario. Ejemplo de cartel de la noche.", price: { currency: "NIO", min: 100 }, hoursAgoDiscovered: 90 },
  { title: "Festival de Metal Nica", category: "rock", day: 6, time: "16:00", venue: "Foro por confirmar", place: "managua", src: "demo", desc: "Festival de un día con bandas de metal de la región. Programa sujeto a confirmación.", price: { currency: "NIO", min: 300 }, hoursAgoDiscovered: 15 },
  { title: "Trova bajo las estrellas", category: "music", day: 1, time: "19:30", venue: "Casa de cultura", place: "granada", src: "demo", desc: "Concierto acústico de trova y canto nuevo.", price: "free", hoursAgoDiscovered: 100 },
  { title: "Jazz en el patio", category: "music", day: 3, time: "20:00", venue: "Café del centro", place: "leon", src: "demo", desc: "Cuarteto de jazz en vivo en un patio colonial.", price: { currency: "NIO", min: 180 }, hoursAgoDiscovered: 150 },
  { title: "Bachata y Kizomba social", category: "dance", day: 4, time: "20:00", venue: "Salón por confirmar", place: "managua", src: "demo", desc: "Práctica social abierta con DJ.", price: { currency: "NIO", min: 120 }, hoursAgoDiscovered: 70 },
  { title: "Stand-up: Noche de risas", category: "theater", day: 2, time: "20:00", venue: "Sala por confirmar", place: "managua", src: "demo", desc: "Cinco comediantes locales en una noche de humor.", price: { currency: "NIO", min: 200 }, hoursAgoDiscovered: 25 },
  { title: "Ciclo de cine centroamericano", category: "cinema", day: 3, time: "18:30", venue: "Cine club por confirmar", place: "managua", src: "demo", desc: "Proyección de cortometrajes seguida de conversatorio.", price: "free", hoursAgoDiscovered: 300 },
  { title: "Meetup de desarrolladores", category: "tech", day: 5, time: "18:00", venue: "Espacio de coworking", place: "managua", src: "demo", desc: "Charlas relámpago sobre web y datos. Cupo limitado.", price: "free", hoursAgoDiscovered: 50 },
  { title: "Exposición de pintura naif", category: "art", day: 1, time: "17:00", venue: "Galería por confirmar", place: "granada", src: "demo", desc: "Inauguración de una muestra colectiva de pintura naif.", price: "free", hoursAgoDiscovered: 120 },
  { title: "Feria gastronómica de la ciudad", category: "food", day: 6, time: "11:00", venue: "Plaza central", place: "masaya", src: "demo", desc: "Puestos de comida típica, música y actividades para familias.", price: "free", hoursAgoDiscovered: 45 },
  { title: "Cata de café y cacao", category: "food", day: 4, time: "15:00", venue: "Finca por confirmar", place: "rivas", src: "demo", desc: "Recorrido y degustación guiada de café y cacao.", price: { currency: "USD", min: 25 }, hoursAgoDiscovered: 80 },
  { title: "Fiesta de fin de semana en la playa", category: "party", day: 5, time: "21:00", venue: "Playa por confirmar", place: "rivas", src: "demo", desc: "DJ set frente al mar. Ejemplo de descripción de un evento social.", price: { currency: "NIO", min: 250 }, hoursAgoDiscovered: 35 },
  { title: "Tour Isletas de Granada en lancha", category: "tours", day: 3, time: "09:30", venue: "Puerto de Granada", place: "granada", src: "wander", desc: "Paseo por las isletas con observación de aves y parada para nadar.", price: { currency: "USD", min: 20 }, hoursAgoDiscovered: 12, organizer: "Wanderlust Nica" },
  { title: "Ruta del Café en Matagalpa", category: "tours", day: 6, time: "06:30", venue: "Salida desde Managua", place: "managua", src: "rutasegura", desc: "Viaje de un día a fincas de café con almuerzo y transporte.", price: { currency: "USD", min: 55 }, hoursAgoDiscovered: 400, organizer: "Ruta Segura Nicaragua" },
  { title: "Karaoke Rock Night", category: "rock", day: 4, time: "21:00", venue: "Ron Kon Rolas", place: "managua", src: "rkr", desc: "Karaoke con banda en vivo: pasás al micrófono y ellos te acompañan.", price: "free", hoursAgoDiscovered: 18 },
];

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function buildMockEvents(now: Date = new Date()): EventItem[] {
  return SEEDS.map((s, i) => {
    const place = getPlace(s.place)!;
    const base = zonedParts(startOfDayUtc(now, place.timezone), place.timezone);
    const [h, mi] = s.time.split(":").map(Number) as [number, number];
    const start = zonedTimeToUtc(base.y, base.m, base.d + s.day, h, mi, place.timezone);
    const p = PROFILES[s.src]!;
    const source: EventSourceRef = {
      sourceId: p.id, // mismo id que el catálogo (config/sources.json): así "Mi agenda" funciona con los datos de ejemplo
      sourceName: p.name,
      platform: p.platform,
      urlKind: "PROFILE_URL",
      originalPostUrl: null, // ningún mock tiene publicación real
      profileUrl: p.url || null,
    };
    const day = zonedParts(start, place.timezone);
    const dateStr = `${day.y}-${String(day.m).padStart(2, "0")}-${String(day.d).padStart(2, "0")}`;
    return {
      id: `mock-${i + 1}`,
      slug: `${slugify(s.title)}-${slugify(s.venue)}-${dateStr}`,
      title: s.title,
      description: s.desc,
      category: s.category,
      startsAt: start.toISOString(),
      timezone: place.timezone,
      venue: s.venue,
      placeId: place.id,
      country: place.country,
      address: s.address,
      organizer: s.organizer ? { name: s.organizer, profileUrl: p.url || undefined } : undefined,
      price:
        s.price === "free" ? { isFree: true } : s.price ? { isFree: false, currency: s.price.currency, min: s.price.min, max: s.price.max } : { isFree: false },
      confidence: s.src === "demo" ? "MEDIUM" : "HIGH",
      status: "PUBLISHED",
      discoveredAt: new Date(now.getTime() - (s.hoursAgoDiscovered ?? 100) * 3_600_000).toISOString(),
      lastVerifiedAt: new Date(now.getTime() - 2 * 3_600_000).toISOString(),
      sources: [source],
      isMock: true,
    } satisfies EventItem;
  });
}
