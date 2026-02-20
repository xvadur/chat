#!/usr/bin/env python3
"""Sync latest Notion Daily Log row into an Obsidian markdown note with YAML properties."""
from __future__ import annotations
import json
import urllib.request
from datetime import datetime
from pathlib import Path

API = "https://api.notion.com/v1"
NOTION_VER = "2025-09-03"
MAP_PATH = Path('/Users/_xvadur/.openclaw/workspace/singularity/config/notion_obsidian_property_map.json')
OUT_DIR = Path('/Users/_xvadur/Desktop/xvadur_obsidian_januar/Jarvis/Daily Logs')
KEY_PATH = Path.home()/'.config/notion/api_key'


def notion_request(method: str, url: str, key: str, body: dict | None = None) -> dict:
    data = json.dumps(body).encode('utf-8') if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header('Authorization', f'Bearer {key}')
    req.add_header('Notion-Version', NOTION_VER)
    req.add_header('Content-Type', 'application/json')
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode('utf-8'))


def read_prop(p: dict):
    t = p.get('type')
    if t == 'title':
        return ''.join(x.get('plain_text','') for x in p.get('title', []))
    if t == 'rich_text':
        return ''.join(x.get('plain_text','') for x in p.get('rich_text', []))
    if t == 'date':
        d = p.get('date')
        return d.get('start') if d else ''
    if t == 'multi_select':
        return [x.get('name','') for x in p.get('multi_select', []) if x.get('name')]
    if t == 'created_time':
        return p.get('created_time','')
    return ''


def main():
    key = KEY_PATH.read_text(encoding='utf-8').strip()
    cfg = json.loads(MAP_PATH.read_text(encoding='utf-8'))
    dsid = cfg['data_source_id']

    res = notion_request('POST', f'{API}/data_sources/{dsid}/query', key, {
        'page_size': 1,
        'sorts': [{'property': 'Začiatok dňa', 'direction': 'descending'}]
    })

    if not res.get('results'):
        raise SystemExit('No rows in Notion Daily Log')

    row = res['results'][0]
    props = row.get('properties', {})
    mapped = dict(cfg.get('defaults', {}))

    for notion_key, obs_key in cfg['notion_to_obsidian'].items():
        if notion_key in props:
            mapped[obs_key] = read_prop(props[notion_key])

    now = datetime.now().strftime('%Y-%m-%d %H:%M')
    date = mapped.get('date') or datetime.now().strftime('%Y-%m-%d')
    mapped.setdefault('created', now)
    if not str(mapped.get('title','')).strip():
        mapped['title'] = f'Daily Log {date}'

    tags = mapped.get('tags', [])
    if not isinstance(tags, list):
        tags = []

    fm = [
        '---',
        f'title: "{str(mapped.get("title","")).replace("\"", "")}"',
        f'created: {mapped.get("created", now)}',
        f'date: {date}',
        f'type: {mapped.get("type","daily")}',
        f'status: {mapped.get("status","active")}',
        f'project: {mapped.get("project","XVADUR")}',
        f'owner: {mapped.get("owner","Adam")}',
        f'assignee: {mapped.get("assignee","Adam")}',
        f'tags: [{", ".join(tags)}]' if tags else 'tags: []',
        f'wake_time: {mapped.get("wake_time","")}',
        f'sleep_time: {mapped.get("sleep_time","")}',
        f'food: "{str(mapped.get("food","")).replace("\"", "")}"',
        f'todo: "{str(mapped.get("todo","")).replace("\"", "")}"',
        f'wins: "{str(mapped.get("wins","")).replace("\"", "")}"',
        f'loss: "{str(mapped.get("loss","")).replace("\"", "")}"',
        f'places: "{str(mapped.get("places","")).replace("\"", "")}"',
        f'expense: "{str(mapped.get("expense","")).replace("\"", "")}"',
        f'day_log: "{str(mapped.get("day_log","")).replace("\"", "")}"',
        f'conflict_notes: "{str(mapped.get("conflict_notes","")).replace("\"", "")}"',
        f'energy: {mapped.get("energy","medium")}',
        f'source: {mapped.get("source","notion")}',
        '---',
        '',
        f'# {mapped.get("title", f"Daily Log {date}")}',
        '',
        '## Daily Log',
        str(mapped.get('day_log','')),
        '',
        '## TODO',
        str(mapped.get('todo','')),
        '',
        '## Food',
        str(mapped.get('food','')),
        '',
        '## Wins',
        str(mapped.get('wins','')),
        '',
        '## Loss',
        str(mapped.get('loss','')),
        ''
    ]

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / f"{date}_Notion_Sync.md"
    out.write_text('\n'.join(fm), encoding='utf-8')
    print(f'✅ notion daily synced -> {out}')


if __name__ == '__main__':
    main()
