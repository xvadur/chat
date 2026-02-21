#!/usr/bin/env bash
set -euo pipefail

DB="/Users/_xvadur/.openclaw/workspace/crm/pcrm.sqlite"
mkdir -p "$(dirname "$DB")"

sqlite3 "$DB" <<'SQL'
PRAGMA journal_mode=WAL;

CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  company TEXT,
  role TEXT,
  mbti TEXT,
  archetype TEXT,
  values_drive TEXT,
  communication_style TEXT,
  tech_stack TEXT,
  relationship_tier TEXT,
  openclaw_status TEXT,
  insights TEXT,
  analytical_profile TEXT,
  contact_info TEXT,
  last_sync DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS interactions (
  id INTEGER PRIMARY KEY,
  contact_id INTEGER,
  channel TEXT,
  direction TEXT,
  subject TEXT,
  snippet TEXT,
  at TEXT,
  source_ref TEXT,
  FOREIGN KEY(contact_id) REFERENCES contacts(id)
);

CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY,
  contact_id INTEGER,
  title TEXT,
  due_at TEXT,
  status TEXT DEFAULT 'open',
  snooze_until TEXT,
  created_at TEXT,
  FOREIGN KEY(contact_id) REFERENCES contacts(id)
);

CREATE TABLE IF NOT EXISTS noise_rules (
  id INTEGER PRIMARY KEY,
  pattern TEXT UNIQUE,
  rule_type TEXT DEFAULT 'contains',
  active INTEGER DEFAULT 1,
  reason TEXT
);

CREATE TABLE IF NOT EXISTS dedupe_candidates (
  id INTEGER PRIMARY KEY,
  contact_a INTEGER,
  contact_b INTEGER,
  score REAL,
  status TEXT DEFAULT 'new'
);

CREATE TABLE IF NOT EXISTS docs_links (
  id INTEGER PRIMARY KEY,
  contact_id INTEGER,
  source TEXT,
  doc_id TEXT,
  title TEXT,
  url TEXT,
  FOREIGN KEY(contact_id) REFERENCES contacts(id)
);

CREATE TABLE IF NOT EXISTS state (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS sleep_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT CHECK(event_type IN ('sleep_in','sleep_out')),
  event_time TEXT NOT NULL,
  note TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS laura_schedule (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT CHECK(event_type IN ('laura_in','laura_out')),
  event_time TEXT NOT NULL,
  note TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS meals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  meal_text TEXT NOT NULL,
  est_calories INTEGER,
  meal_time TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS exercise_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activity TEXT NOT NULL,
  duration_minutes INTEGER,
  note TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS maintenance_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  area TEXT,
  action TEXT NOT NULL,
  note TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS karol_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_text TEXT NOT NULL,
  payment_eur REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS xp_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  points INTEGER NOT NULL,
  note TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS command_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  command TEXT NOT NULL,
  payload TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
SQL

echo "CRM DB initialized: $DB"
