#!/usr/bin/env python3
"""XVADUR Singularity runtime (local command processor).

Usage examples:
  python3 runtime.py "/sleep out 07:45"
  python3 runtime.py "/jedlo kuracie prsia s ryzou"
  python3 runtime.py "/cvicenie bench 45"
  python3 runtime.py "/calendar today"
  python3 runtime.py "/git status"
  python3 runtime.py "/linear list"
"""

from __future__ import annotations
import json
import os
import sqlite3
import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path

DB = "/Users/_xvadur/.openclaw/workspace/crm/pcrm.sqlite"
GIT_REPO_CANDIDATES = ["/Users/_xvadur/XVADUR-OS", "/Users/_xvadur/.openclaw"]
OBSIDIAN_INBOX = Path("/Users/_xvadur/Desktop/xvadur_obsidian_januar/+")
ANALYZER = "/Users/_xvadur/.openclaw/workspace/singularity/scripts/analyzer_agent.py"
TAXONOMIST = "/Users/_xvadur/.openclaw/workspace/singularity/scripts/taxonomist_agent.py"

XP_RULES = {
    "sleep": 5,
    "laura": 5,
    "jedlo": 5,
    "cvicenie": 20,
    "udrzba": 15,
    "karol": 10,
    "log": 10,
}


def db():
    return sqlite3.connect(DB)


def run_cmd(command: list[str], cwd: str | None = None) -> tuple[int, str, str]:
    proc = subprocess.run(command, cwd=cwd, capture_output=True, text=True)
    return proc.returncode, proc.stdout.strip(), proc.stderr.strip()


def has_frontmatter(text: str) -> bool:
    return text.startswith("---\n")


def add_xp(source: str, note: str, points: int):
    with db() as con:
        con.execute(
            "INSERT INTO xp_events(source, points, note) VALUES (?, ?, ?)",
            (source, points, note),
        )


def log_command(command: str, payload: str):
    with db() as con:
        con.execute(
            "INSERT INTO command_log(command, payload) VALUES (?, ?)",
            (command, payload),
        )


def handle_sleep(tokens: list[str]):
    evt = tokens[1] if len(tokens) > 1 else ""
    if evt not in {"in", "out"}:
        raise ValueError("Use: /sleep in|out HH:MM")
    t = tokens[2] if len(tokens) > 2 else datetime.now().strftime("%H:%M")
    event_type = f"sleep_{evt}"
    with db() as con:
        con.execute(
            "INSERT INTO sleep_log(event_type, event_time, note) VALUES (?, ?, ?)",
            (event_type, t, "manual entry"),
        )
    add_xp("sleep", f"{event_type} {t}", XP_RULES["sleep"])
    return f"✅ sleep logged: {event_type} @ {t}"


def handle_laura(tokens: list[str]):
    evt = tokens[1] if len(tokens) > 1 else ""
    if evt not in {"in", "out"}:
        raise ValueError("Use: /laura in|out HH:MM")
    t = tokens[2] if len(tokens) > 2 else datetime.now().strftime("%H:%M")
    event_type = f"laura_{evt}"
    with db() as con:
        con.execute(
            "INSERT INTO laura_schedule(event_type, event_time, note) VALUES (?, ?, ?)",
            (event_type, t, "manual entry"),
        )
    add_xp("laura", f"{event_type} {t}", XP_RULES["laura"])
    return f"✅ laura event logged: {event_type} @ {t}"


def handle_jedlo(tokens: list[str]):
    meal = " ".join(tokens[1:]).strip()
    if not meal:
        raise ValueError("Use: /jedlo <text>")
    with db() as con:
        con.execute(
            "INSERT INTO meals(meal_text, meal_time) VALUES (?, ?)",
            (meal, datetime.now().strftime("%H:%M")),
        )
    add_xp("jedlo", meal, XP_RULES["jedlo"])
    return f"✅ meal logged: {meal}"


def handle_cvicenie(tokens: list[str]):
    if len(tokens) < 2:
        raise ValueError("Use: /cvicenie <activity> [duration_min]")
    activity = tokens[1]
    duration = int(tokens[2]) if len(tokens) > 2 and tokens[2].isdigit() else None
    with db() as con:
        con.execute(
            "INSERT INTO exercise_sessions(activity, duration_minutes, note) VALUES (?, ?, ?)",
            (activity, duration, "manual entry"),
        )
    add_xp("cvicenie", f"{activity} {duration or ''}".strip(), XP_RULES["cvicenie"])
    return f"✅ exercise logged: {activity} ({duration or '?'} min)"


def handle_udrzba(tokens: list[str]):
    text = " ".join(tokens[1:]).strip()
    if not text:
        raise ValueError("Use: /udrzba <text>")
    with db() as con:
        con.execute(
            "INSERT INTO maintenance_log(area, action, note) VALUES (?, ?, ?)",
            (None, text, "manual entry"),
        )
    add_xp("udrzba", text, XP_RULES["udrzba"])
    return f"✅ maintenance logged: {text}"


def handle_karol(tokens: list[str]):
    text = " ".join(tokens[1:]).strip()
    if not text:
        raise ValueError("Use: /karol <text>")
    with db() as con:
        con.execute("INSERT INTO karol_events(event_text) VALUES (?)", (text,))
    add_xp("karol", text, XP_RULES["karol"])
    return f"✅ karol event logged: {text}"


def handle_log(tokens: list[str]):
    text = " ".join(tokens[1:]).strip()
    if not text:
        raise ValueError("Use: /log <text>")
    add_xp("log", text, XP_RULES["log"])
    return f"✅ log recorded (+{XP_RULES['log']} XP)"


def handle_git(tokens: list[str]):
    args = tokens[1:] or ["status", "--short", "--branch"]

    last_err = ""
    for repo in GIT_REPO_CANDIDATES:
        code, out, err = run_cmd(["git", *args], cwd=repo)
        if code == 0:
            return f"✅ git ({repo}) {' '.join(args)}\n{out or '(no output)'}"
        last_err = err or out

    return f"❌ git error: {last_err}"


def handle_calendar(tokens: list[str]):
    if len(tokens) == 1 or tokens[1] in {"today", "list"}:
        start = datetime.now().strftime("%Y-%m-%dT00:00:00")
        end = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%dT00:00:00")
        cmd = [
            "gog",
            "calendar",
            "events",
            "adam@xvadur.com",
            "--from",
            start,
            "--to",
            end,
            "--account",
            "adam@xvadur.com",
        ]
    else:
        cmd = ["gog", "calendar", *tokens[1:], "--account", "adam@xvadur.com"]

    code, out, err = run_cmd(cmd)
    if code != 0:
        return f"❌ calendar error: {err or out}"
    return f"✅ calendar\n{out or '(no events)'}"


def handle_linear(tokens: list[str]):
    api_key = os.getenv("LINEAR_API_KEY")
    if not api_key:
        return "❌ LINEAR_API_KEY is not set. Export it first."

    action = tokens[1] if len(tokens) > 1 else "list"

    if action == "list":
        query = "{ issues(filter: { state: { type: { neq: \"completed\" } } }, first: 10) { nodes { identifier title priority state { name } } } }"
    elif action == "search" and len(tokens) > 2:
        term = " ".join(tokens[2:]).replace('"', "")
        query = f'{{ issues(filter: {{ title: {{ containsIgnoreCase: "{term}" }} }}, first: 10) {{ nodes {{ identifier title priority state {{ name }} }} }} }}'
    else:
        return "Use: /linear [list|search <text>]"

    payload = json.dumps({"query": query})
    code, out, err = run_cmd(
        [
            "curl",
            "-s",
            "https://api.linear.app/graphql",
            "-H",
            "Content-Type: application/json",
            "-H",
            f"Authorization: {api_key}",
            "-d",
            payload,
        ]
    )
    if code != 0:
        return f"❌ linear error: {err or out}"

    try:
        data = json.loads(out)
        nodes = data.get("data", {}).get("issues", {}).get("nodes", [])
        if not nodes:
            return "✅ linear: no matching issues"
        lines = ["✅ linear issues:"]
        for n in nodes:
            lines.append(f"- {n.get('identifier','?')} | P{n.get('priority','?')} | {n.get('state',{}).get('name','?')} | {n.get('title','')}")
        return "\n".join(lines)
    except Exception:
        return f"✅ linear raw:\n{out}"


def resolve_inbox_target(tokens: list[str]) -> Path:
    # /obsidian properties [optional file name]
    if len(tokens) > 2:
        # everything after "properties" is filename (allow spaces)
        name = " ".join(tokens[2:]).strip()
        if not name.endswith(".md"):
            name += ".md"
        p = OBSIDIAN_INBOX / name
        if p.exists():
            return p

    files = sorted(OBSIDIAN_INBOX.glob("*.md"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not files:
        raise FileNotFoundError("No markdown files in Obsidian +/ inbox")
    return files[0]


def handle_obsidian(tokens: list[str]):
    action = tokens[1] if len(tokens) > 1 else ""
    if action != "properties":
        return "Use: /obsidian properties [optional-file-name]"

    target = resolve_inbox_target(tokens)
    raw = target.read_text(encoding="utf-8")
    if has_frontmatter(raw):
        return f"ℹ️ {target.name} already has frontmatter"

    code1, out1, err1 = run_cmd(["python3", ANALYZER, str(target)])
    code2, out2, err2 = run_cmd(["python3", TAXONOMIST, str(target)])

    if code1 != 0:
        return f"❌ analyzer failed: {err1 or out1}"
    if code2 != 0:
        return f"❌ taxonomist failed: {err2 or out2}"

    try:
        a = json.loads(out1)
        t = json.loads(out2)
    except Exception as e:
        return f"❌ parse error: {e}"

    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    # keep tags intentionally small + stable
    allowed = {"idea", "meeting", "task", "aistriko", "xvadur", "ops", "finance", "health"}
    tags = [x for x in (t.get("tags") or []) if x in allowed]

    front = [
        "---",
        f'title: "{(a.get("title") or target.stem).replace(chr(34), "")}"',
        f"created: {now}",
        f"date: {datetime.now().strftime('%Y-%m-%d')}",
        f"type: {a.get('type','note')}",
        f"status: {t.get('status','inbox')}",
        f"project: {t.get('project','XVADUR')}",
        "area: [ops]",
        "priority: P2",
        "owner: Adam",
        "assignee: Adam",
        f"tags: [{', '.join(tags)}]" if tags else "tags: []",
        f"word_count: {t.get('word_count', a.get('word_count', 0))}",
        f"xp: {t.get('xp',10)}",
        "energy: medium",
        "source: obsidian",
        f"summary: \"{(a.get('summary','')[:180]).replace(chr(34), '')}\"",
        "---",
        "",
    ]

    target.write_text("\n".join(front) + raw.strip() + "\n", encoding="utf-8")
    add_xp("obsidian_properties", target.name, int(t.get("xp", 10)))

    return f"✅ /obsidian properties complete | file: {target.name} | type: {a.get('type','note')} | tags: {', '.join(tags) if tags else '-'}"


def _append_line(path: Path, line: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as f:
        f.write(line + "\n")


def _today_stats() -> tuple[int, int]:
    today = datetime.now().strftime("%Y-%m-%d")
    with db() as con:
        xp = con.execute(
            "SELECT COALESCE(SUM(points),0) FROM xp_events WHERE DATE(created_at)=?",
            (today,),
        ).fetchone()[0]
        cmds = con.execute(
            "SELECT COUNT(*) FROM command_log WHERE DATE(created_at)=?",
            (today,),
        ).fetchone()[0]
    return int(xp or 0), int(cmds or 0)


def _git_autocommit(repo: str, msg: str) -> str:
    c1, out1, err1 = run_cmd(["git", "status", "--porcelain"], cwd=repo)
    if c1 != 0:
        return f"{repo}: git unavailable ({err1 or out1})"
    if not out1.strip():
        return f"{repo}: clean"

    run_cmd(["git", "add", "-A"], cwd=repo)
    c2, out2, err2 = run_cmd(["git", "commit", "-m", msg], cwd=repo)
    if c2 != 0:
        return f"{repo}: commit skipped ({err2 or out2})"
    return f"{repo}: committed"


def handle_save(tokens: list[str]):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M")
    day = datetime.now().strftime("%Y-%m-%d")

    # 1) run fast properties pass
    code, out, err = run_cmd(["python3", "/Users/_xvadur/.openclaw/workspace/singularity/scripts/obsidian_properties.py"])
    prop_status = "ok" if code == 0 else f"error: {err or out}"

    # 2) append sync lines to local + obsidian daily logs
    local_log = Path(f"/Users/_xvadur/.openclaw/workspace/memory/log-{day}.md")
    obs_log = Path(f"/Users/_xvadur/Desktop/xvadur_obsidian_januar/Jarvis/Daily Logs/{day}.md")
    line = f"- {ts} | /save executed | properties: {prop_status}"
    _append_line(local_log, line)
    _append_line(obs_log, line)

    # 3) snapshot report
    xp, cmds = _today_stats()
    report = Path(f"/Users/_xvadur/.openclaw/workspace/singularity/logs/save-{day}.md")
    report.write_text(
        f"# Save Snapshot — {ts}\n\n"
        f"- XP today: **{xp}**\n"
        f"- Commands today: **{cmds}**\n"
        f"- Properties pass: **{prop_status}**\n"
        f"- Local log: `{local_log}`\n"
        f"- Obsidian log: `{obs_log}`\n",
        encoding="utf-8",
    )

    # 4) git autocommit
    msg = f"save: {day} {datetime.now().strftime('%H:%M')}"
    git_lines = []
    for repo in GIT_REPO_CANDIDATES:
        git_lines.append(_git_autocommit(repo, msg))

    return (
        "✅ /save complete\n"
        f"- report: {report}\n"
        f"- xp today: {xp}\n"
        f"- commands today: {cmds}\n"
        + "\n".join([f"- {g}" for g in git_lines])
    )


def main():
    raw = " ".join(sys.argv[1:]).strip()
    if not raw.startswith("/"):
        raise SystemExit("Provide slash command, e.g. /sleep out 07:30")
    tokens = raw.split()
    cmd = tokens[0][1:]
    log_command(cmd, raw)

    handlers = {
        "sleep": handle_sleep,
        "laura": handle_laura,
        "jedlo": handle_jedlo,
        "cvicenie": handle_cvicenie,
        "udrzba": handle_udrzba,
        "karol": handle_karol,
        "log": handle_log,
        "git": handle_git,
        "calendar": handle_calendar,
        "linear": handle_linear,
        "obsidian": handle_obsidian,
        "save": handle_save,
    }

    if cmd not in handlers:
        raise SystemExit(f"Unknown command: /{cmd}")

    print(handlers[cmd](tokens))


if __name__ == "__main__":
    main()
