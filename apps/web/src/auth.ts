import NextAuth, { type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Facebook from "next-auth/providers/facebook";
import Credentials from "next-auth/providers/credentials";
import { apiAsService } from "@/lib/session-api";

/**
 * Login social con Auth.js (JWT de sesión, sin adaptador de BD): la identidad se sincroniza con la API
 * (tabla user/account) y el JWT solo lleva { uid, role }. No se guardan tokens OAuth en esta fase.
 *
 * Instagram NO se ofrece como login: la API de Meta para Instagram solo admite cuentas profesionales
 * (Business/Creator), no usuarios generales. En Fase 4 se ofrecerá como *conexión* de una cuenta profesional.
 */
const providers: NextAuthConfig["providers"] = [];
export const enabledProviders: string[] = [];
if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(Google);
  enabledProviders.push("google");
}
if (process.env.AUTH_FACEBOOK_ID && process.env.AUTH_FACEBOOK_SECRET) {
  enabledProviders.push("facebook");
  providers.push(Facebook({ authorization: { params: { scope: "public_profile,email" } } }));
}

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
        return { id: `dev-${name}`, name, email: `${name}@dev.local` };
      },
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 14 },
  pages: { signIn: "/login" },
  callbacks: {
    async jwt({ token, account, profile, user }) {
      if (account) {
        const provider = account.provider === "credentials" ? "dev" : account.provider;
        const res = await apiAsService("/internal/users/sync", {
          method: "POST",
          body: JSON.stringify({
            provider,
            providerAccountId: account.providerAccountId,
            email: user?.email ?? null,
            // Solo Google garantiza correo verificado; el de Facebook no se considera verificado. "dev" no existe en producción.
            emailVerified: provider === "dev" ||
              provider === "google" && (profile as { email_verified?: boolean } | undefined)?.email_verified === true,
            name: user?.name ?? null,
            image: user?.image ?? null,
          }),
        });
        if (!res.ok) throw new Error(`No se pudo sincronizar el usuario (${res.status})`);
        const u = (await res.json()) as { id: string; role: "USER" | "EDITOR" | "ADMIN" };
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
