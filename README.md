# Jarvis Runtime (OpenClaw)

Local runtime workspace for Jarvis running on top of OpenClaw.

This repository is intended as a clean, versioned runtime shell:
- runtime structure and conventions
- safe-to-share workspace files
- docs and operational notes

Sensitive runtime state is intentionally ignored (`.gitignore`), including:
- API keys and tokens
- device identity and pairing files
- logs, media, and transient session data
- personal workspace/session content

## Privacy Mode

This repository is configured as `PRIVATE` on GitHub.

To reduce accidental leaks, the current `.gitignore` defaults to treating runtime
directories as local-only (`workspace/`, `skills/`, `extensions/`, `plugins/`,
`cron/`, `agents/`, etc.).

If you want to version a specific runtime file later, remove or narrow the
matching ignore rule first and commit intentionally.

## Repository Purpose

Use this repo to keep runtime setup reproducible and maintainable while the OpenClaw engine evolves separately.

## Typical Layout

- `workspace/` - identity, behavior, and operating context files
- `skills/` - local skills and helpers
- `extensions/` - optional runtime extensions
- `cron/` - scheduled-job definitions (safe configs only)
- `plugins/` - plugin metadata/config stubs

## Getting Started

1. Clone this repository.
2. Add your local secrets and runtime config files (not committed):
   - `openclaw.json`
   - `credentials/*`
   - `identity/*`
3. Start OpenClaw runtime from this folder.

## Git Workflow

- Keep `main` deployable and clean.
- Commit docs, structure, and non-sensitive runtime config templates.
- Never commit secrets or local session artifacts.

## Notes

If you need to share config, use redacted templates (for example `*.example.json`) instead of live runtime files.
