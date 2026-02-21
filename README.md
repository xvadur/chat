<p align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&color=0:0ea5e9,100:22c55e&height=160&section=header&text=Jarvis%20Runtime&fontSize=42&fontColor=ffffff&animation=fadeIn&fontAlignY=35&desc=OpenClaw-based%20operating%20runtime%20for%20Aistryko&descAlignY=58" />
</p>

<p align="center">
  <a href="https://github.com/xvadur/chat"><img alt="Repo" src="https://img.shields.io/badge/repo-xvadur%2Fchat-111827?style=for-the-badge&logo=github" /></a>
  <img alt="Branch" src="https://img.shields.io/badge/branch-main-16a34a?style=for-the-badge" />
  <img alt="Visibility" src="https://img.shields.io/badge/visibility-private-0f172a?style=for-the-badge" />
</p>

<p align="center">
  <img src="https://media.giphy.com/media/13HgwGsXF0aiGY/giphy.gif" width="760" alt="Jarvis runtime hero animation" />
</p>

# Jarvis Runtime

Operational runtime for Jarvis on top of OpenClaw.  
This repo tracks structure, skills, and operating docs while keeping secrets and transient state local-only.

## Quickstart

```bash
cd /Users/_xvadur/.openclaw
pnpm openclaw tui
```

If CRM DB is missing:

```bash
/Users/_xvadur/.openclaw/workspace/systems/local-scripts/init_crm_db.sh
```

## Runtime Map

- `workspace/` - core identity, memory, systems, outputs
- `skills/` - local skills (`crm`, `airtable`, `slash-commands`, ...)
- `credentials/` - local credentials (not tracked)
- `openclaw.json` - local runtime config (not tracked)

Core workspace docs:
- `workspace/AGENTS.md`
- `workspace/SOUL.md`
- `workspace/USER.md`
- `workspace/IDENTITY.md`
- `workspace/MEMORY.md`
- `workspace/TOOLS.md`
- `workspace/HEARTBEAT.md`

## Ops Architecture

```mermaid
flowchart LR
  A["Chat / Commands"] --> B["Skills Router"]
  B --> C["CRM (SQLite)"]
  B --> D["Calendar (gog)"]
  B --> E["Linear"]
  B --> F["Airtable"]
  C --> G["Daily Memory"]
  D --> G
  E --> G
```

## Command Routing

- `/crm ...` -> local CRM skill + SQLite workflow
- `/linear ...` -> Linear skill
- `/gog ...` -> Google services skill
- `/airtable ...` -> Airtable skill

Command source-of-truth:
- `skills/slash-commands/SKILL.md`

## Security and Git Hygiene

Never commit:
- secrets/tokens (`openclaw.json`, credentials, identity files)
- runtime state (`logs`, `media`, browser/session artifacts)
- local DB artifacts (`*.sqlite`, `*.wal`, `*.shm`)

This repository is intended to stay private and team-safe for runtime collaboration.

## Team Workflow

1. Pull latest `main`.
2. Keep runtime docs/skills/scripts updated.
3. Keep secrets local.
4. Push only safe operational assets.

<p align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&color=0:22c55e,100:0ea5e9&height=120&section=footer" />
</p>
