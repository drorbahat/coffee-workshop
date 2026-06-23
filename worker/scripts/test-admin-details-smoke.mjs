#!/usr/bin/env node

/**
 * test-admin-details-smoke.mjs
 * Smoke tests for the admin UI details panel (Sprint 1).
 * Verifies that openDetails, closeDetails, refreshOpenDetails functions
 * exist, that the details panel HTML structure is correct, and that
 * the action-first hero section is generated.
 */

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`✓ ${label}`);
    passed++;
  } else {
    console.log(`✗ ${label}`);
    failed++;
  }
}

function assertIn(actual, expectedArr, label) {
  if (expectedArr.includes(actual)) {
    console.log(`✓ ${label}`);
    passed++;
  } else {
    console.log(`✗ ${label}  (expected one of: ${JSON.stringify(expectedArr)}, got: ${JSON.stringify(actual)})`);
    failed++;
  }
}

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CLIENT_PATH = resolve(ROOT, 'src/admin-ui/client.js');
const STYLES_PATH = resolve(ROOT, 'src/admin-ui/styles.js');

/* ───── 1. Module files exist ───── */
assert(existsSync(CLIENT_PATH), 'client.js exists');
assert(existsSync(STYLES_PATH), 'styles.js exists');

const clientSrc = readFileSync(CLIENT_PATH, 'utf-8');
const stylesSrc = readFileSync(STYLES_PATH, 'utf-8');

/* ───── 2. Key functions exist in client JS ───── */
assert(clientSrc.includes('function openDetails'), 'Client has openDetails function');
assert(clientSrc.includes('function closeDetails'), 'Client has closeDetails function');
assert(clientSrc.includes('function refreshOpenDetails'), 'Client has refreshOpenDetails function');
assert(clientSrc.includes('function computeDisplayStatus'), 'Client has computeDisplayStatus function');
assert(clientSrc.includes('function computeNextAction'), 'Client has computeNextAction function');

/* ───── 3. Details panel HTML structure ───── */
// The panel should have: hero (name + workshop + status), contact fields, and advanced collapsed section
assert(clientSrc.includes('details-hero'), 'Details panel has hero section');
assert(clientSrc.includes('details-hero-name'), 'Hero section has name element');
assert(clientSrc.includes('details-hero-meta'), 'Hero section has meta (workshop + phone)');
assert(clientSrc.includes('details-hero-status'), 'Hero section has status badge');
assert(clientSrc.includes('details-field-group'), 'Details panel has field groups');
assert(clientSrc.includes('details-summary'), 'Details panel has collapsible summary element');
assert(clientSrc.includes('סטטוסים מתקדמים'), 'Collapsed section titled "סטטוסים מתקדמים"');

/* ───── 4. Advanced fields are inside a <details> element ───── */
{
  // Find the <details> block and verify it contains raw field selects
  const detailBlockStart = clientSrc.indexOf('<details');
  const detailBlockEnd = clientSrc.indexOf('</details>', detailBlockStart);
  const detailBlock = clientSrc.slice(detailBlockStart, detailBlockEnd + 10); // include closing tag
  
  assert(detailBlockStart >= 0, 'Details element exists in HTML body');
  assert(detailBlock.includes('det-whatsapp'), 'Collapsed section has WhatsApp select');
  assert(detailBlock.includes('det-payment'), 'Collapsed section has payment select');
  assert(detailBlock.includes('det-registration'), 'Collapsed section has registration status select');
  assert(detailBlock.includes('det-crm-stage'), 'Collapsed section has CRM stage select');
  assert(detailBlock.includes('det-record-type'), 'Collapsed section has record type select');
}

/* ───── 5. Action buttons exist in details footer ───── */
assert(clientSrc.includes('details-actions'), 'Details panel has actions div');
assert(clientSrc.includes('det-wa'), 'Details has WhatsApp action button');
assert(clientSrc.includes('det-mark-sent'), 'Details has mark-sent action button');
assert(clientSrc.includes('det-mark-bit'), 'Details has mark-bit action button');
assert(clientSrc.includes('det-mark-paid'), 'Details has mark-paid action button');
assert(clientSrc.includes('det-save-all'), 'Details has save-all button');

/* ───── 6. Hero section is before the details field groups ───── */
{
  // In the body.innerHTML assignment, hero should appear before <details> (collapsed section)
  const bodyStart = clientSrc.indexOf('body.innerHTML=');
  const bodyEnd = clientSrc.indexOf('// Actions', bodyStart);
  const bodySection = clientSrc.slice(bodyStart, bodyEnd);
  
  const heroPos = bodySection.indexOf('details-hero');
  const detailsPos = bodySection.indexOf('<details');
  
  assert(heroPos >= 0, 'Hero section found in body.innerHTML');
  assert(detailsPos >= 0, 'Collapsed <details> found in body.innerHTML');
  assert(heroPos < detailsPos, 'Hero section appears BEFORE the collapsed advanced section (action-first ordering)');
}

/* ───── 7. Styles exist for new elements ───── */
assert(stylesSrc.includes('details-hero'), 'styles.js has .details-hero CSS');
assert(stylesSrc.includes('details-hero-name'), 'styles.js has .details-hero-name CSS');
assert(stylesSrc.includes('details-hero-meta'), 'styles.js has .details-hero-meta CSS');
assert(stylesSrc.includes('details-hero-workshop'), 'styles.js has .details-hero-workshop CSS');
assert(stylesSrc.includes('card-status-row'), 'styles.js has .card-status-row CSS');

/* ───── 8. No raw internal values in main cockpit language ───── */
// The card-status-row replaces card-tags, so raw status labels are no longer primary
// Verify that display_status is used in the card rendering
{
  const cardRenderSection = clientSrc.indexOf('function renderCockpitCard');
  const cardEnd = clientSrc.indexOf('async function handleCockpitAction', cardRenderSection);
  const cardCode = clientSrc.slice(cardRenderSection, cardEnd);
  
  assert(cardCode.includes('display_status'), 'renderCockpitCard uses display_status');
  assert(cardCode.includes('display_tone'), 'renderCockpitCard uses display_tone');
  assert(cardCode.includes('card-status-row'), 'renderCockpitCard uses card-status-row');
  // Verify old card-tags is NOT in the card rendering section
  assert(!cardCode.includes('card-tags'), 'renderCockpitCard does NOT use card-tags');
  // Verify raw CRM tags are not shown directly in cards
  assert(!cardCode.includes('crm_stage_label'), 'renderCockpitCard does not show crm_stage_label directly');
  assert(!cardCode.includes('whatsapp_label'), 'renderCockpitCard does not show whatsapp_label directly');
  assert(!cardCode.includes('registration_label'), 'renderCockpitCard does not show registration_label directly');
}

/* ───── Summary ───── */
const total = passed + failed;
console.log(`\n${total} checks: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
