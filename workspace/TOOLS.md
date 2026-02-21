# TOOLS.md - Local Notes

Praktický cheat sheet pre Adam/xvadur setup.

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

## Aktívne nástroje/služby (pracovne)

- OpenClaw runtime + tools
- Telegram channel
- GHL (GoHighLevel): web, CRM, pipeline, outreach
- Obsidian (copywriting / notes)
- OpenRouter
- Brave Search
- Notion
- Airtable
- Linear (aktívny)
- Kimi bridge (plugin)

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

## Integration Registry (source of truth)

- `local skills` (v `~/.openclaw/skills`): `airtable`, `brave-search`, `calendar-business`, `calendar-personal`, `crm`, `gmail-business`, `gmail-personal`, `goplaces`, `linear`, `morning-brief`, `slash-commands`, `youtube-transcript`
- `external skills` (v `~/xvadur_openclaw/skills`): `gog`, `github`, `obsidian`, `notion`, `weather`, `things-mac`, `apple-reminders`, `openai-image-gen`, `openai-whisper-api`, `sag`
- `configured API keys in openclaw.json`: `airtable`, `goplaces`, `notion`, `openai-image-gen`, `openai-whisper-api`, `sag`

## Skill dependency rule

- Pri migrácii alebo čistení kontroluj, či existuje externý skill path `~/xvadur_openclaw/skills`.
- Ak externý path nie je dostupný, command routing pre príslušné skills sa rozbije.

## Skills Handshake (commands ↔ skills)

- Keď command vyžaduje špecializovaný nástroj/workflow, použije sa príslušný skill.
- Priorita: **najšpecifickejší skill** pre danú úlohu.
- Príklady mapovania:
  - `/weather` → skill `weather`
  - YouTube transcript/sumarizácia → `youtube-transcript`
  - GitHub issues/PR/CI → `github`
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

---

Keď pribudnú nové platformy/účty/integrácie, zapíš ich sem hneď.
