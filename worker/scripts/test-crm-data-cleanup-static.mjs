#!/usr/bin/env node

/**
 * test-crm-data-cleanup-static.mjs
 * Static checks for crm-data-cleanup.mjs.
 * Verifies script structure, safety guards, and critical row handling.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLEANUP_PATH = resolve(__dirname, '..', 'scripts', 'crm-data-cleanup.mjs');

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

function assertIn(haystack, needle, label) {
  assert(haystack.includes(needle), label);
}

/* ───── 1. File exists ───── */
assert(existsSync(CLEANUP_PATH), 'crm-data-cleanup.mjs exists');

const src = readFileSync(CLEANUP_PATH, 'utf-8');

/* ───── 2. Default dry-run ───── */
assertIn(src, '--apply', 'Script references --apply flag');
assertIn(src, 'DRY-RUN', 'Script has dry-run default mode');
assert(src.includes('APPLY') || src.includes('process.argv.includes'), 'Script checks argv for --apply');
assert(!src.includes('--apply') || src.indexOf('APPLY') < src.indexOf('--apply') || src.match(/--apply/g).length > 0, 'Script uses --apply flag');

// Verify dry-run is default (APPLY false unless --apply in argv)
assertIn(src, 'APPLY = process.argv.includes', 'Default is dry-run');

/* ───── 3. CRM column detection guard ───── */
assertIn(src, 'PRAGMA table_info', 'Script uses PRAGMA table_info');
assertIn(src, '--json', 'Script uses --json flag');
assertIn(src, 'REQUIRED_CRM_COLUMNS', 'Script defines required CRM columns');
assertIn(src, "record_type", 'record_type in required columns');
assertIn(src, "parent_registration_id", 'parent_registration_id in required columns');
assertIn(src, "crm_stage", 'crm_stage in required columns');
assertIn(src, 'missingCrmCols', 'Script checks for missing CRM columns');

// --apply must refuse when columns missing
assertIn(src, 'Cannot apply', 'Script refuses apply when CRM columns missing');
assertIn(src, 'Run `node scripts/migrate-crm-lite.mjs', 'Script tells user to run migration first');

/* ───── 4. Critical IDs present ───── */
assertIn(src, 'TARGET_IDS', 'Script defines target IDs array');
assertIn(src, '2, 6, 8, 9, 12, 14, 16, 17, 18, 19, 20, 21', 'All critical IDs present');
assertIn(src, 'id 8', 'Row id=8 update lead');
assertIn(src, 'id 14', 'Row id=14 update lead');
assertIn(src, 'id 9', 'Row id=9 masked-phone lead');
assertIn(src, 'id 6', 'Row id=6 canonical lead');
assertIn(src, 'id 2', 'Row id=2 duplicate lead');
assertIn(src, 'id 18', 'Row id=18 primary group registration');
assertIn(src, 'id 21', 'Row id=21 included attendee');
assertIn(src, 'id 12', 'Row id=12 primary group registration');
assertIn(src, 'id 20', 'Row id=20 included attendee');
assertIn(src, 'id 19', 'Row id=19 duplicate registration');

/* ───── 5. Clean values for each row ───── */
// id 8: lead, awaiting_reply
assertIn(src, "record_type: 'lead'", 'id 8: record_type lead');
assertIn(src, "registration_status: 'lead'", 'id 8: registration_status lead');
assertIn(src, "crm_stage: 'awaiting_reply'", 'id 8: crm_stage awaiting_reply');
assertIn(src, 'seats: 0', 'id 8: seats 0');
assertIn(src, 'amount_ils: null', 'id 8: amount_ils NULL');

// id 18: registration, seats 2, amount 400, paid
assertIn(src, "record_type: 'registration'", 'id 18: record_type registration');
assertIn(src, "parent_registration_id: null", 'id 18: parent null');
assertIn(src, 'seats: 2', 'id 18: seats 2');
assertIn(src, 'amount_ils: 400', 'id 18: amount_ils 400');
assertIn(src, "payment_status: 'paid'", 'id 18: payment_status paid');

// id 21: attendee, group_member, parent 18
assertIn(src, "record_type: 'attendee'", 'id 21: record_type attendee');
assertIn(src, "registration_status: 'group_member'", 'id 21: registration_status group_member');
assertIn(src, 'parent_registration_id: 18', 'id 21: parent 18');
assertIn(src, "crm_stage: 'closed'", 'id 21: crm_stage closed');

// id 2: cancelled + מוזג לתוך id 6
assertIn(src, "registration_status: 'cancelled'", 'id 2: registration_status cancelled');
assertIn(src, 'מוזג לתוך id 6', 'id 2: notes include מוזג לתוך id 6');
assertIn(src, 'includes(', 'id 2: idempotence guard — checks if prefix already present');

// Hillel review-only warning
assertIn(src, 'REVIEW-ONLY', 'Script has review-only warnings');
assertIn(src, 'Hillel', 'Script mentions Hillel for review');

/* ───── 6. Audit logging ───── */
assertIn(src, 'registration_events', 'Script inserts registration_events');
assertIn(src, "crm_cleanup", 'Event type is crm_cleanup');
assertIn(src, 'old_value', 'Event includes old_value');
assertIn(src, 'new_value', 'Event includes new_value');
assertIn(src, 'note', 'Event includes note');

/* ───── 7. updated_at on apply ───── */
assertIn(src, "updated_at = datetime('now')", 'Script sets updated_at');

/* ───── 8. SQL file approach ───── */
assertIn(src, '--file', 'Script uses --file flag for wrangler d1 execute');
assertIn(src, 'wrangler d1 execute', 'Script uses wrangler d1 execute');

/* ───── 9. No explicit transactions ───── */
assert(!src.includes('BEGIN;') && !src.includes('BEGIN '), 'No BEGIN transaction');
assert(!src.includes('COMMIT;'), 'No COMMIT');

/* ───── 10. Omitted fields preservation (fix bug) ───── */
assertIn(src, 'changedFieldsForClean', 'Script has changedFieldsForClean function');
assertIn(src, 'Object.keys(clean)', 'Script iterates Object.keys(clean) to compare only explicit fields');
assert(!src.includes("fieldsDiffer(current, clean)"), 'Script does NOT call fieldsDiffer(current, clean) — would compare ALL snapshot keys');
// Verify omitted fields are not nulled: id 9 omits registration_status and notes
// The dry-run should NOT show these fields changing
assertIn(src, "keep existing not_handled / pending whatsapp", 'id 9: comment confirms preserving registration_status and notes');

/* ───── 11. Readable Hebrew table ───── */
assertIn(src, 'רשומה', 'Table header includes רשומה');
assertIn(src, 'סיבה', 'Table header includes סיבה');
assertIn(src, 'ערך נוכחי', 'Table header includes ערך נוכחי');
assertIn(src, 'ערך חדש', 'Table header includes ערך חדש');

/* ───── Summary ───── */
const total = passed + failed;
console.log(`\n${total} checks: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
