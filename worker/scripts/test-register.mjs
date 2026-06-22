// Test the /api/register endpoint against local wrangler dev
// Usage: node scripts/test-register.mjs [base_url]

const BASE = process.argv[2] || 'http://127.0.0.1:8787';

async function test(label, body, expectOk = true) {
  try {
    const res = await fetch(`${BASE}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    const pass = data.ok === expectOk;
    console.log(pass ? '✅' : '❌', label, `→ ${res.status}`, JSON.stringify(data));
    return data;
  } catch (err) {
    console.log('❌', label, `→ NETWORK ERROR: ${err.message}`);
    return null;
  }
}

async function testFormData(label, bodyFields, expectOk = true) {
  try {
    const fd = new URLSearchParams();
    for (const [k, v] of Object.entries(bodyFields)) {
      fd.set(k, v);
    }
    const res = await fetch(`${BASE}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: fd.toString(),
    });
    const data = await res.json();
    const pass = data.ok === expectOk;
    console.log(pass ? '✅' : '❌', label, `→ ${res.status}`, JSON.stringify(data));
    return data;
  } catch (err) {
    console.log('❌', label, `→ NETWORK ERROR: ${err.message}`);
    return null;
  }
}

async function main() {
  console.log(`\n🧪 Testing /api/register against ${BASE}\n`);

  // 1. Valid registration
  const r1 = await test('valid registration', {
    name: 'בדיקה',
    phone: '0501234567',
    email: 'test@example.com',
    edition: 'URU · תל אביב',
    request_type: 'הרשמה — URU · תל אביב',
    workshop: 'חליטות ביתיות',
    workshop_date: 'שישי 3.7 11:00–12:30',
    source: 'אינסטגרם',
    seats: 1,
  });

  // 2. Missing name
  await test('missing name', { phone: '0501234567' }, false);

  // 3. Missing phone
  await test('missing phone', { name: 'ללא טלפון' }, false);

  // 4. Honeypot spam
  const r4 = await test('honeypot spam', {
    name: 'ספאמר',
    phone: '0500000000',
    _gotcha: 'filler',
  });
  if (r4?.ok) {
    console.log(`   (spam row inserted — is_spam: ${r4.is_spam}, spam_reason: ${r4.spam_reason})`);
  }

  // 5. Duplicate client_submission_id
  if (r1?.client_submission_id) {
    await test('duplicate client_submission_id', {
      name: 'בדיקה (dupe)',
      phone: '0501234567',
      client_submission_id: r1.client_submission_id,
    });
  }

  // 6. seats + amount_ils via JSON
  await test('seats + amount_ils', {
    name: 'משפחת לוי',
    phone: '0522222222',
    edition: 'קנופי · ירושלים',
    seats: 3,
    amount_ils: 600,
    group_registration: 'משפחת לוי',
  });

  // 7. Real FormData-style request (application/x-www-form-urlencoded)
  await testFormData('FormData (urlencoded)', {
    name: 'טופס פורם דאטה',
    phone: '0533333333',
    email: 'form@test.com',
    edition: 'URU · תל אביב',
    source: 'וואטסאפ',
  });

  // 8. Duplicate phone+edition within short window
  await test('duplicate phone+edition (1st)', {
    name: 'כפיל טלפון',
    phone: '0544444444',
    edition: 'URU · תל אביב',
    client_submission_id: 'test_dupe_phone_1',
  });
  const r8b = await test('duplicate phone+edition (2nd, diff client_submission_id)', {
    name: 'כפיל טלפון 2',
    phone: '0544444444',
    edition: 'URU · תל אביב',
    client_submission_id: 'test_dupe_phone_2',
  });
  if (r8b?.duplicate_note) {
    console.log(`   ✅ duplicate_note present: ${r8b.duplicate_note}`);
  }

  // 9. Length guard: name too long
  await test('name too long (201 chars)', {
    name: 'א'.repeat(201),
    phone: '0555555555',
  }, false);

  // 10. Length guard: phone too long
  await test('phone too long (41 chars)', {
    name: 'שם תקין',
    phone: '0'.repeat(41),
  }, false);

  console.log('\n✅ Done.');
}

main().catch(console.error);
