import { zonedParts } from "@turistero/config";

export const SCHEDULE = { timeZone: "America/Managua", days: [1, 3, 5], hour: 5, minute: 15 } as const; // lun, mié, vie 05:15

/**
 * ¿Toca ejecutar el descubrimiento programado? True desde las 05:15 (hora de Managua) de lunes, miércoles o viernes,
 * si todavía no hubo una corrida CRON ese mismo día. Tolera reinicios: si el proceso estaba caído a las 05:15 ejecuta al volver.
 */
export function shouldRunScheduled(now: Date, lastCronRunAt: Date | null, s = SCHEDULE): boolean {
  const n = zonedParts(now, s.timeZone);
  if (!(s.days as readonly number[]).includes(n.dow)) return false;
  if (n.h * 60 + n.mi < s.hour * 60 + s.minute) return false;
  if (!lastCronRunAt) return true;
  const l = zonedParts(lastCronRunAt, s.timeZone);
  return !(l.y === n.y && l.m === n.m && l.d === n.d);
}

/** Planificador en proceso para despliegues propios (sin Vercel Cron). Activar con ENABLE_LOCAL_CRON=1. */
export function startLocalScheduler(opts: { lastCronRun: () => Promise<Date | null>; run: () => Promise<unknown>; log: (msg: string) => void; intervalMs?: number }) {
  let running = false;
  const tick = async () => {
    if (running) return;
    try {
      if (shouldRunScheduled(new Date(), await opts.lastCronRun())) {
        running = true;
        opts.log("Ejecutando descubrimiento programado");
        await opts.run();
      }
    } catch (e) {
      opts.log(`Descubrimiento programado falló: ${(e as Error).message}`);
    } finally {
      running = false;
    }
  };
  const t = setInterval(tick, opts.intervalMs ?? 60_000);
  t.unref();
  void tick();
  return () => clearInterval(t);
}
