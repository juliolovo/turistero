import { parseHtml, type SourceContent } from "@turistero/event-parser";
import { FetchError } from "../safe-fetch";
import { extractSocialLinks } from "../social-links";
import type { AdapterResult, DiscoverySource, FetchOptions, SourceAdapter } from "../types";
import { fetchFeed } from "./rss";

const EVENT_PATH = /(event|evento|agenda|programa|cartelera|calendario|tour|excursion|actividad|show|concierto)/i;
const MAX_SUBPAGES = 4;

function statusFor(e: unknown): AdapterResult {
  if (e instanceof FetchError) return { status: e.status, message: e.message, contents: [], postsReviewed: 0 };
  return { status: "ERROR", message: (e as Error).message, contents: [], postsReviewed: 0 };
}

/**
 * Sitio web público: JSON-LD (schema.org/Event), OpenGraph, feeds RSS/Atom enlazados y unas pocas
 * subpáginas de eventos del mismo dominio. Sin ejecutar JavaScript ni tocar áreas con login.
 */
export class WebsiteAdapter implements SourceAdapter {
  readonly id = "website";
  canHandle = (s: DiscoverySource) => !!s.urls.website;

  async fetchRecentContent(source: DiscoverySource, o: FetchOptions): Promise<AdapterResult> {
    const contents: SourceContent[] = [];
    let reviewed = 0;
    const notes: string[] = [];
    let home;
    try {
      home = await o.fetcher.get(source.urls.website!);
    } catch (e) {
      return statusFor(e);
    }
    reviewed++;
    const meta = parseHtml(home.body, home.url);
    const origin = new URL(home.url).origin;
    const links = extractSocialLinks({ links: meta.links, text: meta.text.slice(0, 5000) });

    const fromMeta = (m: ReturnType<typeof parseHtml>, pageUrl: string): SourceContent[] =>
      m.jsonLdEvents.map((ev) => ({
        sourceId: source.id,
        profileUrl: source.urls.website,
        originalPostUrl: ev.url ?? pageUrl,
        title: ev.name,
        text: ev.description ?? "",
        imageUrl: ev.image ?? m.image,
        structured: ev,
      }));

    contents.push(...fromMeta(meta, home.url));

    // Feed RSS/Atom: el declarado en la fuente o el anunciado por la página.
    const feedUrl = source.urls.rss ?? meta.feeds[0];
    if (feedUrl) {
      try {
        const feed = await fetchFeed(source, feedUrl, o);
        reviewed += feed.postsReviewed;
        contents.push(...feed.contents);
      } catch (e) {
        notes.push(`feed: ${(e as Error).message}`);
      }
    }

    // Subpáginas de eventos del mismo dominio.
    const sub = [...new Set(meta.links)]
      .filter((l) => {
        try {
          const u = new URL(l);
          return u.origin === origin && u.href !== home.url && EVENT_PATH.test(u.pathname) && !/\.(jpg|png|pdf|zip)$/i.test(u.pathname);
        } catch {
          return false;
        }
      })
      .slice(0, MAX_SUBPAGES);
    for (const url of sub) {
      try {
        const page = await o.fetcher.get(url);
        reviewed++;
        const m = parseHtml(page.body, page.url);
        links.push(...extractSocialLinks({ links: m.links }));
        const ld = fromMeta(m, page.url);
        if (ld.length) contents.push(...ld);
        else if (m.title) {
          contents.push({ sourceId: source.id, profileUrl: source.urls.website, originalPostUrl: page.url, title: m.title, text: `${m.description ?? ""}\n${m.text.slice(0, 3000)}`, imageUrl: m.image, publishedAt: m.publishedAt });
        }
      } catch (e) {
        notes.push(`${new URL(url).pathname}: ${(e as Error).message}`);
      }
    }

    // Último recurso: la portada, si no hubo nada más (la extracción decidirá si hay una fecha real).
    if (!contents.length && meta.title) {
      contents.push({ sourceId: source.id, profileUrl: source.urls.website, originalPostUrl: home.url, title: meta.title, text: `${meta.description ?? ""}\n${meta.text.slice(0, 3000)}`, imageUrl: meta.image });
    }

    const uniqueLinks = [...new Map(links.map((l) => [l.url, l])).values()];
    return {
      status: contents.length ? "SUCCESS" : "NO_EVENTS",
      message: `${reviewed} página(s) revisada(s)${notes.length ? `; avisos: ${notes.join("; ")}` : ""}`,
      contents,
      postsReviewed: reviewed,
      discoveredLinks: uniqueLinks,
    };
  }
}
