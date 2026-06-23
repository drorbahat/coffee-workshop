# Codex handoff — dror.coffee landing + workshop admin

## Goal
Continue work on Dror Bahat's coffee workshop website and private registration admin.

Dror is product owner, not developer. Keep delivery PM/client-facing, not dev-log. Hebrew UI, RTL, mobile-first, polished calm coffee aesthetic.

## Live URLs
- Public landing page: https://drorbahat.github.io/coffee-workshop/
- Admin: https://coffee-workshop-admin.drorbahat.workers.dev/admin/registrations
- Admin JSON: https://coffee-workshop-admin.drorbahat.workers.dev/admin/registrations.json

## Repo / project
Primary working tree on server:
- `/home/dror/coffee-landing`
- remote: `git@github.com:drorbahat/coffee-workshop.git`
- branch: `master`

There is also `/home/dror/coffee-workshop`, but it looks older/smaller. Use `coffee-landing` as source of truth unless Dror says otherwise.

IMPORTANT: As of 2026-06-23, many admin files are uncommitted/untracked in `/home/dror/coffee-landing`. If working on Mac, first make sure these files are committed/pushed or copied over. Do not assume GitHub has the latest admin implementation.

Current local status observed:
- modified: `worker/src/index.js`
- untracked dirs/files include:
  - `worker/src/admin-registrations-ui.js`
  - `worker/src/registration-normalize.js`
  - `worker/src/admin-ui/page.js`
  - `worker/src/admin-ui/styles.js`
  - `worker/src/admin-ui/client.js`
  - `worker/scripts/test-registration-normalize.mjs`
  - `worker/scripts/test-admin-api-static.mjs`
  - `worker/scripts/test-admin-ui-static.mjs`
  - `worker/scripts/migrate-crm-lite.mjs`
  - `worker/scripts/crm-data-cleanup.mjs`
  - `design/`, `sketches/`

## Stack
- Public site: static GitHub Pages (`index.html`, CSS/assets in repo)
- Backend/admin: Cloudflare Worker
- Config: `worker/wrangler.toml`
- Worker name: `coffee-workshop-admin`
- Main: `worker/src/index.js`
- D1 binding: `coffee_workshop_registrations`
- D1 database name: `coffee_workshop_registrations`
- KV binding: `COFFEE_WORKSHOP`
- Allowed origin: `https://drorbahat.github.io`

## Registration flow — important
Current landing form still has a Formspree `action="https://formspree.io/f/xwvzzzbj"` and JavaScript also posts to the Worker:
- `WORKER_STATUS_URL = https://coffee-workshop-admin.drorbahat.workers.dev/api/status`
- `WORKER_REGISTER_URL = https://coffee-workshop-admin.drorbahat.workers.dev/api/register`

In `index.html`, around the form-submit code, Formspree is described as primary/old provider and Worker as shadow. This is intentional historical rollback/safety context. Do **not** remove Formspree or flip source-of-truth without first mapping current live behavior and confirming with Dror. The admin is fed by Worker/D1; Formspree may still be fallback/parallel notification.

## Admin architecture
- `worker/src/index.js` — routes, auth, D1, API endpoints, CSV/export, update/delete
- `worker/src/registration-normalize.js` — pure helpers: labels, lane computation, WhatsApp normalization/message, workshop key, billable rows
- `worker/src/admin-registrations-ui.js` — render entry wrapper
- `worker/src/admin-ui/page.js` — HTML shell
- `worker/src/admin-ui/styles.js` — CSS
- `worker/src/admin-ui/client.js` — cockpit/table/detail drawer client JS

## Current admin capabilities
Hybrid admin at `/admin/registrations`:
- Cockpit default: daily action lanes, mobile-first
- Table tab: all registrants with filters/search/export
- Detail drawer / mobile bottom sheet
- Editable fields: name, phone, email, edition, workshop/date, source, seats, notes, statuses, parent registration
- Actions: open WhatsApp, mark WhatsApp sent, mark Bit sent, mark paid, add to brew/espresso updates, cancel/delete
- CSV export preserved

Current conceptual lanes:
- `needs_action`
- `open_leads`
- `needs_closing`
- `waiting_payment`
- `closed`

Category/filter keys:
- `uru`
- `kanopi`
- `brew_updates`
- `espresso_updates`
- `other`

Avoid generic `updates`; split brew/espresso updates. Active `other` should usually stay empty.

## Data model notes
The `registrations` table currently mixes:
- form submissions
- main registrations/payers
- included attendees / +1s
- CRM update leads

CRM-lite fields exist:
- `record_type`: `lead`, `registration`, `attendee`
- `parent_registration_id`
- `crm_stage`

Examples from current business logic:
- Main payer rows own payment/seats.
- Included attendees should not look unpaid; show as included under parent.
- Update leads can be open/waiting for reply without payment pressure.

Longer-term only if needed: split into `contacts`, `registrations`, `attendees`, `interactions`. Do NOT over-engineer unless current flat model becomes painful.

## UX rules
Admin must answer in first 5 seconds:
1. how many registrations/leads exist
2. who needs WhatsApp outreach
3. who is waiting for payment
4. who is paid/seat-saved
5. which workshop/date is viewed

Visual direction:
- calm premium coffee, not enterprise SaaS clutter
- warm white/paper background
- coffee brown primary accent
- sage/green for paid/success
- amber for pending/follow-up
- red only for spam/problem
- Hebrew RTL, mobile-first
- real action hierarchy, 44px touch targets

RTL rules:
- Use `dir="rtl" lang="he"`
- Phone numbers, timestamps, IDs, money: LTR isolation (`direction:ltr; unicode-bidi:isolate`)
- Avoid raw technical statuses in main UI

Status labels should be Hebrew-facing, not raw DB values.

## Known pitfalls
- Details drawer save must send changed fields only, not every visible field. Blind submit caused nullable fields like `crm_stage: null` to be rejected.
- Preserve 0 seats with `?? 1`, not `|| 1`.
- Server validation must allow DB NULL for nullable fields: `crm_stage`, `record_type`, `parent_registration_id`, `amount_ils`, `notes`, `workshop_date`, etc.
- If WhatsApp already sent, do not show actionable “סמן וואטסאפ נשלח”; show read-only “הודעה כבר נשלחה”, but keep “פתח WhatsApp”.
- Subagent/parallel work must be batched by file scope; avoid conflicts in same file.
- Prototype design changes with realistic data before production if doing a redesign.

## Commands / verification
From repo root:
```bash
cd /home/dror/coffee-landing
```

There is no obvious package.json in repo root/worker. Existing tests are standalone `.mjs` scripts. Inspect exact scripts before running.

Known/likely static tests:
```bash
node worker/scripts/test-registration-normalize.mjs
node worker/scripts/test-admin-api-static.mjs
node worker/scripts/test-admin-ui-static.mjs
node worker/scripts/test-crm-data-cleanup-static.mjs
```

Cloudflare/Wrangler commands, from `worker/`:
```bash
cd worker
npx wrangler dev
npx wrangler deploy
npx wrangler d1 execute coffee_workshop_registrations --remote --command "PRAGMA table_info(registrations);"
```

Bulk D1 updates require care and event logs if audit trail matters.

## Working style for Dror
- Be concise, Hebrew by default unless code details.
- Start with product impact, not implementation dump.
- If changing multiple issues: plan + diff before applying, get approval if destructive/irreversible.
- Dror prefers polished UX, hates generic AI-bot design.
- For admin/site UI: show prototypes or screenshots when visual work is involved.

## Suggested opening prompt for Codex
Use this prompt when starting Codex on Mac:

"You are helping me continue my dror.coffee workshop landing page and Cloudflare Worker admin. Read `CODEX_HANDOFF.md` first, then inspect the repo. The working source of truth is the coffee-workshop repo, but make sure you have the latest server copy from `/home/dror/coffee-landing` because many admin files may be uncommitted/untracked there. Do not start coding until you summarize: current architecture, uncommitted status, test commands you found, and the smallest safe plan. Hebrew RTL/mobile UX matters. Admin live URL: https://coffee-workshop-admin.drorbahat.workers.dev/admin/registrations. Dror is product owner, not developer — explain changes as product impact."

## If files need transfer from server to Mac
Preferred safe path:
1. On server, commit current work to a WIP branch and push.
2. On Mac, pull that branch.

Alternative: zip/copy `/home/dror/coffee-landing` including untracked files, but exclude secrets and `.wrangler/state`.

Do not copy `.env` or credentials.
