#!/usr/bin/env python3
import argparse
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path
from urllib.parse import parse_qs, urlparse


def extract_video_id(url: str) -> str | None:
    p = urlparse(url)
    if p.netloc in {"youtu.be"}:
        return p.path.strip("/") or None
    if "youtube.com" in p.netloc:
        if p.path == "/watch":
            return parse_qs(p.query).get("v", [None])[0]
        if p.path.startswith("/shorts/"):
            return p.path.split("/shorts/")[-1].split("/")[0]
        if p.path.startswith("/embed/"):
            return p.path.split("/embed/")[-1].split("/")[0]
    return None


def from_api(video_id: str, langs: list[str]) -> tuple[str, str] | None:
    try:
        from youtube_transcript_api import YouTubeTranscriptApi  # type: ignore
    except Exception:
        return None

    try:
        data = YouTubeTranscriptApi.get_transcript(video_id, languages=langs)
        text = "\n".join(x.get("text", "").strip() for x in data if x.get("text"))
        if text.strip():
            return text, "youtube_transcript_api"
    except Exception:
        return None
    return None


def clean_vtt(text: str) -> str:
    # remove WEBVTT header/timestamps/style lines
    out = []
    for line in text.splitlines():
        s = line.strip()
        if not s:
            continue
        if s.startswith("WEBVTT"):
            continue
        if re.match(r"^\d{2}:\d{2}:\d{2}\.\d{3}\s+-->\s+\d{2}:\d{2}:\d{2}\.\d{3}", s):
            continue
        if re.match(r"^\d{2}:\d{2}\.\d{3}\s+-->\s+\d{2}:\d{2}\.\d{3}", s):
            continue
        if s.startswith("NOTE") or s.startswith("STYLE"):
            continue
        # remove speaker tags and duplicate spaces
        s = re.sub(r"<[^>]+>", "", s)
        s = re.sub(r"\s+", " ", s).strip()
        if s:
            out.append(s)
    return "\n".join(out)


def from_ytdlp(url: str, langs: list[str]) -> tuple[str, str] | None:
    with tempfile.TemporaryDirectory() as td:
        outtmpl = str(Path(td) / "cap")
        lang_expr = ",".join(langs) if langs else "en,sk"
        cmd = [
            "yt-dlp",
            "--skip-download",
            "--write-auto-subs",
            "--write-subs",
            "--sub-langs",
            lang_expr,
            "--sub-format",
            "vtt",
            "-o",
            outtmpl,
            url,
        ]
        # yt-dlp may return non-zero when one subtitle language fails (e.g. 429),
        # while still downloading another language successfully. Do not hard-fail.
        subprocess.run(cmd, check=False, capture_output=True, text=True)

        files = sorted(Path(td).glob("cap*.vtt"))
        if not files:
            return None

        # pick first subtitle file
        raw = files[0].read_text(encoding="utf-8", errors="ignore")
        cleaned = clean_vtt(raw)
        if cleaned.strip():
            return cleaned, f"yt-dlp:{files[0].name}"
    return None


def to_markdown(url: str, video_id: str, source: str, transcript: str) -> str:
    return (
        f"# YouTube Transcript\n\n"
        f"- URL: {url}\n"
        f"- Video ID: {video_id}\n"
        f"- Source: {source}\n\n"
        f"## Transcript\n\n{transcript.strip()}\n"
    )


def main():
    ap = argparse.ArgumentParser(description="Extract transcript from YouTube URL")
    ap.add_argument("url")
    ap.add_argument("--lang", default="en,sk", help="Comma-separated preferred languages, e.g. sk,en")
    ap.add_argument("--out", help="Output markdown file path")
    args = ap.parse_args()

    url = args.url.strip()
    vid = extract_video_id(url)
    if not vid:
        print("ERROR: Could not parse YouTube video ID from URL", file=sys.stderr)
        sys.exit(2)

    langs = [x.strip() for x in args.lang.split(",") if x.strip()]

    result = from_api(vid, langs)
    if not result:
        result = from_ytdlp(url, langs)

    if not result:
        print(
            "ERROR: Transcript not available (captions disabled/private/region-blocked) or missing dependencies (youtube_transcript_api, yt-dlp).",
            file=sys.stderr,
        )
        sys.exit(1)

    transcript, source = result
    md = to_markdown(url, vid, source, transcript)

    if args.out:
        out = Path(args.out)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(md, encoding="utf-8")
        print(str(out))
    else:
        print(md)


if __name__ == "__main__":
    main()
