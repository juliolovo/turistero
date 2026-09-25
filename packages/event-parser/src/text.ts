/** Minúsculas y sin acentos (conserva ñ→n también, útil para comparar). */
export function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Quita emojis y símbolos decorativos, colapsa espacios. */
export function cleanTitle(s: string): string {
  return s
    .replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}️‍]/gu, " ")
    .replace(/[*_~`#|]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—:.,;!¡]+|[\s\-–—:.,;]+$/g, "")
    .trim();
}

export function slugify(s: string): string {
  return fold(s).replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function tokens(s: string): string[] {
  return fold(s).split(/[^a-z0-9]+/).filter((t) => t.length > 1);
}
