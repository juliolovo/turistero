import { expect, test } from "@playwright/test";

test.describe("visitante anónimo", () => {
  test("la home muestra el titular, los rangos de fecha y eventos", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("¿Qué hacer esta semana en Nicaragua?");
    await expect(page.getByRole("navigation", { name: "Rango de fechas" }).getByRole("link")).toHaveText([/Hoy/, /Mañana/, /Este fin de semana/, /Próximos 7 días/]);
    await expect(page.getByRole("article").first()).toBeVisible();
    await expect(page.getByText("Destacados")).toHaveCount(0);
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
  });

  test("filtrar por categoría deja solo eventos de esa categoría", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("group", { name: "Categorías" }).getByRole("link", { name: /Tours/ }).click();
    await expect(page).toHaveURL(/category=tours/);
    const cards = page.locator("#eventos").getByRole("article"); // sin la sección "También podría interesarte"
    await expect(cards.first()).toBeVisible();
    const n = await cards.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) await expect(cards.nth(i)).toContainText("Turismo / Tours / Excursiones");
  });

  test("filtro sin resultados muestra un estado vacío útil", async ({ page }) => {
    await page.goto("/?q=zzzzqx");
    await expect(page.getByText("No encontramos eventos con esos filtros.")).toBeVisible();
    await expect(page.getByRole("link", { name: /Ver próximos 7 días/ })).toBeVisible();
  });

  test("la búsqueda encuentra por título", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Buscar eventos").fill("metallica");
    await page.getByRole("button", { name: "Buscar" }).click();
    await expect(page).toHaveURL(/q=metallica/);
    const results = page.locator("#eventos").getByRole("article");
    await expect(results).toHaveCount(1);
    await expect(results).toContainText("Tributo a Metallica");
  });

  test("la vista lista/cards se recuerda tras recargar", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Lista" }).click();
    await expect(page.getByRole("table")).toBeVisible();
    await page.goto("/"); // sin ?view: viene de la cookie
    await expect(page.getByRole("table")).toBeVisible();
    await page.getByRole("link", { name: "Cards" }).click();
    await expect(page.getByRole("article").first()).toBeVisible();
  });

  test("abrir un evento: el origen nunca se esconde ni se inventa", async ({ page }) => {
    await page.goto("/?q=metallica");
    await page.locator("#eventos").getByRole("article").getByRole("link", { name: /Tributo a Metallica/ }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Tributo a Metallica");
    await expect(page.getByText("Dato de ejemplo: este evento es ficticio.")).toBeVisible();
    await expect(page.getByText(/Sin enlace directo a la publicación/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Ron Kon Rolas", exact: true })).toHaveAttribute("href", /facebook\.com\/ronkonrolas/); // perfil, rotulado como tal
    await expect(page.getByRole("link", { name: "Ver publicación original" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Eventos relacionados" })).toBeVisible();
  });

  test("los eventos de ejemplo no se indexan", async ({ page }) => {
    await page.goto("/?q=metallica");
    await page.locator("#eventos").getByRole("article").getByRole("link", { name: /Tributo a Metallica/ }).click();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });

  test("favoritos y admin exigen sesión", async ({ page }) => {
    await page.goto("/favorites");
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login/);
  });

  test("navegación por teclado: enlace para saltar al contenido", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Saltar al contenido" })).toBeFocused();
  });

  test("layout móvil sin desbordamiento horizontal", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    await expect(page.getByRole("article").first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  });
});

test.describe("paginación de la home (10 por página en E2E)", () => {
  const titles = (page: import("@playwright/test").Page) => page.locator("#eventos").getByRole("article").locator("h3").allTextContents();

  test("aparece el paginador, navega entre páginas y no repite eventos", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Paginación de eventos" });
    await expect(nav).toBeVisible();
    await expect(page.locator("#eventos").getByRole("article")).toHaveCount(10);
    await expect(page.getByRole("heading", { name: /eventos.*mostrando 1–10/ })).toBeVisible();
    const first = await titles(page);

    await nav.getByRole("link", { name: "Siguiente" }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(nav.getByRole("link", { name: "Página 2" })).toHaveAttribute("aria-current", "page");
    const second = await titles(page);
    expect(second.length).toBeGreaterThan(0);
    expect(second.filter((t) => first.includes(t))).toEqual([]); // ninguna repetida

    await nav.getByRole("link", { name: "Anterior" }).click();
    await expect(nav.getByRole("link", { name: "Página 1" })).toHaveAttribute("aria-current", "page");
  });

  test("cambiar un filtro vuelve a la primera página; una página inexistente redirige", async ({ page }) => {
    await page.goto("/?page=2");
    await page.getByRole("group", { name: "Categorías" }).getByRole("link", { name: /Rock/ }).click();
    await expect(page).not.toHaveURL(/page=/);
    await page.goto("/?page=999");
    await expect(page).not.toHaveURL(/page=999/);
    await expect(page.locator("#eventos").getByRole("article").first()).toBeVisible();
  });

  test("con pocos resultados no hay paginador", async ({ page }) => {
    await page.goto("/?category=rock");
    await expect(page.locator("#eventos").getByRole("article").first()).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Paginación de eventos" })).toHaveCount(0);
  });
});
