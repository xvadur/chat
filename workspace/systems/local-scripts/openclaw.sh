#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
REPO_ROOT="$(cd "$WORKSPACE_DIR/.." && pwd)"

if command -v openclaw >/dev/null 2>&1; then
  exec openclaw "$@"
fi

if command -v pnpm >/dev/null 2>&1; then
  if [ -f "$REPO_ROOT/package.json" ]; then
    exec pnpm --dir "$REPO_ROOT" openclaw "$@"
  fi

  if [ -f "$HOME/.openclaw/package.json" ]; then
    exec pnpm --dir "$HOME/.openclaw" openclaw "$@"
  fi
fi

cat >&2 <<'ERR'
openclaw command not found.

Fix options:
1) Install OpenClaw CLI globally so `openclaw` is on PATH.
2) Or run from your runtime repo with `pnpm openclaw ...`.
3) For agents/scripts in this workspace, call:
   workspace/systems/local-scripts/openclaw.sh <args>
ERR

exit 127
