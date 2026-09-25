import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";

test.describe("login y favoritos", () => {
  test("proveedores sociales sin credenciales quedan desactivados; Instagram no es un login", async ({ page }) => {
    await page.goto("/login");
    for (const name of ["Continuar con Google", "Continuar con Meta (Facebook)", "Continuar con Microsoft", "Continuar con Apple"]) {
      await expect(page.getByRole("button", { name })).toBeDisabled();
    }
    await expect(page.getByRole("button", { name: /Instagram/ })).toHaveCount(0);
    await expect(page.getByText(/solo admite cuentas profesionales/)).toBeVisible();
    await expect(page.getByLabel("Correo")).toBeVisible(); // usuario y contraseña siempre disponible
  });

  test("crear cuenta con correo y contraseña, entrar, y rechazar contraseñas débiles o erróneas", async ({ page }) => {
    const email = `e2e-${Date.now()}@example.com`;
    await page.goto("/register");
    await page.getByLabel("Correo").fill(email);
    await page.getByLabel("Contraseña", { exact: true }).fill("contrasena123");
    await page.getByLabel("Repite la contraseña").fill("contrasena123");
    await page.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(page.locator('p[role="alert"]')).toContainText(/demasiado común/);

    await page.getByLabel("Correo").fill(email);
    await page.getByLabel("Contraseña", { exact: true }).fill("Buena-clave-2026");
    await page.getByLabel("Repite la contraseña").fill("Buena-clave-2026");
    await page.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(page.getByRole("status")).toContainText("Cuenta creada");

    await page.getByLabel("Correo").fill(email);
    await page.getByLabel("Contraseña").fill("clave-equivocada-1");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page.locator('p[role="alert"]')).toContainText("Correo o contraseña incorrectos");

    await page.getByLabel("Correo").fill(email);
    await page.getByLabel("Contraseña").fill("Buena-clave-2026");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page.getByRole("button", { name: "Salir" })).toBeVisible();
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
