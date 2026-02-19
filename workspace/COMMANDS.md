# COMMANDS.md — XVADUR Singularity OS Protocol v2.0
*Tento súbor definuje kompletné rozhranie medzi Adamom a Chatom (Jarvis). Chat sa ním riadi striktne.*

## 🎯 Filozofia
Každý prompt obsahuje inštrukciu. Slash príkazy slúžia na explicitnú obsluhu nástrojov.

---

## 📋 Životné Metriky (Daily Tracking)

### `/sleep in <cas>` — Adam ide spať
- Zaznamená čas odchodu do postele
- Spustí evening routine (ak ešte nebežala)
- Príklad: `/sleep in 23:30`

### `/sleep out <cas>` — Adam vstáva
- Zaznamená čas prebudenia
- Spustí morning brief generátor
- Príklad: `/sleep out 07:00`

### `/laura out <cas>` — Odvoz Laury do práce
- Zaznamená čas odvozu
- Príklad: `/laura out 06:30`

### `/laura in <cas>` — Príchod Laury z práce
- Zaznamená čas príchodu
- Príklad: `/laura in 14:30`

### `/udrzba <co> [kde]` — Upratovanie/system maintenance
- Zaznamená činnosť údržby
- Príklad: `/udrzba upratovanie byt`, `/udrzba cleanup system`

### `/jedlo <co>` — Stravovanie + kalórie
- Zaznamená jedlo, odhadne kalórie (web search)
- Udržuje denný kalorický súčet
- Príklad: `/jedlo kurací steak s ryžou 600g`

### `/cvicenie <typ> [trvanie]` — Cvičebná session
- Trackuje cvičenie smerom k cieľu +5kg, 4x týždenne
- Príklad: `/cvicenie bench 45min`, `/cvicenie deadlift 30min`

### `/karol <udalost>` — Udalosti okolo Karola
- Zaznamená návštevu, platbu, zdravotný stav
- Príklad: `/karol navsteva 15eur, vsetko ok`

---

## 💼 Biznis Nástroje

### `/linear [akcia]` — Obsluha Linear
- Bez parametra: zobrazí aktívne tasky
- S akciou: vytvorí/upraví/zobrazí task
- Príklady:
  - `/linear` — list active
  - `/linear create "Meeting s Milošom" priority:high`
  - `/linear done TASK-123`

### `/plan <co> <kedy>` — Plánovanie s kalendárom
- Vytvorí udalosť v Google Kalendári + Linear task
- Príklad: `/plan "Call so Šimonom" zajtra 14:00`

### `/calendar [akcia]` — Obsluha Google Kalendára
- Zobrazí, vytvorí, upraví udalosti
- Príklad: `/calendar today`, `/calendar create "Meeting" 2026-02-20 15:00`

### `/git [akcia]` — Verzovanie
- Spravuje Astro landing a xvadur_solution repos
- Príklady: `/git status`, `/git commit "update landing"`, `/git push`

### `/crm [akcia]` — Obsluha databáz
- Zobrazí, vyhľadá, upraví kontakty
- Príklady:
  - `/crm list` — všetci kontakty
  - `/crm find "Miloš"`
  - `/crm add "Meno" role:"Founder"`
  - `/crm ludia` — masívny prehľad s psychoprofilmi

### `/fin [akcia]` — Správa peňazí
- Trackuje príjmy, výdavky, budget
- Príklady: `/fin status`, `/fin add expense "nákup" 45.50eur`, `/fin monthly`

### `/cloudflare [akcia]` — Obsluha Cloudflare
- Príklad: `/cloudflare status`, `/cloudflare deploy`

---

## 🧠 Knowledge Management

### `/obsidian [akcia]` — Obsluha PKM
- Bez parametra: sync status
- S akciou: vyhľadá, vytvorí, upraví poznámky
- Príklady:
  - `/obsidian search "AIstriko"`
  - `/obsidian create "Jarvis/Notes/New Idea"`
  - `/obsidian daily` — zobrazí dnešný denný log

### `/obsidian properties` — Multi-agent metadata generátor
**SPAWN 2 AGENTOV:**
1. **Analyzer Agent** — analyzuje text, navrhne nadpis
2. **Taxonomist Agent** — vygeneruje YAML properties:
   - `created: 2026-02-19 23:51`
   - `tags: [ai, strategy, business]`
   - `word_count: 245`
   - `xp: 10`
   - `project: XVADUR`
   - `priority: high`
   - `energy: focused`

Výstup: Nový dokument v `+/` s YAML frontmatterom.

---

## 🌐 Web & Research

### `/news <tema>` — Brave Search
- Vyhľadá konkrétne informácie
- Príklad: `/news "OpenAI agent releases 2026"`, `/news "Slovak tech startups"`

### `/gog [akcia]` — Google Workspace
- Gmail, Calendar, Drive, Docs, Sheets
- Príklad: `/gog gmail unread`, `/gog calendar today`

---

## ⚙️ Systémové Operácie

### `/log <text>` — Záznam akcie/udalosti
- Zapíše udalosť do denného logu s timestamp
- Automaticky pridelí XP
- Príklad: `/log "Dokončený call s Davidom, potvrdené AIstriko partnerstvo"`

### `/xp [akcia]` — Obsluha XP systému
- Príklady:
  - `/xp status` — aktuálny level, XP do ďalšieho, streak
  - `/xp add 50 "Strategický call"`
  - `/xp history` — graf progressu

### `/config [subor]` — Nastavenie systému
- Upraví interné dokumenty OpenClaw
- Príklad: `/config agents`, `/config tools`, `/config identity`

### `/save` — Update celého systému
**CRITICAL PROTOCOL:**
1. Sync `memory/` s Obsidian `Jarvis/Daily Logs/`
2. Aktualizuj `control/GLOBAL-DASHBOARD.md`
3. Git commit + push (xvadur-os, workspace)
4. Rebuild Astro (ak sú zmeny)
5. Vygeneruj evening brief report
6. Potvrď status + XP

---

## 📅 Daily Rituals

### `/brief morning` — Morning Brief
- Prečítaj včerajší evening brief
- Skontroluj kalendár na dnes
- List Linear priority tasks (High/Urgent)
- Navrhni 3 Deep Work bloky
- Vygeneruj plán + odhad XP

### `/brief evening` — Evening Brief
- Zosumarizuj všetky logy z dňa
- Spočítaj získané XP
- Identifikuj nedokončené úlohy → Tomorrow Focus
- Aktualizuj dashboard
- Príprava na 03:00 System Clean

---

## 🤖 Agent-to-Agent (Tím Mode)

Keď bude Šimon a David mať svojich agentov:
- `/handshake <agent>` — inicializuje komunikáciu
- `/sync team` — synchronizuje team-wide dokumenty
- `/delegate <kto> <task>` — deleguje task cez agenta

---

## 🕰️ Automated Rituals (Cron Jobs)

### 03:00 System Clean (Daily)
**Automaticky spustené — izolovaný agent:**
1. Vyčistenie inboxu (`+/`)
2. Výpočet XP za predchádzajúci deň
3. Príprava Morning Brief dokumentov
4. Kontrola taskov, kalendára, CRM
5. Git commit všetkých zmien
6. RSS feed update
7. Astro rebuild (ak potrebné)

### Every 30 min — System Monitor
- Kontrola urgentných taskov
- Pripomienky podľa priority
- Status update v odpovediach

---

## 🎮 XP Systém

| Aktivita | XP |
|----------|-----|
| Daily log entry | +10 |
| Dokončený task | +25 |
| Dokončený P1 task | +50 |
| Strategický call/pivot | +100 |
| Streak bonus (denne) | +20 |
| System maintenance | +15 |
| Content creation | +30 |

---

*Verzia: 2.0 Singularity Edition*
*Aktualizované: 2026-02-19*
*Status: Ready for deployment*
