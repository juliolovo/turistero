import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";

test.describe("mis fuentes y mi agenda", () => {
  test("exige sesión", async ({ page }) => {
    await page.goto("/my");
    await expect(page).toHaveURL(/\/login/);
  });

  test("agregar una fuente propia, revisarla con honestidad y eliminarla", async ({ page }) => {
    await loginAs(page, "mochilera", "/my");
    await page.goto("/my");
    await expect(page.getByRole("heading", { name: "Mis fuentes" })).toBeVisible();

    await page.getByLabel("Nombre", { exact: true }).fill("Tours de Prueba");
    await page.getByLabel("Facebook").fill("https://www.facebook.com/toursdeprueba");
    await page.getByRole("button", { name: "Guardar fuente" }).click();
    await expect(page.getByRole("status")).toContainText("Tours de Prueba");
    await expect(page.getByText("Tours de Prueba", { exact: true })).toBeVisible();

    // Facebook sin conexión de Meta: no se finge una lectura
    await page.getByRole("button", { name: "Revisar ahora" }).click();
    await expect(page.getByRole("status")).toContainText("conexión de Meta");

    await page.getByRole("button", { name: "Eliminar" }).click();
    await expect(page.getByRole("status")).toContainText("Fuente eliminada");
    await expect(page.getByText("Tours de Prueba", { exact: true })).toHaveCount(0);
  });

  test("suscribirse al catálogo y filtrar Mi agenda", async ({ page }) => {
    await loginAs(page, "agenda");
    await page.goto("/");
    await expect(page.getByRole("link", { name: "⭐ Mi agenda" })).toBeVisible();

    await page.goto("/my");
    const row = page.getByRole("listitem").filter({ hasText: "Ron Kon Rolas" }).first();
    await row.getByRole("button", { name: "Añadir" }).click();
    await expect(page.getByRole("status")).toContainText("añadida a tu agenda");
    await expect(page.getByRole("listitem").filter({ hasText: "Ron Kon Rolas" }).first().getByRole("button", { name: "En mi agenda" })).toBeVisible();

    // Los eventos de ejemplo llevan la fuente "ron-kon-rolas": aparecen en la agenda; los demás no.
    await page.goto("/?mine=1");
    const cards = page.locator("#eventos").getByRole("article");
    await expect(cards.first()).toBeVisible();
    const n = await cards.count();
    for (let i = 0; i < n; i++) await expect(cards.nth(i)).toContainText("Ron Kon Rolas");
  });

  test("el visitante anónimo no ve la opción Mi agenda", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "⭐ Mi agenda" })).toHaveCount(0);
  });
});
