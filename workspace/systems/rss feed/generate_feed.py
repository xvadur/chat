#!/usr/bin/env python3
import json
import html
from pathlib import Path
from datetime import datetime
from email.utils import format_datetime

ROOT = Path('/Users/_xvadur/.openclaw/workspace/social-tracker')
ITEMS = ROOT / 'rss_items.json'
OUT = ROOT / 'feed.xml'
SITE = 'https://xvadur.com'
FEED = f'{SITE}/feed.xml'
TITLE = 'XVADUR Feed'
DESC = 'Denný curated monitoring: politika, tech, financie, AI, Slovensko.'
LANG = 'sk'


def to_rfc2822(dt_str: str) -> str:
    dt = datetime.fromisoformat(dt_str)
    return format_datetime(dt)


def main():
    data = json.loads(ITEMS.read_text(encoding='utf-8'))
    approved = [x for x in data if x.get('approved') is True or x.get('status') == 'approved']

    approved.sort(key=lambda x: x.get('published_at', ''), reverse=True)

    now = format_datetime(datetime.now().astimezone())
    items_xml = []
    for i in approved:
        title = html.escape(i.get('title', ''))
        link = html.escape(i.get('link', SITE))
        guid = html.escape(i.get('id', link))
        pub = to_rfc2822(i.get('published_at')) if i.get('published_at') else now
        topic = html.escape(i.get('topic', ''))
        summary = html.escape(i.get('summary_sk', ''))
        source = html.escape(i.get('source', ''))
        desc = f"[{topic}] {summary} (zdroj: {source})"
        items_xml.append(
            f"""
    <item>
      <title>{title}</title>
      <link>{link}</link>
      <guid isPermaLink=\"false\">{guid}</guid>
      <pubDate>{pub}</pubDate>
      <description>{desc}</description>
    </item>"""
        )

    xml = f"""<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<rss version=\"2.0\">
  <channel>
    <title>{html.escape(TITLE)}</title>
    <link>{html.escape(SITE)}</link>
    <description>{html.escape(DESC)}</description>
    <language>{LANG}</language>
    <lastBuildDate>{now}</lastBuildDate>
    <atom:link href=\"{html.escape(FEED)}\" rel=\"self\" type=\"application/rss+xml\" xmlns:atom=\"http://www.w3.org/2005/Atom\" />
{''.join(items_xml)}
  </channel>
</rss>
"""

    OUT.write_text(xml, encoding='utf-8')
    print(f'feed generated: {OUT} | approved_items={len(approved)}')


if __name__ == '__main__':
    main()
