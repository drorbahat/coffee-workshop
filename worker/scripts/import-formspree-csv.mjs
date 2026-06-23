#!/usr/bin/env node

/**
 * Safe Formspree CSV import template.
 *
 * Historical note:
 * The original one-off migration script contained production-specific manual
 * overlays (real names/phones/notes). Those values do not belong in the public
 * repo. If another historical import is ever needed, keep the private overlay
 * data outside git and pass it in explicitly.
 *
 * Usage:
 *   FORM_CSV=/absolute/path/to/export.csv node worker/scripts/import-formspree-csv.mjs
 *
 * Output:
 *   /tmp/import-registrations.sql
 *
 * This script only maps CSV rows as-is. It does NOT apply private manual
 * overrides, group-member additions, or spam-tab recovery rows.
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { createHash } from 'crypto';

const CSV_PATH = process.env.FORM_CSV;
const OUT_SQL = process.env.OUT_SQL || '/tmp/import-registrations.sql';

if (!CSV_PATH) {
  console.error('Missing FORM_CSV=/absolute/path/to/formspree-export.csv');
  process.exit(1);
}

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
  parts.push(current);
  return parts;
}

function escapeSql(val) {
  if (val === null || val === undefined || val === '') return 'NULL';
  const s = String(val).replace(/'/g, "''");
  return `'${s}'`;
}

function generateSubmissionId(row, idx) {
  const raw = `${row.name || ''}_${row.phone || ''}_${row.submitted || ''}_${idx}`;
  return createHash('sha256').update(raw).digest('hex').slice(0, 24);
}

function cap(val, maxlen) {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  if (!s) return null;
  return s.length > maxlen ? s.slice(0, maxlen) : s;
}

function main() {
  const csv = readFileSync(resolve(CSV_PATH), 'utf-8');
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());

  if (lines.length < 2) {
    console.error('CSV has no data rows');
    process.exit(1);
  }

  const header = parseCsvLineRobust(lines[0]).map((h) => h.trim());
  const inserts = [];

  for (let i = 1; i < lines.length; i++) {
    const vals = parseCsvLineRobust(lines[i]);
    while (vals.length < header.length) vals.push('');
    const row = {};
    header.forEach((h, idx) => { row[h] = vals[idx]; });

    const name = cap(row.name, 200);
    const phone = cap(row.phone, 40);
    if (!name || !phone) continue;

    const clientSubmissionId = cap(row.client_submission_id, 120) || generateSubmissionId(row, i);
    const edition = cap(row.edition, 200);
    const requestType = cap(row.request_type, 200) || (edition ? `registration for ${edition}` : 'unknown');

    inserts.push(`INSERT OR IGNORE INTO registrations (
      client_submission_id, name, phone, email,
      edition, request_type, workshop, workshop_date,
      source, group_registration, seats, amount_ils,
      whatsapp_status, payment_status, registration_status,
      is_spam, notes, imported_from, original_submission_id
    ) VALUES (
      ${escapeSql(clientSubmissionId)},
      ${escapeSql(name)},
      ${escapeSql(phone)},
      ${escapeSql(cap(row.email, 320))},
      ${escapeSql(edition)},
      ${escapeSql(requestType)},
      ${escapeSql(cap(row.workshop, 200))},
      ${escapeSql(cap(row.date || row.workshop_date, 200))},
      ${escapeSql(cap(row.source, 200))},
      ${escapeSql(cap(row.group || row.group_registration, 200))},
      1,
      NULL,
      'pending',
      'pending',
      'new',
      0,
      NULL,
      'formspree_csv',
      ${escapeSql(cap(row.folder_id || row.original_submission_id, 200))}
    );`);
  }

  const sql = `-- Safe Formspree CSV import from ${CSV_PATH}\n-- Generated ${new Date().toISOString()}\n-- Private manual overlays are intentionally not stored in git.\n\n${inserts.join('\n')}\n`;
  writeFileSync(OUT_SQL, sql, 'utf-8');
  console.log(`Generated ${OUT_SQL}`);
  console.log(`Rows: ${inserts.length}`);
}

main();
