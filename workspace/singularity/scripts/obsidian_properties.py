#!/usr/bin/env python3
"""Rule-based properties generator for Obsidian inbox (+/).
No LLM required.
"""
from __future__ import annotations
from pathlib import Path
from datetime import datetime
import re

INBOX = Path('/Users/_xvadur/Desktop/xvadur_obsidian_januar/+')


def classify(text: str) -> tuple[str, list[str], int]:
    t = text.lower()
    tags: list[str] = []  # intentionally minimal; user will tag manually
    doc_type = 'note'
    xp = 10

    if any(k in t for k in ['meeting', 'call', 'stretnutie']):
        doc_type = 'meeting'
        xp = 20
    if any(k in t for k in ['idea', 'napad', 'vizia']):
        doc_type = 'idea'
        xp = max(xp, 15)

    return doc_type, tags, xp


def has_frontmatter(text: str) -> bool:
    return text.startswith('---\n')


def make_title(text: str) -> str:
    first = next((ln.strip() for ln in text.splitlines() if ln.strip()), 'Untitled')
    first = re.sub(r'^#+\s*', '', first)
    return first[:80]


def process_file(path: Path) -> bool:
    raw = path.read_text(encoding='utf-8')
    if has_frontmatter(raw):
        return False

    body = raw.strip()
    title = make_title(body)
    doc_type, tags, xp = classify(body)
    now = datetime.now().strftime('%Y-%m-%d %H:%M')
    wc = len(re.findall(r"\w+", body))

    yaml = [
        '---',
        f'title: "{title.replace("\"", "")}"',
        f'created: {now}',
        f'date: {datetime.now().strftime("%Y-%m-%d")}',
        f'type: {doc_type}',
        'status: inbox',
        'project: XVADUR',
        'area: [ops]',
        'priority: P2',
        'owner: Adam',
        'assignee: Adam',
        f'tags: [{", ".join(tags)}]' if tags else 'tags: []',
        f'word_count: {wc}',
        f'xp: {xp}',
        'energy: medium',
        'source: obsidian',
        'summary: ""',
        '---',
        '',
    ]
    path.write_text('\n'.join(yaml) + body + '\n', encoding='utf-8')
    return True


def main():
    INBOX.mkdir(parents=True, exist_ok=True)
    updated = 0
    for p in sorted(INBOX.glob('*.md')):
        try:
            if process_file(p):
                updated += 1
        except Exception as e:
            print(f'⚠️ {p.name}: {e}')
    print(f'✅ properties pass complete | updated: {updated}')


if __name__ == '__main__':
    main()
