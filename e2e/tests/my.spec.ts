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
    await page.getByRole("button", { name: "Buscar ahora" }).click();
    await expect(page.getByRole("status")).toContainText("conexión de Meta");
    // una revisión al día por fuente: el botón queda deshabilitado con la próxima hora posible
    await expect(page.getByRole("button", { name: "Buscar ahora" })).toBeDisabled();
    await expect(page.getByText(/Podrás volver a buscar ahora/)).toBeVisible();

    await page.getByRole("button", { name: "Eliminar" }).click();
    await expect(page.getByRole("status")).toContainText("Fuente eliminada");
    await expect(page.getByText("Tours de Prueba", { exact: true })).toHaveCount(0);
  });

  test("configurar mi horario de revisión y ver mis novedades", async ({ page }) => {
    await loginAs(page, "horario", "/my");
    await page.goto("/my");
    await expect(page.getByRole("heading", { name: "¿Cuándo revisar?" })).toBeVisible();
    // valores por defecto: lun/mié/vie 05:15
    await expect(page.getByLabel("Hora", { exact: true })).toHaveValue("05:15");
    await expect(page.getByLabel("Lun")).toBeChecked();
    await expect(page.getByLabel("Mar")).not.toBeChecked();

    await page.getByText("Mar", { exact: true }).click();
    await page.getByText("Lun", { exact: true }).click();
    await page.getByLabel("Hora", { exact: true }).fill("07:30");
    await page.getByRole("button", { name: "Guardar horario" }).click();
    await expect(page.getByRole("status")).toContainText("Horario guardado");
    await expect(page.getByLabel("Hora", { exact: true })).toHaveValue("07:30");
    await expect(page.getByLabel("Mar")).toBeChecked();
    await expect(page.getByLabel("Lun")).not.toBeChecked();

    await expect(page.getByRole("heading", { name: /Novedades/ })).toBeVisible();
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
