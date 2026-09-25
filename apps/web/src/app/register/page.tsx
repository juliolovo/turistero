import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { apiConfigured, apiAsService } from "@/lib/session-api";

export const metadata: Metadata = { title: "Crear cuenta" };

export default async function Register({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  if ((await auth())?.user) redirect("/");

  async function register(form: FormData) {
    "use server";
    const body = { email: String(form.get("email") ?? "").trim(), password: String(form.get("password") ?? ""), name: String(form.get("name") ?? "").trim() || undefined };
    if (body.password !== String(form.get("password2") ?? "")) redirect("/register?error=" + encodeURIComponent("Las contraseñas no coinciden."));
    let msg = "";
    if (!apiConfigured()) msg = "El registro no está disponible en este entorno.";
    else {
      const res = await apiAsService("/internal/auth/register", { method: "POST", body: JSON.stringify(body) });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: { message?: string; details?: { message: string }[] } };
        msg = j.error?.details?.[0]?.message ?? j.error?.message ?? "No se pudo crear la cuenta.";
      }
    }
    if (msg) redirect("/register?error=" + encodeURIComponent(msg));
    redirect("/login?registered=1");
  }

  const input = "mt-1 w-full rounded-lg border border-ink/20 px-3 py-2 font-normal";
  return (
    <div className="mx-auto max-w-md space-y-5 px-4 py-14">
      <h1 className="font-display text-3xl font-extrabold text-ink">Crear cuenta</h1>
      {error && <p role="alert" className="rounded-lg bg-rose/15 px-4 py-3 text-sm font-medium text-rose-deep">{error}</p>}
      <form action={register} className="space-y-3 rounded-2xl bg-white p-5">
        <label className="block text-sm font-semibold">Nombre (opcional)<input name="name" autoComplete="name" className={input} /></label>
        <label className="block text-sm font-semibold">Correo<input name="email" type="email" required autoComplete="email" className={input} /></label>
        <label className="block text-sm font-semibold">Contraseña<input name="password" type="password" required minLength={10} autoComplete="new-password" className={input} /></label>
        <p className="text-xs text-cacao/70">Mínimo 10 caracteres, con letras y números (o una frase de 14+). Se guarda con scrypt; nadie puede verla.</p>
        <label className="block text-sm font-semibold">Repite la contraseña<input name="password2" type="password" required minLength={10} autoComplete="new-password" className={input} /></label>
        <button className="w-full rounded-full bg-ink px-5 py-3 font-semibold text-white hover:bg-rose-deep">Crear cuenta</button>
        <p className="text-sm">¿Ya tienes cuenta? <Link href="/login" className="font-semibold text-rose-deep underline">Entrar</Link></p>
      </form>
      <p className="text-sm text-cacao/70">Aún no enviamos correos: no hay verificación ni recuperación de contraseña por correo. Si la olvidas, entra con Google, Meta, Microsoft o Apple.</p>
    </div>
  );
}
