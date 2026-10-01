# Labelring

## How can I edit this code?

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## Deployment

The frontend is a static Vite/React app hosted on **Cloudflare Pages**; the backend is **Supabase** (Postgres + Auth + Storage + Edge Functions). Neither uses GitHub Actions minutes.

- **While switching hosts:** GitHub Pages (`.github/workflows/deploy-pages.yml`, which adds its own `404.html` fallback at build time), Vercel and Cloudflare Pages all build `main`. Delete that workflow to retire GitHub Pages, and disconnect the Vercel project once Cloudflare serves the domain.
- **Frontend:** Cloudflare Pages' Git integration builds every push. Branches and pull requests get a preview URL; `main` goes to production at `www.labelring.co.uk` (`labelring.co.uk` redirects there). Build settings: framework preset **React (Vite)**, build command `npm run build`, output directory `dist`, Node version from `.node-version`. With no `404.html` in the build, Pages serves `index.html` for every client-side route. Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_PROJECT_ID` and `VITE_SUPABASE_PUBLISHABLE_KEY` as environment variables for both Production and Preview.
- **DNS:** the domain stays registered with IONOS; its nameservers point to Cloudflare, which holds the DNS records (website, email and verification records).
- **Backend:** the Supabase GitHub integration (Project Settings → Integrations → GitHub, with **Deploy to production** on) applies new migrations and deploys the edge functions listed in `supabase/config.toml` when `main` changes. `sync-odoo-lead` is deployed separately and isn't listed.
- **Fallback:** `.github/workflows/deploy-supabase.yml` does the same deploy by hand (Actions → Run workflow) if the integration is ever off.
- **Weekly:** `.github/workflows/rulebook-sources.yml` checks the official cosmetics sources on Mondays (about a minute of Actions time).

### GitHub Actions secrets (manual fallback and weekly source check)

| Secret | Purpose |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` | Supabase management API token, used by the CLI to link/push/deploy |
| `SUPABASE_PROJECT_ID` | Supabase project ref |
| `SUPABASE_DB_PASSWORD` | Database password, needed for `supabase db push` |
| `OPENROUTER_API_KEY` | OpenRouter API key used by the `analyze-label`/`generate-label` edge functions |

### Edge function settings (optional)

Set these as Supabase edge function secrets (`supabase secrets set NAME=value`):

| Secret | Default | Purpose |
| --- | --- | --- |
| `SCAN_DAILY_LIMIT` | `3` | Free label scans per person per day, counted by IP and by lead email. `0` turns the limit off. |
| `GENERATE_DAILY_LIMIT` | `200` | AI wording suggestions/previews per person per day in the label generator. |
| `QUOTA_EXEMPT_EMAILS` | _(none)_ | Comma-separated emails that are never limited while signed in (e.g. the team, for testing). |
| `PRIMARY_MODEL` | `~google/gemini-flash-latest` | OpenRouter model that reads every scan. |
| `FALLBACK_MODEL` | `anthropic/claude-sonnet-5.5` | OpenRouter model that re-reads a scan when the first read of a key field (ingredients, warnings, Responsible Person, batch, date, net quantity) is low-confidence; the more certain read of each field is kept. `off` turns re-reads off. |

Every AI call is recorded in `ai_usage` with its tokens and the cost OpenRouter reports; **/admin/leads → Costs** shows cost per scan, how often scans were re-read, and daily totals.

### Brand accounts

Anyone can create an account at **/account** (email and password), create a brand (up to 5 per person) and save labels from the label builder to it. Each save of a label is a new version that records what changed; **Workspace → Labels** lists a brand's labels with their history, and "Use as template" starts a new product's label from an existing one (product details cleared; brand, responsible persons, markets and pack kept). Members see only their own brands; admins see every brand.

In Supabase **Authentication**:

- **Sign In / Providers → Email**: sign-ups enabled, and **Confirm email** on, so an account needs a working inbox.
- **URL Configuration**: Site URL `https://www.labelring.co.uk`, and add `https://www.labelring.co.uk/account` to the redirect URLs (confirmation and password-reset links return there).
