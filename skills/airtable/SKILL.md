---
name: airtable
description: Airtable API workflow for listing bases/tables, sampling records, and safe upserts via REST. Use when user asks for Airtable reads/writes, base/table inspection, or CRM-style record updates.
---

# Airtable

Use Airtable REST API directly with `curl` + `jq`.

## Preconditions

- API key available in `openclaw.json` as `skills.entries.airtable.apiKey` or env var `AIRTABLE_API_KEY`.
- Never print full API key in output.

## Auth helper

```bash
AIRTABLE_API_KEY="$(jq -r '.skills.entries.airtable.apiKey // empty' /Users/_xvadur/.openclaw/openclaw.json)"
```

Fallback:

```bash
AIRTABLE_API_KEY="$AIRTABLE_API_KEY"
```

## Core operations

### List bases

```bash
curl -sS -H "Authorization: Bearer $AIRTABLE_API_KEY" \
  "https://api.airtable.com/v0/meta/bases" | jq
```

### List tables in base

```bash
BASE_ID="appXXXXXXXXXXXXXX"
curl -sS -H "Authorization: Bearer $AIRTABLE_API_KEY" \
  "https://api.airtable.com/v0/meta/bases/$BASE_ID/tables" | jq
```

### Sample records

```bash
BASE_ID="appXXXXXXXXXXXXXX"
TABLE="Leads"
curl -sS -H "Authorization: Bearer $AIRTABLE_API_KEY" \
  --get "https://api.airtable.com/v0/$BASE_ID/$TABLE" \
  --data-urlencode "maxRecords=10" | jq
```

### Upsert-like write (find + update/create)

1. Query existing record by unique field (e.g. `Email`).
2. If found: `PATCH /v0/{base}/{table}/{recordId}`.
3. If not found: `POST /v0/{base}/{table}`.

## Slash command mapping

- `/airtable bases` -> list bases
- `/airtable tables <base>` -> list tables
- `/airtable sample <base> <table> <n>` -> sample records
- `/airtable upsert <base> <table> <payload>` -> write flow with explicit confirmation

## Safety rules

- Reads: execute directly.
- Writes: require explicit `CONFIRM` in chat before API mutation.
- Before writes, echo target base/table and normalized payload summary.
- On API errors, return status code + Airtable error type/message.

## Notes

- If Airtable returns `PUBLIC_API_BILLING_LIMIT_EXCEEDED`, stop writes/reads and report quota blocker.
- Prefer deterministic field mapping over free-form payloads.
