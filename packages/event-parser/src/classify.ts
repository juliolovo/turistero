import type { CategoryId } from "@turistero/types";
import { fold } from "./text";

/** Palabras clave por categoría (ya sin acentos). Peso 3 = señal fuerte, 1 = débil. */
const RULES: Record<CategoryId, [RegExp, number][]> = {
  tours: [
    [/\b(tour|tours|excursion|excursiones|caminata|senderismo|trekking|hiking|volcan|cerro negro|ometepe|laguna|isletas|canopy|kayak|snorkel|surf|playa|salida desde|transporte turistico|paquete turistico|ruta del cafe)\b/, 3],
    [/\b(guia|guiado|guiada|hospedaje|viaje|viajes|aventura|recorrido|traslado)\b/, 1],
  ],
  rock: [
    [/\b(rock|metal|heavy|punk|hardcore|thrash|tributo a|metallica|iron maiden|slayer|nirvana|grunge|banda en vivo rock|rockero)\b/, 3],
    [/\b(banda|bandas|guitarras)\b/, 1],
  ],
  music: [
    [/\b(concierto|musica en vivo|en vivo|recital|trova|jazz|acustico|cantautor|orquesta|sinfonic|festival de musica|dj set|reggae|vallenato|mariachi|marimba)\b/, 3],
    [/\b(banda|cantante|musica|show musical)\b/, 1],
  ],
  dance: [
    [/\b(salsa|bachata|kizomba|merengue|cumbia|baile|bailable|zouk|tango|dancehall|social de baile|clase de baile|noche latina|reggaeton)\b/, 3],
  ],
  theater: [
    [/\b(teatro|obra|comedia|stand[- ]?up|standup|monologo|humor|impro|improvisacion|funcion|marionetas|circo)\b/, 3],
    [/\b(actor|actores|dramaturgia|sala principal)\b/, 1],
  ],
  cinema: [
    [/\b(cine|pelicula|peliculas|proyeccion|cortometraje|cortometrajes|cineclub|cine club|estreno|documental)\b/, 3],
  ],
  tech: [
    [/\b(tecnologia|desarrolladores|programacion|meetup|hackathon|startup|inteligencia artificial|\bia\b|software|ciberseguridad|datos|webinar|workshop tech)\b/, 3],
  ],
  art: [
    [/\b(exposicion|exposiciones|galeria|pintura|escultura|fotografia|muestra|inauguracion|arte|museo|artesania|artesanias|feria de arte)\b/, 3],
  ],
  food: [
    [/\b(gastronomia|gastronomica|cata|degustacion|festival de comida|feria gastronomica|cena|maridaje|cafe|cacao|brunch|almuerzo|chef|comida tipica|food truck|cerveza artesanal)\b/, 3],
  ],
  party: [
    [/\b(fiesta|party|after ?party|rumba|karaoke|noche de|pool party|beach party|cumpleanos|celebracion|carnaval|toque|reunion social|mixer|fin de ano)\b/, 3],
    [/\b(dj|discoteca|bar|antro)\b/, 1],
  ],
};

export interface Classification {
  category: CategoryId | null;
  /** 0..1 */
  score: number;
  runnerUp?: CategoryId;
}

/** El título pesa el doble que el resto del texto. */
export function classify(title: string, body = ""): Classification {
  const tt = fold(title);
  const bb = fold(body);
  const scores = new Map<CategoryId, number>();
  for (const [cat, rules] of Object.entries(RULES) as [CategoryId, [RegExp, number][]][]) {
    let s = 0;
    for (const [re, w] of rules) {
      if (re.test(tt)) s += w * 2;
      if (re.test(bb)) s += w;
    }
    if (s) scores.set(cat, s);
  }
  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return { category: null, score: 0 };
  const [top, second] = ranked;
  // Empate con dos categorías: rock/dance/tours ganan a las genéricas (music/party).
  const generic = new Set<CategoryId>(["music", "party"]);
  let best = top!;
  if (second && second[1] === top![1] && generic.has(top![0]) && !generic.has(second[0])) best = second;
  const margin = second ? (best[1] - (best === top ? second[1] : top![1])) / best[1] : 1;
  return { category: best[0], score: Math.min(1, (best[1] / 8) * (0.6 + 0.4 * Math.max(0, margin))), runnerUp: (best === top ? second?.[0] : top![0]) };
}
