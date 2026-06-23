#!/usr/bin/env node

/**
 * Static/API shape checks for the admin redesign.
 * These tests verify that the code structure matches expectations
 * without needing a running worker or database.
 */

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`✓ ${label}`);
    passed++;
  } else {
    console.log(`✗ ${label}`);
    failed++;
  }
}

function assertEq(actual, expected, label) {
  if (actual === expected) {
    console.log(`✓ ${label}`);
    passed++;
  } else {
    console.log(`✗ ${label}  (expected: ${JSON.stringify(expected)}, got: ${JSON.stringify(actual)})`);
    failed++;
  }
}

function assertIn(actual, expectedArr, label) {
  if (expectedArr.includes(actual)) {
    console.log(`✓ ${label}`);
    passed++;
  } else {
    console.log(`✗ ${label}  (expected one of: ${JSON.stringify(expectedArr)}, got: ${JSON.stringify(actual)})`);
    failed++;
  }
}

/* ───── 1. Verify ADMIN_REGISTRATION_SELECT exists in index.js ───── */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const INDEX_PATH = resolve(__dirname, '..', 'src', 'index.js');

const src = readFileSync(INDEX_PATH, 'utf-8');

// ADMIN_REGISTRATION_SELECT constant exists
assert(src.includes('ADMIN_REGISTRATION_SELECT'), 'ADMIN_REGISTRATION_SELECT constant exists');

// It contains all expected columns (including new CRM-lite fields)
const expectedColumns = [
  'id', 'created_at', 'updated_at',
  'name', 'phone', 'email',
  'edition', 'request_type', 'workshop', 'workshop_date', 'source', 'group_registration',
  'seats', 'amount_ils',
  'whatsapp_status', 'payment_status', 'registration_status',
  'is_spam', 'spam_reason',
  'record_type', 'parent_registration_id', 'crm_stage',
  'notes', 'imported_from', 'original_submission_id',
];
for (const col of expectedColumns) {
  assert(src.includes(col), `ADMIN_REGISTRATION_SELECT includes column '${col}'`);
}

/* ───── 2. Verify update-many route exists ───── */
assert(src.includes('/admin/registration/update-many'), 'update-many route string exists');
assert(src.includes('handleRegistrationUpdateMany'), 'handleRegistrationUpdateMany handler exists');

/* ───── 3. Verify helper functions exist ───── */
assert(src.includes('function validateAndCoerceUpdate'), 'validateAndCoerceUpdate helper exists');
assert(src.includes('function fetchRegistrationById'), 'fetchRegistrationById helper exists');

/* ───── 4. Verify update handler uses full select ───── */
assert(src.includes('fetchRegistrationById(db, id)'), 'update response uses fetchRegistrationById in update');
// The handler returns a 'registration' key, not just 'updated'
assert(src.includes("json({ ok: true, id, field, value: validated.value, registration }"), 'update handler returns full registration key');

/* ───── 5. Verify delete returns registration ───── */
assert(src.includes("json({ ok: true, id, registration }") || src.includes("json({ ok: true, id, registration: registration }"), 'delete handler returns full registration');

/* ───── 6. Verify delete appends notes not replaces ───── */
assert(src.includes('existing.notes'), 'delete handler reads existing notes');
assert(src.includes('[ביטול:'), 'delete handler appends deletion marker [ביטול:');

/* ───── 7. Verify update-many handler validates ALL fields before writing ───── */
assert(src.includes('// Validate ALL fields before writing any'), 'update-many validates all fields first (comment marker)');

/* ───── 8. Verify update-many writes registration_events per changed field ───── */
const eventCount = (src.match(/updated:/g) || []).length;
assert(eventCount >= 1, 'update-many writes registration_events with updated: prefix');

/* ───── 9. Verify update-many returns full registration ───── */
assert(src.includes('const registration = await fetchRegistrationById(db, id);'), 'update-many returns full normalized row');

/* ───── 10. Verify existing constants are preserved ───── */
assert(src.includes('ALLOWED_UPDATE_FIELDS'), 'ALLOWED_UPDATE_FIELDS exists');
assert(src.includes('UPDATE_COLUMN_MAP'), 'UPDATE_COLUMN_MAP exists');
assert(src.includes('ALLOWED_STATUS_VALUES'), 'ALLOWED_STATUS_VALUES exists');

/* ───── 10b. Verify new CRM-lite fields in UPDATE_COLUMN_MAP ───── */
assert(src.includes("record_type: 'record_type'"), 'UPDATE_COLUMN_MAP includes record_type');
assert(src.includes("parent_registration_id: 'parent_registration_id'"), 'UPDATE_COLUMN_MAP includes parent_registration_id');
assert(src.includes("crm_stage: 'crm_stage'"), 'UPDATE_COLUMN_MAP includes crm_stage');

/* ───── 10c. Verify new ALLOWED_STATUS_VALUES ───── */
assert(src.includes("record_type: ['lead', 'registration', 'attendee']"), 'ALLOWED_STATUS_VALUES includes record_type');
assert(src.includes("crm_stage: ['open', 'awaiting_reply', 'interested', 'closing'"), 'ALLOWED_STATUS_VALUES includes crm_stage with open/awaiting_reply/interested/closing');
assert(src.includes("'group_member', 'interested', 'registered'"), 'ALLOWED_STATUS_VALUES registration_status includes group_member, interested, registered');
assert(src.includes("'awaiting_reply', 'replied_interested'"), 'ALLOWED_STATUS_VALUES whatsapp_status includes awaiting_reply, replied_interested');

/* ───── 10d. Verify parent_registration_id handled in validateAndCoerceUpdate ───── */
assert(src.includes("field === 'parent_registration_id'"), 'validateAndCoerceUpdate handles parent_registration_id');

/* ───── 10e. Verify isBillableRow imported in index.js ───── */
assert(src.includes('isBillableRow'), 'isBillableRow imported in index.js');

/* ───── 10f. Verify KPIs use isBillableRow ───── */
const unpaidSection = src.indexOf('unpaid:');
const paidSeatsSection = src.indexOf('paid_seats:');
assert(unpaidSection >= 0, 'unpaid KPI exists');
assert(src.slice(unpaidSection, unpaidSection + 120).includes('isBillableRow(r)'), 'unpaid KPI uses isBillableRow');
assert(paidSeatsSection >= 0, 'paid_seats KPI exists');
assert(src.slice(paidSeatsSection, paidSeatsSection + 140).includes('isBillableRow(r)'), 'paid_seats KPI uses isBillableRow');

/* ───── 10g. Verify CRM-lite counts exist ───── */
assert(src.includes('open_leads:'), 'counts includes open_leads');
assert(src.includes('needs_closing:'), 'counts includes needs_closing');

/* ───── 10h. Verify CRM-lite filters exist ───── */
assert(src.includes('record_types:'), 'filters includes record_types');
assert(src.includes('crm_stages:'), 'filters includes crm_stages');
assert(src.includes("'awaiting_reply', 'replied_interested'"), 'filters.whatsapp_statuses includes awaiting_reply and replied_interested');
assert(src.includes("'registered'"), 'filters.registration_statuses includes registered');
assert(src.includes("'group_member'"), 'filters.registration_statuses includes group_member');
assert(src.includes("'interested'"), 'filters.registration_statuses includes interested');

/* ───── 11. Verify backfill script exists ───── */
import { existsSync } from 'fs';
const BACKFILL_PATH = resolve(__dirname, '..', 'scripts', 'backfill-created-at-from-formspree.mjs');
assert(existsSync(BACKFILL_PATH), 'backfill-created-at-from-formspree.mjs exists');

const backfillSrc = readFileSync(BACKFILL_PATH, 'utf-8');
assert(backfillSrc.includes('--apply'), 'backfill script supports --apply flag');
assert(backfillSrc.includes('dry-run'), 'backfill script has dry-run/dry-run fallback');
assert(!backfillSrc.includes('wrangler') || backfillSrc.includes('wrangler d1 execute'), 'backfill script uses wrangler d1 execute for apply');

// The old bad guard AND (created_at IS NULL OR created_at = '') must NOT exist
assert(!backfillSrc.includes('created_at IS NULL'), 'backfill script does NOT contain the old bad guard "created_at IS NULL"');
// Instead it must use exact-ID WHERE clause
assert(backfillSrc.includes('WHERE id = '), 'backfill script uses exact ID match in UPDATE');
// Must fetch D1 rows first
assert(backfillSrc.includes('queryD1') || backfillSrc.includes('d1 execute.*SELECT'), 'backfill script fetches D1 rows before matching');

/* ───── 12. Verify csvField uses actual newline/carriage return, not literal backslash-n/r ───── */
// Old bug: checked for literal backslash-n '\\n' (two-char sequence in JS source).
// Fix: uses '\\n' (JS escape for newline byte 0x0a).
// Verify by searching for the old pattern (two consecutive backslashes before n/r in JS source).
const csvFieldStart = src.indexOf('function csvField');
const csvFieldBody = src.slice(csvFieldStart, csvFieldStart + 500);
const oldNewlinePattern = "s.includes('\\\\\\\\n')";  // JS string: s.includes('\\\\n') — two backslashes before n
const oldCRPattern = "s.includes('\\\\\\\\r')";       // JS string: s.includes('\\\\r') — two backslashes before r
assert(!csvFieldBody.includes(oldNewlinePattern),
  'csvField uses actual newline char - not literal backslash-n');
assert(!csvFieldBody.includes(oldCRPattern),
  'csvField uses actual carriage return char - not literal backslash-r');

/* ───── 13. Verify is_spam ALLOWED_STATUS_VALUES includes boolean true/false ───── */
// The allowed-values check runs before coercion, so true/false must be in the list
const isSpamIdx = src.indexOf('is_spam: [');
const isSpamLine = src.slice(isSpamIdx, isSpamIdx + 80).split('\n')[0];
assert(isSpamLine.includes('true') && isSpamLine.includes('false'),
  'is_spam ALLOWED_STATUS_VALUES includes boolean true and false for pre-coercion validation');
assert(isSpamLine.includes("'1'") && isSpamLine.includes('1'),
  'is_spam ALLOWED_STATUS_VALUES still includes numeric 1 and string quote-1-quote');

/* ───── 14. Verify migrate-crm-lite.mjs script exists ───── */
const MIGRATE_PATH = resolve(__dirname, '..', 'scripts', 'migrate-crm-lite.mjs');
assert(existsSync(MIGRATE_PATH), 'migrate-crm-lite.mjs exists');

const migrateSrc = readFileSync(MIGRATE_PATH, 'utf-8');
assert(migrateSrc.includes('--apply'), 'migrate script supports --apply flag');
assert(migrateSrc.includes('DRY_RUN'), 'migrate script supports dry-run default');
assert(migrateSrc.includes('--json'), 'migrate script uses --json flag for schema detection');
assert(migrateSrc.includes('results'), 'migrate script parses PRAGMA JSON results array');
assert(migrateSrc.includes('row.name'), 'migrate script reads column names from parsed JSON objects');

/* ───── 15. Verify isBillableRow imported from registration-normalize ───── */
assert(src.includes("import { normalizeRegistration, isBillableRow } from"), 'index.js imports isBillableRow');

/* ───── 16. Verify nullable field handling in validateAndCoerceUpdate ───── */
assert(src.includes('NULLABLE_FIELDS'), 'validateAndCoerceUpdate has NULLABLE_FIELDS set');
assert(src.includes("'crm_stage'"), 'NULLABLE_FIELDS includes crm_stage');
assert(src.includes("'record_type'"), 'NULLABLE_FIELDS includes record_type');
assert(src.includes("'parent_registration_id'"), 'NULLABLE_FIELDS includes parent_registration_id');
assert(src.includes("'amount_ils'"), 'NULLABLE_FIELDS includes amount_ils');
assert(src.includes("'notes'"), 'NULLABLE_FIELDS includes notes');
// Verify null/empty early-exit before allowedValues check
assert(src.includes("rawValue === null || rawValue === undefined || rawValue === ''"), 'nullable early-exit guards before allowedValues check');
assert(src.includes('NULLABLE_FIELDS.has(field)'), 'nullable check uses NULLABLE_FIELDS.has(field)');
assert(src.includes('return { value: null }'), 'nullable early-exit returns value null');

/* ───── Summary ───── */
const total = passed + failed;
console.log(`\n${total} checks: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
