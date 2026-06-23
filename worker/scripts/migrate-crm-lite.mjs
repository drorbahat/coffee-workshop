#!/usr/bin/env node

/**
 * migrate-crm-lite.mjs
 * Safely add CRM-lite columns to the registrations table.
 *
 * Usage:
 *   node scripts/migrate-crm-lite.mjs              # dry-run (default)
 *   node scripts/migrate-crm-lite.mjs --apply       # actually execute
 *
 * The script checks PRAGMA table_info first and only adds
 * columns that are missing. Default is dry-run.
 * Uses --json flag for reliable schema detection.
 */

const DRY_RUN = !process.argv.includes('--apply');

const NEW_COLUMNS = [
  { name: 'record_type',            type: 'TEXT' },
  { name: 'parent_registration_id', type: 'INTEGER' },
  { name: 'crm_stage',              type: 'TEXT' },
];

async function main() {
  console.log(`\n=== CRM-lite migration ===`);
  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN (no changes)' : 'APPLY'}`);
  console.log('');

  // Find wrangler / determine D1 binding
  const { execSync } = await import('child_process');

  // Get current table info using --json for reliable parsing
  console.log('Fetching current schema from remote D1...');
  const infoCmd = 'npx wrangler d1 execute coffee_workshop_registrations --remote --json --command "PRAGMA table_info(registrations);"';
  let existingCols = [];
  try {
    const raw = execSync(infoCmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    // Prefer JSON parsing: --json returns an array of execution-result objects
    // Each object has a "results" array of row objects with a "name" field
    let parsed = false;
    try {
      const json = JSON.parse(raw);
      if (Array.isArray(json) && json.length > 0 && Array.isArray(json[0].results)) {
        for (const row of json[0].results) {
          if (row && typeof row.name === 'string') {
            existingCols.push(row.name);
          }
        }
        parsed = true;
      }
    } catch {
      // JSON parse failed, will fall through to text fallback below
    }
    // Text fallback only if JSON parsing failed
    if (!parsed) {
      console.log('  (JSON parse failed, falling back to text-based parsing)');
      const lines = raw.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('|')) {
          const parts = trimmed.split('|').map(s => s.trim()).filter(Boolean);
          if (parts.length >= 2 && parts[0] !== 'cid') {
            const colName = parts[1];
            if (colName) {
              existingCols.push(colName);
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('Failed to query D1:', err.message);
    console.error('Make sure wrangler is configured and authenticated.');
    process.exit(1);
  }

  console.log('Existing columns: ' + (existingCols.length > 0 ? existingCols.join(', ') : '(none detected)'));
  console.log('');

  // Determine which columns to add
  const missing = NEW_COLUMNS.filter(col => !existingCols.includes(col.name));
  if (missing.length === 0) {
    console.log('All CRM-lite columns already exist. Nothing to do.');
    process.exit(0);
  }

  console.log('Columns to add (' + missing.length + '):');
  for (const col of missing) {
    console.log('  - ' + col.name + ' ' + col.type);
  }
  console.log('');

  if (DRY_RUN) {
    console.log('DRY-RUN: pass --apply to execute.');
    console.log('Would run:');
    for (const col of missing) {
      console.log('  ALTER TABLE registrations ADD COLUMN ' + col.name + ' ' + col.type + ';');
    }
    process.exit(0);
  }

  // Execute ALTER TABLE statements
  console.log('Executing ALTER TABLE statements...');
  for (const col of missing) {
    const cmd = 'npx wrangler d1 execute coffee_workshop_registrations --remote --command "ALTER TABLE registrations ADD COLUMN ' + col.name + ' ' + col.type + ';"';
    console.log('  Adding ' + col.name + ' ' + col.type + '...');
    try {
      execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
      console.log('  OK Done');
    } catch (err) {
      console.error('  Failed to add ' + col.name + ': ' + err.message);
      process.exit(1);
    }
  }

  console.log('');
  console.log('Migration complete.');
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
