#!/usr/bin/env node

/**
 * Import Formspree CSV into local D1.
 * Usage: node scripts/import-formspree-csv.mjs
 *
 * Generates /tmp/import-registrations.sql then applies it via wrangler.
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV_PATH = resolve('/home/dror/formspree_submissions_xwvzzzbj_2026-06-21.csv');
const OUT_SQL = '/tmp/import-registrations.sql';
const WORKER_DIR = resolve(__dirname, '..');

// ---- Manual overlays from tracker ----
// Keyed by (phone, edition) or (name) — applied AFTER CSV import
const OVERLAYS = new Map();

// 1. שניר פוקס — registered herself + husband
OVERLAYS.set('0502234126__URU · תל אביב', {
  seats: 2,
  amount_ils: 400,
  payment_status: 'bit_request_sent',
  notes: 'נרשמה עבורה ועבור בעלה יונתן נובוטני',
  group_registration: 'הרשמת קבוצה',
});

// 2. יונתן נובוטני — husband of Shnir, separate row
// We insert him as a separate row with seats=0 and a note linking to Shnir

// 3. יאנה סיליוטין — two rows: early signup + re-registration
OVERLAYS.set('0542519667__URU · תל אביב', {
  payment_status: 'pending',
  registration_status: 'needs_payment_followup',
});

// 4. הילה לוין — not in CSV (was in Formspree spam), mark as manual import
// We'll add her as a manual row

// 5. Early URU signups — whatsapp_status = outreach_sent
const EARLY_URU_PHONES = ['0509862802', '0502373983', '0509024030', '0534277207'];
for (const phone of EARLY_URU_PHONES) {
  OVERLAYS.set(`${phone}__URU · תל אביב`, { whatsapp_status: 'outreach_sent' });
}

// 6. General filter update leads — whatsapp_status = outreach_sent
const FILTER_LEADS = ['0502057819', '0528568210', '0544643263'];
for (const phone of FILTER_LEADS) {
  // N.B: 0544643263 appears twice (Dali and Dror), both get outreach_sent per tracker
  OVERLAYS.set(`${phone}__`, { whatsapp_status: 'outreach_sent' });
}

// 7. Liraz Hashai — phone masked in Formspree, not actionable
// No overlay for Liraz — will be handled inline in the loop.


/** Robust CSV line parser supporting escaped double-quotes ("") per RFC 4180. */
function parseCsvLineRobust(line) {
  const parts = [];
  let current = '';
  let inQuotes = false;
  let i = 0;
  const len = line.length;
  while (i < len) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < len && line[i + 1] === '"') {
        // Escaped double-quote inside quoted field: add one " and skip next
        current += '"';
        i += 2;
        continue;
      }
      inQuotes = !inQuotes;
      i++;
      continue;
    }
    if (ch === ',' && !inQuotes) {
      parts.push(current);
      current = '';
      i++;
      continue;
    }
    current += ch;
    i++;
  }
  // last field
  parts.push(current);
  return parts;
}

function escape(val) {
  if (val === null || val === undefined) return 'NULL';
  const s = String(val).replace(/'/g, "''");
  return `'${s}'`;
}

function generateSubmissionId(row, idx) {
  const raw = `${row.name}_${row.phone}_${row.submitted}_${idx}`;
  return createHash('md5').update(raw).digest('hex').slice(0, 16);
}

function main() {
  const csv = readFileSync(CSV_PATH, 'utf-8');
  const lines = csv.split('\n').filter(l => l.trim());

  if (lines.length < 2) {
    console.error('CSV has no data rows');
    process.exit(1);
  }

  const header = parseCsvLineRobust(lines[0]);
  console.log('CSV headers:', header);

  const inserts = [];
  const manualRows = [];
  let rowCount = 0;

  for (let i = 1; i < lines.length; i++) {
    const vals = parseCsvLineRobust(lines[i]);
    // Ensure vals matches header length; if fewer, pad with empty
    while (vals.length < header.length) vals.push('');
    const row = {};
    header.forEach((h, idx) => { row[h.trim()] = vals[idx]; });
    rowCount++;

    const name = row.name || '';
    const phone = row.phone || '';
    const email = row.email || '';
    const submitted = row.submitted || '';
    const requestType = row.request_type || '';
    const edition = row.edition || '';
    const workshop = row.workshop || '';
    const workshopDate = row.date || '';
    const source = row.source || '';
    const folderId = row.folder_id || '';
    const csvGroup = row.group || row.group_registration || '';

    // Determine request_type if empty
    const resolvedRequestType = requestType || (edition ? `registration for ${edition}` : 'unknown');

    // Map source
    const resolvedSource = source || null;

    // Determine whatsapp_status based on tracker
    const overlayKey = `${phone}__${edition}`;
    const overlay = OVERLAYS.get(overlayKey) || {};

    // For filter leads, overlay may match any edition — check phone-only key too
    const phoneOnlyKey = `${phone}__`;
    const phoneOverlay = OVERLAYS.get(phoneOnlyKey) || {};

    const mergedOverlay = { ...phoneOverlay, ...overlay };

    // Build client_submission_id
    const clientSubmissionId = generateSubmissionId(row, i);

    // Determine seats and amount
    let seats = mergedOverlay.seats || 1;
    let amountIls = mergedOverlay.amount_ils !== undefined ? mergedOverlay.amount_ils : null;
    let notes = mergedOverlay.notes || null;
    let paymentStatus = mergedOverlay.payment_status || 'pending';
    let registrationStatus = mergedOverlay.registration_status || 'new';
    let whatsappStatus = mergedOverlay.whatsapp_status || 'pending';
    let groupReg = mergedOverlay.group_registration || csvGroup || null;

    // Check if this is a Liraz row (espresso update — not handled)
    const isLiraz = name.includes('Liraz') || name.includes('לירז');

    if (isLiraz) {
      // Liraz: masked phone from Formspree, not actionable
      registrationStatus = 'not_handled';
      notes = 'טלפון מסוך מ-Formspree (+972****4751); ליד אספרסו, לא טופל כרגע';
      seats = 1;
      amountIls = null;
      paymentStatus = 'pending';
      whatsappStatus = 'pending';
      // Keep the masked phone as-is from CSV, no fabricated number
    }

    inserts.push(`INSERT OR IGNORE INTO registrations (
      client_submission_id, name, phone, email,
      edition, request_type, workshop, workshop_date,
      source, group_registration, seats, amount_ils,
      whatsapp_status, payment_status, registration_status,
      is_spam, notes, imported_from, original_submission_id
    ) VALUES (
      ${escape(clientSubmissionId)},
      ${escape(name)},
      ${escape(phone)},
      ${escape(email || null)},
      ${escape(edition || null)},
      ${escape(resolvedRequestType)},
      ${escape(workshop || null)},
      ${escape(workshopDate || null)},
      ${escape(resolvedSource)},
      ${escape(groupReg)},
      ${seats},
      ${amountIls !== null ? amountIls : 'NULL'},
      ${escape(whatsappStatus)},
      ${escape(paymentStatus)},
      ${escape(registrationStatus)},
      0,
      ${escape(notes)},
      'formspree_csv',
      ${escape(folderId || null)}
    );`);
  }

  // ---- Manual-only rows not in CSV ----

  // Hila Levin — came from Formspree spam, real URU 3.7 lead
  // Deterministic client_submission_id
  manualRows.push(`INSERT OR IGNORE INTO registrations (
    client_submission_id, name, phone, email,
    edition, request_type, workshop, workshop_date,
    source, group_registration, seats, amount_ils,
    whatsapp_status, payment_status, registration_status,
    is_spam, notes, imported_from
  ) VALUES (
    ${escape('manual_hila_levin_2026_06_21')},
    'הילה לוין',
    '0543178959',
    NULL,
    'URU · תל אביב',
    'הרשמה — URU · תל אביב',
    'חליטות ביתיות',
    'שישי 3.7 11:00–12:30',
    'חבר/ה',
    NULL,
    1, 200,
    'pending', 'pending', 'new',
    0,
    'הרשמה אמיתית ל-URU 3.7; הייתה ב-Spam של Formspree. הופיעה ב-21.6 15:33',
    'formspree_spam/manual'
  );`);

  // Yonatan Novotny — husband of Shnir, separate row
  // Deterministic client_submission_id with group_registration
  manualRows.push(`INSERT OR IGNORE INTO registrations (
    client_submission_id, name, phone, email,
    edition, request_type, workshop, workshop_date,
    source, group_registration, seats, amount_ils,
    whatsapp_status, payment_status, registration_status,
    is_spam, notes, imported_from
  ) VALUES (
    ${escape('manual_yonatan_novotny_under_shnir')},
    'יונתן נובוטני',
    '0526508860',
    NULL,
    'URU · תל אביב',
    'הרשמה — URU · תל אביב',
    'חליטות ביתיות',
    'שישי 3.7 11:00–12:30',
    'אינסטגרם',
    'כלול בהרשמת שניר',
    0, 0,
    'pending', 'pending', 'registered_under_shnir',
    0,
    'בעלה של שניר פוקס; כלול תחת הרישום של שניר (2 מושבים, 400 ש"ח). בטלפון זה ניתן ליצור קשר נפרד.',
    'manual'
  );`);

  // Write SQL file
  let sql = `-- Import from ${CSV_PATH}\n-- Generated ${new Date().toISOString()}\n\n`;
  sql += `-- CSV rows (${inserts.length})\n`;
  sql += inserts.join('\n') + '\n\n';
  sql += `-- Manual rows (${manualRows.length})\n`;
  sql += manualRows.join('\n') + '\n';

  writeFileSync(OUT_SQL, sql, 'utf-8');
  console.log(`\n📄 Generated ${OUT_SQL}`);
  console.log(`   CSV rows: ${inserts.length}`);
  console.log(`   Manual rows: ${manualRows.length}`);
  console.log(`   Total INSERT OR IGNORE statements: ${inserts.length + manualRows.length}`);
}

main();
