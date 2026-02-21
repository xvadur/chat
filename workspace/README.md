# Jarvis Workspace

This folder is the active operating workspace for Jarvis.

## Core Documents (root)

- `AGENTS.md`
- `SOUL.md`
- `USER.md`
- `IDENTITY.md`
- `MEMORY.md`
- `TOOLS.md`
- `HEARTBEAT.md`

## Folder Layout

- `systems/` - automation scripts and technical helpers
- `outputs/` - generated outputs, reports, and campaign artifacts
- `memory/` - daily logs and short-term operational notes
- `crm/` - local CRM database/state
- `archives/` - cold storage (legacy context, old project snapshots)

## Rules

1. Keep workspace root clean. New active files should go into folders unless they are core documents.
2. Slash command protocol source-of-truth is `~/.openclaw/skills/slash-commands/SKILL.md`.
3. Obsidian is the canonical source for templates.
4. `archives/` is not a source-of-truth for active operations.
5. CRM is core, integrated with planning stack:
   - `crm/` tracks relationship memory and follow-up state
   - Calendar tracks scheduled time commitments
   - Linear tracks executable delivery tasks
