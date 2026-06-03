# Coffee Workshop Landing Page UX Polish Plan

> Implement with independent Hermes subagents using OpenRouter model `deepseek/deepseek-v4-flash:free`.

## Goal
Make the current landing page more conversion-focused without turning it into a generic marketing site.

## Constraints
- Keep it authentic, minimal, personal.
- No FAQ, no long bio, no fake testimonials, no full website sections.
- Preserve current desktop structure: image left, form right, fixed full-width blurred banner.
- Preserve current mobile direction: fixed/parallax-like image, form slides over it.
- Main file: `/home/dror/coffee-landing/index.html`.
- Image stays: `images/dror-filter.jpg`.
- Deploy via git push from `/home/dror/coffee-landing`.

## Required changes

### 1. Header/banner should sell the workshop in one sentence
Current banner has only title/subtitle/location. Add a short value line under the title/subtitle, something like:

`סדנה מעשית להכנת קפה טוב בבית — בקבוצה קטנה ובלי ציוד מיותר`

Keep it tasteful and not too salesy.

### 2. Header should include useful booking facts
Add a compact meta row/chips in the banner:
- `שישי 12.6`
- `11:00`
- `120 ₪`
- `עד 8 אנשים`

Keep it small and quiet, not loud.

### 3. Adjust layout spacing for taller banner
Because the banner is fixed and will become taller, update desktop and mobile top spacing so the form is never hidden under it.

### 4. CTA copy
Change submit button from:
`לינק לתשלום ישלח בהקדם`

to:
`שמרו לי מקום`

Add a small note under it:
`לינק לתשלום יישלח ידנית. המקום נשמר אחרי תשלום.`

### 5. Make workshop cards faster to scan
Keep the same two options and content, but reduce/reshape copy so mobile scanning is easier. Suggested direction:

Filter:
- Title: `☕ חליטות ביתיות` + `מומלץ`
- Copy: `V60, אירו־פרס, פרנץ׳ פרס ומקינטה — תרגול מעשי, טעימות ומתכון שעובד בבית.`
- Duration: `שעה וחצי`

Espresso:
- Title: `⚙️ בריסטה ביתית`
- Copy: `כיול מטחנה, שוטים, חלב ומזיגה — למי שיש או קונה מכונת אספרסו ורוצה לדייק.`
- Duration: `שעתיים`

### 6. Make “לא מסתדר לי המועד” secondary
Style it as a softer fallback option, visually less prominent than the main date. It should still work:
- checking it unchecks and disables the date radio
- unchecking it re-enables the date radio

### 7. Do not break existing behavior
- Formspree action stays exactly: `https://formspree.io/f/xwvzzzbj`
- date value stays exactly: `שישי 12.6 11:00`
- no_date behavior remains valid
- success messages remain correct
- desktop image left / form right
- mobile image with form overlay/parallax behavior

## Verification
- Run a basic local/static check: no syntax-obvious HTML/CSS breakage.
- Use Chromium screenshots:
  - desktop 1440x1000
  - mobile 390x844
- Visually check:
  - banner not hiding form
  - CTA visible and clear
  - cards readable
  - mobile first screen still feels good
- Commit and push.
