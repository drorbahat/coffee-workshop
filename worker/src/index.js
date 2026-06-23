import { normalizeRegistration, isBillableRow, recordType } from './registration-normalize.js';

import { renderRegistrationsAdminPage } from './admin-registrations-ui.js';

const STATUS_KEY = 'status';

// Full column projection used for admin registration responses
const ADMIN_REGISTRATION_SELECT = `SELECT
  id, created_at, updated_at,
  name, phone, email,
  edition, request_type, workshop, workshop_date, source, group_registration,
  seats, amount_ils,
  whatsapp_status, payment_status, registration_status,
  is_spam, spam_reason,
  record_type, parent_registration_id, crm_stage,
  notes, imported_from, original_submission_id
FROM registrations`;
const WORKSHOPS = {
  filter_2026_06_15: {
    workshop_type: 'סדנת חליטות ביתיות',
    date_label: 'שני 15.6',
    start_time: '16:00',
    end_time: '17:30',
    venue: 'קנופי',
    address: 'מבוא המתמיד 6, ירושלים',
    price: 180,
    capacity: 8,
    confirmed: 0,
    open: true,
    workshop_key: 'kanopi',
  },
  uru_2026_07_03: {
    workshop_type: 'סדנת חליטות ביתיות',
    date_label: 'שישי 3.7',
    start_time: '11:00',
    end_time: '12:30',
    venue: 'URU',
    address: 'הכישור 1 ביתן 107, תל אביב - יפו',
    price: 200,
    capacity: 8,
    confirmed: 0,
    open: true,
    workshop_key: 'uru',
  },
};

// Maps KV status keys to workshop_key values from registration-normalize.js
// so capacity summary can match KV public status with D1 paid seats.
const KV_KEY_TO_WORKSHOP_KEY = {
  filter_2026_06_15: 'kanopi',
  uru_2026_07_03: 'uru',
};

// ───── Helper functions ────────────────────────────────────────────────────

/**
 * Validate and coerce a single field update value.
 * Returns { value } on success or { error } on failure.
 */
/** Nullable optional fields — accept null/''/undefined and persist DB NULL */
const NULLABLE_FIELDS = new Set([
  'crm_stage', 'record_type',
  'parent_registration_id', 'amount_ils',
  'notes', 'workshop', 'workshop_date', 'source', 'group_registration', 'email',
]);

function validateAndCoerceUpdate(field, rawValue) {
  if (!ALLOWED_UPDATE_FIELDS.has(field)) {
    return { error: `field '${escapeHtml(field)}' is not allowed for update` };
  }

  // Null/undefined/empty early-exit for nullable optional fields
  if (rawValue === null || rawValue === undefined || rawValue === '') {
    if (NULLABLE_FIELDS.has(field)) {
      return { value: null };
    }
    // For non-nullable fields, treat empty as empty string (not String(null) = 'null')
    rawValue = '';
  }

  // Validate status values where applicable
  const allowedValues = ALLOWED_STATUS_VALUES[field];
  if (allowedValues) {
    const strValue = String(rawValue).trim();
    const match = allowedValues.some(v => String(v) === strValue);
    if (!match) {
      return { error: `invalid value '${escapeHtml(strValue)}' for field '${escapeHtml(field)}'. Allowed: ${allowedValues.join(', ')}` };
    }
  }

  // Validate text field lengths
  const TEXT_MAXLEN = {
    name: 200, phone: 40, email: 320, edition: 200,
    request_type: 200, workshop: 200, workshop_date: 200,
    source: 200, group_registration: 200, notes: 2000,
  };
  const maxLen = TEXT_MAXLEN[field];
  if (maxLen && typeof rawValue === 'string' && rawValue.length > maxLen) {
    return { error: `value too long for '${field}' (max ${maxLen})` };
  }

  let value = rawValue;

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
  } else if (field === 'parent_registration_id') {
    if (value === null || value === '' || value === undefined) {
      value = null;
    } else {
      const n = parseInt(value, 10);
      value = (!isNaN(n) && n > 0) ? n : null;
    }
  } else {
    // String fields: trim, cap length
    value = String(value).trim();
    if (value.length > 2000) value = value.slice(0, 2000);
  }

  return { value };
}

/**
 * Fetch a full normalized registration row by id.
 * Uses ADMIN_REGISTRATION_SELECT for consistent projection.
 */
async function fetchRegistrationById(db, id) {
  const row = await db.prepare(`${ADMIN_REGISTRATION_SELECT} WHERE id = ?`).bind(id).first();
  return row ? normalizeRegistration(row) : null;
}

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
        return redirect('/admin/registrations', env);
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

      if (action === 'save_workshop') {
        // Update workshop metadata
        if (body.workshop_type !== undefined) workshop.workshop_type = String(body.workshop_type);
        if (body.workshop_type_custom && body.workshop_type_custom.trim()) workshop.workshop_type = String(body.workshop_type_custom).trim();
        if (body.date_label !== undefined) workshop.date_label = String(body.date_label);
        if (body.start_time !== undefined) workshop.start_time = String(body.start_time);
        if (body.end_time !== undefined) workshop.end_time = String(body.end_time);
        if (body.venue !== undefined) workshop.venue = String(body.venue);
        if (body.address !== undefined) workshop.address = String(body.address);
        if (body.price !== undefined) workshop.price = Number(body.price) || 0;
        if (body.capacity !== undefined) workshop.capacity = Math.max(1, Number(body.capacity) || 8);
        status[key] = workshop;
        await env.COFFEE_WORKSHOP.put(STATUS_KEY, JSON.stringify(status));
        return json({ ok: true, workshop }, env);
      }

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

    if (url.pathname === '/admin/registrations.json' && request.method === 'GET') {
      if (!(await isAuthed(request, env))) return json({ ok: false, error: 'unauthorized' }, env, 401);
      return handleRegistrationsJson(env);
    }

    if (url.pathname === '/admin/export.csv') {
      if (!(await isAuthed(request, env))) return html(loginPage(), env);
      if (request.method === 'GET') return handleCsvExport(env);
    }

    if (url.pathname === '/admin/workshop-settings') {
      if (!(await isAuthed(request, env))) return html(loginPage(), env);
      if (request.method === 'GET') return handleWorkshopSettings(env);
    }

    if (url.pathname === '/admin/registration/update' && request.method === 'POST') {
      if (!(await isAuthed(request, env))) return json({ ok: false, error: 'unauthorized' }, env, 401);
      return handleRegistrationUpdate(request, env);
    }

    if (url.pathname === '/admin/registration/update-many' && request.method === 'POST') {
      if (!(await isAuthed(request, env))) return json({ ok: false, error: 'unauthorized' }, env, 401);
      return handleRegistrationUpdateMany(request, env);
    }

    if (url.pathname === '/admin/registration/delete' && request.method === 'POST') {
      if (!(await isAuthed(request, env))) return json({ ok: false, error: 'unauthorized' }, env, 401);
      return handleRegistrationDelete(request, env);
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

async function handleRegistrationsJson(env) {
  const db = env.coffee_workshop_registrations;
  if (!db) return json({ ok: false, error: 'database unavailable' }, env, 500);

  const rows = await db.prepare(
    `${ADMIN_REGISTRATION_SELECT} ORDER BY datetime(created_at) DESC, id DESC`
  ).all();

  const items = (rows.results || []).map(normalizeRegistration);

  // Compute paid_seats per workshop key from D1 (billable, paid rows)
  const paidSeatsByKey = {};
  for (const r of items) {
    if (isBillableRow(r) && r.payment_status === 'paid') {
      const key = r.workshop_key || 'other';
      paidSeatsByKey[key] = (paidSeatsByKey[key] || 0) + (Number(r.seats) || 0);
    }
  }

  const counts = {
    total: items.length,
    needs_action: items.filter(r => r.lane === 'needs_action').length,
    open_leads: items.filter(r => r.lane === 'open_leads').length,
    needs_closing: items.filter(r => r.lane === 'needs_closing').length,
    waiting_payment: items.filter(r => r.lane === 'waiting_payment').length,
    waitlist: items.filter(r => r.lane === 'waitlist').length,
    closed: items.filter(r => r.lane === 'closed').length,
    no_whatsapp: items.filter(r => r.whatsapp_status === 'pending').length,
    unpaid: items.filter(r => isBillableRow(r) && r.payment_status !== 'paid').length,
    paid_seats: items
      .filter(r => isBillableRow(r) && r.payment_status === 'paid')
      .reduce((s, r) => s + (Number(r.seats) || 0), 0),
  };

  const workshopKeys = ['all', ...new Set(items.map(r => r.workshop_key).filter(Boolean))];

  const filters = {
    workshop_keys: workshopKeys,
    whatsapp_statuses: ['all', 'pending', 'outreach_sent', 'sent', 'awaiting_reply', 'replied_interested'],
    payment_statuses: ['all', 'pending', 'bit_request_sent', 'paid'],
    registration_statuses: ['all', 'new', 'registered', 'confirmed', 'cancelled', 'needs_payment_followup', 'registered_under_shnir', 'group_member', 'not_handled', 'lead', 'interested', 'waitlist'],
    record_types: ['all', 'lead', 'registration', 'attendee'],
    crm_stages: ['all', 'open', 'awaiting_reply', 'interested', 'closing', 'closed', 'lost'],
  };

  // Build capacity summary comparing KV public status vs D1 paid seats
  const status = await getStatus(env);
  const workshop_capacity_summary = {};
  for (const [key, ws] of Object.entries(status)) {
    const capacity = Number(ws.capacity || 0);
    const public_confirmed = Number(ws.confirmed || 0);
    const wsKey = KV_KEY_TO_WORKSHOP_KEY[key] || key;
    const paid_seats = paidSeatsByKey[wsKey] || 0;
    const manual_reserved = Math.max(0, public_confirmed - paid_seats);
    workshop_capacity_summary[key] = {
      capacity,
      public_confirmed,
      paid_seats,
      manual_reserved,
      open: ws.open !== false && public_confirmed < capacity,
      mismatch: public_confirmed !== paid_seats,
      title: ws.title || '',
      date_label: ws.date_label || '',
      venue: ws.venue || '',
      address: ws.address || '',
      price: ws.price || 0,
    };
  }

  // Include full workshop config for client-side WhatsApp templates etc.
  const workshops = {};
  for (const [key, ws] of Object.entries(status)) {
    workshops[key] = {
      workshop_type: ws.workshop_type || '',
      title: ws.workshop_type || '',  // for backward compat — same as workshop_type
      date_label: ws.date_label || '',
      start_time: ws.start_time || '',
      end_time: ws.end_time || '',
      venue: ws.venue || '',
      address: ws.address || '',
      price: ws.price || 0,
      capacity: Number(ws.capacity || 0),
      open: ws.open !== false && Number(ws.confirmed || 0) < Number(ws.capacity || 0),
      workshop_key: KV_KEY_TO_WORKSHOP_KEY[key] || key,
    };
  }

  return json({ ok: true, registrations: items, counts, filters, workshops, workshop_capacity_summary }, env);
}

const UPDATE_COLUMN_MAP = Object.freeze({
  // Existing status fields
  whatsapp_status: 'whatsapp_status',
  payment_status: 'payment_status',
  registration_status: 'registration_status',
  is_spam: 'is_spam',
  notes: 'notes',
  seats: 'seats',
  amount_ils: 'amount_ils',
  // CRM-lite fields
  record_type: 'record_type',
  parent_registration_id: 'parent_registration_id',
  crm_stage: 'crm_stage',
  // Editable text fields
  name: 'name',
  phone: 'phone',
  email: 'email',
  edition: 'edition',
  request_type: 'request_type',
  workshop: 'workshop',
  workshop_date: 'workshop_date',
  source: 'source',
  group_registration: 'group_registration',
});
const ALLOWED_UPDATE_FIELDS = new Set(Object.keys(UPDATE_COLUMN_MAP));
const ALLOWED_STATUS_VALUES = Object.freeze({
  whatsapp_status: ['pending', 'outreach_sent', 'sent', 'awaiting_reply', 'replied_interested'],
  payment_status: ['pending', 'bit_request_sent', 'paid'],
  registration_status: ['new', 'confirmed', 'cancelled', 'needs_payment_followup', 'registered_under_shnir', 'not_handled', 'lead', 'group_member', 'interested', 'registered', 'waitlist'],
  is_spam: [0, 1, '0', '1', true, false],
  record_type: ['lead', 'registration', 'attendee'],
  crm_stage: ['open', 'awaiting_reply', 'interested', 'closing', 'closed', 'lost'],
});

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
  return html(renderRegistrationsAdminPage(), env);
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

async function handleWorkshopSettings(env) {
  const status = await getStatus(env);
  const WORKSHOP_TYPES = ['סדנת חליטות ביתיות', 'סדנת אספרסו'];
  const forms = Object.entries(WORKSHOPS).map(([key, w]) => {
    const current = status[key] || w;
    const wt = current.workshop_type || 'סדנת חליטות ביתיות';
    const typeOptions = WORKSHOP_TYPES.map(t => 
      `<option value="${escapeHtml(t)}" ${t===wt?'selected':''}>${escapeHtml(t)}</option>`
    ).join('');
    const fields = [
      { html: `<label>סוג הסדנה<select data-field="workshop_type" style="width:100%;padding:10px 12px;border:1px solid #eadfce;border-radius:12px;font-family:inherit;font-size:.95rem;margin-top:4px">${typeOptions}</select><input data-field="workshop_type_custom" placeholder="או הקלידו סוג חדש..." style="width:100%;padding:10px 12px;border:1px solid #eadfce;border-radius:12px;font-family:inherit;font-size:.95rem;margin-top:4px"></label>` },
      { id: 'date_label', label: 'תאריך (מוצג באתר)', value: current.date_label || '' },
      { id: 'start_time', label: 'שעת התחלה', value: current.start_time || '' },
      { id: 'end_time', label: 'שעת סיום', value: current.end_time || '' },
      { id: 'venue', label: 'שם המקום', value: current.venue || '' },
      { id: 'address', label: 'כתובת', value: current.address || '' },
      { id: 'price', label: 'מחיר (₪)', value: current.price || '' },
      { id: 'capacity', label: 'קיבולת (מקומות)', value: current.capacity || 8 },
    ];
    return `<form class="ws-form" data-key="${escapeHtml(key)}">
      <h2>${escapeHtml((current.venue||'סדנה')+' — '+(current.workshop_type||'')+' — '+(current.date_label||''))}</h2>
      ${fields.map(f => {
        if(f.html) return f.html;
        return `<label>${escapeHtml(f.label)}
          <input type="${f.id==='capacity'||f.id==='price'?'number':'text'}" 
                 data-field="${f.id}" value="${escapeHtml(String(f.value))}" 
                 ${f.id==='capacity'?'min=1':''} 
                 ${f.id==='price'?'min=0':''}>
        </label>`;
      }).join('')}
      <button type="submit">שמור</button>
      <span class="ws-msg"></span>
    </form>`;
  }).join('');

  return html(`<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>הגדרות סדנאות</title>
<style>${baseCss()}
body{display:flex;flex-direction:column;align-items:center;gap:18px;padding:40px 20px}
.ws-form{width:min(520px,100%);background:white;border:1px solid #eadfce;border-radius:24px;padding:24px;box-shadow:0 18px 50px rgba(26,14,8,.08)}
.ws-form h2{margin:0 0 16px;font-size:1.2rem}
.ws-form label{display:block;margin-bottom:10px;font-size:.9rem}
.ws-form input{width:100%;padding:10px 12px;border:1px solid #eadfce;border-radius:12px;font-family:inherit;font-size:.95rem;margin-top:4px}
.ws-form button{margin-top:12px;padding:10px 20px;background:#1a0e08;color:white;border:none;border-radius:14px;font-family:inherit;font-weight:700;cursor:pointer;width:auto}
.ws-form button:disabled{opacity:.5}
.ws-msg{font-size:.85rem;margin-right:12px}
.ws-msg.ok{color:#286b35}
.ws-msg.err{color:#8a2a22}
nav{width:min(520px,100%);display:flex;gap:12px;justify-content:flex-end}
nav a{color:#1a0e08;text-decoration:none;font-weight:700;font-size:.9rem;padding:8px 16px;border:1px solid #eadfce;border-radius:12px;background:white}
nav a:hover{background:#fbfaf8}
</style>
</head>
<body>
<nav>
  <a href="/admin/registrations">חזרה להרשמות</a>
  <form method="post" action="/admin/logout"><button class="ghost" type="submit" style="background:transparent;color:#7a6657;padding:8px 10px;width:auto;font-family:inherit">יציאה</button></form>
</nav>
${forms}
<script>
document.querySelectorAll('.ws-form').forEach(f=>{
  f.addEventListener('submit',async e=>{
    e.preventDefault();
    const btn=f.querySelector('button');
    const msg=f.querySelector('.ws-msg');
    btn.disabled=true;msg.textContent='שומר...';msg.className='ws-msg';
    const body={key:f.dataset.key,action:'save_workshop'};
    f.querySelectorAll('[data-field]').forEach(i=>{body[i.dataset.field]=i.value});
    try{
      const r=await fetch('/admin/update',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      const d=await r.json();
      if(d.ok){msg.textContent='נשמר ✓, מרענן...';msg.className='ws-msg ok';setTimeout(()=>location.reload(),600)}
      else{msg.textContent='שגיאה: '+(d.error||'')}
    }catch(err){msg.textContent='שגיאת רשת';msg.className='ws-msg err'}
    btn.disabled=false;
  });
});
</script>
</body>
</html>`, env);
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
  const validated = validateAndCoerceUpdate(field, body.value);
  if (validated.error) {
    return json({ ok: false, error: validated.error }, env, 400);
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
  await db.prepare(updateSql).bind(validated.value, id).run();

  // Insert event log
  try {
    await db.prepare(
      `INSERT INTO registration_events (registration_id, event_type, old_value, new_value)
       VALUES (?, ?, ?, ?)`
    ).bind(id, `updated:${field}`, oldValue, String(validated.value ?? '')).run();
  } catch (evErr) {
    console.error('Failed to write registration_events:', evErr);
  }

  // Fetch the updated full normalized row
  const registration = await fetchRegistrationById(db, id);

  return json({ ok: true, id, field, value: validated.value, registration }, env);
}

async function handleRegistrationUpdateMany(request, env) {
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

  const changes = body.changes;
  if (!changes || typeof changes !== 'object' || Object.keys(changes).length === 0) {
    return json({ ok: false, error: 'changes must be a non-empty object' }, env, 400);
  }

  // Validate ALL fields before writing any
  const validated = {};
  for (const [field, rawValue] of Object.entries(changes)) {
    const result = validateAndCoerceUpdate(field, rawValue);
    if (result.error) {
      return json({ ok: false, error: `field '${field}': ${result.error}` }, env, 400);
    }
    validated[field] = result;
  }

  // Fetch current values for event log
  const current = await db.prepare('SELECT * FROM registrations WHERE id = ?').bind(id).first();
  if (!current) {
    return json({ ok: false, error: 'registration not found' }, env, 404);
  }

  // Paid-as-closed consistency guard:
  // When payment_status is set to 'paid' for a billable registration (not lead/attendee),
  // and registration_status is NOT being explicitly changed, auto-set 'confirmed'.
  if (validated.payment_status?.value === 'paid' && !('registration_status' in validated)) {
    const curRecordType = current.record_type || recordType(current);
    const curRegStatus = String(current.registration_status || '');
    // Only auto-confirm billable registrations (not leads, not attendees, not cancelled/spam)
    if (curRecordType === 'registration' &&
        curRegStatus !== 'cancelled' &&
        Number(current.is_spam) !== 1) {
      validated.registration_status = { value: 'confirmed' };
    }
  }

  // Build and run a single UPDATE for all changed fields
  const setClauses = [];
  const bindValues = [];
  for (const [field, result] of Object.entries(validated)) {
    const columnName = UPDATE_COLUMN_MAP[field];
    setClauses.push(`${columnName} = ?`);
    bindValues.push(result.value);
  }
  setClauses.push("updated_at = datetime('now')");
  bindValues.push(id);

  const updateSql = `UPDATE registrations SET ${setClauses.join(', ')} WHERE id = ?`;
  await db.prepare(updateSql).bind(...bindValues).run();

  // Write registration_events row per changed field
  for (const [field, result] of Object.entries(validated)) {
    const columnName = UPDATE_COLUMN_MAP[field];
    const oldValue = String(current[columnName] ?? '');
    try {
      await db.prepare(
        `INSERT INTO registration_events (registration_id, event_type, old_value, new_value)
         VALUES (?, ?, ?, ?)`
      ).bind(id, `updated:${field}`, oldValue, String(result.value ?? '')).run();
    } catch (evErr) {
      console.error('Failed to write registration_events:', evErr);
    }
  }

  // Fetch the updated full normalized row
  const registration = await fetchRegistrationById(db, id);

  return json({ ok: true, id, registration }, env);
}

async function handleRegistrationDelete(request, env) {
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

  // Check if registration exists
  const existing = await db.prepare('SELECT id, name, notes, registration_status FROM registrations WHERE id = ?').bind(id).first();
  if (!existing) {
    return json({ ok: false, error: 'registration not found' }, env, 404);
  }

  // Soft-delete: mark as cancelled, append deletion note, update updated_at
  const deletionNote = body.note ? String(body.note).trim().slice(0, 500) : 'נמחק ידנית';
  const existingNotes = existing.notes || '';
  let combinedNotes = existingNotes
    ? `${existingNotes} | [ביטול: ${deletionNote}]`
    : `[ביטול: ${deletionNote}]`;
  if (combinedNotes.length > 2000) {
    // Trim if too long, preserving the deletion marker
    combinedNotes = combinedNotes.slice(0, 1990) + '…';
  }

  await db.prepare(
    `UPDATE registrations SET registration_status = 'cancelled', notes = ?, updated_at = datetime('now') WHERE id = ?`
  ).bind(combinedNotes, id).run();

  // Log event
  try {
    await db.prepare(
      `INSERT INTO registration_events (registration_id, event_type, old_value, new_value, note) VALUES (?, ?, ?, ?, ?)`
    ).bind(id, 'deleted', existing.registration_status ?? '', 'cancelled', deletionNote).run();
  } catch (evErr) {
    console.error('Failed to write deletion event:', evErr);
  }

  // Fetch full normalized registration
  const registration = await fetchRegistrationById(db, id);

  return json({ ok: true, id, registration }, env);
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
        <h1>${escapeHtml(w.workshop_type||key)}</h1>
        <p>${escapeHtml(w.date_label||'')} · ${escapeHtml(w.start_time||'')}–${escapeHtml(w.end_time||'')}</p>
        <p>${escapeHtml(w.venue||'')} · ${escapeHtml(w.address||'')}</p>
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
    <a href="/admin/registrations">צפייה בהרשמות</a>
    <a href="/admin/export.csv">ייצוא CSV</a>
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
