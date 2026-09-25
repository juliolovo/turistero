import type { MetadataRoute } from "next";
import { getAllSlugs } from "@/lib/events-repo";

const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Fase 2: solo eventos reales (los mocks están noindex).
  const slugs = process.env.NODE_ENV === "production" && process.env.INDEX_MOCKS !== "1" ? [] : await getAllSlugs().catch(() => [] as string[]);
  return [{ url: site, changeFrequency: "daily" }, ...slugs.map((s) => ({ url: `${site}/events/${s}` }))];
}
