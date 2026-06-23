#!/usr/bin/env node

/**
 * crm-data-cleanup.mjs
 * Safe CRM data cleanup — dry-run by default, --apply to mutate.
 *
 * Requirements:
 *   - Detects CRM columns via PRAGMA table_info; refuses --apply if missing.
 *   - Fetches critical rows from remote D1, builds deterministic plan.
 *   - Prints readable Hebrew dry-run table with id/name/reason/old/new.
 *   - On apply: only changed fields, sets updated_at, writes registration_events.
 *   - No mutations on dry-run. No BEGIN/COMMIT (D1 rejects them).
 *
 * Usage:
 *   node scripts/crm-data-cleanup.mjs              # dry-run
 *   node scripts/crm-data-cleanup.mjs --dry-run    # explicit dry-run
 *   node scripts/crm-data-cleanup.mjs --apply      # apply
 */

import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync, unlinkSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKER_DIR = resolve(__dirname, '..');

const APPLY = process.argv.includes('--apply');

const REQUIRED_CRM_COLUMNS = ['record_type', 'parent_registration_id', 'crm_stage'];

const TARGET_IDS = [2, 6, 8, 9, 12, 14, 16, 17, 18, 19, 20, 21];

/* ───── Helpers ───── */

function sqlEscape(val) {
  if (val === null || val === undefined) return 'NULL';
  return `'${String(val).replace(/'/g, "''")}'`;
}

function queryD1(sql) {
  const raw = execSync(
    `npx wrangler d1 execute coffee_workshop_registrations --remote --json --command ${JSON.stringify(sql)}`,
    { cwd: WORKER_DIR, encoding: 'utf-8', timeout: 30000 }
  );
  const envelope = JSON.parse(raw);
  if (!envelope || !Array.isArray(envelope)) {
    throw new Error('Unexpected D1 response shape');
  }
  const block = envelope[0];
  if (!block || !block.success) {
    throw new Error('D1 query failed: ' + (block ? JSON.stringify(block) : 'empty'));
  }
  return block.results || [];
}

function padRight(s, w) {
  s = String(s);
  return s.length >= w ? s : s + ' '.repeat(w - s.length);
}

function trunc(s, max) {
  s = String(s);
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}

/** Snapshot a row's relevant fields */
function snapRow(row) {
  return {
    record_type: row.record_type || null,
    registration_status: row.registration_status || null,
    crm_stage: row.crm_stage || null,
    parent_registration_id: row.parent_registration_id ?? null,
    seats: row.seats != null ? Number(row.seats) : null,
    amount_ils: row.amount_ils != null ? Number(row.amount_ils) : null,
    payment_status: row.payment_status || null,
    notes: row.notes || null,
  };
}

/**
 * Compare only the fields that are explicitly listed in `clean`.
 * Fields omitted from `clean` are NOT compared and will NOT appear in the diff,
 * ensuring they are preserved as-is in the database.
 */
function changedFieldsForClean(row, clean) {
  const changed = {};
  for (const key of Object.keys(clean)) {
    const va = snapRow(row)[key];
    const vb = clean[key];
    // Coerce comparison: treat null/undefined/empty as equivalent
    const na = (va === null || va === undefined || va === '') ? null : va;
    const nb = (vb === null || vb === undefined || vb === '') ? null : vb;
    if (na !== nb) {
      changed[key] = { old: va, new: vb };
    }
  }
  return changed;
}

function fieldsDiffer(a, b) {
  const changed = {};
  for (const key of Object.keys(a)) {
    const va = a[key];
    const vb = b[key];
    // Coerce comparison: treat null/undefined/empty as equivalent
    const na = (va === null || va === undefined || va === '') ? null : va;
    const nb = (vb === null || vb === undefined || vb === '') ? null : vb;
    if (na !== nb) {
      changed[key] = { old: a[key], new: b[key] };
    }
  }
  return changed;
}

/** Build registration_events INSERT for one row, one field change */
function eventSql(regId, field, oldVal, newVal, note) {
  return `INSERT INTO registration_events (registration_id, event_type, old_value, new_value, note) VALUES (${regId}, 'crm_cleanup', ${sqlEscape(oldVal != null ? String(oldVal) : '')}, ${sqlEscape(newVal != null ? String(newVal) : '')}, ${sqlEscape(note)});`;
}

/* ───── Main ───── */

function main() {
  console.log(`\n=== CRM Data Cleanup ===`);
  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log('');

  /* 1. Check CRM columns exist via PRAGMA ──────────────────── */
  console.log('Checking CRM columns in remote D1…');
  let existingCols = [];
  try {
    const raw = execSync(
      `npx wrangler d1 execute coffee_workshop_registrations --remote --json --command "PRAGMA table_info(registrations);"`,
      { cwd: WORKER_DIR, encoding: 'utf-8', timeout: 30000 }
    );
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0 && Array.isArray(parsed[0].results)) {
      for (const row of parsed[0].results) {
        if (row && typeof row.name === 'string') {
          existingCols.push(row.name);
        }
      }
    }
  } catch (err) {
    console.error('Failed to query schema:', err.message);
    process.exit(1);
  }

  const missingCrmCols = REQUIRED_CRM_COLUMNS.filter(c => !existingCols.includes(c));

  if (missingCrmCols.length > 0) {
    console.log(`CRM columns missing: ${missingCrmCols.join(', ')}`);
    if (APPLY) {
      console.error('\n❌ Cannot apply: CRM-lite columns not present.');
      console.error('   Run `node scripts/migrate-crm-lite.mjs --apply` first.');
      process.exit(1);
    }
    console.log('   (dry-run only — --apply will be refused)\n');
  } else {
    console.log('All CRM columns exist.\n');
  }

  /* 2. Fetch target rows ──────────────────────────────────── */
  console.log(`Fetching ${TARGET_IDS.length} target rows from remote D1…`);
  let rows;
  try {
    rows = queryD1(
      `SELECT * FROM registrations WHERE id IN (${TARGET_IDS.join(',')})`
    );
  } catch (err) {
    console.error('Failed to fetch rows:', err.message);
    process.exit(1);
  }

  if (rows.length === 0) {
    console.log('No rows found. Exiting.');
    process.exit(0);
  }

  // Index by id
  const rowById = {};
  for (const r of rows) {
    rowById[r.id] = r;
  }

  // Warn about missing ids
  const foundIds = rows.map(r => r.id);
  const missingIds = TARGET_IDS.filter(id => !foundIds.includes(id));
  if (missingIds.length > 0) {
    console.log(`  Note: IDs not found: ${missingIds.join(', ')}\n`);
  }

  console.log(`Fetched ${rows.length} rows.\n`);

  /* 3. Build the deterministic plan ────────────────────────── */
  const plan = [];  // { id, name, clean: {fields}, reason }

  // id 8 — חסידה (lead, awaiting_reply)
  const r8 = rowById[8];
  if (r8) {
    plan.push({
      id: 8,
      name: r8.name || 'חסידה',
      clean: {
        record_type: 'lead',
        registration_status: 'lead',
        crm_stage: 'awaiting_reply',
        seats: 0,
        amount_ils: null,
        payment_status: 'pending',
      },
      reason: 'סיווג כליד, ליד בהמתנה לתשובה',
    });
  }

  // id 14 — יפתח (same as 8)
  const r14 = rowById[14];
  if (r14) {
    plan.push({
      id: 14,
      name: r14.name || 'יפתח',
      clean: {
        record_type: 'lead',
        registration_status: 'lead',
        crm_stage: 'awaiting_reply',
        seats: 0,
        amount_ils: null,
        payment_status: 'pending',
      },
      reason: 'סיווג כליד, ליד בהמתנה לתשובה',
    });
  }

  // id 9 — Liraz (lead, keep not_handled/pending WA)
  const r9 = rowById[9];
  if (r9) {
    plan.push({
      id: 9,
      name: r9.name || 'Liraz',
      clean: {
        record_type: 'lead',
        seats: 0,
        amount_ils: null,
        // keep existing not_handled / pending whatsapp
      },
      reason: 'סיווג כליד, איפוס מושבים וסכום',
    });
  }

  // id 6 — דאלי גורדון (canonical)
  const r6 = rowById[6];
  if (r6) {
    plan.push({
      id: 6,
      name: r6.name || 'דאלי גורדון',
      clean: {
        record_type: 'lead',
        registration_status: 'lead',
        crm_stage: 'awaiting_reply',
        seats: 0,
        amount_ils: null,
        payment_status: 'pending',
      },
      reason: 'רשומה קנונית — סיווג כליד פעיל',
    });
  }

  // id 2 — דאלי duplicate → cancelled
  const r2 = rowById[2];
  if (r2) {
    const existingNotes = (r2.notes || '').trim();
    const newNote = existingNotes.includes('מוזג לתוך id 6')
      ? existingNotes
      : `מוזג לתוך id 6. ${existingNotes}`.trim();
    plan.push({
      id: 2,
      name: r2.name || 'דאלי (כפיל)',
      clean: {
        registration_status: 'cancelled',
        seats: 0,
        amount_ils: null,
        notes: newNote,
      },
      reason: 'כפיל של id 6 — ביטול וסימון כאוחד',
    });
  }

  // id 18 — Shnir (registration, 2 seats, 400 ILS, paid)
  const r18 = rowById[18];
  if (r18) {
    plan.push({
      id: 18,
      name: r18.name || 'שניר פוקס',
      clean: {
        record_type: 'registration',
        parent_registration_id: null,
        seats: 2,
        amount_ils: 400,
        payment_status: 'paid',
      },
      reason: 'הרשמה ראשית — 2 מושבים שולם',
    });
  }

  // id 21 — Yonatan (attendee, group_member, parent 18)
  const r21 = rowById[21];
  if (r21) {
    plan.push({
      id: 21,
      name: r21.name || 'יונתן',
      clean: {
        record_type: 'attendee',
        registration_status: 'group_member',
        parent_registration_id: 18,
        seats: 0,
        amount_ils: null,
        payment_status: 'pending',
        crm_stage: 'closed',
      },
      reason: 'משתתף בהרשמת שניר (id 18)',
    });
  }

  // id 12 — Yana (registration, 2 seats, 400 ILS, paid)
  const r12 = rowById[12];
  if (r12) {
    plan.push({
      id: 12,
      name: r12.name || 'יאנה',
      clean: {
        record_type: 'registration',
        parent_registration_id: null,
        seats: 2,
        amount_ils: 400,
        payment_status: 'paid',
      },
      reason: 'הרשמה ראשית — 2 מושבים שולם',
    });
  }

  // id 20 — Hila (attendee, group_member, parent 12)
  const r20 = rowById[20];
  if (r20) {
    plan.push({
      id: 20,
      name: r20.name || 'הילה',
      clean: {
        record_type: 'attendee',
        registration_status: 'group_member',
        parent_registration_id: 12,
        seats: 0,
        amount_ils: null,
        payment_status: 'pending',
        crm_stage: 'closed',
      },
      reason: 'משתתפת בהרשמת יאנה (id 12)',
    });
  }

  // id 19 — Yana duplicate (cancelled, pending)
  const r19 = rowById[19];
  if (r19) {
    plan.push({
      id: 19,
      name: r19.name || 'יאנה (כפיל)',
      clean: {
        registration_status: 'cancelled',
        payment_status: 'pending',
        amount_ils: null,
        seats: 0,
        crm_stage: 'closed',
      },
      reason: 'כפיל של יאנה — בוטל, סוגר',
    });
  }

  /* 4. Build change sets (current → clean) ─────────────────── */
  const changes = [];  // { id, name, reason, diffs: {field: {old, new}} }

  for (const entry of plan) {
    const row = rowById[entry.id];
    if (!row) continue;

    const clean = entry.clean;
    const diffs = changedFieldsForClean(row, clean);

    changes.push({
      id: entry.id,
      name: entry.name,
      reason: entry.reason,
      diffs,
      hasChanges: Object.keys(diffs).length > 0,
    });
  }

  /* 5. Review-only warnings (ids 16, 17 — Hillel) ──────────── */
  const reviewIds = [16, 17];
  for (const id of reviewIds) {
    const row = rowById[id];
    if (row) {
      console.log(`⚠  REVIEW-ONLY: id=${id} ${row.name || '(Hillel)'} — no automatic changes. Manual review needed.`);
    }
  }
  if (reviewIds.some(id => rowById[id])) {
    console.log('');
  }

  /* 6. Print dry-run table ─────────────────────────────────── */
  console.log(`${'='.repeat(100)}`);
  console.log(`${APPLY ? 'APPLY PLAN' : 'DRY-RUN PLAN'}`);
  console.log(`${'='.repeat(100)}`);
  console.log('');

  const totalChanges = changes.filter(c => c.hasChanges).length;
  const totalNoChanges = changes.filter(c => !c.hasChanges).length;

  // Table header
  console.log(
    padRight('ID', 3) + ' ' +
    padRight('שם', 16) + ' ' +
    padRight('סיבה', 30) + ' ' +
    padRight('שדה', 22) + ' ' +
    padRight('ערך נוכחי', 16) + ' ' +
    padRight('ערך חדש', 16)
  );
  console.log('-'.repeat(100));

  for (const c of changes) {
    if (!c.hasChanges) {
      console.log(
        padRight(String(c.id), 3) + ' ' +
        padRight(trunc(c.name, 14), 16) + ' ' +
        padRight(trunc(c.reason, 28), 30) + ' ' +
        '✓  אין שינויים'
      );
      continue;
    }

    const fields = Object.keys(c.diffs);
    // Print first line with full info
    const firstField = fields[0];
    const d = c.diffs[firstField];
    console.log(
      padRight(String(c.id), 3) + ' ' +
      padRight(trunc(c.name, 14), 16) + ' ' +
      padRight(trunc(c.reason, 28), 30) + ' ' +
      padRight(firstField, 22) + ' ' +
      padRight(trunc(String(d.old ?? 'NULL'), 14), 16) + ' ' +
      padRight(trunc(String(d.new ?? 'NULL'), 14), 16)
    );

    // Remaining fields (indented, no id/name/reason)
    for (let i = 1; i < fields.length; i++) {
      const df = c.diffs[fields[i]];
      console.log(
        '    ' + padRight('', 16) + ' ' +
        padRight('', 30) + ' ' +
        padRight(fields[i], 22) + ' ' +
        padRight(trunc(String(df.old ?? 'NULL'), 14), 16) + ' ' +
        padRight(trunc(String(df.new ?? 'NULL'), 14), 16)
      );
    }
  }

  console.log('');
  console.log(`Summary: ${totalChanges} rows with changes, ${totalNoChanges} rows already clean.`);
  if (reviewIds.some(id => rowById[id])) {
    console.log(`⚠  ${reviewIds.filter(id => rowById[id]).length} row(s) flagged for manual review (Hillel).`);
  }
  console.log('');

  if (!APPLY) {
    console.log('--- Dry-run complete. Run with --apply to execute changes. ---');
    process.exit(0);
  }

  /* 7. APPLY ───────────────────────────────────────────────── */
  console.log('=== Applying updates ===\n');

  let applied = 0;
  let errors = 0;
  let skipped = 0;

  for (const c of changes) {
    if (!c.hasChanges) {
      skipped++;
      continue;
    }

    const id = c.id;
    const fields = Object.keys(c.diffs);

    // Build UPDATE SET clause for changed fields + updated_at
    const setClauses = [];
    for (const field of fields) {
      const newVal = c.diffs[field].new;
      if (field === 'notes') {
        setClauses.push(`notes = ${sqlEscape(newVal)}`);
      } else {
        setClauses.push(`${field} = ${sqlEscape(newVal)}`);
      }
    }
    setClauses.push("updated_at = datetime('now')");

    const updateSql = `UPDATE registrations SET ${setClauses.join(', ')} WHERE id = ${id};`;

    // Build event inserts for each changed field
    const eventInserts = [];
    for (const field of fields) {
      const d = c.diffs[field];
      eventInserts.push(eventSql(id, field, d.old, d.new, c.reason));
    }

    // Write single SQL file and execute
    const fullSql = [updateSql, ...eventInserts].join('\n');
    const tmpPath = `/tmp/crm-cleanup-id${id}.sql`;

    try {
      writeFileSync(tmpPath, fullSql, 'utf-8');
      const result = execSync(
        `npx wrangler d1 execute coffee_workshop_registrations --remote --file ${tmpPath}`,
        { cwd: WORKER_DIR, encoding: 'utf-8', timeout: 30000 }
      );
      const outLines = result.trim().split('\n').filter(l => l.trim());
      const lastLine = outLines[outLines.length - 1] || '';
      console.log(`✓ id=${id} ${c.name} — ${Object.keys(c.diffs).length} fields updated (${lastLine})`);
      applied++;

      // Clean up temp file
      try { unlinkSync(tmpPath); } catch { /* ignore */ }
    } catch (err) {
      console.error(`✗ id=${id} ${c.name}: ${err.stderr?.trim() || err.message}`);
      errors++;
      try { unlinkSync(tmpPath); } catch { /* ignore */ }
    }
  }

  console.log(`\nDone. ${applied} applied, ${skipped} skipped (no changes), ${errors} errors.`);
}

main();
