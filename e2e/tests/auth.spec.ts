import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";

test.describe("login y favoritos", () => {
  test("Instagram no se ofrece como login y Google/Facebook sin credenciales quedan desactivados", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "Continuar con Google" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Continuar con Facebook" })).toBeDisabled();
    await expect(page.getByRole("button", { name: /Instagram/ })).toHaveCount(0);
    await expect(page.getByText(/solo admite cuentas profesionales/)).toBeVisible();
  });

  test("login, guardar un favorito, verlo en /favorites y quitarlo", async ({ page }) => {
    await loginAs(page, "viajera");
    await page.goto("/?q=metallica");
    const card = page.getByRole("article").first();
    await card.getByRole("button", { name: /Guardar en favoritos/ }).click();
    await expect(card.getByRole("button", { name: /Quitar de favoritos/ })).toBeVisible();

    await page.goto("/favorites");
    await expect(page.getByRole("heading", { name: "Tus favoritos" })).toBeVisible();
    await expect(page.getByRole("article")).toContainText("Tributo a Metallica");

    await page.getByRole("article").getByRole("button", { name: /Quitar de favoritos/ }).click();
    await page.reload();
    await expect(page.getByText("Aún no tienes favoritos")).toBeVisible();
  });

  test("cerrar sesión", async ({ page }) => {
    await loginAs(page, "viajera2");
    await page.getByRole("button", { name: "Salir" }).click();
    await expect(page.getByRole("link", { name: "Entrar" })).toBeVisible();
  });
});
