# Remote Status Endpoint + Local Fallback — Integration Patterns

## 1. Current Integration Points (index.html)

### `loadWorkshopStatus()` — lines 458–494
- **Fetch URL**: `workshop-status.json?ts=${Date.now()}` — local file, cache-busted
- **Expected JSON shape**: `{ filter_2026_06_15: { capacity, confirmed, open } }`
- **Side effects when full**:
  - Hides the booking radio choice (`filterDateChoice.style.display = 'none'`)
  - Disables the booking input (`filterDateInput.disabled = true`)
  - Swaps CSS class from `primary-workshop` → `full-workshop`
  - Changes badge text to `'המועד מלא'`
  - Changes availability note text
- **Side effects when open**:
  - Re-enables everything, restores class, badge, note text
- **Error handling**: silent catch — if fetch fails, page stays in default (open) state

### `syncChoice()` — lines 496–539
- References `filterDateFull` (set by `loadWorkshopStatus`) at line 525
- If full, skips "register for date" branch even if the date radio is checked

### Call site — line 551
```js
loadWorkshopStatus();  // fire-and-forget, no await
```

### HTML elements touched by status logic
| Element ID | Role |
|---|---|
| `filter_workshop_card` | Card div — gets `full-workshop` class when full |
| `filter_status_badge` | Badge span — text changes |
| `filter_availability_note` | Note div — text changes |
| `filter_date_choice` | Radio label — hidden when full |
| `i_filter_date` | Radio input — disabled when full |

---

## 2. Minimal Change: Remote Worker with Local Fallback

Replace the single-fetch pattern with a two-source strategy.

### Pattern A: Try remote first, fall back to local JSON (recommended)

```js
const REMOTE_URL = 'https://coffee-admin.<subdomain>.workers.dev/api/status';
const LOCAL_URL  = 'workshop-status.json';

async function loadWorkshopStatus() {
  // 1. Try remote
  try {
    const resp = await fetch(REMOTE_URL, {
      headers: { 'Accept': 'application/json' }
      // No cache-bust query param; Cloudflare edge cache handles freshness.
      // Cloudflare Workers have default cache of 0 for non-static, or can set
      // 'Cache-Control: max-age=30' in Worker response for mild caching.
    });
    if (resp.ok) {
      const status = await resp.json();
      applyStatus(status);
      // Optional: cache in sessionStorage so page survives Worker restarts
      try { sessionStorage.setItem('ws_status', JSON.stringify(status)); } catch(_){}
      return;
    }
  } catch (_) { /* network error → fall through to local */ }

  // 2. Fallback: cached copy in sessionStorage (survives refresh, not tab close)
  try {
    const cached = sessionStorage.getItem('ws_status');
    if (cached) { applyStatus(JSON.parse(cached)); return; }
  } catch (_) {}

  // 3. Last resort: local JSON file served by GitHub Pages
  try {
    const resp = await fetch(LOCAL_URL + '?ts=' + Date.now(), { cache: 'no-store' });
    if (resp.ok) {
      const status = await resp.json();
      applyStatus(status);
      return;
    }
  } catch (_) {}

  // 4. Nothing worked — page stays in default (open) state.
  //    This is the safest default: never block registrations on a network error.
}

function applyStatus(status) {
  const workshop = status.filter_2026_06_15;
  if (!workshop) return;

  const confirmed = Number(workshop.confirmed || 0);
  const capacity  = Number(workshop.capacity || 8);
  filterDateFull = workshop.open === false || confirmed >= capacity;

  if (filterDateFull) {
    filterDateInput.checked = false;
    filterDateInput.disabled = true;
    filterDateChoice.style.display = 'none';
    filterWorkshopCard.classList.remove('primary-workshop');
    filterWorkshopCard.classList.add('full-workshop');
    filterStatusBadge.textContent = 'המועד מלא';
    filterStatusBadge.classList.add('full-badge');
    filterAvailabilityNote.textContent =
      'המועד הקרוב התמלא. אפשר להשאיר פרטים ואעדכן כשייפתח מועד נוסף.';
  } else {
    filterDateInput.disabled = false;
    filterDateChoice.style.display = '';
    filterWorkshopCard.classList.add('primary-workshop');
    filterWorkshopCard.classList.remove('full-workshop');
    filterStatusBadge.textContent = 'מועד פתוח';
    filterStatusBadge.classList.remove('full-badge');
    filterAvailabilityNote.textContent = confirmed > 0
      ? `המקום נשמר רק אחרי אישור תשלום. נותרו ${capacity - confirmed} מקומות.`
      : 'המקום נשמר רק אחרי אישור תשלום.';
  }
  syncChoice();
}
```

### What changes in the patch

**Only `loadWorkshopStatus()` changes.** Extract the DOM mutations into `applyStatus(status)`
so both remote and local paths share the same logic. No other function, no HTML, no CSS changes needed.

### Exact diff (lines 458–494 in current index.html)

Replace the entire `loadWorkshopStatus` function body with:

```
OLD (lines 458–494):
  async function loadWorkshopStatus() {
    try {
      const response = await fetch('workshop-status.json?ts=' + Date.now(), { cache: 'no-store' });
      if (!response.ok) return;
      const status = await response.json();
      const workshop = status.filter_2026_06_15;
      if (!workshop) return;

      const confirmed = Number(workshop.confirmed || 0);
      const capacity = Number(workshop.capacity || 8);
      filterDateFull = workshop.open === false || confirmed >= capacity;

      if (filterDateFull) {
        ... (20+ lines of DOM mutations)
      } else {
        ... (another block)
      }
      syncChoice();
    } catch (_) { }
  }

NEW:
  const STATUS_WORKER_URL = 'https://coffee-admin.<subdomain>.workers.dev/api/status';

  async function loadWorkshopStatus() {
    // 1. Remote Worker (Cloudflare KV — source of truth)
    try {
      const resp = await fetch(STATUS_WORKER_URL, { headers: { 'Accept': 'application/json' } });
      if (resp.ok) {
        const status = await resp.json();
        applyStatus(status);
        try { sessionStorage.setItem('ws_status', JSON.stringify(status)); } catch (_) {}
        return;
      }
    } catch (_) {}

    // 2. Stale cache in sessionStorage (survives Worker downtime for current tab)
    try {
      const raw = sessionStorage.getItem('ws_status');
      if (raw) { applyStatus(JSON.parse(raw)); return; }
    } catch (_) {}

    // 3. Local JSON fallback (GitHub Pages — updated manually or by Git sync Action)
    try {
      const resp = await fetch('workshop-status.json?ts=' + Date.now(), { cache: 'no-store' });
      if (resp.ok) { applyStatus(await resp.json()); return; }
    } catch (_) {}

    // 4. Nothing worked — page stays in default open state (safe default)
  }

  function applyStatus(status) {
    const workshop = status.filter_2026_06_15;
    if (!workshop) return;

    const confirmed = Number(workshop.confirmed || 0);
    const capacity  = Number(workshop.capacity || 8);
    filterDateFull = workshop.open === false || confirmed >= capacity;

    if (filterDateFull) {
      filterDateInput.checked = false;
      filterDateInput.disabled = true;
      filterDateChoice.style.display = 'none';
      filterWorkshopCard.classList.remove('primary-workshop');
      filterWorkshopCard.classList.add('full-workshop');
      filterStatusBadge.textContent = 'המועד מלא';
      filterStatusBadge.classList.add('full-badge');
      filterAvailabilityNote.textContent =
        'המועד הקרוב התמלא. אפשר להשאיר פרטים ואעדכן כשייפתח מועד נוסף.';
    } else {
      filterDateInput.disabled = false;
      filterDateChoice.style.display = '';
      filterWorkshopCard.classList.add('primary-workshop');
      filterWorkshopCard.classList.remove('full-workshop');
      filterStatusBadge.textContent = 'מועד פתוח';
      filterStatusBadge.classList.remove('full-badge');
      filterAvailabilityNote.textContent = confirmed > 0
        ? `המקום נשמר רק אחרי אישור תשלום. נותרו ${capacity - confirmed} מקומות.`
        : 'המקום נשמר רק אחרי אישור תשלום.';
    }
    syncChoice();
  }
```

---

## 3. Worker-Side Requirements

The Worker at `GET /api/status` must return:

```json
{
  "filter_2026_06_15": {
    "capacity": 8,
    "confirmed": <int>,
    "open": true|false
  }
}
```

Plus CORS headers:
- `Access-Control-Allow-Origin: https://<username>.github.io` (or `*` for public status)
- `Access-Control-Allow-Methods: GET, OPTIONS`
- `Content-Type: application/json`
- Optional: `Cache-Control: max-age=30` (30s client-side cache)

---

## 4. Fallback Chain Summary

```
User opens page
  │
  ├─ 1. fetch(Worker /api/status) ──── success → applyStatus + cache in sessionStorage → DONE
  │    └─ failure (network, Worker down, CORS block)
  │
  ├─ 2. sessionStorage.getItem('ws_status') ──── hit → applyStatus(cached) → DONE
  │    └─ miss (first visit, tab closed, cleared)
  │
  ├─ 3. fetch('workshop-status.json') ──── success → applyStatus → DONE
  │    └─ failure
  │
  └─ 4. Do nothing — page remains in default open state
       (User can still register; no accidental blocking)
```

---

## 5. Testing Checklist

### Unit / Manual Tests

| # | Test | Expected Result |
|---|------|----------------|
| 1 | Worker up, status open, confirmed=3 | Page shows "נותרו 5 מקומות", full registration available |
| 2 | Worker up, status full (open=false) | Date option hidden, badge says "המועד מלא", only waitlist available |
| 3 | Worker up, confirmed == capacity | Same as #2 (full) |
| 4 | Worker down (stop wrangler dev / block URL in DevTools) | Falls back to sessionStorage (if visited before) or local JSON |
| 5 | Worker down + no sessionStorage (Incognito window) | Falls back to `workshop-status.json` |
| 6 | All sources fail (block all in DevTools, delete JSON file) | Page stays open (safe default), user can register |
| 7 | Worker returns malformed JSON (e.g., error HTML) | `resp.json()` throws → falls through to next tier |
| 8 | Worker returns 200 but missing `filter_2026_06_15` key | `applyStatus` returns early, no DOM changes — safe open state |
| 9 | Worker returns 500 | `resp.ok` is false → falls through to next tier |
| 10 | Admin clicks +1 in admin UI → refresh landing page | Confirmed count increments, availability note updates immediately |
| 11 | CORS: Worker on `workers.dev`, page on `github.io` | Browser must not block — Worker must return correct CORS headers |
| 12 | Mobile (iOS Safari, Chrome Android) | Same behavior, sessionStorage works, RTL layout preserved |
| 13 | Slow network (throttle to 3G in DevTools) | Worker fetch times out (~10s default), falls back within ~10s. Consider adding AbortController with 5s timeout |
| 14 | sessionStorage quota exceeded | `setItem` wrapped in try/catch, silently skipped — page still works |

### Pre-Deploy Check

- [ ] Confirm Worker URL in `STATUS_WORKER_URL` constant
- [ ] Confirm CORS headers allow the GitHub Pages origin
- [ ] Test on staging branch / local dev first
- [ ] Keep `workshop-status.json` in sync as a stale-but-functional fallback (update via Git Action or manual commit)

---

## 6. Optional Enhancements (not minimal, but worth noting)

1. **AbortController timeout**: Add `signal: AbortSignal.timeout(5000)` to Worker fetch so slow networks don't delay fallback for >5s.
2. **Stale-while-revalidate**: Show cached status immediately, then fetch Worker in background and update UI if changed.
3. **`navigator.onLine` check**: Skip fetch entirely if offline, go straight to sessionStorage/local.
4. **GitHub Action sync**: Scheduled workflow that fetches Worker `/api/status` and commits updated `workshop-status.json` to repository (keeps local fallback somewhat fresh).
