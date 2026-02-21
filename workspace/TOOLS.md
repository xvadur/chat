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

## Slash Command Protocol (SOURCE OF TRUTH)

> Od 2026-02-21 je command systém vedený tu v `TOOLS.md`.
> `COMMANDS.md` je iba kompatibilitný odkaz.

### Režimy
- `/chat` → konverzačný režim (reflexia, vízia, framing; bez predčasnej exekúcie)
- `/exe` → exekučný režim (konkrétne kroky, poradie, deadliny, dokončenie)
- `/system` → systémový režim (update core docs/protokolov + explicitné potvrdenie zmien)

### Core denné príkazy
- `/sleep in <cas>`
- `/sleep out <cas>`
- `/laura out <cas>`
- `/laura in <cas>`
- `/udrzba <co> [kde]`
- `/jedlo <co>`
- `/cvicenie <typ> [trvanie]`
- `/karol <udalost>`
- `/log <text>`
- `/brief morning`
- `/brief evening`
- `/save`

### Daily Log Protocol (priebežné zapisovanie dňa)
- Každý deň sa vedie súbor: `memory/YYYY-MM-DD.md`.
- Počas bežnej konverzácie sa priebežne logujú významné udalosti dňa (spánok, jedlo, tasky, cvičenie, Karol, rozhodnutia).
- Keď Adam napíše stav typu „jedol som“, „idem cvičiť“, „bol som u Karola“, zapíše sa to do dnešného logu bez nutnosti extra pripomínania.
- ` /log ` sa používa na explicitný zápis; prirodzené statusy v chate sa zapisujú tiež.
- Cieľ: nahradiť manuálne denníkové prepínanie a mať kompletný timeline dňa v jednom súbore.

### Biznis/operatíva príkazy
- `/linear [akcia]`
- `/plan <co> <kedy>`
- `/calendar [akcia]`
- `/git [akcia]`
- `/crm [akcia]`
- `/fin [akcia]`
- `/cloudflare [akcia]`
- `/obsidian [akcia]`
- `/news <tema>`
- `/gog [akcia]`

## Skills Handshake (commands ↔ skills)

- Keď command vyžaduje špecializovaný nástroj/workflow, použije sa príslušný skill.
- Priorita: **najšpecifickejší skill** pre danú úlohu.
- Príklady mapovania:
  - `/weather` → skill `weather`
  - YouTube transcript/sumarizácia → `youtube-transcript`
  - GitHub issues/PR/CI → `github`
  - Obsidian operácie → `obsidian`
  - Google Workspace operácie → `gog`
  - Things 3 tasky → `things-mac`
  - Apple Reminders → `apple-reminders`
  - Business Gmail (`adam@xvadur.com`) → `gmail-business`
  - Personal Gmail (`yksvadur.ja@gmail.com`) → `gmail-personal`
  - Business Calendar (`adam@xvadur.com`) → `calendar-business`
  - Personal Calendar (`yksvadur.ja@gmail.com`) → `calendar-personal`

---

Keď pribudnú nové platformy/účty/integrácie, zapíš ich sem hneď.