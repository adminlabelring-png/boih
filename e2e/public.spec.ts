import { test, expect } from "@playwright/test";

// Pages anyone can see. Nothing here submits a form or writes to the
// database, so it's safe against the live site.

// A 1x1 PNG, enough to get past "add a photo" without scanning anything.
const PHOTO = {
  name: "label.png",
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    "base64"
  ),
};

test("home page is cosmetics-first", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Check your cosmetics label before the regulator does");
  await expect(page.getByText("Built for cosmetics brands, with FMCG on the way.")).toBeVisible();
  await expect(page.getByText("Where our compliance info comes from")).toBeVisible();
});

test("deep links load the app, and unknown pages show the 404 page", async ({ page }) => {
  await page.goto("/account");
  await expect(page.getByRole("tab", { name: "Create account" })).toBeVisible();
  await page.goto("/no-such-page");
  await expect(page.getByText("404")).toBeVisible();
});

test("label generator offers cosmetics categories only", async ({ page }) => {
  await page.goto("/generate");
  await page.locator("#category").click();
  const options = page.getByRole("option");
  await expect(options).toHaveText(["Skincare", "Haircare", "Makeup", "Fragrance"]);
});

test("early-access form lists cosmetics first and the rest as coming soon", async ({ page }) => {
  await page.goto("/");
  await page.locator("#product_category").click();
  await expect(page.getByRole("option").first()).toHaveText("Skincare");
  await expect(page.getByText("Coming soon", { exact: true }).last()).toBeVisible();
  await expect(page.getByRole("option", { name: "Food" })).toBeVisible();
});

test("scan intake asks the product type and, for non-leave-on types, leave-on or rinse-off", async ({ page }) => {
  await page.goto("/scan");
  await page.locator("input[type=file]").first().setInputFiles(PHOTO);
  await expect(page.getByText("What kind of product?")).toBeVisible();

  await page.getByRole("button", { name: "Liquid or cream" }).first().click();
  await expect(page.getByText("Is it washed off after use?")).toBeVisible();

  // Lip products are leave-on by nature, so the question goes away.
  await page.getByRole("button", { name: "Lip or oral" }).first().click();
  await expect(page.getByText("Is it washed off after use?")).toHaveCount(0);
});
