import { SignJWT } from "jose";

/**
 * Llamadas web -> API en nombre del usuario. La web firma un JWT corto (HS256) con API_JWT_SECRET;
 * la API lo verifica y lee el rol desde la BD. Solo servidor.
 */
const enc = new TextEncoder();

export const apiConfigured = () => !!process.env.API_URL && !!process.env.API_JWT_SECRET;

async function userToken(uid: string) {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(uid)
    .setIssuer("turistero-web")
    .setAudience("turistero-api")
    .setIssuedAt()
    .setExpirationTime("2m")
    .sign(enc.encode(process.env.API_JWT_SECRET!));
}

export async function apiAs(uid: string, path: string, init: RequestInit = {}) {
  return fetch(`${process.env.API_URL}/api${path}`, {
    ...init,
    cache: "no-store",
    headers: { "content-type": "application/json", ...init.headers, authorization: `Bearer ${await userToken(uid)}` },
  });
}

export async function apiAsService(path: string, init: RequestInit = {}) {
  return fetch(`${process.env.API_URL}/api${path}`, {
    ...init,
    cache: "no-store",
    headers: { "content-type": "application/json", ...init.headers, authorization: `Bearer ${process.env.API_SERVICE_TOKEN}` },
  });
}
