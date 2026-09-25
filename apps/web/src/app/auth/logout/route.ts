import { signOut } from "@/auth";

/**
 * Cerrar sesión con un formulario HTML normal (POST): funciona aunque el JavaScript de la página no haya cargado.
 * Borra la cookie de sesión y vuelve al inicio.
 */
export async function POST() {
  await signOut({ redirectTo: "/" });
}
