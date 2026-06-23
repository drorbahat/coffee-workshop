# A — Linear Pro Cockpit

**Variant**: Linear/Notion-light — restrained monochrome, hairline borders, precise density, one accent.

## Design Stance

This variant takes heavy inspiration from Linear's project management UI and Notion's database views, translated into a Hebrew RTL coffee workshop registration admin. The core premise: **treat each registrant as a trackable item moving through a pipeline**, visualized as three Kanban-style cockpit lanes.

### Visual Language

| Element | Choice | Rationale |
|---|---|---|
| Background | `#F2F3F5` — cool light gray | Linear's signature surface; avoids warmth that would compete with coffee brand. |
| Surface | `#FFFFFF` — pure white cards | Maximum contrast for data density without shadows. |
| Borders | `1px solid #E5E7EB` — hairline | Separation without visual weight; the defining trait of Linear's UI. |
| Accent | `#A67C52` — muted bronze | Single restrained accent for active states, toggles, and key data; a nod to coffee without being literal. |
| Typography | System stack (SF Pro, Segoe UI, Rubik) | Guarantees native Hebrew shaping without loading fonts; crisp at all sizes. |
| Motion | 120–200ms transitions, cubic-bezier spring | Matches Linear's snappy, physical feel. |

### Layout Architecture

- **Mobile-first**: Single card stack, full-width lanes, bottom tab navigation, slide-up bottom sheet for editing. The tab bar mirrors iOS/Linear mobile patterns.
- **Desktop**: Three-lane horizontal cockpit with horizontal scroll; table view as alternative toggle. The sheet becomes a fixed right-side panel (420px) on screens ≥768px.
- **Breakpoints**: 768px (tablet), 1024px (desktop wide).

### Cockpit Lanes

1. **טעון טיפול** (Needs Action) — New registrations, unpaid, uncontacted. Yellow dot. These need operator attention.
2. **ממתין לתשלום** (Waiting Payment) — WhatsApp sent, Bit request pending. Gray dot. Awaiting user response.
3. **סגור** (Closed) — Paid, confirmed, grouped-with-partner. Green dot. No further action needed.

Each lane header shows a count badge. Empty lanes show a calm empty state with an info icon — no confetti or illustration, consistent with Linear's pragmatic emptiness.

### Interaction Model

- **1-tap quick actions**: WhatsApp and payment pills on each card cycle through their workflow states optimistically. No confirmation dialogs — the action is instant and visible.
- **Card click**: Opens the bottom sheet / side panel with all editable fields (name, phone, workshop, seats, payment, WhatsApp, status, source, notes).
- **Search**: Header icon toggles a full-width search field that filters both lanes and table in real-time.
- **Filter pills**: Persistent filter bar with preset queries (URU, קנופי, needs followup, unpaid). Active filter is highlighted with accent color.
- **View toggle**: Header button switches between cockpit lanes and a full table view (auto-hidden on mobile, accessed via tab bar).

### Data

All registration rows use fictional sample data shaped like the real workflow, without real names or phone numbers:

| # | Name | Workshop | Status | Lane |
|---|---|---|---|---|
| 1 | נועה כהן | URU תל אביב | BIT sent | Waiting Payment |
| 2 | עמית לוי | URU תל אביב | Grouped | Closed |
| 3 | רוני מזרחי | URU תל אביב | Needs follow-up | Needs Action |
| 4 | תמר ברק | URU תל אביב | New | Needs Action |
| 5–8 | יעל, אורי, מיקה, דניאל | URU תל אביב | WhatsApp sent | Waiting Payment |
| 9–11 | אדם, שירה, גדי | קנופי ירושלים | Paid | Closed |
| 12 | Maya Sample | עדכונים אספרסו | Not handled | Needs Action |

### Tradeoffs & Decisions

1. **Kanban over table by default** — The three-lane view makes pipeline status immediately visible (who needs action now vs. who's waiting vs. who's done). Cost: less dense than a table; requires horizontal scroll on mobile for multiple lanes.

2. **Single accent (bronze) over coffee palette** — The UX spec defines a warm cream/honey/sage palette. This variant deliberately strips it to a monochrome + one accent for a Linear feel. Tradeoff: loses some "coffee warmth" in exchange for sharper information hierarchy.

3. **No drag-to-reorder** — The UX spec mentions long-press reorder. This variant omits it because Kanban lanes already express priority via pipeline position. Reorder adds complexity that isn't justified for a ~12-item dataset.

4. **Optimistic toggles without undo toast** — The spec suggests 5s undo toasts for payment cycles. This variant uses instant visual feedback (pill color change, lane movement) instead, leaning toward Linear's "actions are immediate" philosophy. A production build would add undo.

5. **Bottom sheet as full form instead of inline edit** — The spec suggests tapping pills to edit inline on the card. This variant keeps cards compact and pushes full editing to a dedicated panel. Faster for status cycling (inline pills), more thorough for full data entry (sheet).

6. **No batch mode** — The spec describes checkbox batch selection with bulk actions. This variant focuses on the single-item pipeline workflow. Batch mode is a natural future addition but would compete with the clean Kanban card layout.

7. **Table view as secondary** — Available via toggle but not the primary lens. The table is a standard sortable grid for power users who need to scan many rows; the cockpit is for operators processing the pipeline.

## Files

- `index.html` — Standalone single-file HTML/CSS/JS mockup. Open directly in browser, no build step.
- `README.md` — This file.

## Usage

Open `index.html` in any modern browser. Click cards to open edit panel. Toggle quick-action pills on each card. Use search and filter pills to refine the view. Switch between lane and table views via the toggle button in the header.
