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

---

Keď pribudnú nové platformy/účty/integrácie, zapíš ich sem hneď.