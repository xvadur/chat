#!/usr/bin/env python3
import json, sqlite3, subprocess, sys
from email.utils import parseaddr
from pathlib import Path
from datetime import datetime, timezone

DB = Path('/Users/_xvadur/.openclaw/workspace/crm/pcrm.sqlite')
ACCOUNT = 'adam@xvadur.com'
QUERY = 'in:inbox -in:trash newer_than:30d'
MAX = '200'


def run(cmd):
    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError((p.stderr or p.stdout).strip())
    return p.stdout


def is_noise(sender_email: str, rules):
    s = sender_email.lower()
    return any(r in s for r in rules)


def parse_sender(frm):
    name, addr = parseaddr(frm or '')
    return (name or '').strip(), (addr or '').strip().lower()


def main():
    conn = sqlite3.connect(DB)
    cur = conn.cursor()
    rules = [r[0].lower() for r in cur.execute("SELECT pattern FROM noise_rules WHERE active=1").fetchall()]

    raw = run(['gog','gmail','messages','search',QUERY,'--account',ACCOUNT,'--max',MAX,'--json'])
    data = json.loads(raw)
    msgs = data.get('messages', [])

    processed = 0
    noisy = 0
    inserted_contacts = 0

    for m in msgs:
        frm = m.get('from','')
        name, email = parse_sender(frm)
        if not email:
            continue
        if is_noise(email, rules):
            noisy += 1
            continue

        date = m.get('date')
        subj = m.get('subject','')
        mid = m.get('id','')

        cur.execute('SELECT id FROM contacts WHERE email=?', (email,))
        row = cur.fetchone()
        if row:
            cid = row[0]
            cur.execute('UPDATE contacts SET last_seen=?, name=COALESCE(NULLIF(name,\'\'),?) WHERE id=?', (date, name or None, cid))
        else:
            cur.execute('INSERT INTO contacts(email,name,source,first_seen,last_seen) VALUES(?,?,?,?,?)',
                        (email, name or None, 'gmail', date, date))
            cid = cur.lastrowid
            inserted_contacts += 1

        cur.execute('INSERT INTO interactions(contact_id,channel,direction,subject,snippet,at,source_ref) VALUES(?,?,?,?,?,?,?)',
                    (cid, 'gmail', 'inbound', subj, subj[:220], date, mid))
        processed += 1

    cur.execute('INSERT OR REPLACE INTO state(key,value) VALUES(?,?)',
                ('last_gmail_triage_at', datetime.now(timezone.utc).isoformat()))
    conn.commit()

    total_contacts = cur.execute('SELECT COUNT(*) FROM contacts').fetchone()[0]
    print(json.dumps({
        'account': ACCOUNT,
        'messages_total': len(msgs),
        'processed_non_noise': processed,
        'skipped_noise': noisy,
        'new_contacts': inserted_contacts,
        'contacts_total': total_contacts
    }, ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        print(f'ERROR: {e}', file=sys.stderr)
        sys.exit(1)
