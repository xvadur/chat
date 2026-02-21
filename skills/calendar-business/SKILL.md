---
name: calendar-business
description: Google Calendar workflow for Adam's business account (adam@xvadur.com) via gog CLI. Use for business meetings, client calls, delivery blocks, and work scheduling tied to the business calendar.
---

# Calendar Business (adam@xvadur.com)

Use `gog calendar` with `--account adam@xvadur.com`.

## Core commands

- List today's events:
  - `gog calendar list --days 1 --json --no-input --account adam@xvadur.com`
- List range:
  - `gog calendar list --from <ISO> --to <ISO> --json --no-input --account adam@xvadur.com`
- Create event:
  - `gog calendar create primary --summary "<title>" --from "<ISO>" --to "<ISO>" --json --no-input --account adam@xvadur.com`
- Update event:
  - `gog calendar update primary <eventId> --summary "<new>" --json --no-input --account adam@xvadur.com`

## Rules

- Default all business planning to this account.
- Confirm time window and timezone before create/update.
- Prefer explicit start/end over vague wording when writing events.
