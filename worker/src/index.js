const STATUS_KEY = 'status';
const WORKSHOPS = {
  filter_2026_06_15: {
    title: 'סדנת חליטות ביתיות — קנופי ירושלים',
    date_label: 'שני 15.6 · 16:00–17:30',
    capacity: 8,
    confirmed: 0,
    open: true,
  },
  uru_2026_07_03: {
    title: 'סדנת חליטות ביתיות — URU תל אביב',
    date_label: 'שישי 3.7 · 11:00–12:30',
    capacity: 8,
    confirmed: 0,
    open: true,
  },
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return corsResponse(null, env, 204);

    if (url.pathname === '/api/status' && request.method === 'GET') {
      const status = await getStatus(env);
      return json(status, env);
    }

    // POST /api/register — receive registrations (shadow-mode compatible)
    if (url.pathname === '/api/register' && request.method === 'POST') {
      return handleRegister(request, env);
    }

    if (url.pathname === '/' || url.pathname === '/admin') {
      if (request.method === 'GET') {
        const authed = await isAuthed(request, env);
        return html(authed ? adminPage() : loginPage(), env);
      }
    }

    if (url.pathname === '/admin/login' && request.method === 'POST') {
      const form = await request.formData();
      const password = String(form.get('password') || '');
      if (!env.ADMIN_PASSWORD || password !== env.ADMIN_PASSWORD) {
        return html(loginPage('סיסמה לא נכונה'), env, 401);
      }

      const token = crypto.randomUUID();
      await env.COFFEE_WORKSHOP.put(sessionKey(token), '1', { expirationTtl: 60 * 60 * 24 * 30 });
      return redirect('/admin', env, `session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * 30}`);
    }

    if (url.pathname === '/admin/logout' && request.method === 'POST') {
      const token = getCookie(request, 'session');
      if (token) await env.COFFEE_WORKSHOP.delete(sessionKey(token));
      return redirect('/admin', env, 'session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0');
    }

    if (url.pathname === '/admin/update' && request.method === 'POST') {
      if (!(await isAuthed(request, env))) return json({ ok: false, error: 'unauthorized' }, env, 401);

      const body = await request.json().catch(() => ({}));
      const action = body.action;
      const key = body.key || 'filter_2026_06_15';
      if (!WORKSHOPS[key]) return json({ ok: false, error: 'unknown workshop' }, env, 400);
      const status = await getStatus(env);
      const workshop = status[key] || { ...WORKSHOPS[key] };
      const capacity = Number(workshop.capacity || 8);
      let confirmed = Number(workshop.confirmed || 0);

      if (action === 'inc') confirmed = Math.min(capacity, confirmed + 1);
      else if (action === 'dec') confirmed = Math.max(0, confirmed - 1);
      else if (action === 'full') { confirmed = capacity; workshop.open = false; }
      else if (action === 'open') { workshop.open = true; }
      else if (action === 'reset') { confirmed = 0; workshop.open = true; }
      else return json({ ok: false, error: 'bad action' }, env, 400);

      workshop.confirmed = confirmed;
      if (action !== 'full' && confirmed < capacity) workshop.open = true;
      if (confirmed >= capacity) workshop.open = false;
      status[key] = workshop;
      await env.COFFEE_WORKSHOP.put(STATUS_KEY, JSON.stringify(status));
      return json({ ok: true, status }, env);
    }

    // ── Phase 2A: Admin registrations, CSV export, status updates ─────────

    if (url.pathname === '/admin/registrations') {
      if (!(await isAuthed(request, env))) return html(loginPage(), env);
      if (request.method === 'GET') return handleRegistrations(env);
    }

    if (url.pathname === '/admin/export.csv') {
      if (!(await isAuthed(request, env))) return html(loginPage(), env);
      if (request.method === 'GET') return handleCsvExport(env);
    }

    if (url.pathname === '/admin/registration/update' && request.method === 'POST') {
      if (!(await isAuthed(request, env))) return json({ ok: false, error: 'unauthorized' }, env, 401);
      return handleRegistrationUpdate(request, env);
    }

    return new Response('Not found', { status: 404 });
  },
};

async function getStatus(env) {
  const existing = await env.COFFEE_WORKSHOP.get(STATUS_KEY, 'json');
  // merge: keep stored values, add any new workshops missing from KV
  const merged = { ...WORKSHOPS, ...(existing || {}) };
  for (const key of Object.keys(WORKSHOPS)) {
    if (!merged[key]) merged[key] = { ...WORKSHOPS[key] };
  }
  if (!existing || Object.keys(WORKSHOPS).some((k) => !(k in existing))) {
    await env.COFFEE_WORKSHOP.put(STATUS_KEY, JSON.stringify(merged));
  }
  return merged;
}

// ───── POST /api/register —───────────────
async function handleRegister(request, env) {
  const db = env.coffee_workshop_registrations;
  if (!db) return json({ ok: false, error: 'database unavailable' }, env, 500);

  // Parse JSON or FormData
  let body;
  const ct = (request.headers.get('Content-Type') || '').toLowerCase();
  if (ct.includes('json')) {
    body = await request.json().catch(() => null);
  } else if (ct.includes('form')) {
    const fd = await request.formData().catch(() => null);
    if (fd) {
      body = {};
      for (const [k, v] of fd.entries()) body[k] = v;
    }
  } else {
    // fallback: try JSON
    body = await request.json().catch(() => null);
  }
  if (!body || typeof body !== 'object') {
    return json({ ok: false, error: 'invalid request body' }, env, 400);
  }

  // Required fields
  const name = (body.name || '').trim();
  const phone = (body.phone || '').trim();
  if (!name) return json({ ok: false, error: 'name is required' }, env, 400);
  if (!phone) return json({ ok: false, error: 'phone is required' }, env, 400);

  // Length guards
  if (name.length > 200) return json({ ok: false, error: 'name too long (max 200)' }, env, 400);
  if (phone.length > 40) return json({ ok: false, error: 'phone too long (max 40)' }, env, 400);

  // Spam check: honeypot
  const gotcha = body._gotcha || '';
  const isSpam = gotcha !== '' ? 1 : 0;
  const spamReason = isSpam ? 'honeypot' : null;

  // Generate client_submission_id if absent
  const clientSubmissionId = body.client_submission_id || crypto.randomUUID();

  // Deduplicate by client_submission_id
  const existing = await db.prepare(
    'SELECT id FROM registrations WHERE client_submission_id = ?'
  ).bind(clientSubmissionId).first();
  if (existing) {
    return json({ ok: true, id: existing.id, note: 'duplicate — already exists' }, env);
  }

  // Duplicate phone + edition within 10 minutes → keep but mark note
  const edition = (body.edition || '').trim();
  let duplicateNote = '';
  if (phone && edition) {
    const recent = await db.prepare(
      `SELECT id, notes FROM registrations
       WHERE phone = ? AND edition = ?
       AND datetime(created_at) >= datetime('now', '-10 minutes')
       ORDER BY created_at DESC LIMIT 1`
    ).bind(phone, edition).first();
    if (recent) {
      duplicateNote = 'duplicate phone+edition within 10min';
    }
  }

  // Assemble fields with trimming and length caps
  function cap(val, maxlen) {
    if (!val) return null;
    const s = String(val).trim();
    if (s.length > maxlen) return null;
    return s || null;
  }
  const bodyNotes = cap(body.notes, 2000);
  const combinedNotes = [bodyNotes, duplicateNote].filter(Boolean).join(' | ') || null;

  const fields = {
    client_submission_id: clientSubmissionId,
    name,
    phone,
    email: cap(body.email, 320),
    edition: cap(body.edition, 200),
    request_type: cap(body.request_type, 200),
    workshop: cap(body.workshop, 200),
    workshop_date: cap(body.workshop_date || body.date, 200),
    source: cap(body.source, 200),
    group_registration: cap(body.group_registration || body.group, 200),
    seats: Math.max(1, parseInt(body.seats, 10) || 1),
    amount_ils: body.amount_ils !== undefined ? parseInt(body.amount_ils, 10) || null : null,
    whatsapp_status: cap(body.whatsapp_status, 200) || 'pending',
    payment_status: cap(body.payment_status, 200) || 'pending',
    registration_status: cap(body.registration_status, 200) || 'new',
    is_spam: isSpam,
    spam_reason: spamReason,
    notes: combinedNotes,
    imported_from: cap(body.imported_from, 200),
    original_submission_id: cap(body.original_submission_id, 200),
  };

  const stmt = db.prepare(`
    INSERT INTO registrations (
      client_submission_id, name, phone, email,
      edition, request_type, workshop, workshop_date,
      source, group_registration,
      seats, amount_ils,
      whatsapp_status, payment_status, registration_status,
      is_spam, spam_reason,
      notes, imported_from, original_submission_id
    ) VALUES (?,?,?,?, ?,?,?,?, ?,?, ?,?, ?,?,?, ?,?, ?,?,?)
  `).bind(
    fields.client_submission_id,
    fields.name,
    fields.phone,
    fields.email,
    fields.edition,
    fields.request_type,
    fields.workshop,
    fields.workshop_date,
    fields.source,
    fields.group_registration,
    fields.seats,
    fields.amount_ils,
    fields.whatsapp_status,
    fields.payment_status,
    fields.registration_status,
    fields.is_spam,
    fields.spam_reason,
    fields.notes,
    fields.imported_from,
    fields.original_submission_id
  );

  try {
    const result = await stmt.run();
    const newId = result.meta?.last_row_id || null;

    // Write registration_events row (best-effort, log on failure)
    if (newId) {
      try {
        await db.prepare(
          `INSERT INTO registration_events (registration_id, event_type) VALUES (?, ?)`
        ).bind(newId, 'created').run();
      } catch (evErr) {
        console.error('Failed to write registration_events:', evErr);
      }
    }

    const resp = {
      ok: true,
      id: newId,
      client_submission_id: fields.client_submission_id,
    };
    if (isSpam) resp.is_spam = 1;
    if (spamReason) resp.spam_reason = spamReason;
    if (duplicateNote) resp.duplicate_note = duplicateNote;
    return json(resp, env);
  } catch (err) {
    console.error('INSERT failed:', err);
    return json({ ok: false, error: 'insert failed' }, env, 500);
  }
}

// ───── Phase 2A handlers ─────────────────────────────────────────────────

const UPDATE_COLUMN_MAP = Object.freeze({
  whatsapp_status: 'whatsapp_status',
  payment_status: 'payment_status',
  registration_status: 'registration_status',
  is_spam: 'is_spam',
  notes: 'notes',
  seats: 'seats',
  amount_ils: 'amount_ils',
});
const ALLOWED_UPDATE_FIELDS = new Set(Object.keys(UPDATE_COLUMN_MAP));

const COLUMN_LABELS = {
  created_at: 'תאריך',
  name: 'שם',
  phone: 'טלפון',
  edition: 'מהדורה',
  request_type: 'סוג בקשה',
  source: 'מקור',
  seats: 'מקומות',
  amount_ils: 'סכום (₪)',
  whatsapp_status: 'סטטוס וואטסאפ',
  payment_status: 'סטטוס תשלום',
  registration_status: 'סטטוס רישום',
  is_spam: 'ספאם',
  notes: 'הערות',
};

const DISPLAY_COLUMNS = [
  'created_at', 'name', 'phone', 'edition', 'request_type',
  'source', 'seats', 'amount_ils', 'whatsapp_status',
  'payment_status', 'registration_status', 'is_spam', 'notes',
];

async function handleRegistrations(env) {
  const db = env.coffee_workshop_registrations;
  if (!db) return html('<p>Database unavailable</p>', env, 500);

  const rows = await db.prepare(
    'SELECT id, created_at, name, phone, edition, request_type, source, ' +
    'seats, amount_ils, whatsapp_status, payment_status, registration_status, ' +
    'is_spam, notes FROM registrations ORDER BY created_at DESC'
  ).all();

  const items = rows.results || [];

  let tableRows = items.map((r) => {
    const rowHtml = DISPLAY_COLUMNS.map((col) => {
      let val = r[col];
      // Format is_spam as yes/no badge
      if (col === 'is_spam') {
        const is = Number(val);
        return is ? '<span class="badge-spam">כן</span>' : '<span class="badge-clean">לא</span>';
      }
      // Format amount_ils
      if (col === 'amount_ils' && val != null) {
        return escapeHtml(String(val));
      }
      if (val == null) return '<span class="null">—</span>';
      return escapeHtml(String(val));
    }).join('');

    // Inline action buttons for quick updates
    const actionsHtml = `
      <div class="inline-actions">
        <form class="inline-form" data-id="${escapeHtml(String(r.id))}" data-field="whatsapp_status">
          <button type="button" class="btn-sm" data-value="sent">וואטסאפ נשלח</button>
        </form>
        <form class="inline-form" data-id="${escapeHtml(String(r.id))}" data-field="payment_status">
          <button type="button" class="btn-sm" data-value="bit_request_sent">Bit נשלח</button>
          <button type="button" class="btn-sm" data-value="paid">שולם</button>
        </form>
        <form class="inline-form" data-id="${escapeHtml(String(r.id))}" data-field="is_spam">
          <button type="button" class="btn-sm ${Number(r.is_spam) ? 'btn-danger' : ''}" data-value="${Number(r.is_spam) ? '0' : '1'}">${Number(r.is_spam) ? 'ביטול ספאם' : 'סמן ספאם'}</button>
        </form>
        <form class="inline-form" data-id="${escapeHtml(String(r.id))}" data-field="registration_status">
          <button type="button" class="btn-sm" data-value="confirmed">אישור</button>
          <button type="button" class="btn-sm" data-value="cancelled">ביטול</button>
        </form>
      </div>`;

    return `<tr>${rowHtml}<td>${actionsHtml}</td></tr>`;
  }).join('\n');

  const htmlContent = `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>הרשמות — ניהול סדנאות</title>
<style>${baseCss()}
body{padding:20px;display:block}
.header{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:12px}
.header h1{margin:0;font-size:1.4rem}
.header .links{display:flex;gap:10px;align-items:center}
.header .links a{color:#1a0e08;text-decoration:none;font-weight:700;font-size:.9rem}
.header .links a:hover{text-decoration:underline}
.table-wrap{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:.8rem;background:white;border:1px solid #eadfce;border-radius:12px;overflow:hidden}
th,td{padding:8px 10px;text-align:right;border-bottom:1px solid #eadfce;white-space:nowrap}
th{background:#fbfaf8;font-weight:700;color:#3d2417;position:sticky;top:0}
tr:hover{background:#f8f6f3}
.null{color:#bbb}
.badge-spam{background:#ffe8e5;color:#8a2a22;border-radius:999px;padding:2px 8px;font-size:.75rem;font-weight:700}
.badge-clean{color:#aaa;font-size:.75rem}
.inline-actions{display:flex;gap:4px;flex-wrap:wrap}
.inline-form{display:inline}
.btn-sm{font-family:inherit;font-size:.7rem;padding:3px 7px;border-radius:6px;border:1px solid #eadfce;background:#fbfaf8;color:#1a0e08;cursor:pointer;white-space:nowrap}
.btn-sm:hover{background:#eadfce}
.btn-danger{background:#6f2d22;color:white;border-color:#6f2d22}
.btn-danger:hover{background:#8a3a2c}
#toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#1a0e08;color:white;padding:10px 20px;border-radius:12px;font-size:.85rem;opacity:0;transition:opacity .3s;z-index:999;pointer-events:none}
#toast.show{opacity:1}
.count{font-size:.85rem;color:#7a6657}
</style>
</head>
<body>
  <div class="header">
    <h1>הרשמות לסדנאות</h1>
    <div class="links">
      <span class="count">${items.length} ${items.length === 1 ? 'הרשמה' : 'הרשמות'}</span>
      <a href="/admin">חזרה לניהול מושבים</a>
      <a href="/admin/export.csv">📥 ייצוא CSV</a>
      <form method="post" action="/admin/logout" style="display:inline"><button class="ghost" type="submit">יציאה</button></form>
    </div>
  </div>
  <div class="table-wrap">
  <table>
    <thead><tr>
      ${DISPLAY_COLUMNS.map((c) => `<th>${COLUMN_LABELS[c] || c}</th>`).join('')}
      <th>פעולות</th>
    </tr></thead>
    <tbody>${tableRows || '<tr><td colspan="14" style="text-align:center;color:#999">אין הרשמות</td></tr>'}</tbody>
  </table>
  </div>
  <div id="toast"></div>
<script>
async function doUpdate(id, field, value) {
  const toast = document.getElementById('toast');
  toast.textContent = 'מעדכן...';
  toast.className = 'show';
  try {
    const res = await fetch('/admin/registration/update', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({id, field, value})
    });
    const data = await res.json();
    if (data.ok) {
      toast.textContent = 'עודכן ✓';
      setTimeout(() => location.reload(), 800);
    } else {
      toast.textContent = 'שגיאה: ' + (data.error || 'unknown');
    }
  } catch(e) {
    toast.textContent = 'שגיאת רשת';
  }
  setTimeout(() => toast.className = '', 3000);
}
document.querySelectorAll('.inline-form button[data-value]').forEach(btn => {
  btn.addEventListener('click', () => {
    const form = btn.closest('.inline-form');
    const id = form.dataset.id;
    const field = form.dataset.field;
    const value = btn.dataset.value;
    doUpdate(id, field, value);
  });
});
</script>
</body>
</html>`;

  return html(htmlContent, env);
}

async function handleCsvExport(env) {
  const db = env.coffee_workshop_registrations;
  if (!db) return new Response('Database unavailable', { status: 500 });

  const rows = await db.prepare(
    'SELECT id, created_at, name, phone, email, edition, request_type, ' +
    'workshop, workshop_date, source, group_registration, ' +
    'seats, amount_ils, whatsapp_status, payment_status, registration_status, ' +
    'is_spam, spam_reason, notes, imported_from, original_submission_id ' +
    'FROM registrations ORDER BY created_at DESC'
  ).all();

  const items = rows.results || [];

  const CSV_COLUMNS = [
    'id', 'created_at', 'name', 'phone', 'email',
    'edition', 'request_type', 'workshop', 'workshop_date',
    'source', 'group_registration',
    'seats', 'amount_ils',
    'whatsapp_status', 'payment_status', 'registration_status',
    'is_spam', 'spam_reason', 'notes', 'imported_from', 'original_submission_id',
  ];

  // RFC 4180 CSV quoting
  function csvField(val) {
    if (val === null || val === undefined) return '';
    const s = String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  let csv = '\uFEFF'; // UTF-8 BOM for Hebrew
  csv += CSV_COLUMNS.join(',') + '\n';
  for (const row of items) {
    csv += CSV_COLUMNS.map((c) => csvField(row[c])).join(',') + '\n';
  }

  const h = {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': 'attachment; filename="coffee-workshop-registrations.csv"',
    'Cache-Control': 'no-store',
  };
  return new Response(csv, { status: 200, headers: h });
}

async function handleRegistrationUpdate(request, env) {
  const db = env.coffee_workshop_registrations;
  if (!db) return json({ ok: false, error: 'database unavailable' }, env, 500);

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return json({ ok: false, error: 'invalid JSON body' }, env, 400);
  }

  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) {
    return json({ ok: false, error: 'id must be a positive integer' }, env, 400);
  }

  const field = String(body.field || '').trim();
  if (!ALLOWED_UPDATE_FIELDS.has(field)) {
    return json({ ok: false, error: `field '${escapeHtml(field)}' is not allowed for update` }, env, 400);
  }

  let value = body.value;

  // Type conversions
  if (field === 'is_spam') {
    value = (value === true || value === '1' || value === 'true' || value === 1) ? 1 : 0;
  } else if (field === 'seats') {
    const n = parseInt(value, 10);
    value = (!isNaN(n) && n >= 0) ? n : null;
  } else if (field === 'amount_ils') {
    if (value === null || value === '' || value === undefined) {
      value = null;
    } else {
      const n = parseInt(value, 10);
      value = (!isNaN(n) && n >= 0) ? n : null;
    }
  } else {
    // String fields: trim, cap length
    value = String(value).trim();
    if (value.length > 2000) value = value.slice(0, 2000);
  }

  const columnName = UPDATE_COLUMN_MAP[field];

  // Get current value for event log
  const current = await db.prepare(
    `SELECT ${columnName} FROM registrations WHERE id = ?`
  ).bind(id).first();

  if (!current) {
    return json({ ok: false, error: 'registration not found' }, env, 404);
  }

  const oldValue = String(current[columnName] ?? '');

  // Update the registration
  const updateSql = `UPDATE registrations SET ${columnName} = ?, updated_at = datetime('now') WHERE id = ?`;
  await db.prepare(updateSql).bind(value, id).run();

  // Insert event log
  try {
    await db.prepare(
      `INSERT INTO registration_events (registration_id, event_type, old_value, new_value)
       VALUES (?, ?, ?, ?)`
    ).bind(id, `updated:${field}`, oldValue, String(value ?? '')).run();
  } catch (evErr) {
    console.error('Failed to write registration_events:', evErr);
  }

  return json({ ok: true, id, field, value }, env);
}

async function isAuthed(request, env) {
  const token = getCookie(request, 'session');
  if (!token) return false;
  return Boolean(await env.COFFEE_WORKSHOP.get(sessionKey(token)));
}

function sessionKey(token) {
  return `session:${token}`;
}

function getCookie(request, name) {
  const cookie = request.headers.get('Cookie') || '';
  return cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(name + '='))?.slice(name.length + 1) || '';
}

function allowedOrigin(requestOrigin, env) {
  const allowed = (env.ALLOWED_ORIGIN || 'https://drorbahat.github.io').split(',').map((s) => s.trim());
  return allowed.includes(requestOrigin) ? requestOrigin : allowed[0];
}

function headers(env, type = 'application/json; charset=utf-8') {
  return {
    'Content-Type': type,
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || 'https://drorbahat.github.io',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Cache-Control': 'no-store',
  };
}

function corsResponse(body, env, status = 200) {
  return new Response(body, { status, headers: headers(env) });
}

function json(data, env, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: headers(env) });
}

function html(markup, env, status = 200) {
  return new Response(markup, { status, headers: headers(env, 'text/html; charset=utf-8') });
}

function redirect(path, env, cookie) {
  const h = headers(env, 'text/plain; charset=utf-8');
  h.Location = path;
  if (cookie) h['Set-Cookie'] = cookie;
  return new Response('Redirect', { status: 303, headers: h });
}

function loginPage(error = '') {
  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>ניהול סדנאות</title>
<style>${baseCss()}</style>
</head>
<body>
  <main class="card narrow">
    <h1>ניהול סדנאות</h1>
    <p>כניסה פרטית לעדכון מספר המקומות המאושרים וניהול הרשמות.</p>
    ${error ? `<div class="error">${escapeHtml(error)}</div>` : ''}
    <form method="post" action="/admin/login">
      <label>סיסמה</label>
      <input type="password" name="password" autofocus required>
      <button type="submit">כניסה</button>
    </form>
  </main>
</body>
</html>`;
}

function adminPage() {
  const cards = Object.entries(WORKSHOPS).map(([key, w]) => `
  <main class="card" data-key="${key}">
    <div class="top">
      <div>
        <h1>${escapeHtml(w.title)}</h1>
        <p>${escapeHtml(w.date_label)}</p>
      </div>
    </div>

    <section class="status">
      <div class="number"><span class="confirmed">—</span><small>מתוך <span class="capacity">${w.capacity}</span></small></div>
      <div class="badge state">טוען...</div>
    </section>

    <div class="actions">
      <button data-action="inc">+ הוסף משתתף</button>
      <button data-action="dec" class="secondary">− הורד משתתף</button>
      <button data-action="full" class="secondary">סמן מלא</button>
      <button data-action="open" class="secondary">פתח הרשמה</button>
    </div>

    <button data-action="reset" class="danger">איפוס ל־0 ופתיחה מחדש</button>
  </main>`).join('\n');

  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>ניהול סדנאות</title>
<style>${baseCss()}
body{display:flex;flex-direction:column;align-items:center;gap:18px;justify-content:flex-start;padding-top:40px}
.logout-bar{width:min(520px,100%);display:flex;justify-content:flex-end}
.admin-links{width:min(520px,100%);display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
.admin-links a{color:#1a0e08;text-decoration:none;font-weight:700;font-size:.9rem;padding:8px 16px;border:1px solid #eadfce;border-radius:12px;background:white}
.admin-links a:hover{background:#fbfaf8;text-decoration:underline}
</style>
</head>
<body>
  <div class="logout-bar"><form method="post" action="/admin/logout"><button class="ghost" type="submit">יציאה</button></form></div>
  <div class="admin-links">
    <a href="/admin/registrations">📋 צפייה בהרשמות</a>
    <a href="/admin/export.csv">📥 ייצוא CSV</a>
  </div>
  ${cards}
  <p class="note" id="note">כל שינוי מתעדכן מיד באתר הציבורי.</p>

<script>
async function load() {
  const res = await fetch('/api/status');
  const status = await res.json();
  document.querySelectorAll('.card[data-key]').forEach((card) => render(card, status[card.dataset.key]));
}
function render(card, w) {
  if (!w) return;
  const confirmed = Number(w.confirmed || 0);
  const capacity = Number(w.capacity || 8);
  const full = w.open === false || confirmed >= capacity;
  card.querySelector('.confirmed').textContent = confirmed;
  card.querySelector('.capacity').textContent = capacity;
  const state = card.querySelector('.state');
  state.textContent = full ? 'המועד מלא' : 'פתוח להרשמה';
  state.className = full ? 'badge state full' : 'badge state open';
}
async function update(key, action) {
  const note = document.getElementById('note');
  note.textContent = 'מעדכן...';
  const res = await fetch('/admin/update', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, action })
  });
  const data = await res.json();
  if (!data.ok) { note.textContent = 'שגיאה בעדכון'; return; }
  document.querySelectorAll('.card[data-key]').forEach((card) => render(card, data.status[card.dataset.key]));
  note.textContent = 'עודכן באתר הציבורי.';
}
document.querySelectorAll('.card[data-key] [data-action]').forEach((button) => {
  button.addEventListener('click', () => update(button.closest('.card').dataset.key, button.dataset.action));
});
load();
</script>
</body>
</html>`;
}

function baseCss() {
  return `
@import url('https://fonts.googleapis.com/css2?family=Varela+Round&display=swap');
*{box-sizing:border-box} body{margin:0;min-height:100vh;display:grid;place-items:center;background:#faf8f5;color:#1a0e08;font-family:'Varela Round',system-ui,sans-serif;padding:20px}.card{width:min(520px,100%);background:white;border:1px solid #eadfce;border-radius:24px;padding:24px;box-shadow:0 18px 50px rgba(26,14,8,.08)}.narrow{width:min(420px,100%)}h1{margin:0 0 8px;font-size:1.5rem}p{margin:0 0 18px;color:#6f6258;line-height:1.5}.top{display:flex;align-items:start;justify-content:space-between;gap:16px}.status{display:flex;align-items:center;justify-content:space-between;background:#fbfaf8;border:1px solid #eadfce;border-radius:18px;padding:18px;margin:18px 0}.number{font-size:3.2rem;font-weight:800;line-height:1}.number small{display:block;font-size:.85rem;color:#7a6657;margin-top:4px}.badge{border-radius:999px;padding:8px 12px;font-size:.9rem;font-weight:700}.open{background:#edf7ef;color:#286b35}.full{background:#f5e8dc;color:#764a28}.actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px}button,input{width:100%;border-radius:14px;border:1px solid #eadfce;font-family:inherit;font-size:1rem}input{padding:13px 14px;margin:6px 0 12px;background:#fbfaf8}button{padding:13px 14px;background:#1a0e08;color:white;font-weight:700;cursor:pointer}.secondary{background:#fbfaf8;color:#1a0e08}.ghost{background:transparent;color:#7a6657;padding:8px 10px;width:auto}.danger{background:#6f2d22;margin-top:4px}.note{font-size:.85rem;text-align:center;margin:14px 0 0}.error{background:#fff1f0;color:#8a2a22;border:1px solid #f1c5bd;border-radius:12px;padding:10px;margin-bottom:12px}label{font-weight:700;color:#3d2417}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}
