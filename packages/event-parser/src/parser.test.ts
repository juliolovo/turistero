import { describe, expect, it } from "vitest";
import { zonedParts } from "@turistero/config";
import { classify, cleanTitle, dedupeKey, extractCandidate, isDuplicate, parseDateTime, parseHtml, parsePrice, similarity } from "./index";

const TZ = "America/Managua";
const NOW = new Date("2026-09-24T18:00:00Z"); // jueves 24 sept 2026, 12:00 Managua

const local = (d: Date) => {
  const p = zonedParts(d, TZ);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")} ${String(p.h).padStart(2, "0")}:${String(p.mi).padStart(2, "0")}`;
};
const dt = (t: string) => {
  const r = parseDateTime(t, { now: NOW, timeZone: TZ });
  return r ? local(r.start) : null;
};

describe("parseDateTime", () => {
  it.each([
    ["Viernes 25 de septiembre, 8:00 PM", "2026-09-25 20:00"],
    ["🎸 25 sept · 8pm en Ron Kon Rolas", "2026-09-25 20:00"],
    ["Sábado 26/09 a las 7 de la noche", "2026-09-26 19:00"],
    ["26 de septiembre 2026 a las 20:30 hrs", "2026-09-26 20:30"],
    ["2026-10-03 19:00", "2026-10-03 19:00"],
    ["Este viernes 9:00 p.m.", "2026-09-25 21:00"],
    ["Hoy 6:30 PM", "2026-09-24 18:30"],
    ["Mañana a las 5 de la mañana salida del tour", "2026-09-25 05:00"],
    ["Domingo 27 de septiembre 12:00 PM", "2026-09-27 12:00"],
    ["12 de octubre 5:00 AM", "2026-10-12 05:00"],
  ])("%s -> %s", (text, expected) => expect(dt(text)).toBe(expected));

  it("asume el año siguiente si la fecha ya pasó", () => {
    expect(dt("10 de enero 8pm")).toBe("2027-01-10 20:00");
  });

  it("no confunde 'de la mañana' con 'mañana'", () => {
    expect(dt("Sábado 26 sept 9 de la mañana")).toBe("2026-09-26 09:00");
  });

  it("marca sin hora y fecha explícita/deducida", () => {
    const a = parseDateTime("25 de septiembre", { now: NOW, timeZone: TZ })!;
    expect(a).toMatchObject({ hasTime: false, explicitDate: true });
    const b = parseDateTime("este sábado 8pm", { now: NOW, timeZone: TZ })!;
    expect(b.explicitDate).toBe(false);
  });

  it("detecta hora de fin, incluso pasada la medianoche", () => {
    const r = parseDateTime("Viernes 25 sept de 8:00 PM a 1:00 AM", { now: NOW, timeZone: TZ })!;
    expect(local(r.end!)).toBe("2026-09-26 01:00");
  });

  it("devuelve null si no hay fecha, y no toma precios por horas", () => {
    expect(dt("Gran noche de rock, entrada C$200")).toBeNull();
    expect(dt("Entrada $35 incluye transporte")).toBeNull();
  });

  it("rechaza fechas imposibles", () => {
    expect(dt("31 de febrero")).toBeNull();
  });
});

describe("parsePrice", () => {
  it.each([
    ["Entrada C$200", { isFree: false, currency: "NIO", min: 200 }],
    ["Cover C$ 150 preventa, C$200 en puerta", { isFree: false, currency: "NIO", min: 150, max: 200 }],
    ["Tour US$35 por persona", { isFree: false, currency: "USD", min: 35 }],
    ["Precio: $45", { isFree: false, currency: "USD", min: 45 }],
    ["Desde 1,200 córdobas", { isFree: false, currency: "NIO", min: 1200 }],
    ["Entrada libre", { isFree: true }],
    ["¡Gratis para todos!", { isFree: true }],
    ["Precio por confirmar", { isFree: false, note: "Precio por confirmar" }],
  ])("%s", (t, expected) => expect(parsePrice(t)).toMatchObject(expected));

  it("no marca gratis si dice 'no es gratis'", () => {
    expect(parsePrice("Ojo: no es gratis, entrada pagada")?.isFree).toBe(false);
  });
  it("devuelve null sin señal de precio", () => {
    expect(parsePrice("Noche de rock en vivo")).toBeNull();
  });
  it("C$ no se interpreta como dólares", () => {
    expect(parsePrice("C$200")?.currency).toBe("NIO");
  });
});

describe("classify", () => {
  it.each([
    ["Tributo a Metallica", "", "rock"],
    ["Noche de Salsa y Bachata", "", "dance"],
    ["Tour Volcán Masaya", "salida desde Managua", "tours"],
    ["Obra de teatro: La Sopa Borracha", "", "theater"],
    ["Stand-up comedy", "", "theater"],
    ["Exposición de pintura", "", "art"],
    ["Cata de café", "", "food"],
    ["Meetup de desarrolladores", "", "tech"],
    ["Ciclo de cine", "proyección de cortometrajes", "cinema"],
    ["Concierto de jazz en vivo", "", "music"],
  ])("%s => %s", (title, body, cat) => expect(classify(title, body).category).toBe(cat));

  it("rock gana a música genérica en empate", () => {
    expect(classify("Concierto de rock", "").category).toBe("rock");
  });
  it("sin señales no clasifica", () => {
    expect(classify("Aviso importante", "hola").category).toBeNull();
  });
});

describe("dedupe", () => {
  const base = { title: "Tributo a Metallica", startsAt: new Date("2026-09-26T02:00:00Z"), venue: "Ron Kon Rolas", placeId: "managua" };
  it("misma clave con emojis y variaciones de mayúsculas", () => {
    const k1 = dedupeKey({ title: cleanTitle("🎸 TRIBUTO a Metallica"), dayKey: "2026-09-25", venue: "Ron Kon Rolas" });
    const k2 = dedupeKey({ title: "Metallica tributo", dayKey: "2026-09-25", venue: "RonKon Rolas" });
    expect(k1.split("|")[1]).toBe(k2.split("|")[1]);
  });
  it("detecta duplicados entre fuentes", () => {
    expect(isDuplicate(base, { ...base, title: "TRIBUTO A METALLICA 🤘" }, true)).toBe(true);
    expect(isDuplicate(base, { ...base, title: "Tributo a Metallica en vivo" }, true)).toBe(true);
  });
  it("no fusiona eventos distintos", () => {
    expect(isDuplicate(base, { ...base, title: "Noche de Salsa" }, true)).toBe(false);
    expect(isDuplicate(base, { ...base, venue: "Teatro Nacional" }, true)).toBe(false);
    expect(isDuplicate(base, base, false)).toBe(false); // otro día
    expect(isDuplicate(base, { ...base, placeId: "leon" }, true)).toBe(false);
  });
  it("dos funciones el mismo día a horas distintas no se fusionan", () => {
    expect(isDuplicate(base, { ...base, startsAt: new Date("2026-09-25T17:00:00Z"), title: "Tributo a Metallica matinée" }, true)).toBe(false);
  });
  it("similarity es simétrica y acotada", () => {
    expect(similarity("abc", "abc")).toBe(1);
    expect(similarity("hola mundo", "mundo hola")).toBeGreaterThan(0.6);
    expect(similarity("", "x")).toBe(0);
  });
});

describe("parseHtml", () => {
  const html = `<html><head><title>Ron Kon Rolas</title>
    <meta property="og:title" content="Tributo a Metallica"><meta property="og:image" content="/img/m.jpg">
    <meta property="og:description" content="Viernes 25 sept 8pm"><link rel="alternate" type="application/rss+xml" href="/feed.xml">
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"MusicEvent","name":"Tributo a Metallica",
      "startDate":"2026-09-25T20:00:00-06:00","location":{"@type":"Place","name":"Ron Kon Rolas","address":{"addressLocality":"Managua"}},
      "offers":{"@type":"Offer","price":"200","priceCurrency":"NIO"}}</script>
    <script type="application/ld+json">{invalid json</script></head>
    <body><nav>menu</nav><p>Hola   mundo</p><script>alert(1)</script></body></html>`;
  it("extrae OG, JSON-LD y feeds; ignora JSON inválido y scripts", () => {
    const m = parseHtml(html, "https://rkr.example/");
    expect(m.title).toBe("Tributo a Metallica");
    expect(m.image).toBe("https://rkr.example/img/m.jpg");
    expect(m.feeds).toEqual(["https://rkr.example/feed.xml"]);
    expect(m.jsonLdEvents).toHaveLength(1);
    expect(m.jsonLdEvents[0]).toMatchObject({ startDate: "2026-09-25T20:00:00-06:00", locationName: "Ron Kon Rolas", price: 200, priceCurrency: "NIO" });
    expect(m.text).toBe("Hola mundo");
  });
});

describe("extractCandidate", () => {
  const ctx = { now: NOW, timeZone: TZ, defaultPlaceId: "managua", defaultVenue: "Ron Kon Rolas", sourceName: "Ron Kon Rolas" };
  const post = (text: string, originalPostUrl: string | null = "https://facebook.com/p/1") => ({ sourceId: "ron-kon-rolas", profileUrl: "https://facebook.com/rkr", originalPostUrl, text });

  it("HIGH: fecha, hora, lugar y categoría claros", () => {
    const c = extractCandidate(post("🎸 Tributo a Metallica\nViernes 25 de septiembre 8:00 PM\nEntrada C$200"), ctx)!;
    expect(c).toMatchObject({ title: "Tributo a Metallica", category: "rock", confidence: "HIGH", venue: "Ron Kon Rolas" });
    expect(c.price).toMatchObject({ currency: "NIO", min: 200 });
    expect(local(c.startsAt)).toBe("2026-09-25 20:00");
  });

  it("MEDIUM: falta la hora", () => {
    expect(extractCandidate(post("Tributo a Metallica el 25 de septiembre"), ctx)!.confidence).toBe("MEDIUM");
  });

  it("LOW: fecha deducida de una referencia relativa", () => {
    const c = extractCandidate(post("Este sábado noche de salsa"), { ...ctx, defaultVenue: undefined })!;
    expect(c.confidence).toBe("LOW");
    expect(c.reasons.join(" ")).toMatch(/relativa/);
  });

  it("no genera evento sin fecha ni para fechas pasadas", () => {
    expect(extractCandidate(post("Gracias a todos por venir anoche"), ctx)).toBeNull();
    expect(extractCandidate(post("Tributo a Metallica 10 de septiembre 8pm"), ctx)).toBeNull();
  });

  it("conserva el enlace original tal cual y no lo rellena con el perfil", () => {
    const c = extractCandidate(post("Salsa 25 sept 8pm", null), ctx)!;
    expect(c.originalPostUrl).toBeNull();
    expect(c.reasons).toContain("sin enlace directo a la publicación");
  });

  it("usa JSON-LD con desfase horario", () => {
    const meta = parseHtml(`<script type="application/ld+json">{"@type":"Event","name":"Tour Cerro Negro","startDate":"2026-09-26T05:00:00-06:00","location":{"name":"León"},"offers":{"price":35,"priceCurrency":"USD"}}</script>`);
    const c = extractCandidate({ sourceId: "x", profileUrl: null, originalPostUrl: "https://x.example/e", text: "", structured: meta.jsonLdEvents[0] }, { ...ctx, defaultVenue: undefined })!;
    expect(c.confidence).toBe("HIGH");
    expect(local(c.startsAt)).toBe("2026-09-26 05:00");
    expect(c.price).toMatchObject({ currency: "USD", min: 35 });
    expect(c.category).toBe("tours");
  });

  it("detecta la ciudad en el texto", () => {
    expect(extractCandidate(post("Tour Cerro Negro saliendo de León, sábado 26 sept 5:00 AM"), ctx)!.placeId).toBe("leon");
  });

  it("el título se corta donde empieza la fecha y el lugar no arrastra la frase siguiente", () => {
    const c = extractCandidate(post("Noche de Salsa y Bachata, sábado 26 de septiembre 7:00 PM en Salón Colonial. Entrada C$150"), { ...ctx, defaultVenue: undefined })!;
    expect(c.title).toBe("Noche de Salsa y Bachata");
    expect(c.venue).toBe("Salón Colonial");
    const d = extractCandidate(post("Tributo a Metallica\nViernes 25 sept 8pm en Ron Kon Rolas. Entrada C$200"), { ...ctx, defaultVenue: undefined })!;
    expect(d.venue).toBe("Ron Kon Rolas");
  });
});
