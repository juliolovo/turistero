import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { auth, enabledProviders, signIn } from "@/auth";
import { apiConfigured } from "@/lib/session-api";

export const metadata: Metadata = { title: "Entrar" };

const ERRORS: Record<string, string> = {
  AccessDenied: "No pudimos completar el acceso. Inténtalo de nuevo.",
  Configuration: "El inicio de sesión no está configurado correctamente.",
  SessionExpired: "Tu sesión ya no es válida. Entra de nuevo.",
};

function safeCallback(v: string | undefined) {
  return v && v.startsWith("/") && !v.startsWith("//") ? v : "/"; // evita open redirect
}

export default async function Login({ searchParams }: { searchParams: Promise<{ callbackUrl?: string; error?: string }> }) {
  const { callbackUrl, error } = await searchParams;
  const to = safeCallback(callbackUrl);
  if ((await auth())?.user) redirect(to);

  const btn = "w-full rounded-full border border-ink/20 bg-white px-5 py-3 font-semibold text-ink transition hover:border-ink";
  const off = (p: string) => !enabledProviders.includes(p);

  async function social(provider: "google" | "facebook") {
    "use server";
    await signIn(provider, { redirectTo: to });
  }
  async function dev(form: FormData) {
    "use server";
    try {
      await signIn("dev", { name: String(form.get("name") ?? "dev"), redirectTo: to });
    } catch (e) {
      if (e instanceof AuthError) redirect("/login?error=AccessDenied");
      throw e; // el redirect de éxito también es una excepción y debe propagarse
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-5 px-4 py-14">
      <h1 className="font-display text-3xl font-extrabold text-ink">Entrar a Turistero</h1>
      <p>Guarda favoritos y, pronto, conecta las páginas que ya sigues para que Turistero revise solo esas.</p>

      {error && <p role="alert" className="rounded-lg bg-rose/15 px-4 py-3 text-sm font-medium text-rose-deep">{ERRORS[error] ?? ERRORS.AccessDenied}</p>}
      {!apiConfigured() && (
        <p className="rounded-lg bg-mango/40 px-4 py-3 text-sm">Falta configurar <code>API_URL</code> y <code>API_JWT_SECRET</code>: sin la API no se puede iniciar sesión.</p>
      )}

      <form action={social.bind(null, "google")}>
        <button disabled={off("google")} className={`${btn} disabled:cursor-not-allowed disabled:opacity-50`}>Continuar con Google</button>
      </form>
      <form action={social.bind(null, "facebook")}>
        <button disabled={off("facebook")} className={`${btn} disabled:cursor-not-allowed disabled:opacity-50`}>Continuar con Facebook</button>
      </form>
      {(off("google") || off("facebook")) && (
        <p className="text-sm text-cacao/70">Los botones desactivados no tienen credenciales configuradas (ver README, sección Auth).</p>
      )}
      <p className="text-sm text-cacao/70">
        Instagram no se ofrece para iniciar sesión: la API de Meta solo admite cuentas profesionales. Podrás conectar una cuenta Business/Creator más adelante para leer contenido.
      </p>

      {enabledProviders.includes("dev") && (
        <form action={dev} className="space-y-2 rounded-xl border border-dashed border-ink/30 p-4">
          <p className="text-sm font-semibold">Acceso de desarrollo (deshabilitado en producción)</p>
          <label htmlFor="dev-name" className="sr-only">Nombre de usuario de prueba</label>
          <input id="dev-name" name="name" defaultValue="demo" className="w-full rounded-lg border border-ink/20 px-3 py-2" />
          <button className="w-full rounded-full bg-ink px-5 py-2.5 font-semibold text-white hover:bg-rose-deep">Entrar como usuario de prueba</button>
        </form>
      )}
    </div>
  );
}
