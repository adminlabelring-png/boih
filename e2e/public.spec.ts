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

test("home page follows the redesign", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Labelling and paperwork for UK cosmetics brands.");
  await expect(page.getByText("Six parts of cosmetics compliance, in one place.")).toBeVisible();
  await expect(page.getByText("Coming soon", { exact: true })).toHaveCount(2);
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

test("pilot form asks for the product category and checks the email", async ({ page }) => {
  await page.goto("/#pilot");
  await expect(page.getByLabel("Product category")).toHaveValue("Skincare");
  await page.getByLabel("Your name").fill("Test");
  await page.getByLabel("Work email").fill("not-an-email");
  await page.getByLabel("Brand or company").fill("Test Ltd");
  // Nothing is submitted: the email is invalid.
  await page.getByRole("button", { name: "Book a 30-minute slot" }).click();
  await expect(page.getByText("Please enter a valid email")).toBeVisible();
});

test("scan intake asks the product type and, for non-leave-on types, leave-on or rinse-off", async ({ page }) => {
  await page.goto("/scan");
  // Wait for the page to render before attaching the photo, or the upload
  // can land before its change handler is in place.
  await expect(page.getByRole("heading", { name: /^(Scan|Upload) your label$/ })).toBeVisible();
  await page.locator("input[type=file]").first().setInputFiles(PHOTO);
  await expect(page.getByText("What kind of product?")).toBeVisible();

  await page.getByRole("button", { name: "Liquid or cream" }).first().click();
  await expect(page.getByText("Is it washed off after use?")).toBeVisible();

  // Lip products are leave-on by nature, so the question goes away.
  await page.getByRole("button", { name: "Lip or oral" }).first().click();
  await expect(page.getByText("Is it washed off after use?")).toHaveCount(0);
});
