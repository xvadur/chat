#!/usr/bin/env python3
import argparse
import sqlite3
from pathlib import Path

DB = Path('/Users/_xvadur/.openclaw/workspace/systems/social-tracker/social_metrics.sqlite')

p = argparse.ArgumentParser(description='Log manual daily snapshot for social platform')
p.add_argument('--date', required=True, help='YYYY-MM-DD')
p.add_argument('--platform', required=True, choices=['x','youtube','instagram','tiktok'])
p.add_argument('--followers', type=int)
p.add_argument('--views', type=int)
p.add_argument('--impressions', type=int)
p.add_argument('--likes', type=int)
p.add_argument('--comments', type=int)
p.add_argument('--shares', type=int)
p.add_argument('--saves', type=int)
p.add_argument('--watch-time-min', type=float, dest='watch_time_minutes')
p.add_argument('--posts-published', type=int, dest='posts_published')
p.add_argument('--notes', default='')
args = p.parse_args()

conn = sqlite3.connect(DB)
cur = conn.cursor()
cur.execute('''
INSERT INTO daily_snapshots(
  snapshot_date, platform, followers, views, impressions, likes, comments, shares, saves,
  watch_time_minutes, posts_published, notes
) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
ON CONFLICT(snapshot_date, platform) DO UPDATE SET
  followers=excluded.followers,
  views=excluded.views,
  impressions=excluded.impressions,
  likes=excluded.likes,
  comments=excluded.comments,
  shares=excluded.shares,
  saves=excluded.saves,
  watch_time_minutes=excluded.watch_time_minutes,
  posts_published=excluded.posts_published,
  notes=excluded.notes
''', (
  args.date, args.platform, args.followers, args.views, args.impressions, args.likes,
  args.comments, args.shares, args.saves, args.watch_time_minutes, args.posts_published, args.notes
))
conn.commit()
conn.close()
print('snapshot upserted')
