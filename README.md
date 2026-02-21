<p align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&color=0:f97316,100:ef4444&height=160&section=header&text=Chat&fontSize=52&fontColor=ffffff&animation=fadeIn&fontAlignY=35&desc=The%20Ultimate%20Personal%20Suite%20on%20OpenClaw&descAlignY=58" />
</p>

<p align="center">
  <a href="https://github.com/xvadur/chat"><img alt="Repo" src="https://img.shields.io/badge/repo-xvadur%2Fchat-111827?style=for-the-badge&logo=github" /></a>
  <img alt="Branch" src="https://img.shields.io/badge/branch-main-16a34a?style=for-the-badge" />
  <img alt="Visibility" src="https://img.shields.io/badge/visibility-private-0f172a?style=for-the-badge" />
</p>

<p align="center">
  <img src="https://media1.tenor.com/m/KHFiSxhUNpgAAAAd/rock-lee-anime.gif" width="760" alt="Rock Lee drops his training weights (Chunin Exams)" />
</p>

# Chat

The ultimate operating runtime for Jarvis on top of OpenClaw.  
This is where strategy becomes execution: memory, CRM, commands, and delivery systems in one battle-tested stack.

Built for speed. Built for focus. Built to ship.

## Quickstart

```bash
cd /Users/_xvadur/.openclaw
pnpm openclaw tui
```

If CRM DB is missing, bootstrap it in one command:

```bash
/Users/_xvadur/.openclaw/workspace/systems/local-scripts/init_crm_db.sh
```

## Runtime Map

- `workspace/` - command center: identity, memory, systems, outputs
- `skills/` - execution modules (`crm`, `airtable`, `slash-commands`, ...)
- `credentials/` - local secrets (never tracked)
- `openclaw.json` - local runtime config (never tracked)

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

- `/crm ...` -> relationship intelligence and follow-up control
- `/linear ...` -> execution ownership and delivery tracking
- `/gog ...` -> Google services operations layer
- `/airtable ...` -> structured data sync layer

Command source-of-truth:
- `skills/slash-commands/SKILL.md`

## Security and Git Hygiene

Never commit:
- secrets/tokens (`openclaw.json`, credentials, identity files)
- runtime state (`logs`, `media`, browser/session artifacts)
- local DB artifacts (`*.sqlite`, `*.wal`, `*.shm`)

Runtime stays private, clean, and team-safe by default.

## Team Workflow

1. Pull latest `main`.
2. Execute from the system, then document what changed.
3. Keep secrets local.
4. Push only safe operational assets.

<p align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&color=0:ef4444,100:f97316&height=120&section=footer" />
</p>
