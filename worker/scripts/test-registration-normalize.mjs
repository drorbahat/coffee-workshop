import {
  computeLane,
  workshopKey,
  normalizePhoneForWa,
  statusLabel,
  normalizeRegistration,
  waDraftMessage,
  recordType,
  isGroupMember,
  isBillableRow,
  parentSummary,
} from '../src/registration-normalize.js';

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

function assertEq(actual, expected, label) {
  if (actual === expected) {
    console.log(`✓ ${label}`);
    passed++;
  } else {
    console.log(`✗ ${label}  (expected: ${JSON.stringify(expected)}, got: ${JSON.stringify(actual)})`);
    failed++;
  }
}

/* ───── recordType ───── */

// Explicit record_type values
assertEq(recordType({ record_type: 'lead', registration_status: 'new' }), 'lead', 'recordType: explicit lead');
assertEq(recordType({ record_type: 'registration', registration_status: 'new' }), 'registration', 'recordType: explicit registration');
assertEq(recordType({ record_type: 'attendee', registration_status: 'new' }), 'attendee', 'recordType: explicit attendee');

// Legacy inference: registered_under_shnir → attendee
assertEq(recordType({ registration_status: 'registered_under_shnir' }), 'attendee', 'recordType: registered_under_shnir → attendee');

// Legacy inference: group_member → attendee
assertEq(recordType({ registration_status: 'group_member' }), 'attendee', 'recordType: group_member → attendee');

// Legacy inference: lead registration_status → lead
assertEq(recordType({ registration_status: 'lead' }), 'lead', 'recordType: lead status → lead');

// Legacy inference: brew_updates workshop_key → lead
assertEq(recordType({ edition: 'עדכונים על חליטות' }), 'lead', 'recordType: brew_updates edition → lead');

// Legacy inference: espresso_updates workshop_key → lead
assertEq(recordType({ edition: 'עדכוני אספרסו' }), 'lead', 'recordType: espresso_updates edition → lead');

// Default: registration
assertEq(recordType({ registration_status: 'new', edition: 'URU' }), 'registration', 'recordType: default registration');

/* ───── isGroupMember ───── */

assertEq(isGroupMember({ record_type: 'attendee' }), true, 'isGroupMember: record_type attendee');
assertEq(isGroupMember({ registration_status: 'registered_under_shnir' }), true, 'isGroupMember: registered_under_shnir');
assertEq(isGroupMember({ registration_status: 'group_member' }), true, 'isGroupMember: group_member');
assertEq(isGroupMember({ group_registration: 'כלול בהרשמת שניר' }), true, 'isGroupMember: group_registration contains כלול בהרשמת');
assertEq(isGroupMember({ registration_status: 'new', edition: 'URU' }), false, 'isGroupMember: regular registration false');

/* ───── isBillableRow ───── */

assertEq(isBillableRow({ record_type: 'registration', payment_status: 'paid', is_spam: '0' }), true, 'isBillableRow: registration paid not spam');
assertEq(isBillableRow({ record_type: 'registration', payment_status: 'pending', is_spam: '0' }), true, 'isBillableRow: registration pending not spam');
assertEq(isBillableRow({ record_type: 'lead', is_spam: '0' }), false, 'isBillableRow: lead false');
assertEq(isBillableRow({ record_type: 'attendee', is_spam: '0' }), false, 'isBillableRow: attendee false');
assertEq(isBillableRow({ record_type: 'registration', is_spam: '1' }), false, 'isBillableRow: spam false');
assertEq(isBillableRow({ record_type: 'registration', registration_status: 'cancelled', is_spam: '0' }), false, 'isBillableRow: cancelled false');

/* ───── computeLane ───── */

// 1a. pending WhatsApp + no other flags → 'needs_action'
assertEq(computeLane({ whatsapp_status: 'pending', payment_status: 'pending', registration_status: 'new', is_spam: '0' }), 'needs_action', 'computeLane: pending whatsapp → needs_action');

// 1b. outreach_sent + pending payment → falls through to needs_closing for registration rows
assertEq(computeLane({ whatsapp_status: 'outreach_sent', payment_status: 'pending', registration_status: 'new', is_spam: '0' }), 'needs_closing', 'computeLane: outreach_sent + pending payment → needs_closing');

// 1c. bit_request_sent → 'waiting_payment'
assertEq(computeLane({ whatsapp_status: 'sent', payment_status: 'bit_request_sent', registration_status: 'new', is_spam: '0' }), 'waiting_payment', 'computeLane: bit_request_sent → waiting_payment');

// 1d. paid → 'closed'
assertEq(computeLane({ whatsapp_status: 'sent', payment_status: 'paid', registration_status: 'confirmed', is_spam: '0' }), 'closed', 'computeLane: paid → closed');

// 1e. is_spam=1 → 'closed'
assertEq(computeLane({ whatsapp_status: 'pending', payment_status: 'pending', registration_status: 'new', is_spam: '1' }), 'closed', 'computeLane: is_spam=1 → closed');

// 1f. registered_under_shnir → 'closed'  (via isGroupMember)
assertEq(computeLane({ whatsapp_status: 'pending', payment_status: 'pending', registration_status: 'registered_under_shnir', is_spam: '0' }), 'closed', 'computeLane: registered_under_shnir → closed');

// 1g. cancelled → 'closed'
assertEq(computeLane({ whatsapp_status: 'pending', payment_status: 'pending', registration_status: 'cancelled', is_spam: '0' }), 'closed', 'computeLane: cancelled → closed');

// 1h. needs_payment_followup → 'needs_closing'
assertEq(computeLane({ whatsapp_status: 'pending', payment_status: 'pending', registration_status: 'needs_payment_followup', is_spam: '0' }), 'needs_closing', 'computeLane: needs_payment_followup → needs_closing');

// 1i. not_handled → 'needs_action'
assertEq(computeLane({ whatsapp_status: 'pending', payment_status: 'pending', registration_status: 'not_handled', is_spam: '0' }), 'needs_action', 'computeLane: not_handled → needs_action');

// 1j. lead + pending whatsapp → 'needs_action'
assertEq(computeLane({ whatsapp_status: 'pending', payment_status: 'pending', registration_status: 'lead', is_spam: '0' }), 'needs_action', 'computeLane: lead + pending whatsapp → needs_action');

/* ───── computeLane: new CRM scenarios ───── */

// lead + outreach_sent → 'open_leads'
assertEq(computeLane({ whatsapp_status: 'outreach_sent', payment_status: 'pending', registration_status: 'lead', is_spam: '0' }), 'open_leads', 'computeLane: lead + outreach_sent → open_leads');

// lead + sent → 'open_leads'
assertEq(computeLane({ whatsapp_status: 'sent', payment_status: 'pending', registration_status: 'lead', is_spam: '0' }), 'open_leads', 'computeLane: lead + sent → open_leads');

// lead + interested → 'needs_closing'
assertEq(computeLane({ whatsapp_status: 'sent', payment_status: 'pending', registration_status: 'interested', is_spam: '0' }), 'needs_closing', 'computeLane: lead + interested → needs_closing');

// lead + crm_stage interested → 'needs_closing'
assertEq(computeLane({ whatsapp_status: 'sent', payment_status: 'pending', registration_status: 'lead', crm_stage: 'interested', is_spam: '0' }), 'needs_closing', 'computeLane: lead + crm_stage=interested → needs_closing');

// attendee (group_member) → 'closed'
assertEq(computeLane({ whatsapp_status: 'pending', payment_status: 'pending', registration_status: 'group_member', is_spam: '0' }), 'closed', 'computeLane: group_member → closed');

// attendee with record_type=attendee → 'closed'
assertEq(computeLane({ whatsapp_status: 'pending', payment_status: 'pending', registration_status: 'new', record_type: 'attendee', is_spam: '0' }), 'closed', 'computeLane: record_type=attendee → closed');

// registration + bit_request_sent → 'waiting_payment'
assertEq(computeLane({ whatsapp_status: 'sent', payment_status: 'bit_request_sent', registration_status: 'new', record_type: 'registration', is_spam: '0' }), 'waiting_payment', 'computeLane: registration + bit_request_sent → waiting_payment');

// registration + paid → 'closed'
assertEq(computeLane({ whatsapp_status: 'sent', payment_status: 'paid', registration_status: 'confirmed', record_type: 'registration', is_spam: '0' }), 'closed', 'computeLane: registration + paid → closed');

/* ───── workshopKey ───── */

// 2a. URU edition → 'uru'
assertEq(workshopKey({ edition: 'URU', request_type: '', workshop: '' }), 'uru', 'workshopKey: URU edition → uru');

// 2b. תל אביב → 'uru'
assertEq(workshopKey({ edition: '', request_type: '', workshop: 'תל אביב' }), 'uru', 'workshopKey: תל אביב → uru');

// 2c. קנופי edition → 'kanopi'
assertEq(workshopKey({ edition: 'קנופי', request_type: '', workshop: '' }), 'kanopi', 'workshopKey: קנופי → kanopi');

// 2d. ירושלים → 'kanopi'
assertEq(workshopKey({ edition: '', request_type: '', workshop: 'ירושלים' }), 'kanopi', 'workshopKey: ירושלים → kanopi');

// 2e. עדכונים edition → 'brew_updates'
assertEq(workshopKey({ edition: 'עדכונים — סדנת חליטות', request_type: '', workshop: '' }), 'brew_updates', 'workshopKey: עדכונים — סדנת חליטות → brew_updates');

// 2f. עדכונים generic → 'brew_updates'
assertEq(workshopKey({ edition: 'עדכונים', request_type: '', workshop: '' }), 'brew_updates', 'workshopKey: generic עדכונים → brew_updates');

// 2g. אספרסו → 'espresso_updates'
assertEq(workshopKey({ edition: '', request_type: '', workshop: 'אספרסו' }), 'espresso_updates', 'workshopKey: אספרסו → espresso_updates');

// 2h. חליטה → 'brew_updates'
assertEq(workshopKey({ edition: '', request_type: 'סדנת חליטות', workshop: '' }), 'brew_updates', 'workshopKey: חליטות → brew_updates');

// 2i. unknown → 'other'
assertEq(workshopKey({ edition: 'Unknown', request_type: '', workshop: '' }), 'other', 'workshopKey: unknown → other');

// 2j. עדכוני אספרסו (both present) → 'espresso_updates' (אספרסו wins)
assertEq(workshopKey({ edition: 'עדכונים — סדנת אספרסו', request_type: '', workshop: '' }), 'espresso_updates', 'workshopKey: עדכונים + אספרסו → espresso_updates (espresso wins)');

/* ───── normalizePhoneForWa ───── */

// 3a. '0543178959' → '972543178959'
assertEq(normalizePhoneForWa('0543178959'), '972543178959', 'normalizePhoneForWa: 0543178959 → 972543178959');

// 3b. '+972****4567' → null (masked with asterisks)
assertEq(normalizePhoneForWa('+972****4567'), null, 'normalizePhoneForWa: +972****4567 → null (masked)');

// 3c. '972501234567' → '972501234567'
assertEq(normalizePhoneForWa('972501234567'), '972501234567', 'normalizePhoneForWa: 972501234567 → 972501234567');

// 3d. '+972****4751' → null (masked)
assertEq(normalizePhoneForWa('+972****4751'), null, 'normalizePhoneForWa: masked phone → null');

// 3e. '' → null
assertEq(normalizePhoneForWa(''), null, 'normalizePhoneForWa: empty string → null');

// 3f. null → null
assertEq(normalizePhoneForWa(null), null, 'normalizePhoneForWa: null → null');

// 3g. undefined → null
assertEq(normalizePhoneForWa(undefined), null, 'normalizePhoneForWa: undefined → null');

/* ───── statusLabel ───── */

// 4a. whatsapp_status pending → 'לא נשלחה הודעה'
assertEq(statusLabel('whatsapp_status', 'pending'), 'לא נשלחה הודעה', 'statusLabel: whatsapp_status pending → לא נשלחה הודעה');

// 4b. payment_status bit_request_sent → 'Bit נשלח'
assertEq(statusLabel('payment_status', 'bit_request_sent'), 'Bit נשלח', 'statusLabel: payment_status bit_request_sent → Bit נשלח');

// 4c. unknown value → raw string
assertEq(statusLabel('whatsapp_status', 'bogus_value'), 'bogus_value', 'statusLabel: unknown value → raw string');

// 4d. null → em-dash
assertEq(statusLabel('payment_status', null), '—', 'statusLabel: null → em-dash');

// 4e. undefined → em-dash
assertEq(statusLabel('payment_status', undefined), '—', 'statusLabel: undefined → em-dash');

// 4f. empty string → em-dash
assertEq(statusLabel('payment_status', ''), '—', 'statusLabel: empty string → em-dash');

// 4g. new registration_status labels
assertEq(statusLabel('registration_status', 'group_member'), 'כלול בהרשמה קבוצתית', 'statusLabel: registration_status group_member');
assertEq(statusLabel('registration_status', 'interested'), 'מעוניין', 'statusLabel: registration_status interested');
assertEq(statusLabel('registration_status', 'registered'), 'נרשם', 'statusLabel: registration_status registered');

// 4h. crm_stage labels
assertEq(statusLabel('crm_stage', 'open'), 'פתוח', 'statusLabel: crm_stage open');
assertEq(statusLabel('crm_stage', 'awaiting_reply'), 'ממתין לתשובה', 'statusLabel: crm_stage awaiting_reply');
assertEq(statusLabel('crm_stage', 'interested'), 'מעוניין', 'statusLabel: crm_stage interested');
assertEq(statusLabel('crm_stage', 'closed'), 'סגור', 'statusLabel: crm_stage closed');

/* ───── normalizeRegistration ───── */

// 5. normalizeRegistration returns object with all computed fields
const input = {
  id: 42,
  name: 'דורון',
  phone: '0543178959',
  whatsapp_status: 'pending',
  payment_status: 'bit_request_sent',
  registration_status: 'new',
  edition: 'URU',
  request_type: 'סדנה',
  workshop: 'בריסטה',
  is_spam: '0',
};
const out = normalizeRegistration(input);

assertEq(out.id, 42, 'normalizeRegistration: preserves existing fields');
assertEq(out.name, 'דורון', 'normalizeRegistration: preserves Hebrew name');
assertEq(out.lane, 'waiting_payment', 'normalizeRegistration: computes lane');
assertEq(out.workshop_key, 'uru', 'normalizeRegistration: computes workshop_key');
assertEq(out.whatsapp_label, 'לא נשלחה הודעה', 'normalizeRegistration: computes whatsapp_label');
assertEq(out.payment_label, 'Bit נשלח', 'normalizeRegistration: computes payment_label');
assertEq(out.registration_label, 'חדש', 'normalizeRegistration: computes registration_label');
assertEq(out.wa_phone, '972543178959', 'normalizeRegistration: computes wa_phone');

// Ensure original object is not mutated
assertEq(input.lane, undefined, 'normalizeRegistration: original object not mutated (lane absent)');

/* ───── normalizeRegistration: payment_label override for group members ───── */

// 5a. group_member with parent_registration_id → payment_label shows parent link
const gmWithParent = normalizeRegistration({
  id: 21,
  name: 'יונתן',
  phone: '0540000021',
  registration_status: 'group_member',
  parent_registration_id: 18,
  payment_status: 'pending',
  whatsapp_status: 'pending',
  record_type: 'attendee',
  is_spam: '0',
});
assertEq(gmWithParent.payment_label, 'כלול בהרשמה #18', 'normalizeRegistration: group_member with parent_id → payment_label shows parent link');
assertEq(gmWithParent._is_group_member, true, 'normalizeRegistration: group_member sets _is_group_member=true');

// 5b. group_member without parent_registration_id → generic included text
const gmNoParent = normalizeRegistration({
  id: 22,
  name: 'הילה',
  phone: '0540000022',
  registration_status: 'group_member',
  payment_status: 'pending',
  whatsapp_status: 'pending',
  record_type: 'attendee',
  is_spam: '0',
});
assertEq(gmNoParent.payment_label, 'כלול בהרשמה', 'normalizeRegistration: group_member without parent_id → generic included text');
assertEq(gmNoParent._is_group_member, true, 'normalizeRegistration: group_member without parent_id → _is_group_member=true');

// 5c. regular registration → payment_label unchanged (not overridden)
const regRow = normalizeRegistration({
  id: 1,
  name: 'דורון',
  phone: '0543178959',
  registration_status: 'new',
  payment_status: 'pending',
  whatsapp_status: 'pending',
  edition: 'URU',
  is_spam: '0',
});
assertEq(regRow.payment_label, 'לא שולם', 'normalizeRegistration: regular registration keeps normal payment label');
assertEq(regRow._is_group_member, false, 'normalizeRegistration: regular registration → _is_group_member=false');

// 5d. paid group member — still shows included not paid (display override wins)
const gmPaid = normalizeRegistration({
  id: 23,
  name: 'דנה',
  phone: '0540000023',
  registration_status: 'group_member',
  parent_registration_id: 18,
  payment_status: 'paid',  // server might have this from migration
  whatsapp_status: 'pending',
  record_type: 'attendee',
  is_spam: '0',
});
assertEq(gmPaid.payment_label, 'כלול בהרשמה #18', 'normalizeRegistration: paid group_member → still shows included (not "שולם")');

/* ───── parentSummary ───── */

// parentSummary with allItems lookup → resolves parent name
const summary1 = parentSummary(
  { registration_status: 'group_member', parent_registration_id: 18, record_type: 'attendee' },
  [{ id: 18, name: 'יאנה' }]
);
assertEq(summary1, 'כלול בהרשמת יאנה', 'parentSummary: resolves parent name from allItems');

// parentSummary with allItems but no match → falls back to ID
const summary2 = parentSummary(
  { registration_status: 'group_member', parent_registration_id: 99, record_type: 'attendee' },
  [{ id: 18, name: 'יאנה' }]
);
assertEq(summary2, 'כלול בהרשמה #99', 'parentSummary: no matching parent → fallback to #ID');

// parentSummary without allItems → falls back to ID
const summary3 = parentSummary(
  { registration_status: 'group_member', parent_registration_id: 18, record_type: 'attendee' }
);
assertEq(summary3, 'כלול בהרשמה #18', 'parentSummary: no allItems provided → fallback to #ID');

// parentSummary for non-group-member → null
assertEq(parentSummary({ registration_status: 'new' }, []), null, 'parentSummary: non-group-member → null');

// parentSummary without parent_registration_id → null
assertEq(parentSummary({ registration_status: 'group_member', record_type: 'attendee' }, []), null, 'parentSummary: no parent_registration_id → null');

/* ───── waDraftMessage ───── */

// 6a. Masked phone → null
assertEq(waDraftMessage({ phone: '+972****4751', name: 'Liraz' }), null, 'waDraftMessage: masked phone → null');

// 6b. Generates URL with correct phone
const resultB = waDraftMessage({
  phone: '0543178959',
  name: 'הילה לוין',
  edition: 'URU · תל אביב',
  workshop_date: 'שישי 3.7 11:00–12:30',
  amount_ils: 200,
  seats: 1,
});
assert(resultB !== null, 'waDraftMessage: should not be null');
assertEq(resultB.phone, '972543178959', 'waDraftMessage: correct phone normalization');
assert(resultB.url.includes('wa.me/972543178959'), 'waDraftMessage: URL contains correct phone');
assert(resultB.message.includes('הילה'), 'waDraftMessage: message includes first name');
assert(resultB.message.includes('עורו'), 'waDraftMessage: message includes venue (עורו)');

// 6c. Group registration mentions multiple seats
const resultC = waDraftMessage({
  phone: '0502234126',
  name: 'שניר פוקס',
  edition: 'URU · תל אביב',
  seats: 2,
  amount_ils: 200,
});
assert(resultC.message.includes('מקומות'), 'waDraftMessage: group message mentions מקומות (plural)');
assert(resultC.message.includes('400'), 'waDraftMessage: group amount shows total 400');

// 6d. Kanopi venue
const resultD = waDraftMessage({
  phone: '0546171377',
  name: 'הלל כהן',
  edition: 'קנופי · ירושלים',
  workshop_date: 'שני 15.6 16:00–17:30',
});
assert(resultD.message.includes('קנופי'), 'waDraftMessage: Kanopi venue mentioned');
assert(resultD.message.includes('מבוא המתמיד'), 'waDraftMessage: Kanopi address mentioned');

/* ───── Summary ───── */

const total = passed + failed;
console.log(`\n${total} tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
