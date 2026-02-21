---
name: youtube-transcript
description: Extract and process YouTube video transcripts from a URL. Use when the user shares a YouTube link and asks for transcript, summary, notes, key points, action items, or structured analysis of video content.
---

# YouTube Transcript

Extract transcript from a YouTube URL, then transform it to what the user needs (summary, notes, tasks, timestamps, etc.).

## Run

Use the bundled script:

```bash
python3 scripts/youtube_transcript.py "<youtube-url>" --lang sk,en --out /tmp/transcript.md
```

If `--out` is omitted, script prints markdown to stdout.

## Output contract

Script returns markdown with:
- video URL
- detected language/source
- plain transcript text (cleaned)

Then post-process per user intent:
- **summary**: 5-10 bullets
- **action items**: checklist
- **knowledge notes**: sections + key quotes
- **task extraction**: convert to concrete todos

## If transcript retrieval fails

Try fallback in this order:
1. `youtube_transcript_api`
2. `yt-dlp` auto subtitles

If both fail, report why (captions disabled/region/private) and ask for another link or uploaded audio.