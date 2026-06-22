-- Coffee Workshop Registrations: D1 Schema
-- Phase 1 — Backend-only, no live page changes.

CREATE TABLE IF NOT EXISTS registrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_submission_id TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,

  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,

  edition TEXT,
  request_type TEXT,
  workshop TEXT,
  workshop_date TEXT,
  source TEXT,
  group_registration TEXT,

  seats INTEGER NOT NULL DEFAULT 1,
  amount_ils INTEGER,

  whatsapp_status TEXT NOT NULL DEFAULT 'pending',
  payment_status TEXT NOT NULL DEFAULT 'pending',
  registration_status TEXT NOT NULL DEFAULT 'new',

  is_spam INTEGER NOT NULL DEFAULT 0,
  spam_reason TEXT,

  notes TEXT,
  imported_from TEXT,
  original_submission_id TEXT
);

CREATE TABLE IF NOT EXISTS registration_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  registration_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  event_type TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  note TEXT,
  FOREIGN KEY (registration_id) REFERENCES registrations(id)
);

CREATE INDEX IF NOT EXISTS idx_registrations_phone ON registrations(phone);
CREATE INDEX IF NOT EXISTS idx_registrations_created_at ON registrations(created_at);
CREATE INDEX IF NOT EXISTS idx_registrations_edition ON registrations(edition);
CREATE INDEX IF NOT EXISTS idx_registrations_payment_status ON registrations(payment_status);
CREATE INDEX IF NOT EXISTS idx_registrations_is_spam ON registrations(is_spam);
