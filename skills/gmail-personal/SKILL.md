---
name: gmail-personal
description: Gmail workflow for Adam's personal mailbox (yksvadur.ja@gmail.com) via gog CLI. Use when checking personal notifications, account security alerts, personal admin, and non-business communications.
---

# Gmail Personal (yksvadur.ja@gmail.com)

Use `gog` with `--account yksvadur.ja@gmail.com` for all commands.

## Core commands

- Search inbox:
  - `gog gmail search "in:inbox newer_than:7d" --max=20 --json --no-input --account yksvadur.ja@gmail.com`
- Unread only:
  - `gog gmail search "in:inbox is:unread newer_than:7d" --max=20 --json --no-input --account yksvadur.ja@gmail.com`
- Security alerts:
  - `gog gmail search "in:inbox (security OR password OR login OR alert) newer_than:14d" --max=20 --json --no-input --account yksvadur.ja@gmail.com`
- Open a thread:
  - `gog gmail thread get <threadId> --json --no-input --account yksvadur.ja@gmail.com`

## Operating rules

- Keep personal mailbox triage separate from business tasks.
- Escalate account-security emails first.
- Batch low-priority newsletters/promotions into a short summary.