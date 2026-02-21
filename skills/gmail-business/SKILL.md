---
name: gmail-business
description: Gmail workflow for Adam's business mailbox (adam@xvadur.com) via gog CLI. Use when triaging business email, searching client/vendor threads, drafting replies, or checking urgent inbox items for the business account.
---

# Gmail Business (adam@xvadur.com)

Use `gog` with `--account adam@xvadur.com` for all commands.

## Core commands

- Search inbox:
  - `gog gmail search "in:inbox newer_than:7d" --max=20 --json --no-input --account adam@xvadur.com`
- Urgent/important threads:
  - `gog gmail search "in:inbox is:important newer_than:3d" --max=20 --json --no-input --account adam@xvadur.com`
- Open a thread:
  - `gog gmail thread get <threadId> --json --no-input --account adam@xvadur.com`
- Create a draft:
  - `gog gmail drafts create --to "name@domain.com" --subject "..." --body "..." --no-input --account adam@xvadur.com`

## Operating rules

- Use draft-first behavior for outbound business replies unless explicitly asked to send.
- Prioritize messages tied to revenue, clients, invoices, legal/compliance, platform billing, and account security.
- Summarize each triage batch as: urgent / this-week / FYI.