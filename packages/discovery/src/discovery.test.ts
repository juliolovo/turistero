import { describe, expect, it } from "vitest";
import { extractCandidate } from "@turistero/event-parser";
import { FacebookAdapter, InstagramAdapter, WebsiteAdapter, checkSourceContent, createSafeFetcher, defaultAdapters, extractSocialLinks, isPrivateAddress, mapGraphError, newLinksOnly, normalizeProfileUrl, parseRobots, type DiscoverySource, type FetchOptions } from "./index";

type Route = { status?: number; body?: string; headers?: Record<string, string> };
function mockFetch(routes: Record<string, Route>) {
  const calls: string[] = [];
  const impl = (async (input: URL | string) => {
    const url = input.toString();
    calls.push(url);
    const r = routes[url] ?? routes[new URL(url).origin + new URL(url).pathname] ?? { status: 404, body: "not found" };
    return new Response(r.body ?? "", { status: r.status ?? 200, headers: r.headers ?? {} });
  }) as unknown as typeof fetch;
  return { impl, calls };
}
const PUBLIC = async () => ["93.184.216.34"];
const fetcherFor = (routes: Record<string, Route>, extra = {}) => {
  const m = mockFetch(routes);
  return { ...m, fetcher: createSafeFetcher({ fetchImpl: m.impl, resolveHost: PUBLIC, hostDelayMs: 0, ...extra }) };
};

const NOW = new Date("2026-09-24T18:00:00Z");
const src = (urls: Partial<DiscoverySource["urls"]>): DiscoverySource => ({
  id: "fuente", name: "Fuente", type: "venue", city: "Managua",
  urls: { website: null, facebook: null, instagram: null, tiktok: null, ...urls },
});
const opts = (fetcher: FetchOptions["fetcher"], credentials?: FetchOptions["credentials"]): FetchOptions => ({ now: NOW, maxItems: 10, fetcher, credentials });

describe("isPrivateAddress", () => {
  it.each(["127.0.0.1", "10.0.0.5", "192.168.1.1", "172.16.0.1", "169.254.169.254", "0.0.0.0", "::1", "fe80::1", "fd00::1", "::ffff:10.0.0.1", "100.64.0.1", "no-es-ip"])("%s es privada", (ip) => expect(isPrivateAddress(ip)).toBe(true));
  it.each(["8.8.8.8", "93.184.216.34", "2606:4700:4700::1111"])("%s es pública", (ip) => expect(isPrivateAddress(ip)).toBe(false));
});

describe("SafeFetcher", () => {
  it("bloquea localhost, IPs privadas, protocolos no http y credenciales en la URL", async () => {
    const { fetcher } = fetcherFor({});
    for (const u of ["http://localhost/x", "http://127.0.0.1/", "http://169.254.169.254/latest/meta-data", "file:///etc/passwd", "ftp://x.com/", "https://user:pw@example.com/"]) {
      await expect(fetcher.get(u)).rejects.toMatchObject({ name: "Error" });
    }
  });

  it("bloquea hosts que resuelven a IP privada (DNS rebinding)", async () => {
    const m = mockFetch({});
    const f = createSafeFetcher({ fetchImpl: m.impl, resolveHost: async () => ["10.1.2.3"], hostDelayMs: 0 });
    await expect(f.get("https://evil.example/")).rejects.toMatchObject({ status: "ACCESS_RESTRICTED" });
    expect(m.calls).toHaveLength(0);
  });

  it("revalida el destino de cada redirección", async () => {
    const { fetcher } = fetcherFor({ "https://a.example/": { status: 302, headers: { location: "http://127.0.0.1/admin" } }, "https://a.example/robots.txt": { status: 404 } });
    await expect(fetcher.get("https://a.example/")).rejects.toMatchObject({ status: "ACCESS_RESTRICTED" });
  });

  it("una redirección a login es AUTH_REQUIRED", async () => {
    const { fetcher } = fetcherFor({ "https://a.example/p": { status: 302, headers: { location: "https://a.example/login?next=/p" } } });
    await expect(fetcher.get("https://a.example/p")).rejects.toMatchObject({ status: "AUTH_REQUIRED" });
  });

  it("respeta robots.txt", async () => {
    const { fetcher, calls } = fetcherFor({
      "https://a.example/robots.txt": { body: "User-agent: *\nDisallow: /privado\n" },
      "https://a.example/privado/x": { body: "secreto" },
      "https://a.example/publico": { body: "ok" },
    });
    await expect(fetcher.get("https://a.example/privado/x")).rejects.toMatchObject({ status: "ACCESS_RESTRICTED" });
    expect(calls).not.toContain("https://a.example/privado/x");
    expect((await fetcher.get("https://a.example/publico")).body).toBe("ok");
  });

  it("traduce códigos HTTP a estados de auditoría", async () => {
    const { fetcher } = fetcherFor({
      "https://a.example/401": { status: 401 }, "https://a.example/403": { status: 403 }, "https://a.example/404": { status: 404 },
      "https://a.example/429": { status: 429 }, "https://a.example/500": { status: 500 },
    });
    const st = async (p: string) => fetcher.get(`https://a.example/${p}`).catch((e) => e.status);
    expect(await st("401")).toBe("AUTH_REQUIRED");
    expect(await st("403")).toBe("ACCESS_RESTRICTED");
    expect(await st("404")).toBe("NOT_FOUND");
    expect(await st("429")).toBe("RATE_LIMITED");
    expect(await st("500")).toBe("ERROR");
  });

  it("trunca cuerpos enormes", async () => {
    const { fetcher } = fetcherFor({ "https://a.example/big": { body: "x".repeat(200_000) } }, { maxBytes: 50_000 });
    expect((await fetcher.get("https://a.example/big")).body.length).toBeLessThanOrEqual(50_000);
  });

  it("parseRobots usa el grupo específico si existe", () => {
    expect(parseRobots("User-agent: *\nDisallow: /a\n\nUser-agent: TuristeroBot\nDisallow: /b\n")).toEqual(["/b"]);
    expect(parseRobots("User-agent: *\nDisallow: /a\nDisallow: /c")).toEqual(["/a", "/c"]);
    expect(parseRobots("User-agent: googlebot\nDisallow: /x")).toEqual([]);
  });
});

describe("WebsiteAdapter", () => {
  const page = (body: string) => `<html><head><title>Sitio</title>${body}</head><body></body></html>`;
  const ld = (o: object) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`;

  it("lee JSON-LD, sigue subpáginas de eventos y descubre perfiles sociales", async () => {
    const { fetcher } = fetcherFor({
      "https://tours.example/": { body: `<html><head><title>Tours</title>${ld({ "@type": "Event", name: "Tour Cerro Negro", startDate: "2026-09-26T05:00:00-06:00", location: { name: "León" }, url: "https://tours.example/e/cerro-negro" })}</head>
        <body><a href="/agenda">Agenda</a><a href="https://www.instagram.com/toursnica/">IG</a><a href="/contacto">c</a></body></html>` },
      "https://tours.example/agenda": { body: page(ld({ "@graph": [{ "@type": "Event", name: "Tour Ometepe", startDate: "2026-09-27T06:00:00-06:00", location: { name: "Rivas" } }] })) },
      "https://tours.example/robots.txt": { status: 404 },
    });
    const r = await new WebsiteAdapter().fetchRecentContent(src({ website: "https://tours.example/" }), opts(fetcher));
    expect(r.status).toBe("SUCCESS");
    expect(r.postsReviewed).toBe(2);
    expect(r.contents.map((c) => c.title)).toEqual(["Tour Cerro Negro", "Tour Ometepe"]);
    expect(r.contents[0]!.originalPostUrl).toBe("https://tours.example/e/cerro-negro");
    expect(r.contents[1]!.originalPostUrl).toBe("https://tours.example/agenda");
    expect(r.discoveredLinks?.map((l) => l.url)).toContain("https://www.instagram.com/toursnica");

    const c = extractCandidate(r.contents[0]!, { now: NOW, timeZone: "America/Managua", defaultPlaceId: "managua", sourceName: "Tours" })!;
    expect(c).toMatchObject({ category: "tours", confidence: "HIGH", placeId: "leon" });
  });

  it("usa el feed RSS anunciado por la página", async () => {
    const rss = `<?xml version="1.0"?><rss version="2.0"><channel><title>Blog</title>
      <item><title>Tributo a Metallica</title><link>https://bar.example/p/1</link><pubDate>Wed, 23 Sep 2026 10:00:00 GMT</pubDate>
      <description><![CDATA[<p>Viernes 25 de septiembre 8:00 PM en Ron Kon Rolas. Entrada C$200</p>]]></description></item></channel></rss>`;
    const { fetcher } = fetcherFor({
      "https://bar.example/": { body: page('<link rel="alternate" type="application/rss+xml" href="/feed.xml">') },
      "https://bar.example/feed.xml": { body: rss },
    });
    const r = await new WebsiteAdapter().fetchRecentContent(src({ website: "https://bar.example/" }), opts(fetcher));
    const post = r.contents.find((c) => c.originalPostUrl === "https://bar.example/p/1")!;
    expect(post.text).toContain("Viernes 25 de septiembre");
    const c = extractCandidate(post, { now: NOW, timeZone: "America/Managua", defaultPlaceId: "managua", defaultVenue: "Ron Kon Rolas" })!;
    expect(c).toMatchObject({ category: "rock", confidence: "HIGH" });
    expect(c.price).toMatchObject({ currency: "NIO", min: 200 });
  });

  it("propaga errores de acceso como estado, sin lanzar", async () => {
    const { fetcher } = fetcherFor({ "https://x.example/": { status: 403 } });
    const r = await new WebsiteAdapter().fetchRecentContent(src({ website: "https://x.example/" }), opts(fetcher));
    expect(r).toMatchObject({ status: "ACCESS_RESTRICTED", contents: [] });
  });
});

describe("Facebook / Instagram (API oficial)", () => {
  const graphUrl = (p: string) => Object.keys(routes).find((k) => k.includes(p));
  let routes: Record<string, Route> = {};

  it("sin credenciales devuelven AUTH_REQUIRED y NO consultan nada", async () => {
    const m = fetcherFor({});
    const fb = await new FacebookAdapter().fetchRecentContent(src({ facebook: "https://www.facebook.com/nicaroad" }), opts(m.fetcher));
    const ig = await new InstagramAdapter().fetchRecentContent(src({ instagram: "https://www.instagram.com/ronkonrolas" }), opts(m.fetcher));
    expect(fb.status).toBe("AUTH_REQUIRED");
    expect(ig.status).toBe("AUTH_REQUIRED");
    expect(m.calls).toHaveLength(0);
  });

  it("Facebook: usa Graph API y conserva permalink_url como enlace original", async () => {
    const calls: string[] = [];
    const impl = (async (u: URL | string) => {
      calls.push(u.toString());
      return new Response(JSON.stringify({ data: [
        { message: "Tour Volcán Masaya sábado 26 de septiembre 3:00 PM. US$30", permalink_url: "https://www.facebook.com/nicaroad/posts/123", created_time: "2026-09-22T10:00:00+0000", full_picture: "https://cdn.example/a.jpg" },
        { message: "Post viejo", permalink_url: "https://www.facebook.com/nicaroad/posts/1", created_time: "2026-05-01T10:00:00+0000" },
        { permalink_url: "https://www.facebook.com/nicaroad/posts/2", created_time: "2026-09-22T10:00:00+0000" },
      ] }), { status: 200 });
    }) as unknown as typeof fetch;
    const fetcher = createSafeFetcher({ fetchImpl: impl, resolveHost: PUBLIC, hostDelayMs: 0 });
    const r = await new FacebookAdapter().fetchRecentContent(src({ facebook: "https://www.facebook.com/NicaRoad" }), opts(fetcher, { facebook: { externalId: "app", token: "TKN" } }));
    expect(r.status).toBe("SUCCESS");
    expect(r.contents).toHaveLength(1);
    expect(r.contents[0]).toMatchObject({ originalPostUrl: "https://www.facebook.com/nicaroad/posts/123", imageUrl: "https://cdn.example/a.jpg" });
    expect(calls[0]).toContain("graph.facebook.com/v21.0/nicaroad/posts");
    expect(r.message).not.toContain("TKN"); // el token nunca aparece en la auditoría
  });

  it("Instagram: Business Discovery devuelve permalinks reales", async () => {
    const impl = (async () => new Response(JSON.stringify({ business_discovery: { media: { data: [
      { caption: "Tributo a Metallica viernes 25 sept 8pm", permalink: "https://www.instagram.com/p/ABC/", timestamp: "2026-09-23T10:00:00+0000", media_type: "IMAGE", media_url: "https://cdn.example/i.jpg" },
    ] } } }), { status: 200 })) as unknown as typeof fetch;
    const fetcher = createSafeFetcher({ fetchImpl: impl, resolveHost: PUBLIC, hostDelayMs: 0 });
    const r = await new InstagramAdapter().fetchRecentContent(src({ instagram: "https://www.instagram.com/ronkonrolas/" }), opts(fetcher, { instagram: { externalId: "1784", token: "T" } }));
    expect(r.contents[0]).toMatchObject({ originalPostUrl: "https://www.instagram.com/p/ABC/", profileUrl: "https://www.instagram.com/ronkonrolas/" });
  });

  it("mapea errores de Graph API a estados de auditoría", () => {
    expect(mapGraphError(400, { code: 190 }).status).toBe("AUTH_REQUIRED");
    expect(mapGraphError(400, { code: 4 }).status).toBe("RATE_LIMITED");
    expect(mapGraphError(403, { code: 10 }).status).toBe("ACCESS_RESTRICTED");
    expect(mapGraphError(400, { code: 100 }).status).toBe("ACCESS_RESTRICTED");
    expect(mapGraphError(500, { code: 1, message: "x" }).status).toBe("ERROR");
    void graphUrl; void routes;
  });

  it("un error de Graph API no se lanza: queda como estado", async () => {
    const impl = (async () => new Response(JSON.stringify({ error: { code: 190, message: "Token expired" } }), { status: 400 })) as unknown as typeof fetch;
    const fetcher = createSafeFetcher({ fetchImpl: impl, resolveHost: PUBLIC, hostDelayMs: 0 });
    const r = await new FacebookAdapter().fetchRecentContent(src({ facebook: "https://www.facebook.com/x123" }), opts(fetcher, { facebook: { externalId: "a", token: "t" } }));
    expect(r.status).toBe("AUTH_REQUIRED");
  });
});

describe("checkSourceContent", () => {
  it("combina adaptadores y prioriza el éxito", async () => {
    const { fetcher } = fetcherFor({
      "https://a.example/": { body: `<html><head><title>x</title><script type="application/ld+json">{"@type":"Event","name":"E","startDate":"2026-09-26T20:00:00-06:00"}</script></head></html>` },
    });
    const r = await checkSourceContent(src({ website: "https://a.example/", facebook: "https://www.facebook.com/abc" }), defaultAdapters(), opts(fetcher));
    expect(r.status).toBe("SUCCESS");
    expect(r.adaptersRun).toEqual(["website", "facebook"]);
    expect(r.message).toMatch(/facebook: Facebook requiere/);
  });
  it("una fuente sin URLs es NOT_FOUND", async () => {
    const { fetcher } = fetcherFor({});
    expect((await checkSourceContent(src({}), defaultAdapters(), opts(fetcher))).status).toBe("NOT_FOUND");
  });
});

describe("enlaces sociales", () => {
  it("normaliza y filtra enlaces de compartir/no-perfil", () => {
    expect(normalizeProfileUrl("https://m.facebook.com/NicaRoad/?ref=x")).toMatchObject({ platform: "facebook", key: "nicaroad" });
    expect(normalizeProfileUrl("https://www.facebook.com/profile.php?id=61577210645241")).toMatchObject({ key: "id:61577210645241" });
    expect(normalizeProfileUrl("https://www.facebook.com/sharer/sharer.php?u=x")).toBeNull();
    expect(normalizeProfileUrl("https://www.instagram.com/p/ABC/")).toBeNull();
    expect(normalizeProfileUrl("https://twitter.com/x")).toBeNull();
  });
  it("extrae de texto y enlaces, y omite perfiles ya conocidos", () => {
    const links = extractSocialLinks({ links: ["https://www.instagram.com/toursnica/"], text: "Síguenos en https://facebook.com/otra.pagina, gracias" });
    expect(links.map((l) => l.url).sort()).toEqual(["https://www.facebook.com/otra.pagina", "https://www.instagram.com/toursnica"]);
    const fresh = newLinksOnly(links, [{ urls: { website: null, facebook: "https://www.facebook.com/Otra.Pagina", instagram: null, tiktok: null } }]);
    expect(fresh.map((l) => l.url)).toEqual(["https://www.instagram.com/toursnica"]);
  });
});
