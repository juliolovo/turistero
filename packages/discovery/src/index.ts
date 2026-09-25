import type { SourceContent } from "@turistero/event-parser";
import { WebsiteAdapter } from "./adapters/website";
import { RSSAdapter } from "./adapters/rss";
import { FacebookAdapter, InstagramAdapter } from "./adapters/meta";
import { ManualAdapter } from "./adapters/manual";
import { SearchAdapter } from "./adapters/search";
import type { AdapterResult, CheckStatus, DiscoveredLink, DiscoverySource, FetchOptions, SourceAdapter } from "./types";

export * from "./types";
export * from "./safe-fetch";
export * from "./social-links";
export * from "./adapters/website";
export * from "./adapters/rss";
export * from "./adapters/meta";
export * from "./adapters/manual";
export * from "./adapters/search";

export const defaultAdapters = (): SourceAdapter[] => [new WebsiteAdapter(), new RSSAdapter(), new FacebookAdapter(), new InstagramAdapter(), new ManualAdapter(), new SearchAdapter()];

// Prioridad para resumir varios adaptadores en un solo estado: lo accionable primero.
const SEVERITY: CheckStatus[] = ["SUCCESS", "NO_EVENTS", "NO_RECENT_CONTENT", "NOT_FOUND", "RATE_LIMITED", "ACCESS_RESTRICTED", "AUTH_REQUIRED", "ERROR"];

/** Ejecuta todos los adaptadores aplicables a una fuente y combina el resultado (un sitio + FB + IG, por ejemplo). */
export async function checkSourceContent(source: DiscoverySource, adapters: SourceAdapter[], o: FetchOptions): Promise<AdapterResult & { adaptersRun: string[] }> {
  const applicable = adapters.filter((a) => a.canHandle(source));
  if (!applicable.length) {
    return { status: "NOT_FOUND", message: "La fuente no tiene URLs que revisar.", contents: [], postsReviewed: 0, adaptersRun: [] };
  }
  const results: { id: string; r: AdapterResult }[] = [];
  for (const a of applicable) {
    try {
      results.push({ id: a.id, r: await a.fetchRecentContent(source, o) });
    } catch (e) {
      results.push({ id: a.id, r: { status: "ERROR", message: (e as Error).message, contents: [], postsReviewed: 0 } });
    }
  }
  const contents: SourceContent[] = results.flatMap(({ r }) => r.contents);
  const links = new Map<string, DiscoveredLink>();
  for (const { r } of results) for (const l of r.discoveredLinks ?? []) links.set(l.url, l);
  const anyOk = results.some(({ r }) => r.status === "SUCCESS");
  const worst = results.map(({ r }) => r.status).sort((a, b) => SEVERITY.indexOf(b) - SEVERITY.indexOf(a))[0]!;
  return {
    status: anyOk ? "SUCCESS" : worst,
    message: results.map(({ id, r }) => `${id}: ${r.message}`).join(" | "),
    contents,
    postsReviewed: results.reduce((n, { r }) => n + r.postsReviewed, 0),
    discoveredLinks: [...links.values()],
    adaptersRun: results.map((x) => x.id),
  };
}
