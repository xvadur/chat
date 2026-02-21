# XVADUR Singularity OS — System Context Pack

_Last updated: 2026-02-20 20:25 (Europe/Bratislava)_

Toto je pripravený podklad pre Claude (Plan Mode), aby mal presný obraz o tom, ako je systém momentálne nastavený.

---

## 1) Runtime Snapshot

- **Platforma:** OpenClaw (local runtime)
- **Host:** MacBook Air M3 (`Prasačí_Air`)
- **OS:** Darwin 25 arm64
- **Repo root:** `~/.openclaw`
- **Workspace:** `~/.openclaw/workspace`
- **Primárny model (default):** `openai-codex/gpt-5.3-codex`
- **Dostupné modely (aliases/config):**
  - `openrouter/auto` (alias OpenRouter)
  - `openrouter/anthropic/claude-opus-4.6`
  - `google-antigravity/claude-opus-4-6-thinking`
  - `google-antigravity/gemini-3-flash`
  - `kimi-coding/k2p5` (alias Kimi K2.5)
  - `kimi-coding/kimi-k2-thinking`
- **Thinking mode:** OFF (dá sa zapnúť príkazom `/reasoning`)
- **Compaction:** safeguard
- **Context pruning:** cache-ttl (1h)
- **Heartbeat:** každých 30 min

---

## 2) Ako OpenClaw v tomto systéme funguje (operating model)

### 2.1 Session model
- Bežíme v **main session** (`agent:main:main`) ako primárny „Jarvis" kanál.
- OpenClaw drží kontext v session + robí compaction, aby sa nezrútil context window.
- Pri komplexných úlohách vie spawnuť izolované sub-agenty (`sessions_spawn`), ale core orchestration ostáva v main.

### 2.2 Dokumenty, ktoré runtime aktívne používa
Pri štarte a počas práce sú dôležité hlavne tieto súbory v `workspace/`:
- `SOUL.md` → identita/štýl asistenta
- `USER.md` → profil používateľa (Adam)
- `AGENTS.md` → pravidlá správania v workspace
- `COMMANDS.md` → slash command protokol
- `MEMORY.md` → long-term curated memory (iba v main session)
- `memory/YYYY-MM-DD.md` → denné operatívne poznámky
- `memory/log-YYYY-MM-DD.md` → timestamp logy akcií
- `HEARTBEAT.md` → čo robiť počas heartbeat pollov

### 2.3 Pamäťový model (memory behavior)
OpenClaw tu používa 3 vrstvy pamäte:

1. **Krátkodobá (session context)**
   - aktuálny chat + tool výsledky
   - najrýchlejší prístup, ale limitovaný oknom modelu

2. **Pracovná perzistentná pamäť (daily files)**
   - `workspace/memory/YYYY-MM-DD.md`
   - `workspace/memory/log-YYYY-MM-DD.md`
   - slúži na kontinuitu medzi session restartami

3. **Dlhodobá kurátorská pamäť**
   - `workspace/MEMORY.md`
   - len zásadné fakty/rozhodnutia/patterny, nie každá drobnosť

### 2.4 Ako sa pamäť aktualizuje v praxi
- Ručne cez `/log ...` (XP + event log)
- Automaticky cez `/save`:
  - sync line do local/obsidian daily logu
  - snapshot report do `singularity/logs/`
  - git autocommit zmenených repo
- Pred odpoveďami o minulosti sa má použiť memory recall (search + targeted read)

### 2.5 Command execution flow
1. User pošle slash command (napr. `/sleep out 07:00`)
2. `runtime.py`:
   - zaloguje command do `command_log`
   - vykoná handler
   - zapíše business/life event do SQLite
   - pridelí XP do `xp_events`
3. Voliteľne prebehne sync do Obsidian/Git (`/save`)

### 2.6 Obsidian properties pipeline
- Vstup: markdown v `+/`
- `analyzer_agent.py` → title/type/summary
- `taxonomist_agent.py` → tags/status/project/xp
- `runtime.py /obsidian properties` vloží YAML frontmatter a uloží súbor

### 2.7 Scheduling a autonómia
- Preferovaný scheduler: local crontab (stabilný workaround)
- Aktívne beží:
  - 03:00 system clean
  - 6h properties pass
  - 30 min monitor/dashboard refresh
- OpenClaw je **assistive + operator** (nie fully autonomous bez ľudského smerovania)

---

## 3) Komunikačné kanály

- **Webchat:** aktívny (current session)
- **Telegram:** aktívny (DM policy pairing, group allowlist)

---

## 4) Aktuálne OpenClaw nástroje (v tejto session)

- Súborové: `read`, `write`, `edit`
- Shell/process: `exec`, `process`
- Web: `web_search`, `web_fetch`, `browser`
- Node/canvas: `canvas`, `nodes`
- Scheduling: `cron`
- Messaging: `message`
- Runtime ops: `gateway`
- Sessions/agents: `agents_list`, `sessions_list`, `sessions_history`, `sessions_send`, `sessions_spawn`, `subagents`, `session_status`
- Media: `image`, `tts`, `kimi_upload_file`
- Memory: `memory_search`, `memory_get`

Poznámka: Gateway cron/canvas boli skôr blokované token mismatch chybou; workaround je local crontab.

---

## 5) Skills (nainštalované lokálne)

Lokálne skills v `~/.openclaw/skills/`:
- `brave-search`
- `goplaces`
- `linear`
- `morning-brief`

Skilly dostupné v runtime (agent-level katalog) zahŕňajú aj:
- coding-agent, github, gog, healthcheck, imsg, notion, obsidian, skill-creator,
  things-mac, tmux, video-frames, weather, brave-search, linear

---

## 6) Štruktúra priečinkov (ako systém reálne žije na disku)

Nižšie je **praktická mapa** celého setupu, aby Claude vedel presne, kde čo je.

### 5.1 OpenClaw root (`~/.openclaw`)

```text
~/.openclaw/
├─ openclaw.json                 # hlavná konfigurácia runtime (modely, auth profily, pluginy)
├─ skills/                       # lokálne skills (brave-search, linear, goplaces, morning-brief)
├─ agents/                       # agent sessions + auth profiles
├─ extensions/                   # pluginy (napr. kimi-claw)
└─ workspace/                    # hlavný pracovný adresár
   ├─ AGENTS.md                  # behavior/runtime pravidlá
   ├─ SOUL.md                    # identita/voice
   ├─ USER.md                    # profil Adama
   ├─ COMMANDS.md                # slash command protokol
   ├─ IMPLEMENTATION-ROADMAP.md  # implementačný plán
   ├─ SYSTEM-CONTEXT-PACK.md     # tento dokument
   ├─ MEMORY.md                  # long-term memory
   ├─ memory/                    # denné logy + operatívna pamäť
   │  ├─ YYYY-MM-DD.md
   │  └─ log-YYYY-MM-DD.md
   ├─ crm/
   │  └─ pcrm.sqlite             # hlavná SQLite DB
   ├─ singularity/
   │  ├─ README.md
   │  ├─ config/
   │  │  ├─ schema_v3.sql
   │  │  ├─ obsidian-properties-schema.yaml
   │  │  └─ notion_obsidian_property_map.json
   │  ├─ scripts/
   │  │  ├─ runtime.py
   │  │  ├─ analyzer_agent.py
   │  │  ├─ taxonomist_agent.py
   │  │  ├─ obsidian_properties.py
   │  │  ├─ system_clean.py
   │  │  └─ notion_daily_sync.py
   │  └─ logs/
   └─ automation/                # helper automations (dashboard/gmail triage/...)
```

### 5.2 Obsidian vault (`~/Desktop/xvadur_obsidian_januar`)

```text
~/Desktop/xvadur_obsidian_januar/
├─ +/                            # inbox (raw notes) pre auto-property pipeline
├─ Atlas/
│  ├─ Maps/                      # mapy systémov, MOCs, Davos
│  │  └─ Davos/
│  │     ├─ README.md
│  │     ├─ discovery/
│  │     ├─ research/
│  │     ├─ architecture/
│  │     ├─ plan/
│  │     ├─ progress/
│  │     └─ decisions/
│  ├─ Dots/                      # idey/snippety
│  ├─ Sources/                   # interview/research materiály
│  ├─ Statements/                # identity/principles
│  └─ Things/                    # projekty/artefakty
├─ Efforts/                      # Ongoing/Simmering/Sleeping
├─ Calendar/                     # dátumové poznámky/denníky
├─ Jarvis/
│  └─ Daily Logs/                # mirror runtime denníkov
└─ x/Templates/                  # templaty (Daily, Property, Mirror...)
```

### 5.3 Web/Face layer (`~/XVADUR-OS/face-astro` + `~/XVADUR-OS/singularity_`)

```text
~/XVADUR-OS/
├─ face-astro/                   # Mission Control UI (dashboard/task/calendar/content/...)
└─ singularity_/                 # personal web repo (xvadur.com direction)
```

### 5.4 Funkčné rozdelenie (čo kde patrí)

- **Operational runtime + automations:** `~/.openclaw/workspace`
- **Knowledge base + writing:** `~/Desktop/xvadur_obsidian_januar`
- **Public web/interface:** `~/XVADUR-OS/*`
- **Tasks/system of record (work):** Linear (externý cloud)
- **Structured life/business data:** `workspace/crm/pcrm.sqlite`

### 5.5 Architektúra komponentov (summary)

- **Runtime + Automation (OpenClaw + Python):**
  - `runtime.py`, `analyzer_agent.py`, `taxonomist_agent.py`, `obsidian_properties.py`, `system_clean.py`, `notion_daily_sync.py`
- **Structured Data (SQLite):**
  - `contacts`, `sleep_log`, `laura_schedule`, `meals`, `exercise_sessions`, `maintenance_log`, `karol_events`, `xp_events`, `command_log`
- **Task Spine (Linear):**
  - Issues `XDR-21` až `XDR-29` vytvorené
- **Face/UI (Astro):**
  - Mission Control screens + landing v2

---

## 7) Slash Command vrstva (real implementácia v runtime.py)

Aktívne handlery:
- `/sleep in|out HH:MM`
- `/laura in|out HH:MM`
- `/jedlo ...`
- `/cvicenie ...`
- `/udrzba ...`
- `/karol ...`
- `/log ...`
- `/git ...`
- `/calendar ...`
- `/linear [list|search]`
- `/obsidian properties [filename]`
- `/save`

### Dôležité behavior
- Každý command sa loguje do `command_log`
- XP sa zapisuje do `xp_events` podľa pravidiel
- `/obsidian properties` spúšťa analyzer + taxonomist a doplní YAML frontmatter
- `/save` robí properties pass + log sync + snapshot report + git autocommit

---

## 8) Automatizácie (cron)

Lokálny crontab:
- `*/30 * * * *` dashboard refresh
- `0 */6 * * *` Obsidian properties pass
- `0 3 * * *` System clean

---

## 9) Davos Protocol (aktuálny stav)

Cesta: `Atlas/Maps/Davos/`

Obsah:
- `README.md` (work-in-progress, ide sa doladiť podľa tvojho štýlu)
- Štruktúra projektu je **folder-first**:
  - `discovery/`
  - `research/`
  - `architecture/`
  - `plan/`
  - `progress/`
  - `decisions/`

Princíp, ktorý si definoval:
- Do každého typu sa môžu ukladať viaceré dokumenty daného druhu.
- Nie "6 flat markdownov" v roote, ale typové priečinky.

---

## 10) /linear režim (tvoj požadovaný workflow)

Definované v `workspace/COMMANDS.md`:
1. `/linear` otvorí aktívne tasky
2. ideme task po tasku
3. ku každému vytvoríme subtasky
4. priradíme labels
5. update status
6. roadmap prepojenie + sync do Obsidian

---

## 11) Integrácie a konfigurácia

Aktívne konfigurácie (bez secret hodnôt):
- Linear API: configured
- Notion API: configured
- Google antigravity auth: configured
- OpenRouter: configured
- Anthropic: configured
- Kimi coding: configured
- Telegram plugin: enabled
- Kimi bridge plugin: enabled

TTS:
- provider: ElevenLabs
- auto: off

---

## 12) Čo je hotové vs. čo treba dotiahnuť

### Hotové
- Runtime skeleton + command handlers
- Schema v3 pre life/business tracking
- `/obsidian properties` pipeline
- `/save` orchestration
- Davos folder structure
- Linear foundational issues (XDR-21..29)
- Inbox cleanup a veľký Obsidian refactor

### Dotiahnuť (priorita)
1. **Davos README final policy** (podľa tvojho exact spôsobu práce)
2. **/linear full task manager flow** (subtasks/labels/state transitions robustne)
3. **Obsidian as KB** (dashboards + property validation + MOCs)
4. **Calendar event orchestration** (daily timing intelligence)
5. **Business Suite mode** (CRM/fin/task/calendar briefing do jedného operačného flow)

---

## 13) Bezpečnostná poznámka pre Claude plán

Pri práci s týmto packom:
- Nepresúvať tajné tokeny do markdownov/public repa
- Držať secrets iba v OpenClaw config/env/keychain
- V dokumentácii používať iba „configured/masked“ režim

---

## 14) Suggested prompt pre Claude (copy/paste)

"Tu je môj aktuálny OpenClaw systém (XVADUR Singularity OS). Chcem od teba Plan Mode návrh implementácie v 3 krokoch:
1) Dokončiť DAVOS README ako operačný štandard,
2) Dokončiť Linear ako praktický task manager (task→subtask→label→status→roadmap),
3) Dokončiť Obsidian ako knowledge base + calendar orchestrator + business suite.

Použi existujúce komponenty, nič nestavaj od nuly. Navrhni konkrétne tasky, acceptance criteria, risky, a poradie implementácie na 4 dni."