# Workspace Index

This workspace was reorganized to separate runtime-critical files from project execution artifacts.

## Keep At Root (runtime identity)

- `AGENTS.md`
- `SOUL.md`
- `USER.md`
- `IDENTITY.md`
- `MEMORY.md`
- `TOOLS.md` (includes slash-command protocol)
- `COMMANDS.md` (legacy redirect)
- `HEARTBEAT.md`

## Structure

- `control/`
  - Live dashboards and execution boards (`ACTION-BOARD.md`, `GLOBAL-DASHBOARD.md`, `DASHBOARD.html`)
- `projects/`
  - Active projects (`projects/AIstriko/`)
- `systems/`
  - Automation and trackers (`systems/automation/`, `systems/social-tracker/`)
- `outbound/`
  - Outreach pipeline and outputs
  - `outbound/runs/` contains archived batch artifacts
  - `outbound/v2/` contains readiness/outbound v2 outputs
- `research/`
  - Strategy and migration notes
- `onboarding-data/`
  - Long-form personal/context docs
- `memory/`
  - Daily logs and memory notes
- `crm/`
  - Local CRM SQLite database
- `archives/`
  - Historical archived material
- `_archive/`
  - Internal technical archives (`_archive/system/git-local-backup`)

## Operating Rules

- New dashboards go to `control/`.
- New one-off plans go to `research/`.
- New scripts/services go to `systems/`.
- New campaign output goes to `outbound/runs/YYYY-MM-DD_<name>/`.
- Do not create loose files in workspace root unless they are core identity/runtime files.
