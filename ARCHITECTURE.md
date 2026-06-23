# Cloudflare Worker + D1 + KV Architecture

## Overview

Static GitHub Pages landing page → Cloudflare Worker (public JSON API + password-protected admin) → D1 (registrations database) + KV (workshop capacity/status).

One Worker, two data stores, three route groups (public status, registration API, private admin).

## Why This, Not That

- **Why Worker + D1, not pure KV**: D1 gives real SQL queries — filtering, sorting, aggregations, joins. The CRM-lite model (`record_type`, `parent_registration_id`, `crm_stage`) needs relational capabilities that a single JSON blob in KV can't provide.
- **Why KV still exists**: KV holds the workshop seat counter for the public `/api/status` endpoint. It's fast (sub-1ms reads), free-tier friendly, and decouples the public seat display from the full registrations database.
- **Why not a separate admin host (Vercel/Netlify)**: one Worker handles both JSON API and admin UI. No extra account, no extra deploy.
- **Why not a database-only admin**: D1 is SQLite-compatible and has some limitations (no BEGIN/COMMIT, each statement is auto-committed). The Worker manages these constraints.
- **Why not a protected GitHub Pages branch**: would need GitHub token in browser or server-side proxy — the Worker is that proxy.
- **Why password auth via Worker secret**: simple, server-side check. No browser tokens, no JWT complexity for a single-admin system.

## File Structure

```
coffee-landing/
├── index.html                  # Landing page (unchanged API surface)
├── styles.css                  # Landing styles
├── workshop-status.json        # Local dev / fallback copy of KV status
├── ARCHITECTURE.md             # This file
├── CODEX_HANDOFF.md            # Agent handoff / context
├── INTEGRATION_PATTERNS.md     # Fallback chain documentation
├── README.md                   # Project overview
│
├── worker/
│   ├── wrangler.toml           # Cloudflare Worker config
│   ├── schema.sql              # D1 table schema
│   ├── src/
│   │   ├── index.js            # Worker main: routes, auth, D1 queries, API
│   │   ├── registration-normalize.js  # Pure helpers: lanes, labels, WhatsApp
│   │   ├── admin-registrations-ui.js   # Entry render wrapper
│   │   └── admin-ui/
│   │       ├── page.js         # HTML shell (Hebrew, RTL)
│   │       ├── styles.js       # CSS string
│   │       └── client.js       # Client JS (cockpit, table, details, filters)
│   └── scripts/                # Utility/test scripts (all dry-run safe)
│
├── design/
│   └── prototypes/registrations-ux/   # UX prototypes (fictional data)
│
└── sketches/admin-redesign/           # Admin redesign sketches (fictional data)
```

### File roles

| File | Purpose |
|------|---------|
| `worker/wrangler.toml` | Binds D1 database and KV namespace, sets route pattern, defines env vars (`ADMIN_PASSWORD` set via `wrangler secret put`) |
| `worker/src/index.js` | Main Worker. Routes: `/api/status` (public, KV-backed), `/api/register` (public, D1-backed), `/admin/registrations` (password-protected), `/admin/registration/update-many` (bulk update), export CSV. |
| `worker/src/registration-normalize.js` | Pure functions: `computeLane`, `workshopKey`, `normalizePhoneForWa`, `statusLabel`, `waDraftMessage`, `isBillableRow`, `parentSummary`. No side effects. |
| `worker/src/admin-ui/page.js` | Renders HTML shell for the admin page with navigation, filters, cockpit/table tabs, details drawer. Hebrew labels, RTL layout. |
| `worker/src/admin-ui/styles.js` | All CSS for the admin UI. Coffee-branded palette, mobile-first, 44px touch targets. |
| `worker/src/admin-ui/client.js` | Client-side JS: data fetching, filtering, cockpit/table rendering, detail drawer, inline editing, update-many calls. |
| `worker/schema.sql` | D1 `registrations` table schema including CRM-lite columns. |

## Routes

| Route | Method | Auth | What it does |
|-------|--------|------|--------------|
| `GET /api/status` | GET | none | Reads KV, returns workshop capacity/confirmed/open as JSON with CORS |
| `POST /api/register` | POST | none | Accepts registration form data (JSON or FormData). Validates, normalizes, inserts into D1. Honeypot spam detection, duplicate detection via `client_submission_id`. |
| `GET /admin/registrations` | GET | session cookie | Returns admin HTML page. If no valid session, returns login form. |
| `GET /admin/registrations.json` | GET | session cookie | Returns all registrations from D1 as JSON with computed fields (lane, labels, parent info). |
| `GET /admin/export.csv` | GET | session cookie | Returns CSV export of all registrations. |
| `POST /admin/registration/update` | POST | session cookie | Update single field on one registration. Validates against `ALLOWED_UPDATE_FIELDS` and `ALLOWED_STATUS_VALUES`. |
| `POST /admin/registration/update-many` | POST | session cookie | Update multiple fields on one registration atomically. Validates ALL fields before writing any. Writes `registration_events` audit log. |
| `POST /admin/registration/delete` | POST | session cookie | Soft-delete (marks `cancelled`, preserves notes, appends `[ביטול:` marker). |
| `POST /admin/login` | POST | body: password | Validates password against Worker secret. Sets HTTP-only session cookie with KV-backed TTL. |

## D1 Schema (registrations table)

```sql
CREATE TABLE registrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_submission_id TEXT UNIQUE,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),

  -- Contact fields
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,

  -- Workshop fields
  edition TEXT,             -- e.g. 'URU · תל אביב', 'קנופי · ירושלים'
  request_type TEXT,        -- e.g. 'הרשמה — URU · תל אביב'
  workshop TEXT,            -- 'חליטות ביתיות' / 'אספרסו'
  workshop_date TEXT,       -- e.g. 'שישי 3.7 11:00–12:30'
  source TEXT,              -- 'אינסטגרם', 'חבר/ה', 'וואטסאפ', etc.
  group_registration TEXT,

  -- Booking fields
  seats INTEGER DEFAULT 1,
  amount_ils INTEGER,

  -- Status fields
  whatsapp_status TEXT DEFAULT 'pending',
  payment_status TEXT DEFAULT 'pending',
  registration_status TEXT DEFAULT 'new',

  -- Spam detection
  is_spam INTEGER DEFAULT 0,
  spam_reason TEXT,

  -- CRM-lite fields
  record_type TEXT,              -- 'lead' | 'registration' | 'attendee'
  parent_registration_id INTEGER,
  crm_stage TEXT,                -- 'open' | 'awaiting_reply' | 'interested' | 'closing' | 'closed'

  -- Audit
  notes TEXT,
  imported_from TEXT,
  original_submission_id TEXT
);

CREATE TABLE IF NOT EXISTS registration_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  registration_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  field_name TEXT,
  old_value TEXT,
  new_value TEXT,
  note TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (registration_id) REFERENCES registrations(id)
);
```

## KV Schema

**Namespace**: `COFFEE_WORKSHOP`

**Key**: `status` → JSON blob:
```json
{
  "filter_2026_06_15": {
    "title": "...",
    "date_label": "...",
    "capacity": 8,
    "confirmed": 3,
    "open": true
  }
}
```

KV is the public face of seat availability. D1 is the internal source of truth for registrations. The two may differ if seats are manually reserved — a known gap that future work may address.

## Admin capabilities

The admin UI at `/admin/registrations` provides:

- **Cockpit tab**: mobile-first action lanes sorted by next action needed.
- **Table tab**: all registrants with filters, search, sorting, CSV export.
- **Detail drawer / mobile bottom sheet**: view and edit all fields.
- **Editable fields**: name, phone, email, edition, workshop/date, source, seats, notes, statuses, parent registration, CRM fields.
- **Actions**: open WhatsApp with pre-filled message, mark WhatsApp sent, mark Bit sent, mark paid, add to brew/espresso updates, link to parent registration, unlink, cancel/delete.
- **Filters**: by workshop, source, payment status, WhatsApp status, registration status, record type, CRM stage, search by name/phone.

## Lanes (computed)

The system computes a `lane` for each row:

| Lane | Meaning |
|------|---------|
| `needs_action` | WhatsApp not sent / not handled — first outreach needed |
| `open_leads` | WhatsApp sent, waiting for reply — lead management |
| `needs_closing` | Lead interested / payment followup needed |
| `waiting_payment` | Bit request sent, awaiting payment |
| `closed` | Paid, cancelled, spam, or group member |

## Security Model

### 1. No browser tokens
- Admin password is a Cloudflare Worker **secret** (`wrangler secret put ADMIN_PASSWORD`) — never in source code, never in wrangler.toml, never in git.

### 2. Session management
- On successful login, Worker creates a random token and stores it in KV with 2-hour `expirationTtl`.
- HTTP-only, Secure, SameSite=Lax cookie: `session=<token>`.
- Admin routes check cookie presence in KV.

### 3. CORS
- Worker checks `Origin` header against an allowlist: `https://drorbahat.github.io`.
- Public endpoints (`/api/status`, `/api/register`) allow the GitHub Pages origin.
- OPTIONS preflight returns 204 immediately.

## Data safety rules

1. **Never commit real registrant data** to git. The `.gitignore` blocks `*.csv` and screenshot patterns.
2. **Prototype/sketch files** use fictional names and non-functional phone numbers (`0501111xxx`).
3. **CRM scripts default to dry-run** — `--apply` flag required to mutate D1.
4. **D1 has no transactions** — each statement is auto-committed. Plan carefully.
5. **audit trail**: All field changes write a row to `registration_events` table.

## Cost (Cloudflare Free Tier)

All comfortably inside free tier during normal operation.

## What This Is NOT

- Not a full CMS — one flat table, no versioning, no draft/publish.
- Not multi-tenant — one database, one password, one admin.
- Not a payment system — payment tracking is manual (after Bit/PayBox confirmation).
- Not PWA or offline-first — admin requires internet.

## Deployment

```bash
# Worker
cd worker
npx wrangler dev              # local preview
npx wrangler deploy           # production deploy

# Landing page
git push origin master        # GitHub Pages auto-deploys
```
