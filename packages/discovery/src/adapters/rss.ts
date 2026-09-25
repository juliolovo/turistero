import { XMLParser } from "fast-xml-parser";
import { parseHtml, type SourceContent } from "@turistero/event-parser";
import { FetchError } from "../safe-fetch";
import type { AdapterResult, DiscoverySource, FetchOptions, SourceAdapter } from "../types";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", textNodeName: "#text", processEntities: true });
const arr = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const text = (v: unknown): string => {
  if (v === undefined || v === null) return "";
  if (typeof v === "object") return String((v as Record<string, unknown>)["#text"] ?? "");
  return String(v);
};
const plain = (html: string) => parseHtml(`<body>${html}</body>`).text;

export function parseFeed(xml: string, source: { id: string; profileUrl: string | null }, maxItems: number): SourceContent[] {
  const doc = parser.parse(xml) as Record<string, any>;
  const items: SourceContent[] = [];
  if (doc.rss?.channel) {
    for (const it of arr(doc.rss.channel.item).slice(0, maxItems)) {
      const html = text(it["content:encoded"]) || text(it.description);
      const img = it.enclosure?.["@_type"]?.startsWith?.("image") ? it.enclosure["@_url"] : it["media:content"]?.["@_url"];
      items.push({ sourceId: source.id, profileUrl: source.profileUrl, originalPostUrl: text(it.link) || null, title: text(it.title), text: plain(html), publishedAt: text(it.pubDate) || undefined, imageUrl: img });
    }
  } else if (doc.feed) {
    for (const it of arr(doc.feed.entry).slice(0, maxItems)) {
      const link = arr(it.link).find((l: any) => !l["@_rel"] || l["@_rel"] === "alternate");
      items.push({ sourceId: source.id, profileUrl: source.profileUrl, originalPostUrl: link?.["@_href"] ?? null, title: text(it.title), text: plain(text(it.content) || text(it.summary)), publishedAt: text(it.published || it.updated) || undefined });
    }
  }
  return items;
}

export async function fetchFeed(source: DiscoverySource, url: string, o: FetchOptions): Promise<AdapterResult> {
  const res = await o.fetcher.get(url, { accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8" });
  const contents = parseFeed(res.body, { id: source.id, profileUrl: source.urls.website ?? url }, o.maxItems);
  return { status: contents.length ? "SUCCESS" : "NO_EVENTS", message: `${contents.length} entrada(s) del feed`, contents, postsReviewed: contents.length };
}

/** Feed RSS/Atom declarado explícitamente en `urls.rss`. */
export class RSSAdapter implements SourceAdapter {
  readonly id = "rss";
  canHandle = (s: DiscoverySource) => !!s.urls.rss && !s.urls.website;

  async fetchRecentContent(source: DiscoverySource, o: FetchOptions): Promise<AdapterResult> {
    try {
      return await fetchFeed(source, source.urls.rss!, o);
    } catch (e) {
      return { status: e instanceof FetchError ? e.status : "ERROR", message: (e as Error).message, contents: [], postsReviewed: 0 };
    }
  }
}
