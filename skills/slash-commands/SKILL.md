---
name: slash-commands
description: Execute and interpret Adam's slash command protocol (/chat, /exe, /system, daily commands, business/ops commands). Use when user sends a slash command, asks what commands exist, or asks how command routing should work.
---

# Slash Commands

Single source of truth for command behavior and routing.

## Mode contracts (strict)

- `/chat` → conversation-first (reflection, framing, understanding). Do not force execution unless user asks.
- `/exe` → execution-first (concrete next steps, sequence, completion).
- `/system` → update core docs/protocols and confirm exact changes.

## Core daily commands

- `/sleep in <cas>`
- `/sleep out <cas>`
- `/laura out <cas>`
- `/laura in <cas>`
- `/udrzba <co> [kde]`
- `/jedlo <co>`
- `/cvicenie <typ> [trvanie]`
  - pri detailnom tréningu (série/váhy) zapisuj aj do workout DB (`pcrm.sqlite`) cez `workspace/systems/local-scripts/crm.sh` (`workout-new`, `workout-add`, `workout-day`)
- `/karol <udalost>`
- `/log <text>`
- `/brief morning`
- `/brief evening`
- `/save`

## Daily Log Protocol

- Maintain `memory/YYYY-MM-DD.md` continuously through the day.
- Log meaningful day events even from natural chat updates (sleep, food, exercise, Karol, decisions, tasks).
- Use `/log` for explicit entries; still capture relevant implicit status updates.
- Goal: complete day timeline with minimal friction.

## Business / operations commands

- `/linear [akcia]`
- `/plan <co> <kedy>`
- `/calendar [akcia]`
- `/git [akcia]`
- `/crm [akcia]`
- `/fin [akcia]`
- `/cloudflare [akcia]`
- `/obsidian [akcia]`
- `/news <tema>`
- `/gog [akcia]`
- `/airtable [akcia]`

## Command → skill routing handshake

- When a command requires a specialized workflow/tool, use the most specific skill.
- Canonical mappings:
  - `/weather` → `weather`
  - YouTube transcript/sumarizácia → `youtube-transcript`
  - GitHub issues/PR/CI → `github`
  - Obsidian operácie → `obsidian`
  - Google Workspace operácie → `gog`
  - Airtable operácie → `airtable` (ak dostupný), inak API fallback
  - CRM operácie → `crm` (SQLite v `workspace/crm/pcrm.sqlite`)
  - Things 3 tasky → `things-mac`
  - Apple Reminders → `apple-reminders`
  - Business Gmail (`adam@xvadur.com`) → `gmail-business`
  - Personal Gmail (`yksvadur.ja@gmail.com`) → `gmail-personal`
  - Business Calendar (`adam@xvadur.com`) → `calendar-business`
  - Personal Calendar (`yksvadur.ja@gmail.com`) → `calendar-personal`

## Rule

Keep this file as source-of-truth for command protocol changes. Keep `TOOLS.md` as quick operational notes only.

## OpenClaw command reliability

- If the task requires OpenClaw CLI and `openclaw` is missing in PATH, use:
  - `workspace/systems/local-scripts/openclaw.sh <args>`
- Example fallback:
  - `workspace/systems/local-scripts/openclaw.sh update status`
