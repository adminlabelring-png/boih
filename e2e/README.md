# End-to-end tests (Playwright)

```sh
npm run test:e2e                      # read-only pages, against a local dev server
E2E_BASE_URL=https://labelring.pages.dev npm run test:e2e   # against a deployed site
```

By default the tests start `vite` locally; the app then talks to the Supabase
project in `.env` (the live one). `public.spec.ts` only reads pages and never
submits a form, so it's always safe.

## Live account tests (`account.spec.ts`)

These create an account, a brand and saved labels in the live database, so
they're skipped unless you opt in:

| Variable | |
| --- | --- |
| `E2E_LIVE=1` | Run the tests that write to the database. |
| `E2E_EMAIL`, `E2E_PASSWORD` | A test account. Use an address you control (e.g. `you+e2e@gmail.com`). |
| `E2E_SIGNUP=1` | First run only, when `E2E_EMAIL` isn't registered yet: creates the account and checks the "check your email" screen. |

Steps for a new test account:

1. `E2E_LIVE=1 E2E_SIGNUP=1 E2E_EMAIL=… E2E_PASSWORD=… npm run test:e2e -- account`
2. Confirm the account (open the link in the email, or in Supabase:
   Authentication → Users → the user → Confirm email).
3. `E2E_LIVE=1 E2E_EMAIL=… E2E_PASSWORD=… npm run test:e2e -- account`

They never use the lead forms, scans or "Save & export", so no leads reach
Odoo, and the label builder's AI preview is stubbed, so no AI calls are made.
Each run creates a brand named `E2E Test Brand <timestamp>`; delete test
brands and the test account afterwards (Supabase → SQL):

```sql
delete from public.brands where name like 'E2E Test Brand %';
delete from auth.users where email = '<E2E_EMAIL>';
```

## Behind a proxy or with a preinstalled browser

`E2E_CHROMIUM_PATH` (browser binary), `E2E_PROXY` (proxy server) and
`E2E_CHROMIUM_ARGS` (extra Chromium flags, space-separated) are passed to
the browser.
