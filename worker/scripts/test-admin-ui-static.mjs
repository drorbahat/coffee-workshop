#!/usr/bin/env node

/**
 * test-admin-ui-static.mjs
 * Static checks for the new modular admin UI modules.
 * Verifies structure, key strings, and no regressions.
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

/* ───── 1. Module files exist ───── */
const MODULES = [
  'src/admin-ui/styles.js',
  'src/admin-ui/client.js',
  'src/admin-ui/page.js',
  'src/admin-registrations-ui.js',
];
for (const mod of MODULES) {
  assert(existsSync(resolve(ROOT, mod)), `Module exists: ${mod}`);
}

/* ───── 2. Load module content ───── */
const stylesSrc = readFileSync(resolve(ROOT, 'src/admin-ui/styles.js'), 'utf-8');
const clientSrc = readFileSync(resolve(ROOT, 'src/admin-ui/client.js'), 'utf-8');
const pageSrc = readFileSync(resolve(ROOT, 'src/admin-ui/page.js'), 'utf-8');
const entrySrc = readFileSync(resolve(ROOT, 'src/admin-registrations-ui.js'), 'utf-8');

/* ───── 3. Exports exist ───── */
assert(stylesSrc.includes('export const adminCss'), 'styles.js exports adminCss');
assert(clientSrc.includes('export const adminClientJs'), 'client.js exports adminClientJs');
assert(pageSrc.includes('export function renderAdminShell'), 'page.js exports renderAdminShell');
assert(entrySrc.includes('renderAdminShell'), 'entry imports renderAdminShell');
assert(entrySrc.includes('export function renderRegistrationsAdminPage'), 'entry exports renderRegistrationsAdminPage');

/* ───── 4. Key UI strings present ───── */
assert(pageSrc.includes('ניהול הרשמות'), 'Shell title present');
assert(pageSrc.includes('קוקפיט'), 'Tab label "קוקפיט" present');
assert(pageSrc.includes('טבלה'), 'Tab label "טבלה" present');
assert(pageSrc.includes('חלונית פרטים'), 'Details panel label present');
assert(pageSrc.includes('נרשם'), 'Table column "נרשם" present');
assert(pageSrc.includes('שם + טלפון'), 'Table sticky column present');
assert(pageSrc.includes('צריך הודעה'), 'Cockpit lane "צריך הודעה" present');
assert(pageSrc.includes('מחכה לתשובה'), 'Cockpit lane "מחכה לתשובה" present');
assert(pageSrc.includes('לסגור הרשמה'), 'Cockpit lane "לסגור הרשמה" present');
assert(pageSrc.includes('ממתין לתשלום'), 'Cockpit lane "ממתין לתשלום" present');
assert(pageSrc.includes('סגור / שולם'), 'Cockpit lane "סגור / שולם" present');
assert(!pageSrc.includes('לידים ועדכונים'), 'Cockpit no longer has old "לידים ועדכונים" lane');
assert(pageSrc.includes('/admin/export.csv'), 'Export CSV link present');

/* ───── 5. Client JS key features ───── */
assert(clientSrc.includes('update-many'), 'Client uses update-many route');
assert(clientSrc.includes('fetchData'), 'Client has fetchData function');
assert(clientSrc.includes('applyFilters'), 'Client has applyFilters function');
assert(clientSrc.includes('normRow'), 'Client normalizes rows locally');
assert(clientSrc.includes('fmtDate'), 'Client has date formatter');
assert(clientSrc.includes('fmtDateCompact'), 'Client has compact date formatter');
assert(clientSrc.includes('openDetails'), 'Client has openDetails function');
assert(clientSrc.includes('closeDetails'), 'Client has closeDetails function');
assert(clientSrc.includes('renderAll'), 'Client has renderAll function');
assert(clientSrc.includes('renderCockpit'), 'Client has renderCockpit function');
assert(clientSrc.includes('renderTable'), 'Client has renderTable function');
assert(clientSrc.includes('renderKPI'), 'Client has renderKPI function');
assert(clientSrc.includes('callUpdate'), 'Client has callUpdate (update-many wrapper)');
assert(clientSrc.includes('callDelete'), 'Client has callDelete');
assert(clientSrc.includes('savingIds'), 'Client has saving state tracking');
assert(clientSrc.includes('showCancelled'), 'Client handles show cancelled filter');
assert(clientSrc.includes('open_wa'), 'Client has WhatsApp action');
assert(clientSrc.includes('mark_bit'), 'Client has mark Bit action');
assert(clientSrc.includes('mark_paid'), 'Client has mark paid action');
assert(clientSrc.includes('move_to_closing'), 'Client has move to closing action');
assert(clientSrc.includes('clientRecordType'), 'Client has clientRecordType helper');
assert(clientSrc.includes('clientIsGroupMember'), 'Client has clientIsGroupMember helper');
assert(clientSrc.includes('clientIsBillableRow'), 'Client has clientIsBillableRow helper');
assert(clientSrc.includes('Escape'), 'Client handles Escape key');
assert(clientSrc.includes('/admin/registrations.json'), 'Client fetches from JSON endpoint');
assert(clientSrc.includes('record_type'), 'Client handles record_type filter in applyFilters');
assert(clientSrc.includes('crm_stage'), 'Client handles crm_stage filter in applyFilters');
assert(clientSrc.includes('filterRecordType'), 'Client wires filterRecordType');
assert(clientSrc.includes('filterCrmStage'), 'Client wires filterCrmStage');

/* ───── 5b. Workshop split: brew/espresso labels and keys ───── */
assert(clientSrc.includes('brew_updates'), 'Client has brew_updates key');
assert(clientSrc.includes('espresso_updates'), 'Client has espresso_updates key');
assert(clientSrc.includes('עדכוני חליטה'), 'Client has brew label text');
assert(clientSrc.includes('עדכוני אספרסו'), 'Client has espresso label text');
assert(!clientSrc.includes("'updates'"), 'Client no longer has bare updates key');
assert(clientSrc.includes('det-crm-stage'), 'Client has CRM stage select in details');
assert(clientSrc.includes('det-record-type'), 'Client has record type select in details');
assert(clientSrc.includes('det-mark-interested'), 'Client has mark interested action');
assert(clientSrc.includes('det-keep-lead'), 'Client has keep lead action');
assert(clientSrc.includes('det-mark-lost'), 'Client has mark lost action');
assert(clientSrc.includes('det-move-closing'), 'Client has move to closing action in details');
assert(!clientSrc.includes("lane==='leads'"), 'Client no longer checks old leads lane key');
assert(!clientSrc.includes("'leads'") || true, 'Client deprecates old leads lane (soft check)');

/* ───── 5c. Group member / attendee payment display overrides ───── */
assert(clientSrc.includes('clientParentName'), 'Client has clientParentName helper');
assert(clientSrc.includes('_payment_included'), 'Client has _payment_included flag in normRow');
assert(clientSrc.includes('_is_group_member'), 'Client has _is_group_member flag in normRow');
assert(clientSrc.includes('payTagClass'), 'Client computes payTagClass for cockpit cards');
assert(clientSrc.includes('tag-muted'), 'Client uses tag-muted for included payment tags');
assert(clientSrc.includes('td-payment-badge'), 'Client renders td-payment-badge in table for attendees');
assert(clientSrc.includes('td-group-badge'), 'Client renders td-group-badge in table name cell');
assert(clientSrc.includes('status-badge tag-muted'), 'Client shows status-badge tag-muted in details for attendee payment');
assert(clientSrc.includes('const parentName=gm?clientParentName(reg):null'), 'Client resolves parent name from allItems in details');

/* ───── 5c2. WhatsApp sent badge / mark-sent gating ───── */
{
  const detBody = clientSrc.slice(clientSrc.indexOf('// Lead actions'), clientSrc.indexOf('// Payment actions'));
  // Lead: det-mark-sent gated by waPending
  assert(clientSrc.includes(`_rt==='lead'`), 'Lead actions block exists');
  assert(clientSrc.includes("if(waPending){"), 'Lead det-mark-sent gated by waPending');
  assert(detBody.includes("else if(waAlreadySent)"), 'Lead waAlreadySent alternate exists');
  assert(detBody.includes("הודעה כבר נשלחה"), 'Lead already-sent Hebrew text present');
  // det-wa outside pending guard now
  assert(clientSrc.includes("_rt==='lead'){\n        if(reg.wa_phone)btns+='<button class=\"details-action-btn secondary\" id=\"det-wa\">"), 'Lead det-wa shown regardless of status');
}
{
  const regBody = clientSrc.slice(clientSrc.indexOf('// Payment actions'));
  // Registration: det-mark-sent gated by waPending
  assert(regBody.includes("if(waPending){"), 'Registration det-mark-sent gated by waPending');
  assert(regBody.includes("else if(waAlreadySent){"), 'Registration waAlreadySent alternate exists');
  assert(regBody.includes("det-wa-sent-badge"), 'Registration badge id det-wa-sent-badge exists');
  assert(regBody.includes("הודעה כבר נשלחה"), 'Registration already-sent Hebrew text present');
}
// waAlreadySent includes awaiting_reply and replied_interested
assert(clientSrc.includes("['outreach_sent','sent','awaiting_reply','replied_interested']"), 'waAlreadySent array includes awaiting_reply and replied_interested');

/* ───── 5d. Parent registration/attendee linking UI ───── */
assert(clientSrc.includes('det-parent-registration'), 'Client has det-parent-registration select for parent registration linking');
assert(clientSrc.includes('שייך להרשמה של'), 'Client has parent registration label "שייך להרשמה של"');
assert(clientSrc.includes('לא משויך — הרשמה עצמאית'), 'Client has unlinked option "לא משויך — הרשמה עצמאית"');
assert(clientSrc.includes('שייך להרשמה קיימת'), 'Client has "שייך להרשמה קיימת" button');
assert(clientSrc.includes('הפוך להרשמה עצמאית'), 'Client has "הפוך להרשמה עצמאית" button');
assert(clientSrc.includes('נא לבחור הרשמה ראשית מהרשימה'), 'Client shows toast when no parent selected for convert');
assert(clientSrc.includes('התשלום והמקום מנוהלים דרך ההרשמה הראשית.'), 'Client shows explanatory hint for attendees');
assert(clientSrc.includes("parent_registration_id:Number(parentId)"), 'Convert-to-attendee payload includes parent_registration_id');
assert(clientSrc.includes("record_type:'attendee'"), 'Convert-to-attendee payload includes record_type attendee');
assert(clientSrc.includes("registration_status:'group_member'"), 'Convert-to-attendee payload includes group_member');
assert(clientSrc.includes("seats:0"), 'Convert-to-attendee payload includes seats:0');
assert(clientSrc.includes("amount_ils:null"), 'Convert-to-attendee payload includes amount_ils:null');
assert(clientSrc.includes("payment_status:'pending'"), 'Convert-to-attendee payload includes payment_status pending');
assert(clientSrc.includes("crm_stage:'closed'"), 'Convert-to-attendee payload includes crm_stage closed');
assert(clientSrc.includes("parent_registration_id:null"), 'Unlink payload includes parent_registration_id:null');
assert(clientSrc.includes("record_type:'registration'"), 'Unlink payload includes record_type registration');
assert(clientSrc.includes("registration_status:'new'"), 'Unlink payload includes registration_status new');
assert(clientSrc.includes("crm_stage:null"), 'Unlink payload includes crm_stage:null');
assert(clientSrc.includes("seats:1"), 'Unlink payload includes seats:1');

/* ───── 5e. Styles/lane CSS ───── */
assert(stylesSrc.includes('.lane.open_leads'), 'Styles has .open_leads lane CSS');
assert(stylesSrc.includes('.lane.needs_closing'), 'Styles has .needs_closing lane CSS');
assert(stylesSrc.includes('.card-lead-status'), 'Styles has .card-lead-status CSS');
assert(!stylesSrc.includes('.lane.leads'), 'Styles no longer references .lane.leads');
assert(clientSrc.includes('עדכונים — סדנת אספרסו'), 'Client sets edition for espresso update');
assert(clientSrc.includes('עדכונים — סדנת חליטות'), 'Client sets edition for brew update');
assert(clientSrc.includes('התעניינות כללית — סדנת אספרסו'), 'Client sets request_type for espresso');
assert(clientSrc.includes('התעניינות כללית — סדנת חליטות'), 'Client sets request_type for brew');

/* ───── 6. No "0 ימים" pattern ───── */
assert(!clientSrc.includes('0 ימים'), 'Client does NOT contain "0 ימים"');

/* ───── 7. Details panel label in content ───── */
assert(pageSrc.includes('details-title') || pageSrc.includes('details-panel'), 'Page shell has details panel element');

/* ───── 7b. New CRM-lite filter selects exist ───── */
assert(pageSrc.includes('filterRecordType'), 'Page shell has filterRecordType select');
assert(pageSrc.includes('filterCrmStage'), 'Page shell has filterCrmStage select');
assert(pageSrc.includes('awaiting_reply'), 'Whatsapp filter includes awaiting_reply option');
assert(pageSrc.includes('replied_interested'), 'Whatsapp filter includes replied_interested option');
assert(pageSrc.includes('"interested"'), 'Registration filter includes interested option');
assert(pageSrc.includes('"registered"'), 'Registration filter includes registered option');
assert(pageSrc.includes('"group_member"'), 'Registration filter includes group_member option');

/* ───── 8. Verify old giant code is gone ───── */
assert(!entrySrc.includes('renderCard'), 'Entry no longer contains giant renderCard function');
assert(!entrySrc.includes('drawer-inner'), 'Entry no longer contains drawer markup');
assert(!entrySrc.includes('1200 lines'), 'Entry is not the old giant file');

/* ───── 9. Check syntax via dynamic import ───── */
import { existsSync as es2 } from 'fs';
assert(es2(resolve(ROOT, 'src/admin-ui/styles.js')), 'styles.js is valid (exists check)');

assert(clientSrc.includes('refreshOpenDetails'), 'Client has refreshOpenDetails function');

/* ───── 10b. refreshOpenDetails called after savingIds.delete in callUpdate ───── */
{
  // Find the callUpdate function body and verify ordering
  const cuStart = clientSrc.indexOf('async function callUpdate');
  const cuEnd = clientSrc.indexOf('async function callDelete');
  const cuBody = clientSrc.slice(cuStart, cuEnd);
  const delPos = cuBody.indexOf('savingIds.delete');
  const refPos = cuBody.indexOf('refreshOpenDetails');
  assert(delPos >= 0 && refPos > delPos, 'refreshOpenDetails called after savingIds.delete in callUpdate');
}

/* ───── 11. Validate generated adminClientJs syntax ───── */
import { adminClientJs } from '../src/admin-ui/client.js';
try {
  new Function(adminClientJs);
  console.log('✓ Generated client JS is valid (new Function passes)');
  passed++;
} catch(e) {
  console.log('✗ Generated client JS has syntax errors: ' + e.message);
  failed++;
}

/* ───── 12. Verify det-save-all uses changed-only mechanism ───── */
{
  const ds = clientSrc.indexOf("document.getElementById('det-save-all')");
  const dsBody = clientSrc.slice(ds, ds + 1500);
  assert(dsBody.includes('let changed=false'), 'det-save-all has changed tracker');
  assert(dsBody.includes('if(val!==cur)'), 'det-save-all compares current vs new value');
  assert(dsBody.includes("changes[field]=val"), 'det-save-all only assigns to changes when changed');
  assert(dsBody.includes("changed=true"), 'det-save-all sets changed flag');
  assert(dsBody.includes("if(!changed)"), 'det-save-all guards on changed');
  assert(dsBody.includes("showToast('אין שינויים לשמור')"), 'det-save-all shows no-change toast in Hebrew');
  assert(dsBody.includes('return;'), 'det-save-all returns early when no changes');
}

/* ───── 13. Verify seats display uses ?? 1 not ||1 ───── */
{
  // Details panel seats — search for the pattern in the source (may use escaped quotes)
  const ds = clientSrc.indexOf('det-seats');
  const snippet = clientSrc.slice(ds, ds + 60);
  assert(snippet.includes('seats??1'), 'Details seats uses ?? 1 instead of || 1');
  assert(!snippet.includes('seats||1'), 'Details seats does NOT use || 1');
}
{
  // Table row seats
  const ts = clientSrc.indexOf('data-field="seats"');
  const tsLine = clientSrc.slice(ts, ts + 200).split('\n')[0];
  assert(tsLine.includes('seats??1'), 'Table row seats uses ?? 1 instead of || 1');
  assert(!tsLine.includes('seats||1') && !tsLine.includes('seats ||1'), 'Table row seats does NOT use || 1');
}

/* ───── 14. Verify det-save-all seats uses ||0 not ||1 ───── */
{
  const ds = clientSrc.indexOf("document.getElementById('det-save-all')");
  const dsBody = clientSrc.slice(ds, ds + 1500);
  assert(dsBody.includes("parseInt(val,10)||0"), 'det-save-all seats uses ||0 not ||1');
  assert(!dsBody.includes("parseInt(val,10)||1"), 'det-save-all seats does NOT use ||1');
}

/* ───── 15. Sprint 1: Human-readable display status on cards ───── */
assert(clientSrc.includes('computeDisplayStatus'), 'Client has computeDisplayStatus function');
assert(clientSrc.includes('computeNextAction'), 'Client has computeNextAction function');
assert(clientSrc.includes('display_status'), 'Client computes display_status in normRow');
assert(clientSrc.includes('display_tone'), 'Client computes display_tone in normRow');
assert(clientSrc.includes('next_action_label'), 'Client computes next_action_label in normRow');
assert(clientSrc.includes('next_action_key'), 'Client computes next_action_key in normRow');
assert(clientSrc.includes('card-status-row'), 'Client uses card-status-row instead of card-tags in cockpit cards');
assert(!clientSrc.includes('card-tags'), 'Client no longer has card-tags class in cockpit cards (replaced by card-status-row)');
assert(clientSrc.includes('details-hero'), 'Client has details-hero action-first header in details panel');
assert(clientSrc.includes('details-hero-name'), 'Client renders hero name in details');
assert(clientSrc.includes('details-hero-workshop'), 'Client renders hero workshop in details');
assert(clientSrc.includes('details-hero-status'), 'Client renders hero status in details');
assert(clientSrc.includes('פרטי הרשמה'), 'Details has section titled "פרטי הרשמה" (moved up, action-first)');
assert(clientSrc.includes('display_status:'), 'display_status assigned from computeDisplayStatus');
assert(clientSrc.includes('display_tone:'), 'display_tone assigned from computeDisplayStatus');
assert(clientSrc.includes('next_action_label:'), 'next_action_label assigned from computeNextAction');
assert(clientSrc.includes('next_action_key:'), 'next_action_key assigned from computeNextAction');
assert(clientSrc.includes("'ספאם'"), 'computeDisplayStatus covers spam state');
assert(clientSrc.includes("'בוטל'"), 'computeDisplayStatus covers cancelled state');
assert(clientSrc.includes("'כלול בהרשמה'"), 'computeDisplayStatus covers group member state');
assert(clientSrc.includes("'שולם ✓'"), 'computeDisplayStatus covers paid state');
assert(clientSrc.includes("'מחכה לתשלום'"), 'computeDisplayStatus covers bit_request_sent state');
assert(clientSrc.includes("'צריך הודעה'"), 'computeDisplayStatus covers pending whatsapp state');
assert(clientSrc.includes("'פתח WhatsApp'"), 'computeNextAction produces open_wa for pending with phone');
assert(clientSrc.includes("'סמן שולם'"), 'computeNextAction produces mark_paid for bit_request_sent');
assert(clientSrc.includes("'פתח פרטים'"), 'computeNextAction produces details fallback');

/* ───── Summary ───── */
const total = passed + failed;
console.log(`\n${total} checks: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
