# B — Notion / Cal Neutral Spreadsheet

> Warm‑neutral, spreadsheet‑style admin mockup for coffee workshop management.
> Hebrew RTL · responsive · no AI slop.

## Design rationale

| Aspect | Choice |
|---|---|
| **Palette** | Warmer than strict monochrome — beige, taupe, warm gray, off‑white. Borrows the quiet utility of Notion / Airtable without importing their colour accents. |
| **Layout** | Compact cockpit strip above a single grouped table. No sidebars, no tabs — one operational surface. |
| **Table grouping** | Workshops as collapsible `<details>` groups. Each group header shows the workshop date, title, and a mini stat (registered / capacity). |
| **Inline editing** | Status cells are `<select>` elements styled as badges. Changing a value updates an adjacent lightweight counter in the cockpit (JavaScript). |
| **Filters** | Three toggle buttons above the table filter rows by status (all / pending / complete). |

## Data

Workshops:

- **28.3 — סדנת קפה בסיסי** (Basic Coffee, 6/8 registered)
- **4.4 — סדנת חליטה מתקדמת** (Advanced Brewing, 5/8)
- **11.4 — סדנת בריסטה** (Barista, 4/8)

Registrants use fictional sample names and `0501111xxx` sample phones. The rows are shaped like the real workflow — single registrants, group attendees, pending WhatsApp, and paid/unpaid states — but contain no real personal data.

## Files

```
B-neutral-spreadsheet/
├── index.html          ← standalone mockup (CSS + JS inline)
└── README.md           ← this file
```

Open `index.html` in any browser. No build step, no dependencies.

## What to look for

- The cockpit summary responds when you change a status dropdown — the counters update immediately.
- The filter buttons hide/show rows by WhatsApp status.
- Workshop groups collapse/expand via native `<details>`.
- The palette is deliberately muted: `#f5f0eb` background, `#d4c9bc` borders, `#4a3f35` text.
