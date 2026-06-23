#!/usr/bin/env node

/**
 * Backfill created_at from Formspree CSV timestamps.
 *
 * Matches each CSV row to exactly one DB row by priority key, then
 * UPDATEs by exact D1 id — safely, without broad WHERE clauses.
 *
 * Usage:
 *   node scripts/backfill-created-at-from-formspree.mjs             # dry-run
 *   node scripts/backfill-created-at-from-formspree.mjs --apply     # apply
 *   node scripts/backfill-created-at-from-formspree.mjs --limit 5   # dry-run first 5
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKER_DIR = resolve(__dirname, '..');

const CSV_PATH = resolve('/home/dror/formspree_submissions_xwvzzzbj_2026-06-21.csv');

const APPLY  = process.argv.includes('--apply');
const LIMIT  = (() => {
  const idx = process.argv.indexOf('--limit');
  if (idx !== -1 && idx + 1 < process.argv.length) {
    const n = parseInt(process.argv[idx + 1], 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
})();

/* ───── Helpers ───── */

/** Parse "10:08 AM - 30 May 2026" → ISO datetime "2026-05-30 10:08:00" */
function parseFormspreeTimestamp(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)\s*-\s*(\d{1,2})\s+(\w+)\s+(\d{4})$/i);
  if (!m) return null;

  let hours = parseInt(m[1], 10);
  const minutes = parseInt(m[2], 10);
  const ampm = m[3].toUpperCase();
  const day = parseInt(m[4], 10);
  const monthName = m[5];
  const year = parseInt(m[6], 10);

  if (ampm === 'PM' && hours < 12) hours += 12;
  if (ampm === 'AM' && hours === 12) hours = 0;

  const months = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
    apr: 4, april: 4, may: 5, jun: 6, june: 6,
    jul: 7, july: 7, aug: 8, august: 8, sep: 9, september: 9,
    oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
  };
  const month = months[monthName.toLowerCase()];
  if (!month) return null;

  const pad = (n) => String(n).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)} ${pad(hours)}:${pad(minutes)}:00`;
}

/** Strip non-digit chars */
function normalizePhone(raw) {
  if (!raw) return '';
  return String(raw).replace(/[^0-9]/g, '');
}

/** RFC 4180 CSV line parser */
function parseCsvLineRobust(line) {
  const parts = [];
  let current = '';
  let inQuotes = false;
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
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

/** Escape a string for a single-quoted SQL literal */
function sqlEscape(val) {
  if (val === null || val === undefined) return 'NULL';
  return `'${String(val).replace(/'/g, "''")}'`;
}

/** Query remote D1, parse the JSON envelope, return results array */
function queryD1(sql) {
  const raw = execSync(
    `npx wrangler d1 execute coffee_workshop_registrations --remote --json --command ${JSON.stringify(sql)}`,
    { cwd: WORKER_DIR, encoding: 'utf-8', timeout: 30000 }
  );
  const envelope = JSON.parse(raw);
  if (!envelope || !Array.isArray(envelope)) {
    throw new Error('Unexpected D1 response shape');
  }
  // Single envelope: [{ results: [...], success: true, ... }]
  const block = envelope[0];
  if (!block || !block.success) {
    throw new Error('D1 query failed: ' + (block ? JSON.stringify(block) : 'empty'));
  }
  return block.results || [];
}

/* ───── Main ───── */

function main() {
  /* 1. Read CSV ──────────────────────────────────────────── */
  let csv = readFileSync(CSV_PATH, 'utf-8');
  // Strip BOM if present
  if (csv.charCodeAt(0) === 0xFEFF) {
    csv = csv.slice(1);
  }
  const lines = csv.split('\n').filter(l => l.trim());
  if (lines.length < 2) {
    console.error('CSV has no data rows');
    process.exit(1);
  }

  const header = parseCsvLineRobust(lines[0]).map(h => h.trim());
  console.log('CSV headers:', header, '\n');

  // Parse CSV rows
  const csvRows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCsvLineRobust(lines[i]);
    while (vals.length < header.length) vals.push('');
    const row = {};
    header.forEach((h, idx) => { row[h] = vals[idx].trim(); });
    csvRows.push(row);
  }

  console.log(`Parsed ${csvRows.length} rows from CSV\n`);

  /* 2. Build CSV entries with parsed timestamps ─────────── */
  const csvEntries = csvRows.map((row, idx) => ({
    idx,
    name: (row.name || '').trim(),
    phone: normalizePhone(row.phone),
    email: (row.email || '').trim(),
    folder_id: (row.folder_id || '').trim(),
    edition: (row.edition || '').trim(),
    workshop: (row.workshop || '').trim(),
    workshop_date: (row.date || '').trim(),
    submitted: (row.submitted || '').trim(),
    created_at: parseFormspreeTimestamp(row.submitted),
  }));

  const datedEntries = csvEntries.filter(e => e.created_at);
  console.log(`${datedEntries.length} entries with parseable timestamps`);

  /* 3. Query remote D1 ──────────────────────────────────── */
  console.log('\nQuerying remote D1 …');
  let dbRows;
  try {
    dbRows = queryD1(
      'SELECT id, created_at, name, phone, email, edition, workshop, workshop_date, original_submission_id FROM registrations'
    );
  } catch (err) {
    console.error('Failed to query D1:', err.message);
    process.exit(1);
  }
  console.log(`Fetched ${dbRows.length} rows from D1\n`);

  // Normalize DB rows: strip \r from original_submission_id, normalize phone
  const dbRowsNormalized = dbRows.map(r => ({
    ...r,
    phone: normalizePhone(r.phone || ''),
    orig_sub_id: (r.original_submission_id || '').replace(/\r$/, ''),
  }));

  /* 4. Build lookup indices ─────────────────────────────── */
  // (a) by original_submission_id (folder_id)
  const indexBySubId = new Map();
  for (const r of dbRowsNormalized) {
    if (r.orig_sub_id) {
      indexBySubId.set(r.orig_sub_id, r);
    }
  }

  // (b) by phone tail (last 6 digits) + workshop_date
  const indexByPhoneDate = new Map();
  for (const r of dbRowsNormalized) {
    const phoneTail = r.phone.slice(-6);
    if (phoneTail && r.workshop_date) {
      const key = `${phoneTail}||${r.workshop_date}`;
      if (!indexByPhoneDate.has(key)) indexByPhoneDate.set(key, []);
      indexByPhoneDate.get(key).push(r);
    }
  }

  // (c) by name + phone tail
  const indexByNamePhone = new Map();
  for (const r of dbRowsNormalized) {
    const phoneTail = r.phone.slice(-6);
    if (r.name && phoneTail) {
      const key = `${r.name}||${phoneTail}`;
      if (!indexByNamePhone.has(key)) indexByNamePhone.set(key, []);
      indexByNamePhone.get(key).push(r);
    }
  }

  // (d) by name + edition
  const indexByNameEdition = new Map();
  for (const r of dbRowsNormalized) {
    if (r.name && r.edition) {
      const key = `${r.name}||${r.edition}`;
      if (!indexByNameEdition.has(key)) indexByNameEdition.set(key, []);
      indexByNameEdition.get(key).push(r);
    }
  }

  /* 5. Match each CSV entry ─────────────────────────────── */
  const matches = [];      // { dbRow, csvEntry, reason }
  const ambiguous = [];    // { csvEntry, candidates, reason }
  const unmatched = [];    // { csvEntry, reason }

  for (const entry of datedEntries) {
    let bestMatch = null;
    let bestReason = '';

    // (a) folder_id == original_submission_id
    if (entry.folder_id) {
      const dbRow = indexBySubId.get(entry.folder_id);
      if (dbRow) {
        bestMatch = dbRow;
        bestReason = `folder_id → original_submission_id = ${entry.folder_id}`;
      }
    }

    // (b) phone tail + workshop_date
    if (!bestMatch && entry.phone && entry.workshop_date) {
      const key = `${entry.phone.slice(-6)}||${entry.workshop_date}`;
      const candidates = indexByPhoneDate.get(key);
      if (candidates) {
        if (candidates.length === 1) {
          bestMatch = candidates[0];
          bestReason = `phone+date (${entry.phone.slice(-6)} + ${entry.workshop_date})`;
        } else {
          ambiguous.push({ csvEntry: entry, candidates, reason: `phone+date ambiguous (${key})` });
          continue;
        }
      }
    }

    // (c) name + phone tail
    if (!bestMatch && entry.name && entry.phone) {
      const key = `${entry.name}||${entry.phone.slice(-6)}`;
      const candidates = indexByNamePhone.get(key);
      if (candidates) {
        if (candidates.length === 1) {
          bestMatch = candidates[0];
          bestReason = `name+phone (${entry.name} + ...${entry.phone.slice(-6)})`;
        } else {
          ambiguous.push({ csvEntry: entry, candidates, reason: `name+phone ambiguous (${key})` });
          continue;
        }
      }
    }

    // (d) name + edition
    if (!bestMatch && entry.name && entry.edition) {
      const key = `${entry.name}||${entry.edition}`;
      const candidates = indexByNameEdition.get(key);
      if (candidates) {
        if (candidates.length === 1) {
          bestMatch = candidates[0];
          bestReason = `name+edition (${entry.name} + ${entry.edition})`;
        } else {
          ambiguous.push({ csvEntry: entry, candidates, reason: `name+edition ambiguous (${key})` });
          continue;
        }
      }
    }

    if (!bestMatch) {
      unmatched.push({ csvEntry: entry, reason: 'no match found' });
      continue;
    }

    // Check if created_at already equals target
    const alreadyEqual = bestMatch.created_at === entry.created_at;

    matches.push({
      dbRow: bestMatch,
      csvEntry: entry,
      reason: bestReason,
      alreadyEqual,
    });
  }

  /* 6. Apply limit (if set) — trim matches only ──────────── */
  let displayMatches = matches;
  if (LIMIT !== null) {
    displayMatches = matches.slice(0, LIMIT);
  }

  /* 7. Print dry-run / apply summary ────────────────────── */
  const mode = APPLY ? 'APPLY' : 'DRY-RUN';
  console.log(`${'='.repeat(80)}`);
  console.log(`${mode}  (--limit: ${LIMIT ?? 'none'})`);
  console.log(`${'='.repeat(80)}`);
  console.log('');

  if (displayMatches.length === 0) {
    console.log('No updates to show.\n');
  } else {
    // Compact table header
    console.log(
      padRight('ID', 4) + ' ' +
      padRight('Name', 20) + ' ' +
      padRight('Current created_at', 22) + ' ' +
      padRight('New created_at', 22) + ' ' +
      'Match reason'
    );
    console.log('-'.repeat(80));

    for (const m of displayMatches) {
      const skipMark = m.alreadyEqual ? ' (SKIP — same)' : '';
      console.log(
        padRight(String(m.dbRow.id), 4) + ' ' +
        padRight(trunc(m.csvEntry.name, 18), 20) + ' ' +
        padRight(m.dbRow.created_at || '(null)', 22) + ' ' +
        padRight(m.csvEntry.created_at, 22) + ' ' +
        m.reason + skipMark
      );
    }
    console.log('');
  }

  /* Unmatched */
  if (unmatched.length > 0) {
    console.log(`⚠  Unmatched (${unmatched.length}):`);
    for (const u of unmatched) {
      console.log(`   ${u.csvEntry.name || '(no name)'}  phone=${u.csvEntry.phone}  folder_id=${u.csvEntry.folder_id}  — ${u.reason}`);
    }
    console.log('');
  }

  /* Ambiguous */
  if (ambiguous.length > 0) {
    console.log(`⚠  Ambiguous — NOT updating (${ambiguous.length}):`);
    for (const a of ambiguous) {
      const ids = a.candidates.map(c => c.id).join(',');
      console.log(`   ${a.csvEntry.name || '(no name)'}  phone=${a.csvEntry.phone}  folder_id=${a.csvEntry.folder_id}  — ${a.reason}  candidate IDs: ${ids}`);
    }
    console.log('');
  }

  /* Already-equal count */
  const skipCount = matches.filter(m => m.alreadyEqual).length;
  const toUpdate = matches.filter(m => !m.alreadyEqual);
  if (LIMIT !== null) {
    console.log(`Shown: ${displayMatches.length} of ${matches.length} total matched rows`);
  }
  console.log(`Total matched: ${matches.length}  |  Already equal (skip): ${skipCount}  |  Would update: ${toUpdate.length}  |  Unmatched: ${unmatched.length}  |  Ambiguous: ${ambiguous.length}\n`);

  /* 8. APPLY ─────────────────────────────────────────────── */
  if (APPLY) {
    console.log('=== Applying updates via wrangler d1 execute --remote ===\n');

    let applied = 0;
    let errors = 0;
    let skipped_count = 0;

    // Actually apply only the full match set (not limited to display)
    for (const m of matches) {
      if (m.alreadyEqual) {
        skipped_count++;
        continue;
      }

      // UPDATE by exact ID, preserve updated_at by not touching it
      const updateSql = `UPDATE registrations SET created_at = ${sqlEscape(m.csvEntry.created_at)} WHERE id = ${m.dbRow.id};`;

      try {
        const result = execSync(
          `npx wrangler d1 execute coffee_workshop_registrations --remote --command ${JSON.stringify(updateSql)}`,
          { cwd: WORKER_DIR, encoding: 'utf-8', timeout: 30000 }
        );
        const outLines = result.trim().split('\n').filter(l => l.trim());
        const lastLine = outLines[outLines.length - 1] || '';
        console.log(`✓ id=${m.dbRow.id} ${m.csvEntry.name} → ${m.csvEntry.created_at}  (${lastLine})`);
        applied++;

        // Write registration_events audit row (best-effort)
        try {
          const eventSql = `INSERT INTO registration_events (registration_id, event_type, old_value, new_value, note) VALUES (${m.dbRow.id}, 'created_at_backfill', ${sqlEscape(m.dbRow.created_at || '')}, ${sqlEscape(m.csvEntry.created_at)}, 'backfilled from Formspree CSV');`;
          execSync(
            `npx wrangler d1 execute coffee_workshop_registrations --remote --command ${JSON.stringify(eventSql)}`,
            { cwd: WORKER_DIR, encoding: 'utf-8', timeout: 30000 }
          );
        } catch (evErr) {
          console.error(`  (event write failed, continuing) ${evErr.stderr?.trim() || evErr.message}`);
        }
      } catch (err) {
        console.error(`✗ id=${m.dbRow.id} ${m.csvEntry.name}: ${err.stderr?.trim() || err.message}`);
        errors++;
      }
    }

    console.log(`\nDone. ${applied} applied, ${skipped_count} skipped (already equal), ${errors} errors.`);
  } else {
    console.log(`--- Dry-run complete. Run with --apply to execute ${toUpdate.length} UPDATE(s). ---`);
  }
}

/* ───── Formatting helpers ───── */

function padRight(s, w) {
  s = String(s);
  return s.length >= w ? s : s + ' '.repeat(w - s.length);
}

function trunc(s, max) {
  s = String(s);
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

/* ───── Run ───── */
main();
