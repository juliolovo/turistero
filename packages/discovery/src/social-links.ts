import type { DiscoveredLink, DiscoverySource } from "./types";

const FB_RESERVED = new Set(["sharer", "sharer.php", "share", "share.php", "dialog", "plugins", "tr", "login", "l.php", "watch", "groups", "events", "marketplace", "pages", "policies", "help", "privacy", "reel", "photo", "photo.php", "story.php", "permalink.php", "hashtag", "profile.php", "people", "public", "gaming", "stories", "about"]);
const IG_RESERVED = new Set(["p", "reel", "reels", "explore", "accounts", "stories", "tv", "direct", "about", "legal", "developer", "web", "directory", "oauth"]);

export function normalizeProfileUrl(url: string): { platform: "facebook" | "instagram"; key: string; url: string } | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www|m|web|mobile|l)\./, "");
  if (host === "facebook.com" || host === "fb.com") {
    const id = u.pathname === "/profile.php" ? u.searchParams.get("id") : null;
    if (id) return { platform: "facebook", key: `id:${id}`, url: `https://www.facebook.com/profile.php?id=${id}` };
    const seg = u.pathname.split("/").filter(Boolean)[0]?.toLowerCase();
    if (!seg || FB_RESERVED.has(seg) || !/^[a-z0-9.\-_]{3,}$/.test(seg)) return null;
    return { platform: "facebook", key: seg, url: `https://www.facebook.com/${u.pathname.split("/").filter(Boolean)[0]}` };
  }
  if (host === "instagram.com" || host === "instagr.am") {
    const seg = u.pathname.split("/").filter(Boolean)[0]?.toLowerCase();
    if (!seg || IG_RESERVED.has(seg) || !/^[a-z0-9._]{2,30}$/.test(seg)) return null;
    return { platform: "instagram", key: seg, url: `https://www.instagram.com/${u.pathname.split("/").filter(Boolean)[0]}` };
  }
  return null;
}

/** Perfiles de Facebook/Instagram que aparecen en enlaces o texto (para proponer fuentes nuevas). */
export function extractSocialLinks(input: { links?: string[]; text?: string }): DiscoveredLink[] {
  const found = new Map<string, DiscoveredLink>();
  const add = (raw: string, context?: string) => {
    const n = normalizeProfileUrl(raw);
    if (n && !found.has(`${n.platform}:${n.key}`)) found.set(`${n.platform}:${n.key}`, { platform: n.platform, url: n.url, handle: n.key.startsWith("id:") ? undefined : n.key, context });
  };
  for (const l of input.links ?? []) add(l, "enlace en la página");
  const re = /https?:\/\/(?:www\.|m\.)?(?:facebook|fb|instagram)\.com\/[^\s"'<>)\]]+/gi;
  for (const m of (input.text ?? "").matchAll(re)) add(m[0].replace(/[.,;!?]+$/, ""), "mencionado en el texto");
  return [...found.values()];
}

/** Descarta perfiles que ya son de la fuente revisada o que ya están en el catálogo. */
export function newLinksOnly(links: DiscoveredLink[], known: { urls: DiscoverySource["urls"] }[]): DiscoveredLink[] {
  const keys = new Set<string>();
  for (const k of known) for (const u of [k.urls.facebook, k.urls.instagram]) {
    const n = u ? normalizeProfileUrl(u) : null;
    if (n) keys.add(`${n.platform}:${n.key}`);
  }
  return links.filter((l) => {
    const n = normalizeProfileUrl(l.url);
    return n && !keys.has(`${n.platform}:${n.key}`);
  });
}
