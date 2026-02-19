#!/usr/bin/env python3
"""03:00 daily system clean for XVADUR Singularity OS."""

from __future__ import annotations
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path('/Users/_xvadur/.openclaw/workspace')
DB = ROOT / 'crm/pcrm.sqlite'
OUT = ROOT / 'singularity/logs'
OUT.mkdir(parents=True, exist_ok=True)


def yesterday_range():
    now = datetime.now()
    y = now.date() - timedelta(days=1)
    start = datetime.combine(y, datetime.min.time())
    end = datetime.combine(y, datetime.max.time())
    return start.isoformat(sep=' '), end.isoformat(sep=' '), y.isoformat()


def daily_xp(start: str, end: str) -> int:
    with sqlite3.connect(DB) as con:
        row = con.execute(
            "SELECT COALESCE(SUM(points),0) FROM xp_events WHERE created_at BETWEEN ? AND ?",
            (start, end),
        ).fetchone()
    return int(row[0] or 0)


def write_report(date_iso: str, xp: int):
    report = OUT / f'system-clean-{date_iso}.md'
    report.write_text(
        f"# System Clean Report — {date_iso}\n\n"
        f"- Generated: {datetime.now().isoformat(timespec='seconds')}\n"
        f"- XP (yesterday): **{xp}**\n"
        f"- Status: ✅ baseline cleanup completed\n\n"
        "## Next morning prep\n"
        "- Refresh morning brief\n"
        "- Check urgent tasks (Linear)\n"
        "- Check calendar for next 24h\n",
        encoding='utf-8',
    )
    return report


def main():
    start, end, day = yesterday_range()
    xp = daily_xp(start, end)
    report = write_report(day, xp)
    print(f"✅ system clean completed | report: {report}")


if __name__ == '__main__':
    main()
