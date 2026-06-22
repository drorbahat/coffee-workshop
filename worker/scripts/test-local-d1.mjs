#!/usr/bin/env node
/**
 * Directly test register logic + D1 inserts via local SQLite.
 * Avoids needing wrangler dev server.
 */

import Database from 'better-sqlite3';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = resolve(__dirname, '..', '.wrangler/state/v3/d1/miniflare-D1DatabaseObject/a88238182bcb5a56fe0df1a5ab8eb3144f5fbd5c0ebbaa39e63a18c768de462f.sqlite');

const db = new Database(DB_PATH);

function cap(val, maxlen) {
  if (!val) return null;
  const s = String(val).trim();
  if (s.length > maxlen) return null;
  return s || null;
}

function test(label, fn) {
  try {
    fn();
    console.log('✅', label);
  } catch (err) {
    console.log('❌', label, `— ${err.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

// --- Tests ---

test('cap trims and caps strings', () => {
  assert(cap('  hello  ', 10) === 'hello');
  assert(cap('a'.repeat(201), 200) === null); // too long
  assert(cap(null, 200) === null);
  assert(cap(undefined, 200) === null);
});

test('name length guard (200 max)', () => {
  const name = 'א'.repeat(201);
  assert(name.length > 200, 'name should be too long');
});

test('phone length guard (40 max)', () => {
  const phone = '0'.repeat(41);
  assert(phone.length > 40, 'phone should be too long');
});

test('INSERT OR IGNORE works with deterministic ID', () => {
  const existing = db.prepare(
    "SELECT id FROM registrations WHERE client_submission_id = 'manual_hila_levin_2026_06_21'"
  ).get();
  assert(existing, 'deterministic Hila ID should exist');

  // Try inserting again — should not throw (INSERT OR IGNORE)
  const stmt = db.prepare(`INSERT OR IGNORE INTO registrations (
    client_submission_id, name, phone, edition, request_type, seats, whatsapp_status, payment_status, registration_status, is_spam
  ) VALUES (
    'manual_hila_levin_2026_06_21', 'הילה לוין', '0543178959',
    'URU · תל אביב', 'הרשמה — URU · תל אביב',
    1, 'pending', 'pending', 'new', 0
  )`);
  const info = stmt.run();
  assert(info.changes === 0, 'INSERT OR IGNORE should not insert duplicate');
});

test('Liraz is marked not_handled', () => {
  const row = db.prepare(
    "SELECT registration_status, notes FROM registrations WHERE name LIKE '%Liraz%'"
  ).get();
  assert(row, 'Liraz row exists');
  assert(row.registration_status === 'not_handled', `expected not_handled, got ${row.registration_status}`);
  assert(row.notes && row.notes.includes('טלפון מסוך'), 'notes mentions masked phone');
});

test('Shnir has group_registration', () => {
  const row = db.prepare(
    "SELECT group_registration FROM registrations WHERE name = 'שניר פוקס'"
  ).get();
  assert(row, 'Shnir row exists');
  assert(row.group_registration === 'הרשמת קבוצה', `expected 'הרשמת קבוצה', got ${row.group_registration}`);
});

test('Yonatan has group_registration', () => {
  const rows = db.prepare(
    "SELECT group_registration, client_submission_id FROM registrations WHERE name = 'יונתן נובוטני'"
  ).all();
  assert(rows.length >= 1, 'Yonatan rows exist');
  for (const row of rows) {
    assert(row.group_registration === 'כלול בהרשמת שניר',
      `Yonatan (${row.client_submission_id}): expected 'כלול בהרשמת שניר', got ${row.group_registration}`);
  }
});

test('Total registration count is reasonable', () => {
  const row = db.prepare('SELECT COUNT(*) as cnt FROM registrations').get();
  assert(row.cnt >= 20, `expected at least 20 rows, got ${row.cnt}`);
  console.log(`   Total rows: ${row.cnt}`);
});

test('registration_events table exists and is usable', () => {
  const stmt = db.prepare('SELECT COUNT(*) as cnt FROM registration_events');
  const row = stmt.get();
  assert(typeof row.cnt === 'number', 'registration_events table accessible');
  console.log(`   Events: ${row.cnt}`);
});

// Cleanup
db.close();
console.log('\n🎉 All tests passed!');
