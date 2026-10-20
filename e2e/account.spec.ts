import { test, expect, type Page } from "@playwright/test";

// Accounts, brands and saved labels against a real Supabase project. These
// write to the database, so they only run with E2E_LIVE=1 and a test
// account (E2E_EMAIL / E2E_PASSWORD). See e2e/README.md for setting one up
// and cleaning up afterwards.
//
// Nothing here goes through the lead forms, scans or "Save & export", so
// no leads are created in Odoo. The AI preview in the label builder is
// stubbed, so no AI calls are made.

const live = process.env.E2E_LIVE === "1";
const email = process.env.E2E_EMAIL ?? "";
const password = process.env.E2E_PASSWORD ?? "";
// Set E2E_SIGNUP=1 when E2E_EMAIL hasn't been registered yet: the first
// test then creates it.
const signup = process.env.E2E_SIGNUP === "1";

test.describe.configure({ mode: "serial" });
test.skip(!live || !email || !password, "Set E2E_LIVE=1, E2E_EMAIL and E2E_PASSWORD to run the live account tests.");

const stubAiPreview = (page: Page) =>
  page.route("**/functions/v1/generate-label", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ preview: "(preview stubbed in tests)" }) })
  );

const openTab = async (page: Page, name: "Sign in" | "Create account") => {
  await page.goto("/account");
  await page.getByRole("tab", { name }).click();
};

const fillCredentials = async (page: Page) => {
  const panel = page.getByRole("tabpanel");
  await panel.getByLabel("Email").fill(email);
  await panel.getByLabel("Password").fill(password);
};

const signIn = async (page: Page) => {
  await openTab(page, "Sign in");
  await fillCredentials(page);
  await page.getByRole("tabpanel").getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Your brands" })).toBeVisible();
};

test("a new address gets 'check your email' after creating an account", async ({ page }) => {
  test.skip(!signup, "E2E_SIGNUP=1 only when E2E_EMAIL is a new address.");
  await openTab(page, "Create account");
  await fillCredentials(page);
  await page.getByRole("tabpanel").getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
});

test("an address that already has an account is told so, not 'check your email'", async ({ page }) => {
  test.skip(signup, "Needs a confirmed account: run again without E2E_SIGNUP once it's confirmed.");
  await openTab(page, "Create account");
  await fillCredentials(page);
  await page.getByRole("tabpanel").getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "You already have an account" })).toBeVisible();
  // "Sign in" takes them back to the sign-in tab.
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("tab", { name: "Sign in" })).toHaveAttribute("aria-selected", "true");
});

test("a wrong password is refused", async ({ page }) => {
  test.skip(signup, "Needs a confirmed account.");
  await openTab(page, "Sign in");
  const panel = page.getByRole("tabpanel");
  await panel.getByLabel("Email").fill(email);
  await panel.getByLabel("Password").fill(`${password}-wrong`);
  await panel.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Invalid login credentials")).toBeVisible();
});

test("sign in, create a brand, save a label and save a second version", async ({ page }) => {
  test.skip(signup, "Needs a confirmed account.");
  await stubAiPreview(page);
  await signIn(page);

  // A fresh brand for this run (cleaned up afterwards, see the README).
  const brand = `E2E Test Brand ${Date.now()}`;
  // New accounts see the brand form; accounts with a brand see "Add another brand".
  const addBrand = page.getByRole("button", { name: "Add another brand" });
  await expect(page.getByLabel("Brand name").or(addBrand)).toBeVisible();
  if (await addBrand.isVisible()) await addBrand.click();
  await page.getByLabel("Brand name").fill(brand);
  await page.getByRole("button", { name: /create brand/i }).click();
  await expect(page).toHaveURL(/\/workspace\/labels/);

  // Version 1 from the label builder.
  await page.goto("/generate");
  await page.locator("#category").click();
  await page.getByRole("option", { name: "Skincare" }).click();
  await page.locator("#productName").fill("E2E Rose Face Cream");
  await page.locator("#ingredients").fill("Aqua, Glycerin, Parfum, Linalool");
  await page.getByRole("button", { name: "Save to brand" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved to your brand as version 1.")).toBeVisible();

  // Version 2: a real change, with a note.
  await page.locator("#productName").fill("E2E Rose Face Cream 50 ml");
  await page.getByRole("button", { name: "Save as version 2" }).click();
  await page.getByLabel("Note (optional)").fill("Renamed in an end-to-end test");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved as version 2.")).toBeVisible();

  // The workspace lists it at version 2.
  await page.goto("/workspace/labels");
  await expect(page.getByText("E2E Rose Face Cream 50 ml")).toBeVisible();
  await expect(page.getByText(/v2|version 2/i).first()).toBeVisible();
});

test("forgot password sends a reset link", async ({ page }) => {
  test.skip(signup, "Needs a confirmed account.");
  await openTab(page, "Sign in");
  await page.getByRole("tabpanel").getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Forgot your password?" }).click();
  await expect(page.getByText("We've sent a password reset link")).toBeVisible();
});
