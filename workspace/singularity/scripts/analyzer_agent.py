#!/usr/bin/env python3
"""Analyzer agent (rule-based): proposes title/type/summary/entities."""
from __future__ import annotations
import json
import re
import sys
from pathlib import Path


def extract_entities(text: str) -> list[str]:
    entities = []
    for name in ["Adam", "Šimon", "Simon", "David", "Miloš", "Milos", "Laura", "Karol", "AIstriko", "XVADUR"]:
        if name.lower() in text.lower():
            entities.append(name)
    return sorted(set(entities))


def classify(text: str) -> str:
    t = text.lower()
    if any(k in t for k in ["meeting", "call", "stretnutie"]):
        return "meeting"
    if any(k in t for k in ["task", "todo", "urobit", "/linear"]):
        return "task"
    if any(k in t for k in ["idea", "vizia", "napad", "singularity"]):
        return "idea"
    if any(k in t for k in ["brief", "report", "summary"]):
        return "report"
    return "note"


def propose_title(text: str) -> str:
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        line = re.sub(r"^#+\s*", "", line)
        if len(line) > 8:
            return line[:90]
    return "Untitled Note"


def main():
    if len(sys.argv) < 2:
        raise SystemExit("Usage: analyzer_agent.py <file.md>")

    path = Path(sys.argv[1])
    text = path.read_text(encoding="utf-8")

    words = len(re.findall(r"\w+", text))
    dtype = classify(text)
    title = propose_title(text)
    entities = extract_entities(text)
    summary = " ".join(text.strip().split())[:220]

    out = {
        "title": title,
        "type": dtype,
        "entities": entities,
        "word_count": words,
        "summary": summary,
    }
    print(json.dumps(out, ensure_ascii=False))


if __name__ == "__main__":
    main()
