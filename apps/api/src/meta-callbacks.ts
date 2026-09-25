import { createHmac, timingSafeEqual } from "node:crypto";
import type { Router } from "express";
import { deauthorizeFacebookUser, deleteFacebookUserData, getDeletionStatus, type Db } from "@turistero/db";
import { HttpError, notFound } from "./http";

/**
 * Verifica un `signed_request` de Meta: "<firma>.<payload>" (base64url). La firma es HMAC-SHA256 del payload con el
 * secreto de la app. Devuelve el payload o null si es inválido. https://developers.facebook.com/docs/games/gamesonfacebook/login#parsingsr
 */
export function parseSignedRequest(signed: string | undefined, appSecret: string | undefined): { user_id?: string; [k: string]: unknown } | null {
  if (!signed || !appSecret) return null;
  const [sig, payload] = signed.split(".");
  if (!sig || !payload) return null;
  const expected = createHmac("sha256", appSecret).update(payload).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return data && typeof data === "object" && String(data.algorithm ?? "").toUpperCase() === "HMAC-SHA256" ? data : null;
  } catch {
    return null;
  }
}

/** Callbacks obligatorios de la app de Meta: eliminación de datos y desautorización. */
export function registerMetaCallbacks(api: Router, { db }: { db: Db }) {
  const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL ?? process.env.PUBLIC_WEB_URL ?? "http://localhost:3000").replace(/\/$/, "");

  // Meta envía application/x-www-form-urlencoded con `signed_request`.
  api.post("/meta/data-deletion", async (req, res) => {
    const data = parseSignedRequest(req.body?.signed_request, process.env.META_APP_SECRET);
    if (!data?.user_id) throw new HttpError(400, "INVALID_SIGNATURE", "signed_request inválido");
    const { code } = await deleteFacebookUserData(db, String(data.user_id));
    res.json({ url: `${siteUrl()}/data-deletion?code=${code}`, confirmation_code: code });
  });

  api.get("/meta/data-deletion/:code", async (req, res) => {
    const r = await getDeletionStatus(db, String(req.params.code));
    if (!r) throw notFound("Solicitud");
    res.json(r);
  });

  api.post("/meta/deauthorize", async (req, res) => {
    const data = parseSignedRequest(req.body?.signed_request, process.env.META_APP_SECRET);
    if (!data?.user_id) throw new HttpError(400, "INVALID_SIGNATURE", "signed_request inválido");
    await deauthorizeFacebookUser(db, String(data.user_id));
    res.json({ ok: true });
  });
}
