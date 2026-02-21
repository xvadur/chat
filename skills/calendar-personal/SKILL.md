---
name: calendar-personal
description: Google Calendar workflow for Adam's personal account (yksvadur.ja@gmail.com) via gog CLI. Use for personal plans, health, family, errands, and non-business scheduling.
---

# Calendar Personal (yksvadur.ja@gmail.com)

Use `gog calendar` with `--account yksvadur.ja@gmail.com`.

## Core commands

- List today's events:
  - `gog calendar list --days 1 --json --no-input --account yksvadur.ja@gmail.com`
- List range:
  - `gog calendar list --from <ISO> --to <ISO> --json --no-input --account yksvadur.ja@gmail.com`
- Create event:
  - `gog calendar create primary --summary "<title>" --from "<ISO>" --to "<ISO>" --json --no-input --account yksvadur.ja@gmail.com`
- Update event:
  - `gog calendar update primary <eventId> --summary "<new>" --json --no-input --account yksvadur.ja@gmail.com`

## Rules

- Keep personal/family/health scheduling in this account.
- Escalate overlaps with business calendar so conflicts are visible.
- Confirm reminders when event is time-sensitive.
