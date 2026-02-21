#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <audio-file>" >&2
  exit 2
fi

AUDIO_PATH="$1"
MODEL="${WHISPER_MODEL:-base}"

if [[ ! -f "$AUDIO_PATH" ]]; then
  echo "Audio file not found: $AUDIO_PATH" >&2
  exit 4
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

/opt/homebrew/bin/whisper \
  --model "$MODEL" \
  --output_format txt \
  --output_dir "$TMP_DIR" \
  --fp16 False \
  "$AUDIO_PATH" >/dev/null 2>&1

BASENAME="$(basename "$AUDIO_PATH")"
STEM="${BASENAME%.*}"
OUT="$TMP_DIR/$STEM.txt"

if [[ ! -f "$OUT" ]]; then
  echo "Whisper did not produce transcript file" >&2
  exit 5
fi

cat "$OUT"
