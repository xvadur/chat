---
name: crm
description: Operate Jarvis local CRM in SQLite (`workspace/crm/pcrm.sqlite`) for contacts, interactions, reminders, and follow-ups. Use when user asks for lead/contact state, follow-up planning, outreach logging, or CRM-memory sync with Calendar and Linear.
---

# CRM

Use local SQLite DB as operational memory for people, leads, and follow-ups.

## Source of truth

- DB path: `/Users/_xvadur/.openclaw/workspace/crm/pcrm.sqlite`
- Workspace folder: `/Users/_xvadur/.openclaw/workspace/crm`
- Helper CLI: `/Users/_xvadur/.openclaw/workspace/systems/local-scripts/crm.sh`

## Main tables

- `contacts` - people/companies
- `interactions` - message/call/contact history
- `reminders` - follow-ups (`open` / `done`)
- `docs_links` - links to external docs
- `dedupe_candidates` - duplicate detection

## Core commands

- Preferred wrapper:
  - `/Users/_xvadur/.openclaw/workspace/systems/local-scripts/crm.sh inbox`
  - `/Users/_xvadur/.openclaw/workspace/systems/local-scripts/crm.sh contacts 30`
  - `/Users/_xvadur/.openclaw/workspace/systems/local-scripts/crm.sh interactions 20`
- List open reminders (next 7 days):
  - `sqlite3 /Users/_xvadur/.openclaw/workspace/crm/pcrm.sqlite "SELECT id, title, due_at, status FROM reminders WHERE status='open' AND (due_at IS NULL OR due_at <= datetime('now','+7 day')) ORDER BY due_at IS NULL, due_at;"`
- List latest interactions:
  - `sqlite3 /Users/_xvadur/.openclaw/workspace/crm/pcrm.sqlite "SELECT id, contact_id, channel, direction, subject, at FROM interactions ORDER BY datetime(at) DESC LIMIT 20;"`
- List priority contacts (manual signal):
  - `sqlite3 /Users/_xvadur/.openclaw/workspace/crm/pcrm.sqlite "SELECT id, name, company, relationship_tier, openclaw_status, last_sync FROM contacts ORDER BY datetime(last_sync) DESC LIMIT 50;"`

## Operating workflow

1. Read CRM state first (contacts + open reminders + latest interactions).
2. When an interaction happens, log it into `interactions`.
3. If follow-up is needed, create/update `reminders`.
4. If follow-up has concrete time, offer/create Calendar event.
5. If follow-up becomes execution task, offer/create Linear issue.
6. Write short operational summary to daily memory (`workspace/memory/YYYY-MM-DD.md`) after major CRM changes.

## Cross-system policy

- CRM = relationship memory (who, context, next touch).
- Calendar = time commitment (when exactly).
- Linear = execution ownership (what must be delivered).
- Daily memory = narrative context (why it matters now).

## Slash mapping

- `/crm inbox` -> open reminders + overdue follow-ups
- `/crm contacts` -> contact list/snapshot
- `/crm log` -> insert interaction (`crm.sh log ...`)
- `/crm remind` -> create/update reminder (`crm.sh add-reminder ...`)
- `/crm sync` -> push concise CRM summary into daily memory (`crm.sh sync-note ...`)

## Safety rules

- Read operations: run directly.
- Write operations: summarize intended mutation before applying.
- Destructive operations (`DELETE`, mass `UPDATE`): require explicit `CONFIRM`.
- Do not expose raw secrets from `contact_info` in chat output unless user asks.
