import { extractSocialLinks } from "../social-links";
import type { AdapterResult, DiscoveredLink, DiscoverySource, FetchOptions, SourceAdapter } from "../types";

export interface SearchHit { title: string; url: string; snippet?: string }
/** Proveedor de búsqueda pluggable (Brave/Bing/SerpAPI…). Se implementa en cuanto haya credenciales y términos de uso claros. */
export interface SearchProvider { search(query: string): Promise<SearchHit[]> }

/**
 * Descubre fuentes NUEVAS a partir de búsquedas públicas ("tours León Nicaragua"). No produce eventos:
 * devuelve enlaces a perfiles/sitios que el runner convierte en `SourceCandidate` para revisión humana.
 */
export class SearchAdapter implements SourceAdapter {
  readonly id = "search";
  constructor(private provider?: SearchProvider) {}
  canHandle = (_s: DiscoverySource) => false;

  async fetchRecentContent(): Promise<AdapterResult> {
    return { status: "ACCESS_RESTRICTED", message: "SearchAdapter se usa mediante discover(); no revisa fuentes.", contents: [], postsReviewed: 0 };
  }

  async discover(queries: string[], _o?: Pick<FetchOptions, "now">): Promise<{ status: "SUCCESS" | "ACCESS_RESTRICTED"; message: string; links: DiscoveredLink[] }> {
    if (!this.provider) return { status: "ACCESS_RESTRICTED", message: "Sin proveedor de búsqueda configurado.", links: [] };
    const links = new Map<string, DiscoveredLink>();
    for (const q of queries) {
      const hits = await this.provider.search(q);
      for (const h of hits) {
        for (const l of extractSocialLinks({ links: [h.url] })) links.set(l.url, { ...l, context: `búsqueda: ${q}` });
        if (!/facebook\.com|instagram\.com/i.test(h.url)) links.set(h.url, { platform: "website", url: h.url, context: `búsqueda: ${q} — ${h.title}` });
      }
    }
    return { status: "SUCCESS", message: `${links.size} enlace(s) candidatos`, links: [...links.values()] };
  }
}
