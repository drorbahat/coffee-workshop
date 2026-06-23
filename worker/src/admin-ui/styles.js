/* ───────────────────────────────────────────────
 * admin-ui/styles.js
 * A+B hybrid: Linear Pro Cockpit precision +
 * Neutral Spreadsheet table + Apple details panel
 * RTL Hebrew first — no generic SaaS slop
 * ─────────────────────────────────────────────── */

export const adminCss = `
/* ── Reset & base ────────────────────────────── */
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{font-size:15px}
body{
  background:#f8f7f5;
  color:#1a1512;
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;
  padding:0;
  min-height:100vh;
  direction:rtl;
  -webkit-font-smoothing:antialiased;
}

/* ── Variables ───────────────────────────────── */
:root{
  --bg: #f8f7f5;
  --surface: #ffffff;
  --hairline: #e4e1dd;
  --hairline-strong: #d2cec8;
  --text: #1a1512;
  --text-secondary: #6b6560;
  --text-tertiary: #9b9590;
  --accent: #7a4a2a;
  --accent-light: #f0ebe6;
  --accent-hover: #6a3d20;
  --green: #2d6e3f;
  --green-bg: #eaf4ed;
  --amber: #8a6a20;
  --amber-bg: #f5f0e0;
  --red: #8a3a2a;
  --red-bg: #f5e6e2;
  --radius-sm: 6px;
  --radius: 10px;
  --radius-xl: 16px;
  --shadow: 0 1px 3px rgba(26,21,18,.06);
  --shadow-lg: 0 4px 20px rgba(26,21,18,.1);
  --font-mono: 'SF Mono','Cascadia Code','JetBrains Mono',monospace;
  --lane-needs: #b85a3a;
  --lane-wait: #b8913a;
  --lane-closed: #3a7a4a;
  --lane-updates: #5a5a7a;
  --lane-closing: #8a6a20;
}

/* ── Layout ──────────────────────────────────── */
.app-shell{max-width:1360px;margin:0 auto;padding:0 20px 40px}

/* ── Command header ─────────────────────────── */
.command-header{
  display:flex;
  flex-wrap:wrap;
  align-items:center;
  gap:12px;
  padding:14px 0;
  border-bottom:1px solid var(--hairline);
  margin-bottom:16px;
}
.command-header h1{
  font-size:1.1rem;
  font-weight:700;
  color:var(--text);
  letter-spacing:-.01em;
  white-space:nowrap;
}
.command-header .header-meta{
  display:flex;
  align-items:center;
  gap:8px;
  margin-right:auto;
}
.header-meta .last-refresh{
  font-size:.75rem;
  color:var(--text-tertiary);
  white-space:nowrap;
}
.header-meta .global-search{
  padding:6px 12px;
  border:1px solid var(--hairline);
  border-radius:var(--radius-sm);
  font-family:inherit;
  font-size:.8rem;
  background:var(--surface);
  color:var(--text);
  width:180px;
  outline:none;
  transition:border-color .15s;
}
.header-meta .global-search:focus{border-color:var(--accent)}
.header-meta .icon-btn{
  background:var(--surface);
  border:1px solid var(--hairline);
  border-radius:var(--radius-sm);
  width:32px;height:32px;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  cursor:pointer;
  color:var(--text-secondary);
  font-size:.85rem;
  transition:all .12s;
}
.header-meta .icon-btn:hover{background:var(--accent-light);color:var(--accent)}
.header-meta .link-btn{
  font-size:.8rem;
  color:var(--text-secondary);
  text-decoration:none;
  padding:6px 12px;
  border:1px solid var(--hairline);
  border-radius:var(--radius-sm);
  background:var(--surface);
  transition:all .12s;
}
.header-meta .link-btn:hover{background:var(--accent-light);color:var(--accent)}

/* ── Tabs / segmented switch ────────────────── */
.tab-bar{
  display:flex;
  gap:0;
  border-bottom:1px solid var(--hairline);
  margin-bottom:16px;
}
.tab-btn{
  background:transparent;
  border:none;
  border-bottom:2px solid transparent;
  padding:10px 20px;
  font-family:inherit;
  font-size:.85rem;
  font-weight:600;
  color:var(--text-secondary);
  cursor:pointer;
  transition:all .15s;
  margin-bottom:-1px;
}
.tab-btn:hover{color:var(--text)}
.tab-btn.active{
  color:var(--text);
  border-bottom-color:var(--accent);
}

/* ── KPI band ────────────────────────────────── */
.kpi-band{
  display:grid;
  grid-template-columns:repeat(4,1fr);
  gap:8px;
  margin-bottom:16px;
}
.kpi-item{
  background:var(--surface);
  border:1px solid var(--hairline);
  border-radius:var(--radius);
  padding:12px 14px;
  text-align:center;
}
.kpi-item .kpi-num{
  font-size:1.6rem;
  font-weight:700;
  line-height:1.2;
  color:var(--text);
}
.kpi-item .kpi-label{
  font-size:.7rem;
  color:var(--text-secondary);
  text-transform:uppercase;
  letter-spacing:.04em;
}
.kpi-item.needs .kpi-num{color:var(--lane-needs)}
.kpi-item.wait .kpi-num{color:var(--lane-wait)}
.kpi-item.closed .kpi-num{color:var(--lane-closed)}

/* ── Capacity band ──────────────────────────── */
.capacity-band{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:8px;
  margin-bottom:16px;
}
.capacity-card{
  background:var(--surface);
  border:1px solid var(--hairline);
  border-radius:var(--radius);
  padding:10px 14px;
}
.capacity-card.capacity-mismatch-card{
  border-color:var(--red);
  background:var(--red-bg);
}
.capacity-title{
  font-size:.85rem;
  font-weight:700;
  color:var(--text);
  margin-bottom:4px;
}
.capacity-numbers{
  font-size:.8rem;
  color:var(--text-secondary);
}
.capacity-num{
  font-weight:700;
  font-size:1.1rem;
  color:var(--text);
}
.capacity-den{
  color:var(--text-tertiary);
}
.capacity-label{
  font-size:.72rem;
  color:var(--text-tertiary);
}
.capacity-reserved{
  font-size:.72rem;
  color:var(--text-tertiary);
}
.capacity-reserved-note{
  margin-top:6px;
  font-size:.75rem;
  font-weight:600;
  color:var(--blue);
}
.capacity-mismatch{
  margin-top:6px;
  font-size:.75rem;
  font-weight:600;
  color:var(--red);
}

/* ── Filters ────────────────────────────────── */
.filter-strip{
  display:flex;
  flex-wrap:wrap;
  gap:8px;
  align-items:center;
  margin-bottom:16px;
}
.filter-strip select{
  padding:6px 10px;
  border:1px solid var(--hairline);
  border-radius:var(--radius-sm);
  font-family:inherit;
  font-size:.8rem;
  background:var(--surface);
  color:var(--text);
  outline:none;
  cursor:pointer;
  min-width:120px;
}
.filter-strip select:focus{border-color:var(--accent)}
.chip-group{
  display:flex;
  gap:4px;
  flex-wrap:wrap;
}
.chip{
  padding:4px 12px;
  border:1px solid var(--hairline);
  border-radius:999px;
  font-size:.75rem;
  font-weight:600;
  background:var(--surface);
  color:var(--text-secondary);
  cursor:pointer;
  transition:all .12s;
  white-space:nowrap;
}
.chip:hover{border-color:var(--hairline-strong);color:var(--text)}
.chip.active{
  background:var(--accent);
  border-color:var(--accent);
  color:white;
}
.chip.cancelled-toggle.active{background:var(--text-secondary);border-color:var(--text-secondary)}

/* ── Cockpit lanes ──────────────────────────── */
#cockpit-view{
  display:grid;
  grid-template-columns:1fr;
  gap:10px;
}
.lane{
  background:var(--surface);
  border:1px solid var(--hairline);
  border-radius:var(--radius);
  padding:14px;
}
.lane-header{
  display:flex;
  align-items:center;
  gap:8px;
  margin-bottom:10px;
  padding-bottom:8px;
  border-bottom:1px solid var(--hairline);
}
.lane-header .lane-dot{
  width:8px;height:8px;
  border-radius:50%;
  flex-shrink:0;
}
.lane.needs_action .lane-dot{background:var(--lane-needs)}
.lane.open_leads .lane-dot{background:var(--lane-updates)}
.lane.needs_closing .lane-dot{background:var(--lane-closing)}
.lane.waiting_payment .lane-dot{background:var(--lane-wait)}
.lane.closed .lane-dot{background:var(--lane-closed)}
.lane-header h2{
  font-size:.8rem;
  font-weight:700;
  color:var(--text-secondary);
  text-transform:uppercase;
  letter-spacing:.03em;
}
.lane-header .lane-count{
  background:var(--bg);
  border-radius:999px;
  padding:0 8px;
  font-size:.7rem;
  font-weight:600;
  color:var(--text-tertiary);
  margin-right:auto;
}
.lane-items{display:flex;flex-direction:column;gap:6px}
.lane-empty{
  padding:20px 10px;
  text-align:center;
  font-size:.75rem;
  color:var(--text-tertiary);
  border:1px dashed var(--hairline);
  border-radius:var(--radius-sm);
}

/* Cockpit card */
.cockpit-card{
  padding:10px 12px;
  border:1px solid var(--hairline);
  border-radius:var(--radius-sm);
  cursor:pointer;
  transition:all .12s;
  position:relative;
}
.cockpit-card:hover{border-color:var(--accent);box-shadow:var(--shadow)}
.cockpit-card .card-top{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:8px;
  margin-bottom:4px;
}
.cockpit-card .card-name{
  font-size:.88rem;
  font-weight:600;
  color:var(--text);
}
.cockpit-card .card-date{
  font-size:.7rem;
  color:var(--text-tertiary);
  white-space:nowrap;
}
.cockpit-card .card-meta{
  font-size:.75rem;
  color:var(--text-secondary);
  margin-bottom:6px;
  display:flex;
  gap:6px;
  align-items:center;
  flex-wrap:wrap;
}
.cockpit-card .card-tags{
  display:flex;
  gap:4px;
  flex-wrap:wrap;
  margin-bottom:6px;
}
.tag{
  font-size:.65rem;
  font-weight:600;
  padding:2px 8px;
  border-radius:999px;
  display:inline-block;
}
.tag-need{background:var(--red-bg);color:var(--red)}
.tag-wait{background:var(--amber-bg);color:var(--amber)}
.tag-ok{background:var(--green-bg);color:var(--green)}
.tag-muted{background:var(--bg);color:var(--text-tertiary)}
.cockpit-card .card-seats{
  font-size:.7rem;
  color:var(--text-tertiary);
}
.card-lead-status{
  font-size:.7rem;
  color:var(--lane-updates);
  margin-bottom:4px;
  font-weight:600;
}

/* Card status row — Sprint 1: single human-readable status + payment */
.card-status-row{
  display:flex;
  gap:4px;
  flex-wrap:wrap;
  align-items:center;
  margin-bottom:6px;
}

/* Card action button */
.card-action-btn{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  gap:4px;
  width:100%;
  margin-top:6px;
  padding:8px 14px;
  min-height:38px;
  border:1px solid var(--accent);
  border-radius:var(--radius-sm);
  background:var(--accent);
  color:white;
  font-family:inherit;
  font-size:.75rem;
  font-weight:600;
  cursor:pointer;
  transition:all .12s;
}
.card-action-btn:hover{background:var(--accent-hover)}
.card-action-btn.saving{opacity:.6;pointer-events:none}
.card-action-btn.secondary{background:var(--surface);color:var(--accent)}
.card-action-btn.secondary:hover{background:var(--accent-light)}

/* ── Table view ─────────────────────────────── */
.table-shell{
  background:var(--surface);
  border:1px solid var(--hairline);
  border-radius:var(--radius);
  overflow:hidden;
}
.table-wrap{
  overflow-x:auto;
  max-height:calc(100vh - 280px);
}
.table-wrap table{
  width:100%;
  border-collapse:collapse;
  font-size:.78rem;
  min-width:900px;
}
.table-wrap th,.table-wrap td{
  padding:8px 10px;
  text-align:right;
  border-bottom:1px solid var(--hairline);
  white-space:nowrap;
  vertical-align:middle;
}
.table-wrap th{
  background:var(--bg);
  font-weight:600;
  color:var(--text-secondary);
  position:sticky;
  top:0;
  z-index:2;
  font-size:.72rem;
  text-transform:uppercase;
  letter-spacing:.03em;
}
.table-wrap tr:hover{background:#f5f3f0}
.table-wrap tr.cancelled{opacity:.5}
.sticky-col{
  position:sticky;
  right:0;
  background:var(--surface);
  z-index:3;
  box-shadow:-1px 0 0 var(--hairline);
}
th.sticky-col{z-index:4}
tr:hover .sticky-col{background:#f5f3f0}
tr.cancelled .sticky-col{opacity:.5}

/* Inline edit inputs */
.td-edit-input,.td-edit-select{
  width:100%;
  min-width:60px;
  padding:4px 6px;
  border:1px solid transparent;
  border-radius:3px;
  font-family:inherit;
  font-size:.78rem;
  color:var(--text);
  background:transparent;
  outline:none;
  transition:all .1s;
}
.td-edit-input:hover,.td-edit-select:hover{border-color:var(--hairline)}
.td-edit-input:focus,.td-edit-select:focus{
  border-color:var(--accent);
  background:var(--surface);
  box-shadow:0 0 0 2px rgba(122,74,42,.15);
}
.td-edit-select{
  cursor:pointer;
  -webkit-appearance:none;
  appearance:none;
  background-image:url("data:image/svg+xml,%3Csvg width='8' height='5' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l3 3 3-3' stroke='%239b9590' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E");
  background-repeat:no-repeat;
  background-position:left 6px center;
  padding-left:18px;
}
.td-name-cell{
  display:flex;
  align-items:center;
  gap:8px;
  flex-wrap:wrap;
}
.td-phone{
  font-size:.7rem;
  color:var(--text-tertiary);
  direction:ltr;
  unicode-bidi:isolate;
  display:block;
}
.td-group-badge{
  display:inline-block;
  font-size:.62rem;
  font-weight:600;
  color:var(--text-tertiary);
  background:var(--bg);
  border-radius:999px;
  padding:1px 6px;
  white-space:nowrap;
  vertical-align:middle;
}
.td-payment-badge{
  display:inline-block;
  font-size:.72rem;
  font-weight:600;
  padding:2px 8px;
  border-radius:999px;
  white-space:nowrap;
}

/* ── Details panel / bottom sheet ───────────── */
#details-panel{
  position:fixed;
  top:0;left:0;right:0;bottom:0;
  z-index:1000;
  pointer-events:none;
}
#details-panel.open{pointer-events:all}
.details-overlay{
  position:absolute;
  inset:0;
  background:rgba(26,21,18,.3);
  opacity:0;
  transition:opacity .2s;
}
#details-panel.open .details-overlay{opacity:1}
.details-inner{
  position:absolute;
  top:0;
  left:auto;
  right:0;
  width:420px;
  max-width:100%;
  height:100%;
  background:var(--surface);
  box-shadow:-4px 0 30px rgba(26,21,18,.12);
  padding:0;
  overflow-y:auto;
  transform:translateX(100%);
  transition:transform .3s cubic-bezier(.22,1,.36,1);
  display:flex;
  flex-direction:column;
}
#details-panel.open .details-inner{transform:translateX(0)}
.details-header{
  display:flex;
  align-items:center;
  justify-content:space-between;
  padding:16px 20px;
  border-bottom:1px solid var(--hairline);
  flex-shrink:0;
}
.details-header h2{
  font-size:1rem;
  font-weight:700;
  color:var(--text);
}
.details-close{
  background:none;
  border:none;
  font-size:1.2rem;
  color:var(--text-tertiary);
  cursor:pointer;
  padding:4px 8px;
  border-radius:var(--radius-sm);
  transition:all .12s;
}
.details-close:hover{background:var(--bg);color:var(--text)}
.details-body{
  padding:16px 20px 100px;
  flex:1;
  overflow-y:auto;
}
.details-field-group{
  margin-bottom:16px;
}

/* Details hero — Sprint 1: action-first header */
.details-hero{
  background:var(--accent-light);
  border-radius:var(--radius-sm);
  padding:12px 14px;
  margin-bottom:16px;
}
.details-hero-name{
  font-size:1.15rem;
  font-weight:700;
  color:var(--text);
  margin-bottom:4px;
}
.details-hero-meta{
  display:flex;
  gap:10px;
  align-items:center;
  font-size:.82rem;
  color:var(--text-secondary);
  margin-bottom:6px;
  flex-wrap:wrap;
}
.details-hero-workshop{
  font-weight:600;
}
.details-field-group h3{
  font-size:.7rem;
  font-weight:700;
  color:var(--text-secondary);
  text-transform:uppercase;
  letter-spacing:.04em;
  margin-bottom:6px;
  padding-bottom:4px;
  border-bottom:1px solid var(--hairline);
}
.details-field{
  display:flex;
  align-items:baseline;
  gap:8px;
  padding:6px 0;
  border-bottom:1px solid #f0eeeb;
}
.details-field:last-child{border-bottom:none}
.details-field .field-label{
  font-size:.78rem;
  font-weight:600;
  color:var(--text-secondary);
  min-width:80px;
  flex-shrink:0;
}
.details-field .field-value{
  font-size:.82rem;
  color:var(--text);
  word-break:break-word;
}
.details-field .field-value.ltr{direction:ltr;unicode-bidi:isolate;display:inline-block}
.details-input,.details-select,.details-textarea{
  width:100%;
  padding:6px 10px;
  border:1px solid var(--hairline);
  border-radius:var(--radius-sm);
  font-family:inherit;
  font-size:.82rem;
  color:var(--text);
  background:var(--bg);
  outline:none;
  transition:border-color .12s;
}
.details-input:focus,.details-select:focus,.details-textarea:focus{border-color:var(--accent);background:var(--surface)}
.details-textarea{min-height:60px;resize:vertical}
.details-actions{
  padding:12px 20px;
  border-top:1px solid var(--hairline);
  display:flex;
  flex-direction:column;
  gap:6px;
  background:var(--surface);
  flex-shrink:0;
}
.details-action-btn{
  width:100%;
  padding:10px;
  border-radius:var(--radius-sm);
  border:1px solid var(--hairline);
  font-family:inherit;
  font-size:.82rem;
  font-weight:600;
  cursor:pointer;
  background:var(--surface);
  color:var(--text);
  transition:all .12s;
  text-align:center;
}
.details-action-btn:hover{background:var(--bg)}
.details-action-btn.primary{background:var(--accent);color:white;border-color:var(--accent)}
.details-action-btn.primary:hover{background:var(--accent-hover)}
.details-action-btn.primary.saving{opacity:.6;pointer-events:none}
.details-action-btn.secondary{background:var(--surface);color:var(--accent);border-color:var(--accent)}
.details-action-btn.secondary:hover{background:var(--accent-light)}
.details-action-btn.danger{background:var(--red);color:white;border-color:var(--red)}
.details-action-btn.danger:hover{background:#7a2e1e}
.details-action-btn.danger.saving{opacity:.6;pointer-events:none}

/* ── Toast ──────────────────────────────────── */
#toast-region{
  position:fixed;
  bottom:20px;
  left:50%;
  transform:translateX(-50%);
  z-index:9999;
  pointer-events:none;
}
.toast{
  background:var(--text);
  color:white;
  padding:8px 18px;
  border-radius:var(--radius-sm);
  font-size:.82rem;
  opacity:0;
  transform:translateY(8px);
  transition:all .25s;
  pointer-events:none;
  white-space:nowrap;
}
.toast.show{opacity:1;transform:translateY(0)}

/* ── Status badge inline ────────────────────── */
.status-badge{
  display:inline-block;
  padding:1px 8px;
  border-radius:999px;
  font-size:.65rem;
  font-weight:600;
}

/* ── Hidden ─────────────────────────────────── */
.v-hide{display:none!important}

/* ── Responsive ─────────────────────────────── */
@media(min-width:900px){
  #cockpit-view{grid-template-columns:1fr 1fr 1fr}
  .app-shell{padding:0 32px 40px}
}
@media(min-width:1200px){
  #cockpit-view{grid-template-columns:1fr 1fr 1fr 1fr 1fr}
}
@media(max-width:700px){
  .kpi-band{grid-template-columns:repeat(2,1fr)}
  .command-header .header-meta .global-search{width:120px}
  .filter-strip{flex-direction:column;align-items:stretch}
  .filter-strip select{width:100%}
  .chip-group{width:100%}
  .details-inner{
    width:100%;
    top:auto;
    bottom:0;
    height:85vh;
    transform:translateY(100%);
    border-radius:var(--radius-xl) var(--radius-xl) 0 0;
  }
  #details-panel.open .details-inner{transform:translateY(0)}
  .details-body{padding-bottom:120px}
}
`;
