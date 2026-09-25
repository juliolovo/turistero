import { parseHtml, type SourceContent } from "@turistero/event-parser";
import { FetchError, type SafeFetcher } from "../safe-fetch";
import type { AdapterResult, DiscoverySource, FetchOptions, SourceAdapter } from "../types";

/**
 * Entrada manual: un editor pega una URL pública (o el texto de una publicación) y se procesa como cualquier
 * otra fuente. La URL pegada se conserva como `originalPostUrl`.
 */
export function contentFromText(sourceId: string, text: string, postUrl: string | null, profileUrl: string | null = null): SourceContent {
  return { sourceId, profileUrl, originalPostUrl: postUrl, text };
}

export async function contentFromUrl(fetcher: SafeFetcher, sourceId: string, url: string): Promise<{ contents: SourceContent[]; error?: FetchError }> {
  try {
    const page = await fetcher.get(url);
    const m = parseHtml(page.body, page.url);
    const contents: SourceContent[] = m.jsonLdEvents.map((ev) => ({
      sourceId, profileUrl: null, originalPostUrl: ev.url ?? page.url, title: ev.name, text: ev.description ?? "", imageUrl: ev.image ?? m.image, structured: ev,
    }));
    if (!contents.length) {
      contents.push({ sourceId, profileUrl: null, originalPostUrl: page.url, title: m.title, text: `${m.description ?? ""}\n${m.text.slice(0, 4000)}`, imageUrl: m.image, publishedAt: m.publishedAt });
    }
    return { contents };
  } catch (e) {
    if (e instanceof FetchError) return { contents: [], error: e };
    throw e;
  }
}

/** Fuentes del tipo "manual" no tienen URLs que revisar: solo reciben contenido pegado. */
export class ManualAdapter implements SourceAdapter {
  readonly id = "manual";
  canHandle = (_s: DiscoverySource) => false;
  async fetchRecentContent(_s: DiscoverySource, _o: FetchOptions): Promise<AdapterResult> {
    return { status: "NO_EVENTS", message: "Fuente manual: no hay nada que revisar automáticamente.", contents: [], postsReviewed: 0 };
  }
}
