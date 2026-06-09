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
    <p>כניסה פרטית לעדכון מספר המקומות המאושרים.</p>
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
</style>
</head>
<body>
  <div class="logout-bar"><form method="post" action="/admin/logout"><button class="ghost" type="submit">יציאה</button></form></div>
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
