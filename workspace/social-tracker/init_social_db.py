#!/usr/bin/env python3
import sqlite3
from pathlib import Path

DB = Path('/Users/_xvadur/.openclaw/workspace/social-tracker/social_metrics.sqlite')
DB.parent.mkdir(parents=True, exist_ok=True)

conn = sqlite3.connect(DB)
cur = conn.cursor()
cur.executescript('''
PRAGMA journal_mode=WAL;

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY,
  platform TEXT NOT NULL,               -- x|youtube|instagram|tiktok
  title TEXT,
  topic TEXT,
  pastor_problem TEXT,
  pastor_amplify TEXT,
  pastor_story TEXT,
  pastor_testimony TEXT,
  pastor_offer TEXT,
  pastor_response TEXT,
  status TEXT DEFAULT 'draft',          -- idea|draft|ready|posted
  publish_at TEXT,
  published_url TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS daily_snapshots (
  id INTEGER PRIMARY KEY,
  snapshot_date TEXT NOT NULL,          -- YYYY-MM-DD
  platform TEXT NOT NULL,
  followers INTEGER,
  views INTEGER,
  impressions INTEGER,
  likes INTEGER,
  comments INTEGER,
  shares INTEGER,
  saves INTEGER,
  watch_time_minutes REAL,
  posts_published INTEGER,
  notes TEXT,
  UNIQUE(snapshot_date, platform)
);

CREATE TABLE IF NOT EXISTS post_metrics (
  id INTEGER PRIMARY KEY,
  post_id INTEGER NOT NULL,
  snapshot_date TEXT NOT NULL,
  views INTEGER,
  impressions INTEGER,
  likes INTEGER,
  comments INTEGER,
  shares INTEGER,
  saves INTEGER,
  watch_time_minutes REAL,
  followers_gained INTEGER,
  FOREIGN KEY(post_id) REFERENCES posts(id),
  UNIQUE(post_id, snapshot_date)
);

CREATE TABLE IF NOT EXISTS morning_brief_cache (
  id INTEGER PRIMARY KEY,
  brief_date TEXT NOT NULL,
  section TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
''')
conn.commit()
conn.close()
print(f'DB ready: {DB}')
