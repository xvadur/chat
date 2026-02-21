#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <audio-file>" >&2
  exit 2
fi

AUDIO_PATH="$1"
API_KEY="${ELEVENLABS_API_KEY:-}"
MODEL_ID="${ELEVENLABS_STT_MODEL_ID:-scribe_v1}"

if [[ -z "$API_KEY" ]]; then
  echo "ELEVENLABS_API_KEY is not set" >&2
  exit 3
fi

if [[ ! -f "$AUDIO_PATH" ]]; then
  echo "Audio file not found: $AUDIO_PATH" >&2
  exit 4
fi

resp=$(curl -sS --fail-with-body \
  -X POST "https://api.elevenlabs.io/v1/speech-to-text" \
  -H "xi-api-key: $API_KEY" \
  -F "model_id=$MODEL_ID" \
  -F "file=@$AUDIO_PATH")

text=$(printf '%s' "$resp" | jq -r '.text // empty')
if [[ -z "$text" ]]; then
  printf '%s\n' "$resp" >&2
  echo "No transcript text returned" >&2
  exit 5
fi

printf '%s\n' "$text"
