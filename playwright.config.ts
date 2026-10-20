import { defineConfig, devices } from "@playwright/test";

// End-to-end tests. By default they start the local dev server, which talks
// to the Supabase project in .env; set E2E_BASE_URL to test a deployed site
// instead (e.g. a Cloudflare preview).
//
// Tests that write to the database (accounts, brands, saved labels) only
// run with E2E_LIVE=1 and test credentials: see e2e/README.md.
const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:5179";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      // For machines with a preinstalled Chromium, or behind a proxy that
      // re-signs TLS (pass its CA's SPKI hash as a Chromium flag).
      executablePath: process.env.E2E_CHROMIUM_PATH || undefined,
      args: process.env.E2E_CHROMIUM_ARGS ? process.env.E2E_CHROMIUM_ARGS.split(" ") : [],
      proxy: process.env.E2E_PROXY ? { server: process.env.E2E_PROXY, bypass: "127.0.0.1,localhost" } : undefined,
    },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /public\.spec\.ts/ },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npx vite --host 127.0.0.1 --port 5179",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 60_000,
      },
});
