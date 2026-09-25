import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "./helpers";

/**
 * Accesibilidad automática (axe-core, reglas WCAG 2.0/2.1 A y AA). Falla ante violaciones "serious" o "critical".
 * No sustituye una revisión manual (lector de pantalla, teclado), pero atrapa contraste, etiquetas, roles y landmarks.
 */
async function audit(page: Page, name: string) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const summary = bad.map((v) => `${v.impact} · ${v.id} · ${v.help}\n   ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join("\n   ")}`).join("\n");
  expect(bad, `Violaciones de accesibilidad en ${name}:\n${summary}`).toEqual([]);
}

test.describe("accesibilidad (WCAG AA)", () => {
  test("home: cards", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("article").first()).toBeVisible();
    await audit(page, "home (cards)");
  });

  test("home: vista lista", async ({ page }) => {
    await page.goto("/?view=list");
    await expect(page.getByRole("table")).toBeVisible();
    await audit(page, "home (lista)");
  });

  test("home: sin resultados", async ({ page }) => {
    await page.goto("/?q=zzzzqx");
    await expect(page.getByText("No encontramos eventos")).toBeVisible();
    await audit(page, "home (vacío)");
  });

  test("detalle de un evento", async ({ page }) => {
    await page.goto("/?q=metallica");
    await page.locator("#eventos").getByRole("article").getByRole("link", { name: /Tributo a Metallica/ }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Metallica");
    await audit(page, "detalle de evento");
  });

  test("login, registro y páginas legales", async ({ page }) => {
    for (const path of ["/login", "/register", "/privacy", "/terms", "/data-deletion"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await audit(page, path);
    }
  });

  test("mis fuentes y favoritos", async ({ page }) => {
    await loginAs(page, "a11y");
    await page.goto("/my");
    await expect(page.getByRole("heading", { name: "Mis fuentes" })).toBeVisible();
    await audit(page, "/my");
    await page.goto("/favorites");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await audit(page, "/favorites");
  });

  test("administración", async ({ page }) => {
    await loginAs(page, "admin", "/admin");
    for (const path of ["/admin", "/admin/sources", "/admin/sources/status", "/admin/events", "/admin/runs", "/admin/candidates", "/admin/add-event", "/admin/users", "/admin/connections"]) {
      await page.goto(path);
      await expect(page.locator("main h1").first()).toBeVisible();
      await audit(page, path);
    }
  });
});
