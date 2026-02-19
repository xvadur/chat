# XVADUR Singularity Runtime

## Created components

- `config/schema_v3.sql` — SQLite schema (life + ops tables)
- `scripts/runtime.py` — slash command processor (v1)
- `scripts/obsidian_properties.py` — rule-based YAML properties generator for Obsidian `+/`
- `scripts/analyzer_agent.py` — Agent #1 (title/type/entity analyzer)
- `scripts/taxonomist_agent.py` — Agent #2 (tags/properties/xp proposer)
- `scripts/system_clean.py` — daily 03:00 cleanup report generator
- `logs/` — cron/job logs

## Active cron jobs (local crontab)

- `*/30 * * * *` dashboard generator (existing)
- `0 */6 * * *` Obsidian properties pass
- `0 3 * * *` System clean

## Quick usage

```bash
python3 singularity/scripts/runtime.py "/sleep out 07:30"
python3 singularity/scripts/runtime.py "/jedlo omeleta"
python3 singularity/scripts/runtime.py "/cvicenie bench 45"
python3 singularity/scripts/runtime.py "/linear list"
python3 singularity/scripts/runtime.py "/calendar today"
python3 singularity/scripts/runtime.py "/git status --short --branch"
python3 singularity/scripts/runtime.py "/obsidian properties tmp_singularity_test"
python3 singularity/scripts/obsidian_properties.py
python3 singularity/scripts/system_clean.py
```
