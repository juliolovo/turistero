import { signOut } from "@/auth";

/** La API ya no reconoce al usuario de la cookie (BD reiniciada, usuario eliminado…): se cierra la sesión limpiamente. */
export async function GET() {
  await signOut({ redirectTo: "/login?error=SessionExpired" });
}
