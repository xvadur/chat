# TOOLS.md - Local Notes & Skills Reference

Praktický cheat sheet pre Adam/xvadur setup.

## OpenClaw CLI fallback (anti `command not found`)

- Keď zlyhá `openclaw ...` s `command not found`, nepoužívaj holý príkaz znovu.
- Použi wrapper: `workspace/systems/local-scripts/openclaw.sh <args>`
  - napr. `workspace/systems/local-scripts/openclaw.sh update status`
- Wrapper skúsi v poradí:
  1) globálny `openclaw` (PATH)
  2) `pnpm --dir ~/.openclaw openclaw ...`
  3) vypíše presný návod na opravu

## 🎯 SKILLS QUICK REFERENCE (28 total)

**Kedy použiť ktorý skill:**

| Keď potrebuješ... | Použi skill | Príkaz |
|-------------------|-------------|---------|
| **n8n workflow** | n8n | `python3 ~/.openclaw/skills/n8n/scripts/n8n_api.py` |
| **GitHub ops** | github | `gh pr/issue/repo ...` |
| **Google Calendar** | google-calendar | `python3 ~/.openclaw/skills/google-calendar/scripts/google_calendar.py` |
| **DNS/SSL/Cloudflare** | cloudflare-toolkit | `~/.openclaw/skills/cloudflare-toolkit/scripts/cf.sh` |
| **Supabase DB** | supabase | `~/.openclaw/skills/supabase/scripts/supabase.sh` |
| **News/RSS** | news-summary | `curl feeds + OpenRouter` |
| **Copywriting** | humanizer | guidelines v SKILL.md |
| **Web search** | brave-search | `node ~/.openclaw/skills/brave-search/search.js` |
| **iMessage** | imsg | `imsg send "number" "text"` |
| **GIF search** | gifgrep | `gifgrep search "query"` |
| **RSS monitor** | blogwatcher | `blogwatcher list/watch` |
| **Stock data** | yahoo-finance | `python3 scripts/yahoo_finance.py` |
| **CRM** | crm | `workspace/systems/local-scripts/crm.sh` |
| **Linear** | linear | API + web |
| **Airtable** | airtable | API |

**Podrobný cheatsheet:** `SKILLS-CHEATSHEET.md`

---

## Git & Branch workflow (Chat runtime)

- **Repo:** `https://github.com/xvadur/chat`
- **Lokálna cesta:** `~/.openclaw` (symlink: `~/Documents/chat`)
- **Workspace:** `~/.openclaw/workspace` (symlink: `~/Documents/chat-workspace`)

### Branch pravidlá

- Primárna pracovná branch: **`system`**
- Každý deň nová pracovná branch z `system`
- Naming: **`system/DD-MM-den`** (napr. `system/17-02-utorok`)
- Po dokončení dňa: commit + push + (voliteľne) PR späť do `system`

### Rýchly postup

```bash
cd ~/.openclaw
git fetch origin
git checkout system
git pull --ff-only origin system
BRANCH="system/$(date +%d-%m)-$(LC_TIME=sk_SK.UTF-8 date +%A | tr '[:upper:]' '[:lower:]')"
git checkout -b "$BRANCH"
```

## Runtime baseline

- **Machine:** MacBook Air M3
- **Primary channel:** Telegram
- **Primary workspace:** `~/.openclaw/workspace`

## Messaging architecture (low-friction)

- Keep one **Command Center** chat for raw dumps and fast capture.
- Use up to 2-3 **Output lanes** (e.g., Biznis / Build / Personal) for structured results.
- Reduce mobile friction first (especially @mention bottlenecks) before adding complexity.
- Rule: if a setup adds friction, simplify the path before adding features.

## Template source of truth

- Canonical templates are in Obsidian only.
- `workspace/templates/` is not a primary source-of-truth for Jarvis decisions.
- If a template differs between OpenClaw workspace and Obsidian, prefer Obsidian.
- New or updated templates should be created in Obsidian first.

## Aktívne nástroje/služby (pracovne) - AKTUALIZOVANÉ

### 🆕 NOVÉ (pridané 2026-02-22)
- **n8n** - Workflow automation & integrations
- **GitHub CLI** - Repository management
- **Google Calendar** (adam@xvadur.com) - Enhanced scheduling
- **Cloudflare Toolkit** - DNS, SSL, zone management
- **Supabase** - Database & vector operations
- **News Summary** - RSS + OpenRouter daily briefings
- **Humanizer** - AI text humanization for copywriting
- **Frontend Design** - Astro web development guidelines
- **Free-Ride** - Free AI models via OpenRouter
- **iMessage CLI** - SMS/iMessage from terminal
- **GIFgrep** - GIF search and extraction
- **Blogwatcher** - RSS/Atom feed monitoring
- **Yahoo Finance** - Stock data & analysis
- **Prompt Engineering Expert** - Prompt optimization
- **Self-Improving Agent** - Continuous learning

### Existujúce
- OpenClaw runtime + tools (28 skills total)
- Telegram channel
- GHL (GoHighLevel): web, CRM, pipeline, outreach
- Obsidian (copywriting / notes)
- OpenRouter
- Brave Search
- Notion
- Airtable
- Linear (aktívny)
- Kimi bridge (plugin)
- ElevenLabs TTS

## AI Recepcia / Biznis execution stack

- 100+ hotel kontaktov v GHL (batch mail)
- 300 scraped leadov (zubári + hotely)
- xvadur.com live, ongoing copy/copyright updates
- Compliance research rozpracovaný

## Poznámka k TTS

- Preferovaný mód: text-first
- Hlas len na explicitné vyžiadanie
- ElevenLabs voice preferencia sa nastavuje v `openclaw.json` (`messages.tts`)

## Chat style preferencie

- GIF mode: zapínať inteligentne podľa kontextu (win/fail/overload), nepreháňať spam
- Pri priamom pokyne (`/gif ...` alebo "teraz by sa hodil gif") poslať GIF hneď

## Commands & Skills (quick usage notes)

- `TOOLS.md` drží iba praktické poznámky a mapovanie.
- **Source of truth pre slash command systém je skill:**
  - `~/.openclaw/skills/slash-commands/SKILL.md`

## Integration Registry (source of truth) - AKTUALIZOVANÉ 2026-02-22

### 🆕 NOVÉ SKILLY (16 pridaných)
**Nainštalované dnes:**

| Skill | Účel | API Key | CLI |
|-------|------|---------|-----|
| **n8n** | Workflow automation | ✅ N8N_API_KEY | ❌ |
| **github** | GitHub CLI ops | ❌ | ✅ gh |
| **google-calendar** | Google Calendar API | ✅ OAuth | ❌ |
| **self-improving-agent** | Pasívne učenie | ❌ | ❌ |
| **free-ride** | Free AI modely | ✅ OPENROUTER | ❌ |
| **prompt-engineering-expert** | Prompt optimalizácia | ❌ | ❌ |
| **opencode-controller** | OpenClaw control | ❌ | ❌ |
| **yahoo-finance** | Stock data | ❌ | ❌ |
| **humanizer** | Copywriting (odstráni AI) | ❌ | ❌ |
| **frontend-design** | Astro web dev | ❌ | ❌ |
| **news-summary** | RSS + OpenRouter summary | ✅ OPENROUTER | ❌ |
| **imsg** | iMessage/SMS | ❌ | ✅ imsg |
| **gifgrep** | GIF search | ❌ | ✅ gifgrep |
| **blogwatcher** | RSS monitoring | ❌ | ✅ blogwatcher |
| **cloudflare-toolkit** | DNS, SSL, zones | ✅ CLOUDFLARE_API_TOKEN | ❌ |
| **supabase** | Database, vector search | ✅ SUPABASE_SERVICE_KEY | ❌ |

### 📊 CELKOVÝ PREHĽAD — 28 SKILLOV

**Business/Ops:**
- `airtable`, `calendar-business`, `calendar-personal`, `crm`, `gmail-business`, `gmail-personal`, `linear`, `n8n`

**AI/Content:**
- `brave-search`, `free-ride`, `humanizer`, `news-summary`, `prompt-engineering-expert`, `self-improving-agent`, `youtube-transcript`

**Dev/Tech:**
- `cloudflare-toolkit`, `frontend-design`, `github`, `google-calendar`, `opencode-controller`, `supabase`, `yahoo-finance`

**Communication/Utility:**
- `blogwatcher`, `gifgrep`, `imsg`, `goplaces`, `morning-brief`, `slash-commands`

### 🔑 Configured API Keys (v openclaw.json)
- `airtable`, `brave-search` (goplaces), `cloudflare`, `elevenlabs`, `google-calendar` (OAuth), `linear`, `n8n`, `notion`, `openrouter`, `supabase`

### 🖥️ Installed CLI Tools
- `gh` (GitHub), `imsg` (iMessage), `gifgrep` (GIF search), `blogwatcher` (RSS), `spotify_player` (removed - vyžaduje platbu)

## Skill dependency rule

- Pri migrácii alebo čistení kontroluj, či existuje externý skill path `~/xvadur_openclaw/skills`.
- Ak externý path nie je dostupný, command routing pre príslušné skills sa rozbije.

## Skills Handshake (commands ↔ skills) - AKTUALIZOVANÉ

- Keď command vyžaduje špecializovaný nástroj/workflow, použije sa príslušný skill.
- Priorita: **najšpecifickejší skill** pre danú úlohu.
- **NOVÉ mapovania (28 skills total):**
  - **GitHub** (repos, PRs, issues, actions) → `github`
  - **n8n workflows** (automations, executions) → `n8n`
  - **Google Calendar** (events, scheduling) → `google-calendar` (nový)
  - **Cloudflare** (DNS, SSL, zones, tunnels) → `cloudflare-toolkit`
  - **Supabase** (DB, vector search, storage) → `supabase`
  - **News/RSS** (daily briefings) → `news-summary`
  - **Copywriting** (humanize AI text) → `humanizer`
  - **Frontend dev** (Astro, design) → `frontend-design`
  - **Free AI models** (OpenRouter) → `free-ride`
  - **Prompt engineering** → `prompt-engineering-expert`
  - **iMessage/SMS** → `imsg`
  - **GIF search** → `gifgrep`
  - **RSS monitoring** → `blogwatcher`
  - **Stock data** → `yahoo-finance`
  - YouTube transcript/sumarizácia → `youtube-transcript`
  - Obsidian operácie → `obsidian`
  - Google Workspace operácie → `gog`
  - CRM operácie (`workspace/crm/pcrm.sqlite`) → `crm`
  - Things 3 tasky → `things-mac`
  - Apple Reminders → `apple-reminders`
  - Business Gmail (`adam@xvadur.com`) → `gmail-business`
  - Personal Gmail (`yksvadur.ja@gmail.com`) → `gmail-personal`
  - Business Calendar (`adam@xvadur.com`) → `calendar-business`
  - Personal Calendar (`yksvadur.ja@gmail.com`) → `calendar-personal`

## CRM operating rule

- CRM je integrálna pamäť a správa kontaktov: `workspace/crm/pcrm.sqlite`.
- Operačný wrapper: `workspace/systems/local-scripts/crm.sh`.
- CRM + Calendar + Linear majú rozdielne role:
  - CRM = kontaktový kontext a follow-up stav
  - Calendar = presný čas záväzku
  - Linear = vykonávacia úloha/dodanie
- Workout tracking (detailed) je v tom istom DB:
  - tabuľky: `workout_sessions`, `workout_exercises`, `workout_sets`
  - rýchle príkazy:
    - `crm.sh workout-new [date] [note]`
    - `crm.sh workout-add <session_id> <exercise> <weight_kg> <reps> [set_order]`
    - `crm.sh workout-day [date]`
    - `crm.sh workout-show <session_id>`

---

Keď pribudnú nové platformy/účty/integrácie, zapíš ich sem hneď.
