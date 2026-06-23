// Status label maps — NEVER show raw DB values in the UI
export const STATUS_LABELS = Object.freeze({
  whatsapp_status: {
    pending: 'לא נשלחה הודעה',
    outreach_sent: 'נשלחה הודעה',
    sent: 'נשלחה הודעה',
    awaiting_reply: 'ממתין לתשובה',
    replied_interested: 'חזר מעוניין',
  },
  payment_status: {
    pending: 'לא שולם',
    bit_request_sent: 'Bit נשלח',
    paid: 'שולם',
  },
  registration_status: {
    new: 'חדש',
    needs_payment_followup: 'פולואפ תשלום',
    registered_under_shnir: 'כלול בהרשמה קבוצתית',
    not_handled: 'לא טופל',
    confirmed: 'מאושר',
    cancelled: 'בוטל',
    lead: 'ליד לעדכונים',
    group_member: 'כלול בהרשמה קבוצתית',
    interested: 'מעוניין',
    registered: 'נרשם',
    waitlist: 'רשימת המתנה',
  },
  crm_stage: {
    open: 'פתוח',
    awaiting_reply: 'ממתין לתשובה',
    interested: 'מעוניין',
    closing: 'בסגירה',
    closed: 'סגור',
    lost: 'אבד',
  },
});

export function statusLabel(field, value) {
  if (value === null || value === undefined || value === '') return '—';
  return STATUS_LABELS[field]?.[value] || String(value);
}

// ───── CRM helpers ───────────────────────────────────────────────

/**
 * Infer the record_type for a row.
 * Returns the explicit value when set, otherwise falls back to legacy heuristics.
 */
export function recordType(row) {
  if (row.record_type) return row.record_type;
  if (row.registration_status === 'registered_under_shnir' || row.registration_status === 'group_member') return 'attendee';
  const key = workshopKey(row);
  if (row.registration_status === 'lead' || key === 'brew_updates' || key === 'espresso_updates') return 'lead';
  return 'registration';
}

/**
 * Is this row a group member / attendee (not independently payable)?
 */
export function isGroupMember(row) {
  return recordType(row) === 'attendee' ||
    row.registration_status === 'registered_under_shnir' ||
    row.registration_status === 'group_member' ||
    String(row.group_registration || '').includes('כלול בהרשמת');
}

/**
 * Is this row a billable payer registration?
 * Non-billable rows: leads, attendees, cancelled, spam — excluded from revenue KPIs.
 */
export function isBillableRow(row) {
  if (Number(row.is_spam) === 1) return false;
  if (row.registration_status === 'cancelled') return false;
  if (recordType(row) !== 'registration') return false;
  return true;
}

// Compute which lane the registration belongs in for cockpit view
export function computeLane(row) {
  if (Number(row.is_spam) === 1) return 'closed';
  if (row.registration_status === 'cancelled') return 'closed';
  if (isGroupMember(row)) return 'closed';
  if (row.payment_status === 'paid') return 'closed';
  if (row.payment_status === 'bit_request_sent') return 'waiting_payment';

  // Explicit waitlist → dedicated lane
  if (row.registration_status === 'waitlist') return 'waitlist';

  if (recordType(row) === 'lead') {
    if (row.registration_status === 'interested' || row.crm_stage === 'interested') return 'needs_closing';
    if (row.whatsapp_status === 'pending') return 'needs_action';
    return 'open_leads';
  }

  if (row.registration_status === 'needs_payment_followup') return 'needs_closing';
  if (row.registration_status === 'not_handled') return 'needs_action';
  if (row.whatsapp_status === 'pending') return 'needs_action';
  return 'needs_closing';
}

// Classify by workshop/edition for filters
export function workshopKey(row) {
  const text = `${row.edition || ''} ${row.request_type || ''} ${row.workshop || ''}`;
  // Actual workshops first so a workshop named e.g. "חליטות עורו" doesn't get mis-classified
  if (text.includes('URU') || text.includes('תל אביב')) return 'uru';
  if (text.includes('קנופי') || text.includes('ירושלים')) return 'kanopi';
  // אספרסו before generic עדכונים so rows with both go to espresso
  if (text.includes('אספרסו')) return 'espresso_updates';
  if (text.includes('עדכונים') || text.includes('חליט')) return 'brew_updates';
  return 'other';
}

// Normalize phone for WhatsApp wa.me links
export function normalizePhoneForWa(phone) {
  const raw = String(phone || '').trim();
  if (!raw || raw.includes('*')) return null;
  const digits = raw.replace(/[^0-9+]/g, '');
  if (digits.startsWith('+972')) return '972' + digits.slice(4);
  if (digits.startsWith('972')) return digits;
  if (digits.startsWith('0')) return '972' + digits.slice(1);
  return digits.length >= 9 ? digits : null;
}

// Full normalization that adds computed fields
export function normalizeRegistration(row) {
  const gm = isGroupMember(row);
  const lane = computeLane(row);

  // Compute a human-readable primary display status
  let display_status;
  let display_status_tone = 'neutral';

  if (Number(row.is_spam) === 1) {
    display_status = 'ספאם';
    display_status_tone = 'error';
  } else if (row.registration_status === 'cancelled') {
    display_status = 'בוטל';
    display_status_tone = 'muted';
  } else if (gm) {
    display_status = 'כלול בהרשמה';
    display_status_tone = 'info';
  } else if (row.registration_status === 'waitlist') {
    display_status = 'רשימת המתנה';
    display_status_tone = 'info';
  } else if (row.payment_status === 'paid' && isBillableRow(row)) {
    // Billable paid rows show as closed/paid regardless of registration_status
    display_status = 'שולם';
    display_status_tone = 'success';
  } else if (recordType(row) === 'lead') {
    // Leads show granular state based on whatsapp/crm status
    if (row.whatsapp_status === 'pending') {
      display_status = 'צריך הודעה';
      display_status_tone = 'action';
    } else if (row.registration_status === 'interested' || row.crm_stage === 'interested') {
      display_status = 'מעוניין';
      display_status_tone = 'positive';
    } else if (row.whatsapp_status === 'awaiting_reply') {
      display_status = 'מחכה לתשובה';
      display_status_tone = 'pending';
    } else if (lane === 'open_leads') {
      display_status = 'מחכה לתשובה';
      display_status_tone = 'pending';
    } else if (lane === 'needs_closing') {
      display_status = 'בסגירה';
      display_status_tone = 'warning';
    } else {
      display_status = statusLabel('registration_status', row.registration_status);
      display_status_tone = 'pending';
    }
  } else if (row.payment_status === 'bit_request_sent') {
    display_status = 'מחכה לתשלום';
    display_status_tone = 'warning';
  } else if (lane === 'needs_action') {
    display_status = 'צריך הודעה';
    display_status_tone = 'action';
  } else if (lane === 'open_leads') {
    display_status = 'מחכה לתשובה';
    display_status_tone = 'pending';
  } else if (lane === 'needs_closing') {
    display_status = 'בסגירה';
    display_status_tone = 'warning';
  } else if (lane === 'closed') {
    display_status = 'סגור';
    display_status_tone = 'muted';
  } else {
    display_status = statusLabel('registration_status', row.registration_status);
  }

  return {
    ...row,
    lane,
    workshop_key: workshopKey(row),
    whatsapp_label: statusLabel('whatsapp_status', row.whatsapp_status),
    payment_label: gm
      ? (row.parent_registration_id
        ? `כלול בהרשמה #${row.parent_registration_id}`
        : 'כלול בהרשמה')
      : statusLabel('payment_status', row.payment_status),
    registration_label: (row.payment_status === 'paid' && isBillableRow(row))
      ? 'שולם'
      : statusLabel('registration_status', row.registration_status),
    display_status,
    display_status_tone,
    wa_phone: normalizePhoneForWa(row.phone),
    _is_group_member: gm,
  };
}

/**
 * Generate a human-readable summary of a group-member's parent registration.
 * If `allItems` (array of normalized rows) is provided, tries to resolve the
 * parent name.  Otherwise falls back to the parent id.
 * Returns null if the row is not a group member or has no parent.
 */
export function parentSummary(row, allItems) {
  if (!isGroupMember(row) || !row.parent_registration_id) return null;
  const parent = allItems?.find(r => Number(r.id) === Number(row.parent_registration_id));
  if (parent && parent.name) return `כלול בהרשמת ${parent.name}`;
  return `כלול בהרשמה #${row.parent_registration_id}`;
}

/**
 * Generate a prefilled WhatsApp message for workshop outreach.
 * Returns null if phone is not reachable (masked, empty, etc).
 * Policy: NEVER sends automatically — only generates the link.
 */
export function waDraftMessage(row) {
  const phone = normalizePhoneForWa(row.phone);
  if (!phone) return null;

  const firstName = (row.name || '').split(/\s+/)[0] || 'שם';
  const edition = row.edition || '';
  const date = row.workshop_date || row.date || '';
  const amount = row.amount_ils;
  const seats = row.seats || 1;
  const isGroup = seats > 1;

  // Venue-aware message
  const isURU = edition.includes('URU') || edition.includes('עורו') || edition.includes('תל אביב');
  const isKanopi = edition.includes('קנופי') || edition.includes('ירושלים');

  let venue = '';
  if (isURU) venue = 'בעורו בתל אביב, הכישור 1 ביתן 107';
  else if (isKanopi) venue = 'בקנופי בירושלים, מבוא המתמיד 6';

  let msg = `היי ${firstName}, מה שלומך?\n\n`;

  if (isURU || isKanopi) {
    msg += `ראיתי שנרשמת לסדנת החליטות ${venue}${date ? ', ' + date : ''}.\n`;
  } else {
    msg += `תודה שנרשמת לסדנת הקפה${date ? ' ב' + date : ''}!\n`;
  }

  if (amount) {
    const total = amount * seats;
    msg += `\nכדי לשמור ${isGroup ? 'מקומות' : 'מקום'}, אפשר להעביר ביט על סך ${total} ש״ח${isGroup ? ` (${seats} מקומות × ₪${amount})` : ''}.\n`;
  } else {
    msg += `\nמחכה לראות אותך בסדנה!\n`;
  }

  msg += `\nכל שאלה — אני כאן.`;

  return {
    phone,
    message: msg,
    url: `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`,
  };
}
