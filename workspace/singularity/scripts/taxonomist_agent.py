#!/usr/bin/env python3
"""Taxonomist agent (rule-based): proposes tags/properties/xp."""
from __future__ import annotations
import json
import re
import sys
from pathlib import Path


def tags_for(text: str) -> list[str]:
    t = text.lower()
    tags = []
    rules = {
        "aistriko": ["aistriko", "šimon", "simon", "david"],
        "xvadur": ["xvadur", "brand", "singularity"],
        "health": ["cvicenie", "jedlo", "sleep"],
        "finance": ["peniaze", "fin", "budget", "prijem", "vydavok"],
        "crm": ["crm", "kontakt", "lead"],
        "ops": ["calendar", "linear", "git", "task"],
    }
    for tag, kws in rules.items():
        if any(k in t for k in kws):
            tags.append(tag)
    if "meeting" in t or "stretnutie" in t or "call" in t:
        tags.append("meeting")
    if "idea" in t or "vizia" in t or "napad" in t:
        tags.append("idea")
    return sorted(set(tags))


def xp_for(text: str) -> int:
    t = text.lower()
    base = 10
    if any(k in t for k in ["strateg", "meeting", "call"]):
        base = 20
    if any(k in t for k in ["pivot", "partner", "deal"]):
        base = 30
    return base


def main():
    if len(sys.argv) < 2:
        raise SystemExit("Usage: taxonomist_agent.py <file.md>")

    path = Path(sys.argv[1])
    text = path.read_text(encoding="utf-8")

    out = {
        "tags": tags_for(text),
        "project": "XVADUR",
        "status": "inbox",
        "xp": xp_for(text),
        "word_count": len(re.findall(r"\w+", text)),
    }
    print(json.dumps(out, ensure_ascii=False))


if __name__ == "__main__":
    main()
