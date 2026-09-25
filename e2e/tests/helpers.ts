import { expect, type Page } from "@playwright/test";

/** Entra con el acceso de desarrollo. `admin` recibe rol ADMIN (ADMIN_EMAILS=admin@dev.local). */
export async function loginAs(page: Page, name: string, callbackUrl = "/") {
  await page.goto(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  await page.getByLabel("Nombre de usuario de prueba").fill(name);
  await page.getByRole("button", { name: "Entrar como usuario de prueba" }).click();
  await expect(page.getByRole("button", { name: "Salir" })).toBeVisible();
}
