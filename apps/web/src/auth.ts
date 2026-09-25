import NextAuth, { type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Facebook from "next-auth/providers/facebook";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import Apple from "next-auth/providers/apple";
import Credentials from "next-auth/providers/credentials";
import { apiAsService } from "@/lib/session-api";

type Role = "USER" | "EDITOR" | "ADMIN";

/**
 * Acceso con Auth.js (JWT de sesión, sin adaptador de BD): la identidad se sincroniza con la API (tablas user/account)
 * y el JWT solo lleva { uid, role }. No se guardan tokens OAuth de login.
 *
 * Métodos: Google, Facebook (Meta), Microsoft (Entra ID / cuenta personal), Apple, y usuario + contraseña.
 * Instagram NO se ofrece como login: la API de Meta para Instagram solo admite cuentas profesionales
 * (Business/Creator), no usuarios generales; se usará como *conexión* de lectura, no para iniciar sesión.
 *
 * Correo verificado: solo Google y Apple lo garantizan. Facebook y Microsoft NO (pueden devolver correos sin verificar),
 * por eso nunca se vinculan cuentas por correo con ellos ni conceden ADMIN.
 */
const providers: NextAuthConfig["providers"] = [];
export const enabledProviders: string[] = [];
const has = (...k: string[]) => k.every((x) => !!process.env[x]);

if (has("AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET")) {
  providers.push(Google);
  enabledProviders.push("google");
}
if (has("AUTH_FACEBOOK_ID", "AUTH_FACEBOOK_SECRET")) {
  providers.push(Facebook({ authorization: { params: { scope: "public_profile,email" } } }));
  enabledProviders.push("facebook");
}
if (has("AUTH_MICROSOFT_ENTRA_ID_ID", "AUTH_MICROSOFT_ENTRA_ID_SECRET")) {
  // Por defecto cuentas personales de Microsoft (Outlook/Hotmail/Xbox). Para una organización: issuer con su tenant id.
  providers.push(MicrosoftEntraID({ issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER ?? "https://login.microsoftonline.com/consumers/v2.0" }));
  enabledProviders.push("microsoft-entra-id");
}
if (has("AUTH_APPLE_ID", "AUTH_APPLE_SECRET")) {
  // AUTH_APPLE_SECRET es un JWT firmado con tu clave de Apple (caduca ≤ 6 meses): ver scripts/apple-client-secret.mjs
  providers.push(Apple);
  enabledProviders.push("apple");
}

// Usuario y contraseña: la verificación (scrypt, bloqueo por intentos) la hace la API.
providers.push(
  Credentials({
    id: "password",
    name: "Correo y contraseña",
    credentials: { email: {}, password: {} },
    authorize: async (c) => {
      const email = String(c?.email ?? "");
      const password = String(c?.password ?? "");
      if (!email || !password) return null;
      const res = await apiAsService("/internal/auth/verify", { method: "POST", body: JSON.stringify({ email, password }) });
      if (!res.ok) return null;
      const u = (await res.json()) as { id: string; role: Role; name: string | null; email: string | null; image: string | null };
      return { id: u.id, name: u.name, email: u.email, image: u.image, role: u.role, via: "password" } as never;
    },
  }),
);
enabledProviders.push("password");

// Acceso rápido para desarrollo/E2E: jamás en producción.
export const devLoginEnabled = process.env.ALLOW_DEV_LOGIN === "1" && process.env.NODE_ENV !== "production";
if (devLoginEnabled) {
  enabledProviders.push("dev");
  providers.push(
    Credentials({
      id: "dev",
      name: "Acceso de desarrollo",
      credentials: { name: {}, role: {} },
      authorize: async (c) => {
        const name = String(c?.name || "dev").toLowerCase().replace(/[^a-z0-9]/g, "") || "dev";
        return { id: `dev-${name}`, name, email: `${name}@dev.local`, via: "dev" } as never;
      },
    }),
  );
}

const truthy = (v: unknown) => v === true || v === "true";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 14 },
  pages: { signIn: "/login" },
  callbacks: {
    async jwt({ token, account, profile, user }) {
      if (account) {
        const via = (user as { via?: string } | undefined)?.via;
        if (via === "password") {
          // La API ya verificó la contraseña y devolvió el usuario: no hay nada que sincronizar.
          token.uid = user!.id!;
          token.role = (user as unknown as { role: Role }).role;
          return token;
        }
        const provider = via === "dev" ? "dev" : account.provider;
        const p = profile as { email_verified?: boolean | string } | undefined;
        const res = await apiAsService("/internal/users/sync", {
          method: "POST",
          body: JSON.stringify({
            provider,
            providerAccountId: account.providerAccountId,
            email: user?.email ?? null,
            // Solo Google y Apple garantizan el correo verificado. "dev" no existe en producción.
            emailVerified: provider === "dev" || ((provider === "google" || provider === "apple") && truthy(p?.email_verified)),
            name: user?.name ?? null,
            image: user?.image ?? null,
          }),
        });
        if (!res.ok) throw new Error(`No se pudo sincronizar el usuario (${res.status})`);
        const u = (await res.json()) as { id: string; role: Role };
        token.uid = u.id;
        token.role = u.role;
      }
      return token;
    },
    session({ session, token }) {
      if (token.uid) session.user.id = token.uid;
      if (token.role) session.user.role = token.role;
      return session;
    },
  },
});
