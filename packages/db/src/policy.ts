/**
 * Política de revisión de fuentes: cortesía con los sitios y con las APIs.
 *  - como máximo UNA revisión por fuente cada MIN_RECHECK_HOURS (24 h por defecto);
 *  - si falla por algo transitorio (error de red, límite de peticiones), se permite UN reintento
 *    pasada 1 hora, y como máximo 2 intentos en la ventana;
 *  - si el problema no se arregla reintentando (requiere autenticación, acceso restringido, no encontrada / sin enlaces) no se reintenta antes.
 */
export const RETRYABLE = new Set(["ERROR", "RATE_LIMITED"]);
export const RETRY_AFTER_MINUTES = 60;
export const MAX_ATTEMPTS_PER_WINDOW = 2;
export const minRecheckHours = () => Number(process.env.MIN_RECHECK_HOURS ?? 24);

export interface PastCheck { startedAt: Date; status: string }
export type CheckDecision = { ok: true; retry: boolean } | { ok: false; retryAt: Date; reason: string };

/** `recent`: revisiones de la fuente (cualquier orden). */
export function checkDecision(recent: PastCheck[], now: Date, minHours = minRecheckHours()): CheckDecision {
  const windowMs = minHours * 3_600_000;
  const inWindow = recent
    .filter((c) => now.getTime() - c.startedAt.getTime() < windowMs)
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  const last = inWindow[0];
  if (!last) return { ok: true, retry: false };
  const nextNormal = new Date(last.startedAt.getTime() + windowMs);
  if (RETRYABLE.has(last.status) && inWindow.length < MAX_ATTEMPTS_PER_WINDOW) {
    const retryAt = new Date(last.startedAt.getTime() + RETRY_AFTER_MINUTES * 60_000);
    return retryAt <= now ? { ok: true, retry: true } : { ok: false, retryAt, reason: "La última revisión falló; se reintentará pronto." };
  }
  return { ok: false, retryAt: nextNormal, reason: `Ya se revisó hoy (máximo una vez cada ${minHours} h por fuente).` };
}
