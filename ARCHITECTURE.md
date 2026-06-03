# Cloudflare Worker + KV Admin Architecture

## Overview

Static GitHub Pages landing page → Cloudflare Worker (public JSON API + password-protected admin) → Cloudflare KV (durable state).

One Worker, one KV namespace, two routes (public status, private admin). No database, no build step beyond `wrangler deploy`.

## Why This, Not That

- **Why Worker + KV, not GitHub Actions editing JSON**: manual payment confirmation needs instant update, no commit noise, no Git race conditions.
- **Why not a database (D1/DO)**: KV is free-tier friendly (<100K reads/day, <1K writes/day), single-key read is sub-1ms, perfect for a small JSON blob.
- **Why not a separate admin host (Vercel/Netlify)**: one Worker handles both API and admin UI in <50 lines of routing logic. No extra account, no extra deploy.
- **Why not a protected GitHub Pages branch**: would need GitHub token in browser or a server-side proxy anyway — the Worker is that proxy.
- **Why not KV auth via Wrangler secrets alone**: need browser-accessible admin UI, so the Worker itself checks the password (server-side check, plain comparison against a KV-stored hash or a Worker secret).

## File Structure (in repo, alongside landing page)

```
coffee-landing/
├── index.html                  # existing landing page (unchanged API surface)
├── workshop-status.json        # local dev copy (GitHub Pages serves this in dev)
│                               #   In prod, GitHub Pages still serves this file,
│                               #   but the Worker's KV is the source of truth.
│                               #   A GitHub Action syncs KV → this file on change
│                               #   (or the landing page fetches the Worker URL directly).
│
├── worker/
│   ├── wrangler.toml           # Cloudflare Worker config
│   ├── src/
│   │   └── index.ts            # single-file Worker (~100 lines)
│   └── admin/
│       └── index.html          # admin UI (embedded in Worker response)
│
└── ARCHITECTURE.md             # this file
```

### File roles

| File | Purpose |
|------|---------|
| `worker/wrangler.toml` | Binds KV namespace, sets route pattern, defines env vars (ADMIN_PASSWORD set via `wrangler secret put ADMIN_PASSWORD`) |
| `worker/src/index.ts` | Hono or raw `fetch` handler. Three routes: GET `/api/status`, GET `/admin`, POST `/admin/update`. CORS headers on all responses. |
| `worker/admin/index.html` | Self-contained HTML form embedded in Worker response. Password-gated. Hebrew labels. Buttons: +1 / -1 / מלא / פתוח. |

## Routes

| Route | Method | Auth | What it does |
|-------|--------|------|--------------|
| `GET /api/status` | GET | none | Reads KV, returns JSON with CORS headers |
| `POST /api/status` | POST | none | Also gets status. CORS preflight also allows POST. |
| `GET /admin` | GET | session cookie | Returns admin HTML page. If no valid session, returns login form. |
| `POST /admin/login` | POST | body: password | Validates password, sets session cookie (signed JWT or random token stored in KV with short TTL). Redirects to `/admin`. |
| `POST /admin/update` | POST | session cookie | reads body `{ action: "inc" | "dec" | "full" | "open" , key: "filter_2026_06_15" }`, applies mutation to KV, returns updated JSON. |

### Admin actions

- **+1**: `confirmed += 1`, capped at `capacity`
- **-1**: `confirmed -= 1`, floored at `0`
- **מלא (full)**: sets `open = false, confirmed = capacity`
- **פתוח (open)**: sets `open = true, confirmed = 0`

## KV Schema

**Namespace**: `COFFEE_WORKSHOP`

**Keys**:
- `status` → JSON blob: `{ "filter_2026_06_15": { "title": "...", "date_label": "...", "capacity": 8, "confirmed": 3, "open": true } }`
- `sessions` → JSON blob: `{ "token_abc123": { "expires_at": 1717171200 } }` (optional, for session management)

All reads are `kv.get("status", "json")`. All writes are atomic read-modify-write (KV is eventually consistent; single-writer pattern — one admin at a time — avoids conflicts).

## Security Model

### 1. No browser tokens
- Admin password is NEVER sent to the browser as plaintext or embedded JS.
- Password is stored as a Cloudflare Worker **secret** (`wrangler secret put ADMIN_PASSWORD`) — never in source code, never in wrangler.toml, never in git.
- Worker compares `request body password` against the secret server-side.

### 2. Session management (simplest viable)
- On successful login, Worker creates a random token, stores it in KV with a 2-hour TTL (via `expirationTtl`).
- Sets an HTTP-only, Secure, SameSite=Lax cookie: `session=<token>`.
- Admin routes check cookie exists in KV.
- No JWT needed — no distributed verification, no key rotation complexity for a single Worker.

**Alternative (even simpler)**: no sessions at all. Send password as a query parameter or header with every admin request. More annoying UX but zero session state. Recommended if Dror is the only admin and uses it once a week.

### 3. CORS — safe origin list
- Worker checks `Origin` header against a hardcoded allowlist: `https://<username>.github.io`, `https://<custom-domain>.com`
- Returns `Access-Control-Allow-Origin: <origin>` only for allowed origins (not `*`). Wildcard would work here too since status is public, but explicit is better.
- `Access-Control-Allow-Methods: GET, POST, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type`
- OPTIONS (preflight) returns 204 immediately.

### 4. Rate limiting (optional, free tier)
- Cloudflare's free tier includes basic DDoS protection.
- Can add a simple in-Worker rate limit: 10 POSTs/minute to `/admin/login`.

## Deployment Flow

1. `cd worker && npm create cloudflare@latest` (or manual setup)
2. `npx wrangler kv:namespace create COFFEE_WORKSHOP`
3. Copy KV ID into `wrangler.toml`
4. `npx wrangler secret put ADMIN_PASSWORD` (enter password)
5. Seed KV with initial status: `npx wrangler kv:key put --binding=COFFEE_WORKSHOP status '{"filter_2026_06_15":{...}}'`
6. `npx wrangler deploy`
7. Worker is live at `https://coffee-admin.<subdomain>.workers.dev`

## Landing Page Integration (two options)

### Option A: GitHub Pages fetches Worker directly (recommended)
In `index.html`, change:
```js
// Before: fetch('workshop-status.json?...')
// After:
fetch('https://coffee-admin.<subdomain>.workers.dev/api/status')
```
Pro: zero sync delay, always fresh. Con: adds Worker dependency to page load (but Worker is fast + cached).

### Option B: GitHub Action syncs KV → repo JSON
A scheduled Action (every 5 min or on-demand) reads Worker `/api/status` and commits `workshop-status.json` to the repo. Landing page reads local file as before.
Pro: page works offline of Worker. Con: 5-min lag, commit noise.

**Recommendation**: Option A. The Worker is the source of truth. The local `workshop-status.json` becomes a dev-only fixture.

## Cost (Cloudflare Free Tier)

| Resource | Free limit | This usage estimate |
|----------|-----------|---------------------|
| Worker requests | 100K/day | ~100/day (public page loads) + ~10/day (admin) |
| KV reads | 100K/day | ~100/day |
| KV writes | 1K/day | ~10/day |
| KV storage | 1 GB | <1 KB |
| Worker CPU | 10ms/request | ~2ms per status read |

→ Stays comfortably inside free tier.

## What This Is NOT

- Not a full CMS — one JSON blob, no versioning, no draft/publish.
- Not multi-tenant — one KV namespace, one password, one admin.
- Not a payment system — confirmed count is manually incremented after Bit/PayBox confirmation.
- Not PWA or offline-first — admin requires internet (Worker connection).
- Not end-to-end encrypted — password is plain in Worker memory during comparison. Acceptable for a workshop seat counter.

## Fallback / Resilience

- If Worker is down: landing page shows last-known state (cache the JSON response in sessionStorage), falls back to "open registration" mode.
- If KV is down: Worker returns 503. Landing page gracefully degrades.
- If admin password is lost: `wrangler secret put ADMIN_PASSWORD` again.

## Extensions (if needed later)

- Multi-workshop: add more keys to KV (e.g., `filter_2026_07_01`), admin UI shows dropdown.
- Email notifications: add a Resend/Postmark webhook call after confirmed count changes.
- Audit log: append to a KV list key on every mutation.
- Image upload: store workshop photos in R2, link from status JSON.
