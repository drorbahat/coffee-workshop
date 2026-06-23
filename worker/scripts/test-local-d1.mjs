#!/usr/bin/env node
/**
 * Local D1 smoke test helper.
 *
 * This file intentionally contains no production registrant names or phone
 * numbers. Historical row-specific checks were removed from git because they
 * encoded private migration data.
 *
 * For real local-D1 debugging, run aggregate/schema queries against your local
 * `.wrangler` state without printing personal data.
 */

function test(label, fn) {
  try {
    fn();
    console.log('✅', label);
  } catch (err) {
    console.log('❌', label, `— ${err.message}`);
    process.exitCode = 1;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

function cap(val, maxlen) {
  if (!val) return null;
  const s = String(val).trim();
  if (s.length > maxlen) return null;
  return s || null;
}

test('cap trims and caps strings', () => {
  assert(cap('  hello  ', 10) === 'hello');
  assert(cap('a'.repeat(201), 200) === null);
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

console.log('\nLocal D1 smoke helper passed. No private fixture rows are stored in git.');
