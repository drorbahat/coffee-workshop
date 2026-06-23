// ───────────────────────────────────────────────
// admin-ui/page.js
// Renders the HTML shell for the A+B hybrid admin UI
// Imports CSS and client JS from sibling modules
// ───────────────────────────────────────────────

import { adminCss } from './styles.js';
import { adminClientJs } from './client.js';

export function renderAdminShell() {
  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>ניהול הרשמות — דרור</title>
<style>${adminCss}</style>
</head>
<body>
<div class="app-shell">

  <!-- ── Command header ────────────────── -->
  <header class="command-header">
    <h1>ניהול הרשמות</h1>
    <div class="header-meta">
      <span class="last-refresh" id="lastRefresh">טוען...</span>
      <input type="search" class="global-search" id="filterSearch" placeholder="חיפוש שם, טלפון, סדנה…" autocomplete="off">
      <button class="icon-btn" id="refreshBtn" title="רענן">רענן</button>
      <a href="/admin/export.csv" class="link-btn" title="ייצוא CSV">CSV</a>
    </div>
  </header>

  <!-- ── Tab bar ───────────────────────── -->
  <nav class="tab-bar">
    <button class="tab-btn active" data-tab="cockpit">קוקפיט</button>
    <button class="tab-btn" data-tab="table">טבלה</button>
  </nav>

  <!-- ── KPI band ──────────────────────── -->
  <section class="kpi-band" id="kpi-band">
    <div class="kpi-item"><div class="kpi-num">—</div><div class="kpi-label">סה״כ</div></div>
    <div class="kpi-item needs"><div class="kpi-num">—</div><div class="kpi-label">צריך טיפול</div></div>
    <div class="kpi-item wait"><div class="kpi-num">—</div><div class="kpi-label">ממתין לתשלום</div></div>
    <div class="kpi-item closed"><div class="kpi-num">—</div><div class="kpi-label">שולם / מקומות</div></div>
  </section>

  <!-- ── Filters ───────────────────────── -->
  <section class="filter-strip">
    <select id="filterWorkshop"><option value="all">כל הסדנאות</option></select>
    <select id="filterWhatsapp">
      <option value="all">וואטסאפ: הכל</option>
      <option value="pending">לא נשלחה</option>
      <option value="outreach_sent">נשלחה</option>
      <option value="sent">נשלחה</option>
      <option value="awaiting_reply">ממתין לתשובה</option>
      <option value="replied_interested">חזר מעוניין</option>
    </select>
    <select id="filterPayment">
      <option value="all">תשלום: הכל</option>
      <option value="pending">לא שולם</option>
      <option value="bit_request_sent">Bit נשלח</option>
      <option value="paid">שולם</option>
    </select>
    <select id="filterRegistration">
      <option value="all">סטטוס: הכל</option>
      <option value="new">חדש</option>
      <option value="confirmed">מאושר</option>
      <option value="lead">ליד</option>
      <option value="interested">מעוניין</option>
      <option value="registered">נרשם</option>
      <option value="needs_payment_followup">פולואפ תשלום</option>
      <option value="not_handled">לא טופל</option>
      <option value="group_member">הרשמה קבוצתית</option>
      <option value="registered_under_shnir">הרשמה קבוצתית</option>
      <option value="cancelled">בוטל</option>
    </select>
    <select id="filterRecordType">
      <option value="all">סוג: הכל</option>
      <option value="lead">ליד</option>
      <option value="registration">הרשמה</option>
      <option value="attendee">כלול בהרשמה</option>
    </select>
    <select id="filterCrmStage">
      <option value="all">שלב: הכל</option>
      <option value="open">פתוח</option>
      <option value="awaiting_reply">ממתין לתשובה</option>
      <option value="interested">מעוניין</option>
      <option value="closing">בסגירה</option>
      <option value="closed">סגור</option>
      <option value="lost">אבד</option>
    </select>
    <div class="chip-group" id="quickChips">
      <button class="chip" data-quick="needs_action">צריך טיפול</button>
      <button class="chip" data-quick="no_whatsapp">לא נשלחה הודעה</button>
      <button class="chip" data-quick="unpaid">לא שילמו</button>
      <button class="chip" data-quick="spam">ספאם</button>
    </div>
    <label style="display:flex;align-items:center;gap:4px;font-size:.78rem;color:var(--text-secondary);cursor:pointer">
      <input type="checkbox" id="showCancelled"> הצג מבוטלים
    </label>
  </section>

  <!-- ── Cockpit view ──────────────────── -->
  <main>
    <div id="cockpit-view">
      <div class="lane needs_action">
        <div class="lane-header">
          <span class="lane-dot" style="background:#b85a3a"></span>
          <h2>צריך הודעה</h2>
          <span class="lane-count">0</span>
        </div>
        <div class="lane-items"></div>
      </div>
      <div class="lane open_leads">
        <div class="lane-header">
          <span class="lane-dot" style="background:#5a5a7a"></span>
          <h2>מחכה לתשובה</h2>
          <span class="lane-count">0</span>
        </div>
        <div class="lane-items"></div>
      </div>
      <div class="lane needs_closing">
        <div class="lane-header">
          <span class="lane-dot" style="background:#8a6a20"></span>
          <h2>לסגור הרשמה</h2>
          <span class="lane-count">0</span>
        </div>
        <div class="lane-items"></div>
      </div>
      <div class="lane waiting_payment">
        <div class="lane-header">
          <span class="lane-dot" style="background:#b8913a"></span>
          <h2>ממתין לתשלום</h2>
          <span class="lane-count">0</span>
        </div>
        <div class="lane-items"></div>
      </div>
      <div class="lane closed">
        <div class="lane-header">
          <span class="lane-dot" style="background:#3a7a4a"></span>
          <h2>סגור / שולם</h2>
          <span class="lane-count">0</span>
        </div>
        <div class="lane-items"></div>
      </div>
    </div>

    <!-- ── Table view ──────────────────── -->
    <div id="table-view" class="v-hide">
      <div class="table-shell">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th class="sticky-col">שם + טלפון</th>
                <th>נרשם</th>
                <th>סדנה / תאריך</th>
                <th>מקומות</th>
                <th>וואטסאפ</th>
                <th>תשלום</th>
                <th>סטטוס</th>
                <th>סוג</th>
                <th>שלב</th>
                <th>מקור</th>
                <th>הערות</th>
                <th>פעולה</th>
              </tr>
            </thead>
            <tbody id="table-body"></tbody>
          </table>
        </div>
      </div>
    </div>
  </main>

  <!-- ── Details panel ─────────────────── -->
  <aside id="details-panel">
    <div class="details-overlay" id="details-overlay"></div>
    <div class="details-inner">
      <div class="details-header">
        <h2 id="details-title">חלונית פרטים</h2>
        <button class="details-close" id="details-close">&times;</button>
      </div>
      <div class="details-body" id="details-body"></div>
      <div class="details-actions" id="details-actions"></div>
    </div>
  </aside>

</div>

<!-- ── Toast region ────────────────────── -->
<div id="toast-region"></div>

<script>${adminClientJs}</script>
</body>
</html>`;
}
