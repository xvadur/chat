#!/usr/bin/env bash
set -euo pipefail

DB="/Users/_xvadur/.openclaw/workspace/crm/pcrm.sqlite"
MEM_DIR="/Users/_xvadur/.openclaw/workspace/memory"
TODAY_FILE="$MEM_DIR/$(date +%F).md"

usage() {
  cat <<'USAGE'
Usage:
  crm.sh inbox
  crm.sh contacts [limit]
  crm.sh interactions [limit]
  crm.sh add-reminder <contact_id> <title> [due_at_iso]
  crm.sh log <contact_id> <channel> <direction> <subject> [snippet]
  crm.sh sync-note <text>

  # Workout DB (detailed)
  crm.sh workout-new [session_date_yyyy-mm-dd] [note]
  crm.sh workout-add <session_id> <exercise_name> <weight_kg> <reps> [set_order]
  crm.sh workout-day [session_date_yyyy-mm-dd]
  crm.sh workout-show <session_id>
USAGE
}

sql_escape() {
  local s="$1"
  s="${s//\'/\'\'}"
  printf '%s' "$s"
}

require_db() {
  if [[ ! -f "$DB" ]]; then
    echo "CRM DB not found: $DB" >&2
    exit 1
  fi
}

cmd_inbox() {
  sqlite3 -header -column "$DB" "
    SELECT r.id, c.name AS contact, r.title, r.due_at, r.status
    FROM reminders r
    LEFT JOIN contacts c ON c.id = r.contact_id
    WHERE r.status = 'open'
    ORDER BY (r.due_at IS NULL), datetime(r.due_at);
  "
}

cmd_contacts() {
  local limit="${1:-30}"
  sqlite3 -header -column "$DB" "
    SELECT id, name, company, relationship_tier, openclaw_status, last_sync
    FROM contacts
    ORDER BY datetime(last_sync) DESC
    LIMIT $limit;
  "
}

cmd_interactions() {
  local limit="${1:-20}"
  sqlite3 -header -column "$DB" "
    SELECT i.id, c.name AS contact, i.channel, i.direction, i.subject, i.at
    FROM interactions i
    LEFT JOIN contacts c ON c.id = i.contact_id
    ORDER BY datetime(i.at) DESC
    LIMIT $limit;
  "
}

cmd_add_reminder() {
  local contact_id="$1"
  local title
  title="$(sql_escape "$2")"
  local due_at="${3:-}"
  local created_at
  created_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  if [[ -n "$due_at" ]]; then
    sqlite3 "$DB" "INSERT INTO reminders (contact_id, title, due_at, status, created_at) VALUES ($contact_id, '$title', '$due_at', 'open', '$created_at');"
  else
    sqlite3 "$DB" "INSERT INTO reminders (contact_id, title, status, created_at) VALUES ($contact_id, '$title', 'open', '$created_at');"
  fi
  echo "Reminder created."
}

cmd_log() {
  local contact_id="$1"
  local channel
  local direction
  local subject
  local snippet
  channel="$(sql_escape "$2")"
  direction="$(sql_escape "$3")"
  subject="$(sql_escape "$4")"
  snippet="$(sql_escape "${5:-}")"
  local at
  at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  sqlite3 "$DB" "INSERT INTO interactions (contact_id, channel, direction, subject, snippet, at) VALUES ($contact_id, '$channel', '$direction', '$subject', '$snippet', '$at');"
  echo "Interaction logged."
}

cmd_sync_note() {
  local text="$1"
  mkdir -p "$MEM_DIR"
  if [[ ! -f "$TODAY_FILE" ]]; then
    printf "# %s\n\n" "$(date +%F)" > "$TODAY_FILE"
  fi
  printf -- "- [CRM %s] %s\n" "$(date +%H:%M)" "$text" >> "$TODAY_FILE"
  echo "CRM note synced to $TODAY_FILE"
}

cmd_workout_new() {
  local session_date="${1:-$(date +%F)}"
  local note
  note="$(sql_escape "${2:-}")"
  local sid
  sid=$(sqlite3 "$DB" "INSERT INTO workout_sessions (session_date, note) VALUES ('$session_date', '$note'); SELECT last_insert_rowid();")
  echo "Workout session created: $sid ($session_date)"
}

cmd_workout_add() {
  local session_id="$1"
  local exercise
  exercise="$(sql_escape "$2")"
  local weight_kg="$3"
  local reps="$4"
  local set_order="${5:-}"

  local ex_id
  ex_id=$(sqlite3 "$DB" "SELECT id FROM workout_exercises WHERE session_id=$session_id AND exercise_name='$exercise' ORDER BY id LIMIT 1;")
  if [[ -z "$ex_id" ]]; then
    local ex_order
    ex_order=$(sqlite3 "$DB" "SELECT COALESCE(MAX(exercise_order),0)+1 FROM workout_exercises WHERE session_id=$session_id;")
    ex_id=$(sqlite3 "$DB" "INSERT INTO workout_exercises (session_id, exercise_name, exercise_order) VALUES ($session_id, '$exercise', $ex_order); SELECT last_insert_rowid();")
  fi

  if [[ -z "$set_order" ]]; then
    set_order=$(sqlite3 "$DB" "SELECT COALESCE(MAX(set_order),0)+1 FROM workout_sets WHERE exercise_id=$ex_id;")
  fi

  sqlite3 "$DB" "INSERT INTO workout_sets (exercise_id, set_order, weight_kg, reps) VALUES ($ex_id, $set_order, $weight_kg, $reps);"
  echo "Workout set added: session=$session_id exercise='$2' set=$set_order ${weight_kg}kg x ${reps}"
}

cmd_workout_day() {
  local session_date="${1:-$(date +%F)}"
  sqlite3 -header -column "$DB" "
    SELECT ws.id AS session_id, ws.session_date, we.exercise_name, wset.set_order, wset.weight_kg, wset.reps
    FROM workout_sessions ws
    JOIN workout_exercises we ON we.session_id = ws.id
    JOIN workout_sets wset ON wset.exercise_id = we.id
    WHERE ws.session_date = '$session_date'
    ORDER BY ws.id DESC, we.exercise_order ASC, wset.set_order ASC;
  "
}

cmd_workout_show() {
  local session_id="$1"
  sqlite3 -header -column "$DB" "
    SELECT ws.id AS session_id, ws.session_date, ws.note, we.exercise_name, wset.set_order, wset.weight_kg, wset.reps
    FROM workout_sessions ws
    JOIN workout_exercises we ON we.session_id = ws.id
    JOIN workout_sets wset ON wset.exercise_id = we.id
    WHERE ws.id = $session_id
    ORDER BY we.exercise_order ASC, wset.set_order ASC;
  "
}

main() {
  require_db
  local cmd="${1:-}"
  shift || true

  case "$cmd" in
    inbox) cmd_inbox "$@" ;;
    contacts) cmd_contacts "$@" ;;
    interactions) cmd_interactions "$@" ;;
    add-reminder)
      [[ $# -ge 2 ]] || { usage; exit 1; }
      cmd_add_reminder "$@"
      ;;
    log)
      [[ $# -ge 4 ]] || { usage; exit 1; }
      cmd_log "$@"
      ;;
    sync-note)
      [[ $# -ge 1 ]] || { usage; exit 1; }
      cmd_sync_note "$*"
      ;;
    workout-new)
      cmd_workout_new "$@"
      ;;
    workout-add)
      [[ $# -ge 4 ]] || { usage; exit 1; }
      cmd_workout_add "$@"
      ;;
    workout-day)
      cmd_workout_day "$@"
      ;;
    workout-show)
      [[ $# -ge 1 ]] || { usage; exit 1; }
      cmd_workout_show "$@"
      ;;
    *)
      usage
      exit 1
      ;;
  esac
}

main "$@"
