# Coffee Workshop — Landing & Admin

**Dror Bahat** — סדנאות קפה ביתי

Public landing page + private Cloudflare Worker-based registration admin.

## Live URLs

| Service | URL |
|---------|-----|
| **Public landing** | https://drorbahat.github.io/coffee-workshop/ |
| **Admin (registrations)** | https://coffee-workshop-admin.drorbahat.workers.dev/admin/registrations |
| **Public status API** | https://coffee-workshop-admin.drorbahat.workers.dev/api/status |
| **Admin JSON API** | https://coffee-workshop-admin.drorbahat.workers.dev/admin/registrations.json |
| **CSV export** | https://coffee-workshop-admin.drorbahat.workers.dev/admin/export.csv |
| **GitHub repo** | https://github.com/drorbahat/coffee-workshop |

## Architecture (high-level)

```
GitHub Pages (static landing) ──→ Formspree (parallel shadow)
                                    │
                                    ▼
GitHub Pages ──→ Cloudflare Worker ──→ D1 (registrations)
                       │                    └─ registrations table (CRM-lite)
                       └─ KV (workshop capacity)
```

- **Landing page**: static HTML/CSS on GitHub Pages. Form posts to Formspree (primary/safety) **and** the Worker `/api/register` (shadow).
- **Worker**: Cloudflare Workers runtime. Serves the admin UI, JSON API, CSV export, registration endpoint, and seat-status endpoint.
- **D1**: SQLite-compatible Cloudflare DB. Main `registrations` table with CRM-lite columns (`record_type`, `parent_registration_id`, `crm_stage`).
- **KV**: Holds workshop capacity/status summary (`/api/status`). Source of truth for public seat availability.

## Key files

```
coffee-landing/
├── index.html                          # Landing page
├── styles.css                          # Landing styles
├── workshop-status.json                # Dev/local fallback for seat status
├── .gitignore
├── ARCHITECTURE.md                     # Architecture reference
├── CODEX_HANDOFF.md                    # Agent context / handoff notes
├── INTEGRATION_PATTERNS.md             # Fallback chain patterns
├── README.md                           # This file
│
├── worker/
│   ├── wrangler.toml                   # Cloudflare Worker config
│   ├── schema.sql                      # D1 schema
│   ├── src/
│   │   ├── index.js                    # Worker main: routes, auth, API
│   │   ├── registration-normalize.js   # Pure helpers: lanes, labels, WhatsApp
│   │   ├── admin-registrations-ui.js   # Entry render wrapper
│   │   └── admin-ui/
│   │       ├── page.js                 # HTML shell
│   │       ├── styles.js               # CSS string
│   │       └── client.js               # Client JS (cockpit, table, details)
│   └── scripts/
│       ├── test-register.mjs                   # Integration test for /api/register
│       ├── test-registration-normalize.mjs     # Unit tests for normalize helpers
│       ├── test-admin-api-static.mjs           # Static checks for index.js API
│       ├── test-admin-ui-static.mjs            # Static checks for admin UI modules
│       ├── test-crm-data-cleanup-static.mjs    # Static checks for cleanup script
│       ├── crm-data-cleanup.mjs                # CRM data cleanup (dry-run by default)
│       ├── import-formspree-csv.mjs            # Formspree CSV import
│       ├── migrate-crm-lite.mjs                # Add CRM-lite columns (dry-run by default)
│       ├── backfill-created-at-from-formspree.mjs  # Backfill timestamps
│       └── test-local-d1.mjs                   # Local D1 test
│
├── design/
│   └── prototypes/registrations-ux/    # UX prototypes (clickable HTML)
│
└── sketches/admin-redesign/            # Admin redesign sketches
```

## Running tests

All tests are standalone `.mjs` scripts. No package.json needed.

```bash
# From the repo root:
node worker/scripts/test-registration-normalize.mjs
node worker/scripts/test-admin-api-static.mjs
node worker/scripts/test-admin-ui-static.mjs
node worker/scripts/test-crm-data-cleanup-static.mjs
```

## Data safety

- **Never** commit actual registrant data (names, phone numbers, emails) to git.
- Prototype/sketch data in `design/` and `sketches/` uses fictional names and non-functional phone numbers (`0501111xxx`).
- Production data lives in Cloudflare D1 — never export it into the repo.
- CSV exports from the admin UI should not be committed. The `.gitignore` blocks `*.csv`.
- CRM cleanup scripts (`crm-data-cleanup.mjs`) default to **dry-run** (`--apply` flag required to mutate).

## Deploy safety

- Worker deploys: `cd worker && npx wrangler deploy`
- Always preview with `npx wrangler dev` before deploying.
- Landing page deploys: push `master` to GitHub. GitHub Pages auto-deploys.
- Do **not** deploy untested changes to the Worker without running the static tests first.

## D1 safety

- Schema changes require `migrate-crm-lite.mjs` (dry-run default).
- Bulk updates require `crm-data-cleanup.mjs` (dry-run default).
- D1 has no `BEGIN`/`COMMIT` support — each statement is auto-committed.
- Always use `--json` + `--remote` when querying D1 programmatically.
