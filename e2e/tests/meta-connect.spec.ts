import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "./helpers";

/**
 * Simula a Meta sin tocar facebook.com:
 *  1) pedimos `/admin/connections/meta/start` SIN seguir la redirección (Chromium no enruta los saltos de redirección,
 *     así que no se puede interceptar el diálogo): la web responde 307 al diálogo de Facebook y fija la cookie `state`;
 *  2) hacemos lo que haría Meta: volver al `redirect_uri` con `code` y `state` (o con `error`).
 * El intercambio de tokens lo hace la API real contra la Graph API simulada (e2e/fake-meta-graph.mjs).
 */
async function startAndReturnFromMeta(page: Page, mode: "approve" | "deny" | "tamper-state" = "approve") {
  const res = await page.context().request.get("/admin/connections/meta/start", { maxRedirects: 0 });
  expect(res.status()).toBe(307);
  const dialog = new URL(res.headers()["location"]!);
  expect(dialog.origin + dialog.pathname).toMatch(/^https:\/\/www\.facebook\.com\/v[\d.]+\/dialog\/oauth$/);

  const back = new URL(dialog.searchParams.get("redirect_uri")!);
  if (mode === "deny") {
    back.searchParams.set("error", "access_denied");
    back.searchParams.set("error_description", "El usuario canceló");
  } else {
    back.searchParams.set("code", "CODE-VALIDO");
    back.searchParams.set("state", mode === "tamper-state" ? "estado-falso" : dialog.searchParams.get("state")!);
  }
  await page.goto(back.toString());
  return dialog;
}

test.describe("Conectar con Meta", () => {
  test("solo un ADMIN puede iniciar la conexión", async ({ page }) => {
    await loginAs(page, "usuario-meta");
    const res = await page.context().request.get("/admin/connections/meta/start", { maxRedirects: 0 });
    expect(res.headers()["location"] ?? "").not.toMatch(/facebook\.com/);
  });

  test("sin sesión no hay conexión", async ({ request }) => {
    const res = await request.get("/admin/connections/meta/start", { maxRedirects: 0 });
    expect(res.headers()["location"] ?? "").toMatch(/\/login/);
  });

  test("flujo completo: autorizar, detectar Página e Instagram, guardar cifrado y probar", async ({ page }) => {
    await loginAs(page, "admin", "/admin/connections");
    await page.goto("/admin/connections");
    await expect(page.getByRole("heading", { name: "Conectar con Meta" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Conectar con Meta/ })).toHaveAttribute("href", "/admin/connections/meta/start");

    const dialog = await startAndReturnFromMeta(page);

    // la solicitud a Meta llevó lo correcto
    expect(dialog.searchParams.get("client_id")).toBe("1234567890");
    expect(dialog.searchParams.get("response_type")).toBe("code");
    expect(dialog.searchParams.get("scope")).toContain("pages_show_list");
    expect(dialog.searchParams.get("scope")).toContain("instagram_basic");
    expect(dialog.searchParams.get("redirect_uri")).toMatch(/\/admin\/connections\/meta\/callback$/);
    expect(dialog.searchParams.get("state")).toMatch(/^[a-f0-9]{48}$/);

    // vuelve al panel con el resumen
    await expect(page.getByRole("status")).toContainText("Conectado como Julio Prueba");
    await expect(page.getByRole("status")).toContainText("@miig_e2e");
    await expect(page.getByRole("status")).toContainText("Mi Página E2E");

    // dos conexiones (Facebook + Instagram); nunca se ve un token
    await expect(page.getByRole("cell", { name: /Facebook · Julio Prueba/ })).toBeVisible();
    await expect(page.getByRole("cell", { name: /@miig_e2e/ })).toBeVisible();
    expect(await page.content()).not.toMatch(/LONG-token|SHORT-token|v1\.[A-Za-z0-9_-]{10,}\./);

    await page.getByRole("button", { name: "Probar" }).first().click();
    await expect(page.getByRole("status")).toContainText("El token es válido");
  });

  test("si el usuario cancela en Facebook se explica", async ({ page }) => {
    await loginAs(page, "admin", "/admin/connections");
    await startAndReturnFromMeta(page, "deny");
    await expect(page.locator('p[role="alert"]')).toContainText("Meta canceló la conexión");
  });

  test("un state manipulado (CSRF) se rechaza", async ({ page }) => {
    await loginAs(page, "admin", "/admin/connections");
    await startAndReturnFromMeta(page, "tamper-state");
    await expect(page.locator('p[role="alert"]')).toContainText("state inválido");
  });

  test("el state es de un solo uso", async ({ page }) => {
    await loginAs(page, "admin", "/admin/connections");
    const dialog = await startAndReturnFromMeta(page);
    await expect(page.getByRole("status")).toContainText("Conectado");
    // repetir el mismo callback (replay) ya no funciona
    const replay = new URL(dialog.searchParams.get("redirect_uri")!);
    replay.searchParams.set("code", "CODE-VALIDO");
    replay.searchParams.set("state", dialog.searchParams.get("state")!);
    await page.goto(replay.toString());
    await expect(page.locator('p[role="alert"]')).toContainText("state inválido");
  });

  test("abrir el callback sin haber iniciado el flujo se rechaza", async ({ page }) => {
    await loginAs(page, "admin", "/admin/connections");
    await page.goto("/admin/connections/meta/callback?code=CODE-VALIDO&state=inventado");
    await expect(page.locator('p[role="alert"]')).toContainText("state inválido");
  });
});
