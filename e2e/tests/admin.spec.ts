import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";

test.describe("administración", () => {
  test("un USER no entra a /admin", async ({ page }) => {
    await loginAs(page, "usuario");
    await page.goto("/admin");
    await expect(page).not.toHaveURL(/\/admin/);
    await expect(page.getByRole("link", { name: "Admin", exact: true })).toHaveCount(0);
  });

  test("el ADMIN ve las fuentes y el catálogo inicial", async ({ page }) => {
    await loginAs(page, "admin", "/admin/sources");
    await page.goto("/admin/sources");
    await expect(page.getByRole("heading", { name: /Fuentes/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "Ron Kon Rolas", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Ruta Segura Nicaragua" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Usuarios" })).toBeVisible();
  });

  test("ejecutar búsqueda ahora registra TODAS las fuentes y el estado no finge revisiones", async ({ page }) => {
    await loginAs(page, "admin", "/admin/runs");
    await page.goto("/admin/runs");
    await page.getByRole("button", { name: "Ejecutar búsqueda ahora" }).click();
    await expect(page.getByRole("status")).toContainText("Búsqueda terminada");
    await page.goto("/admin/sources/status");
    await expect(page.getByText("Requiere autenticación").first()).toBeVisible(); // Facebook sin credenciales de Meta
    await expect(page.getByText("Sin revisar todavía")).toHaveCount(0);
  });

  test("crear una fuente y agregar un evento desde texto", async ({ page }) => {
    await loginAs(page, "admin", "/admin/sources");
    await page.goto("/admin/sources");
    await page.getByText("Agregar fuente").click();
    await page.getByLabel("Nombre", { exact: true }).fill("Tours E2E");
    await page.getByLabel("Identificador (slug)").fill("tours-e2e");
    await page.getByLabel("Facebook").fill("https://www.facebook.com/toursE2E");
    await page.getByRole("button", { name: "Guardar fuente" }).click();
    await expect(page.getByRole("status")).toContainText("Tours E2E");

    await page.goto("/admin/add-event");
    await page.getByLabel("Texto de la publicación").fill("Tour de café y cacao, domingo 4 de octubre 3:00 PM en Finca Los Volcanes. US$25");
    await page.getByLabel("Organizador / fuente").fill("Tours E2E");
    await page.getByRole("button", { name: "Procesar" }).click();
    await expect(page.getByRole("status")).toContainText("Creado");
  });
});
