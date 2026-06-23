# C — Apple Glass Ops

> **וריאנט C — זכוכית מאופקת, אופרטיבית, בהשראת אפל**  
> *Variant C — Restrained glass, operational, Apple-inspired*

## Design Stance

This variant explores **glassmorphism as a utility layer, not decoration**. Every blurred panel serves a structural purpose — framing data, separating concerns, providing visual hierarchy without adding chromatic noise. The result is an admin surface that feels both tactile and transparent, like macOS's material layers but applied to operational UI.

## Key Design Decisions

| Decision | Rationale |
|---|---|
| **Light glass only** (blur(18px), opacity 0.72) | Keeps text fully legible; no dark glass inversions that feel gimmicky. |
| **No saturated gradients** | Pure white/clear glass + minimal accent blue (Apple `#0071e3`). The only color comes from semantic status indicators (green/amber/red dots). |
| **Sidebar as glass drawer** | Fixed-position glass sidebar with backdrop blur. On mobile it slides in as a drawer — the overlay gets a subtle 4px blur so content remains dimly visible beneath. |
| **Thin 0.5px borders** | Matches macOS Sequoia/Vision Pro aesthetic of barely-there borders (`rgba(255,255,255,0.56)`). |
| **Cockpit card accent bars** | 2.5px top border per card (green/blue/yellow/red) gives a quick semantic read without filling the card with colour. |
| **Table = most dense component** | Kept deliberately non-glass (transparent rows) so tabular data remains scannable. Only the header gets a subtle blur. |
| **Upcoming workshop progress bars** | Capacity bars use accent blue fill — a direct nod to iOS volume/battery indicators. |
| **No JavaScript animation** | One JS function: sidebar toggle. Zero decorative animation. Transitions are CSS-only and kept to 150–200ms. |

## Tradeoffs & Known Limitations

1. **Backdrop-filter performance** — Blur + `position: fixed` sidebar can stutter on low-end Android devices (Chrome <90). Production would want `will-change: transform` isolation or a NO-GLASS fallback via `@supports not (backdrop-filter: blur(1px))`.
2. **Sidebar navigation** — Full-width sidebar works on desktop (240px). On very narrow phones (<360px) the nav labels could overflow; a `font-size` clamp or scrollable inner wrapper would be needed.
3. **Table sticky header** — Uses `position: sticky` with a blur background. On browsers that don't support sticky+blur combo (some WebKit versions), the header falls back to opaque white — still functional, slightly less polished.
4. **Hebrew typography** — Relies on system fonts (`-apple-system`, `BlinkMacSystemFont`, `SF Pro Text`). On Linux/Windows without SF Pro installed, Helvetica Neue or Segoe UI is used. Hebrew diacritics and `nikud` aren't tested here (not needed for this data).
5. **No print styles** — The glass effects turn into opaque boxes when printed. A `@media print` reset would be needed for production.
6. **Accessibility** — Colour contrast is fine (dark text on light glass), but interactive elements (sidebar links, buttons) are semantic `<a>`/`<button>` elements despite `cursor: default`. A production build should add `aria-current="page"` and keyboard focus rings.

## Realistic Data

- **12 registrants** with Hebrew names, signup dates spanning 06.08.2025–15.08.2025, three statuses (confirmed/pending/cancelled), ILS amounts.
- **4 timeline items** with mixed status dots (green = on track, yellow = low registration, red = cancelled/rescheduled).
- **5 upcoming workshops** with realistic capacity bars and descriptions.
- **4 cockpit cards** with change indicators and contextual sub-lines.

## How to View

Open `index.html` directly in any modern browser (Chrome, Safari, Firefox, Edge). No build step required.

```bash
open index.html          # macOS
xdg-open index.html      # Linux
start index.html         # Windows
```

## File Structure

```
C-apple-glass-ops/
├── index.html   # Standalone HTML (all CSS + JS inline, ~36 KB)
└── README.md    # This file
```

## Contrast With Other Variants

- **Variant A** (if exists): Likely full-colour, illustrative, marketing-heavy.
- **Variant B** (if exists): Likely minimal, monochrome, high-contrast.
- **Variant C**: Glass as structure. Neutral base, subtle materiality, Apple-operational rather than Apple-marketing. Suitable for internal admin tools where clarity > beauty, but beauty helps clarity.
