import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "@playwright/test";

const outputRoot = resolve(process.env.LIBRE_AI_WEBSITE_OUTPUT_ROOT ?? "dist");
const homeUrl = pathToFileURL(join(outputRoot, "index.html")).href;
const brandGuideUrl = pathToFileURL(join(outputRoot, "marque.html")).href;
const starterQuickstartUrl =
  "https://github.com/libre-ai/starter/blob/acccae671aa46419fce9d0b7ff7cbe2511f073a6/starter/README.md#d%C3%A9marrage-rapide";

test("renders the canonical editorial journey and complete fleet", async ({ page }) => {
  await page.goto(homeUrl);
  await expect(
    page.getByText("Les plateformes propriétaires vous louent le produit."),
  ).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Possédez la fabrique.");
  await expect(page.locator("#preuves article")).toHaveCount(3);
  expect(await page.locator("#fleet-rows tr").count()).toBeGreaterThan(0);
  await expect(page.getByRole("link", { name: "Prenez les clés." })).toHaveAttribute(
    "href",
    starterQuickstartUrl,
  );
  await expect(
    page.getByText("Démonstration exécutable, pas application prête pour la production."),
  ).toBeVisible();
  await expect(page.locator("script")).toHaveCount(0);
});

test("loads no remote resource", async ({ page }) => {
  const remoteRequests: string[] = [];
  page.on("request", (request) => {
    if (/^https?:/.test(request.url())) remoteRequests.push(request.url());
  });
  await page.goto(homeUrl);
  await expect(page.locator("body")).toBeVisible();
  expect(remoteRequests).toEqual([]);
});

test("keeps the skip path and narrow reflow usable", async ({ page }) => {
  await page.goto(homeUrl);
  const skipLink = page.getByRole("link", { name: "Aller au contenu" });
  await skipLink.focus();
  await expect(skipLink).toBeVisible();
  await skipLink.press("Enter");
  expect(page.url().endsWith("#contenu")).toBe(true);

  for (const width of [640, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  }
});

test("withholds the figurative candidate on every public page", async ({ page }) => {
  await page.goto(brandGuideUrl);
  await expect(page.getByText("Les actifs figuratifs ne sont pas encore publiés.")).toBeVisible();
  await expect(page.locator('img[src*="libre-ai-mark"]')).toHaveCount(0);
  await expect(page.locator('a[href*="libre-ai-mark"]')).toHaveCount(0);
});

test("captures one disposable Chromium review surface", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "One canonical review capture is sufficient");
  await page.goto(homeUrl);
  await page.screenshot({ fullPage: true, path: testInfo.outputPath("website-home.png") });
});
