export type Params = Record<string, string | undefined>;

export function href(base: Params, patch: Params, hash = ""): string {
  const merged = { ...base, ...patch };
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) if (v) sp.set(k, v);
  const s = sp.toString();
  return `/${s ? `?${s}` : ""}${hash}`;
}

export function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
