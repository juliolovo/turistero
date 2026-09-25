import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { auth, enabledProviders, signIn } from "@/auth";
import { apiConfigured } from "@/lib/session-api";
import { AppleIcon, FacebookIcon, GoogleIcon, MicrosoftIcon } from "@/components/brand-icons";

export const metadata: Metadata = { title: "Entrar" };

const ERRORS: Record<string, string> = {
  AccessDenied: "No pudimos completar el acceso. Inténtalo de nuevo.",
  Configuration: "El inicio de sesión no está configurado correctamente.",
  SessionExpired: "Tu sesión ya no es válida. Entra de nuevo.",
  InvalidCredentials: "Correo o contraseña incorrectos. Tras varios intentos fallidos la cuenta se bloquea unos minutos.",
};

type Social = "google" | "facebook" | "microsoft-entra-id" | "apple";
const SOCIAL: { id: Social; label: string; Icon: (p: { className?: string }) => React.ReactElement; env: string }[] = [
  { id: "google", label: "Continuar con Google", Icon: GoogleIcon, env: "AUTH_GOOGLE_ID y AUTH_GOOGLE_SECRET" },
  { id: "facebook", label: "Continuar con Meta (Facebook)", Icon: FacebookIcon, env: "AUTH_FACEBOOK_ID y AUTH_FACEBOOK_SECRET" },
  { id: "microsoft-entra-id", label: "Continuar con Microsoft", Icon: MicrosoftIcon, env: "AUTH_MICROSOFT_ENTRA_ID_ID y AUTH_MICROSOFT_ENTRA_ID_SECRET" },
  { id: "apple", label: "Continuar con Apple", Icon: AppleIcon, env: "AUTH_APPLE_ID y AUTH_APPLE_SECRET" },
];

function safeCallback(v: string | undefined) {
  return v && v.startsWith("/") && !v.startsWith("//") ? v : "/"; // evita open redirect
}

export default async function Login({ searchParams }: { searchParams: Promise<{ callbackUrl?: string; error?: string; registered?: string }> }) {
  const { callbackUrl, error, registered } = await searchParams;
  const to = safeCallback(callbackUrl);
  if ((await auth())?.user) redirect(to);

  const btn = "flex w-full items-center justify-center gap-3 rounded-full border border-ink/20 bg-white px-5 py-3 font-semibold text-ink transition hover:border-ink disabled:cursor-not-allowed disabled:opacity-50";
  const off = (p: string) => !enabledProviders.includes(p);

  async function social(provider: Social) {
    "use server";
    await signIn(provider, { redirectTo: to });
  }
  async function password(form: FormData) {
    "use server";
    try {
      await signIn("password", { email: String(form.get("email") ?? ""), password: String(form.get("password") ?? ""), redirectTo: to });
    } catch (e) {
      if (e instanceof AuthError) redirect(`/login?error=InvalidCredentials&callbackUrl=${encodeURIComponent(to)}`);
      throw e; // el redirect de éxito también es una excepción y debe propagarse
    }
  }
  async function dev(form: FormData) {
    "use server";
    try {
      await signIn("dev", { name: String(form.get("name") ?? "dev"), redirectTo: to });
    } catch (e) {
      if (e instanceof AuthError) redirect("/login?error=AccessDenied");
      throw e;
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-5 px-4 py-14">
      <h1 className="font-display text-3xl font-extrabold text-ink">Entrar a Turistero</h1>
      <p>Guarda favoritos, arma tu agenda con las páginas que sigues y elige cuándo revisarlas.</p>

      {registered && <p role="status" className="rounded-lg bg-lagoon/15 px-4 py-3 text-sm font-medium text-lagoon">Cuenta creada. Ya puedes entrar.</p>}
      {error && <p role="alert" className="rounded-lg bg-rose/15 px-4 py-3 text-sm font-medium text-rose-deep">{ERRORS[error] ?? ERRORS.AccessDenied}</p>}
      {!apiConfigured() && (
        <p className="rounded-lg bg-mango/40 px-4 py-3 text-sm">Falta configurar <code>API_URL</code> y <code>API_JWT_SECRET</code>: sin la API no se puede iniciar sesión.</p>
      )}

      <form action={password} className="space-y-3 rounded-2xl bg-white p-5">
        <h2 className="font-display text-xl font-bold text-ink">Con tu correo</h2>
        <label className="block text-sm font-semibold">Correo<input name="email" type="email" required autoComplete="email" className="mt-1 w-full rounded-lg border border-ink/20 px-3 py-2 font-normal" /></label>
        <label className="block text-sm font-semibold">Contraseña<input name="password" type="password" required autoComplete="current-password" className="mt-1 w-full rounded-lg border border-ink/20 px-3 py-2 font-normal" /></label>
        <button className="w-full rounded-full bg-ink px-5 py-3 font-semibold text-white hover:bg-rose-deep">Entrar</button>
        <p className="text-sm">¿No tienes cuenta? <Link href="/register" className="font-semibold text-rose-deep underline">Crear cuenta</Link></p>
      </form>

      <div className="space-y-3">
        <p className="text-center text-sm text-cacao/70">o continúa con</p>
        {SOCIAL.map((s) => (
          <form key={s.id} action={social.bind(null, s.id)}>
            <button disabled={off(s.id)} title={off(s.id) ? `Sin configurar: falta ${s.env}` : undefined} className={btn}>
              <s.Icon className="size-5 shrink-0" />
              {s.label}
            </button>
            {off(s.id) && <p className="mt-1 text-center text-xs text-cacao/60">Sin configurar — falta {s.env} (ver docs/AUTH.md)</p>}
          </form>
        ))}
      </div>
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
