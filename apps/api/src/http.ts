import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from "express";
import { ZodError, type ZodType } from "zod";
import type { Logger } from "pino";

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what = "Recurso") => new HttpError(404, "NOT_FOUND", `${what} no encontrado`);

export function parse<T>(schema: ZodType<T>, data: unknown): T {
  return schema.parse(data);
}

export const errorHandler =
  (log: Logger): ErrorRequestHandler =>
  (err, req, res, _next) => {
    if (err instanceof ZodError) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Datos inválidos", details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) } });
      return;
    }
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: { code: err.code, message: err.message } });
      return;
    }
    if ((err as { type?: string }).type === "entity.parse.failed") {
      res.status(400).json({ error: { code: "BAD_JSON", message: "JSON inválido" } });
      return;
    }
    log.error({ err, path: req.path }, "unhandled error");
    res.status(500).json({ error: { code: "INTERNAL", message: "Error interno" } });
  };

export const notFoundHandler: RequestHandler = (_req: Request, _res: Response, next: NextFunction) => next(notFound("Ruta"));
