# COMMANDS.md — Chat Operating Commands (V1)

Účel: stabilný command layer pre low-burn aj full-execution mode.

---

## 0) Runtime modes

- **LOG mode (default):** tracking + krátke odpovede, minimum tokenov.
- **OPS mode:** aktivuje sa iba cez `/ops ...` príkazy.

Prepínače:
- `/mode log`
- `/mode ops`
- `/mode auto`

---

## 1) Command contract

Formát:
- `/command argumenty`

Pravidlá:
- 1 command = 1 intent
- odpovede stručné (status + next)
- ak command nie je jasný, Chat sa spýta 1 otázku max

Response šablóna:
- `STATUS: ...`
- `NEXT: ...`

---

## 2) Core commands (tracking)

- `/brief` — štart dňa (top priority + focus)
- `/plan` — plán na 2-4h blok
- `/top3` — tri najdôležitejšie veci dnes
- `/task <text>` — pridaj task
- `/tasks` — aktuálny task list
- `/done <text>` — označ task hotový
- `/log <text>` — priebežný log
- `/blocker <text>` — nahlás blocker
- `/next <text>` — najbližší konkrétny krok
- `/focus <min> <task>` — focus blok (napr. `/focus 60 offer copy`)
- `/review` — čo funguje / čo nie / zmena
- `/save` — sync systému a pamäte (update dokumentov + denného logu)
- `/close` — end-of-day wrap

---

## 3) Karol commands (side-income tracking)

Účel: mať presnú evidenciu návštev, platieb, nákladov a čistého zostatku.

Sledovaná štruktúra pri každej návšteve:
- dátum + čas príchod/odchod
- typ úkonu/starostlivosti
- platba od Karola (`received`)
- súvisiace náklady (`expenses`: nákup, doprava, atď.)
- čistý výsledok (`net = received - expenses`)
- priebežný zostatok (`running balance`)
- ďalší termín / poznámka

Commandy:
- `/karol in` — štart návštevy (čas + status)
- `/karol out` — koniec návštevy (čas + stručná poznámka)
- `/karol pay <suma>` — prijatá platba (napr. `/karol pay 15`)
- `/karol expense <suma> <item>` — náklad viazaný na Karola (napr. `/karol expense 30 kaufland`)
- `/karol net` — dnešný čistý výsledok + priebežný balance
- `/karol next <čas|poznámka>` — ďalšia návšteva/plán
- `/karol calendar add <from> <to> <poznámka>` — zapíš návštevu do Google Calendar (kalendár `karol`)
- `/karol calendar done <eventId|čas>` — označ/aktualizuj event po návšteve
- `/karol summary` — súhrn za posledné dni

Template záznamu (čo budem logovať):

```text
KAROL_VISIT
- date:
- in_time:
- out_time:
- care_notes:
- received_eur:
- expenses_eur:
- expense_items:
- net_eur:
- running_balance_eur:
- next_visit:
```

---

## 4) Revenue commands (GHL / outreach)

- `/lead add <name|hotel|context>`
- `/lead status <name|id> <new-status>`
- `/pipeline` — stručný funnel snapshot
- `/offer draft <target>` — draft offer skeleton
- `/outreach prep <segment>` — priprav outreach batch
- `/outreach send <segment>` — spustiť len po explicitnom potvrdení
- `/followup plan <segment>` — follow-up schedule

---

## 5) Copy & web commands

- `/copy hero <tema>`
- `/copy cta <goal>`
- `/copy polish <text>`
- `/web checklist` — čo chýba pred publish
- `/web publish-ready` — quick readiness audit

---

## 6) CRM commands (founder CRM)

- `/crm triage` — spusti Gmail triage pre `adam@xvadur.com`
- `/crm stats` — počet kontaktov/interakcií + stale status
- `/crm followups` — top follow-up kandidáti
- `/crm noise add <pattern>` — pridaj noise pravidlo
- `/crm noise list` — zobraz noise pravidlá

Lokálne súbory:
- DB: `crm/pcrm.sqlite`
- Triage script: `automation/triage_gmail.py`
- Noise rules: `automation/noise_senders.txt`

---

## 7) Google + Airtable commands

### gog
- `/gog gmail unread`
- `/gog calendar today`
- `/gog sheet update <sheet> <range>`

### airtable
- `/airtable bases`
- `/airtable tables <base>`
- `/airtable sample <base> <table> <n>`
- `/airtable upsert <base> <table> <payload>`

Poznámka: write/sending akcie vždy s potvrdením (`CONFIRM`).

---

## 8) System / infra commands

- `/status` — session/resource status
- `/disk` — disk quick scan
- `/tools` — tool availability snapshot
- `/tool check <name>` — konkrétny tool
- `/branch today` — skontroluj/poradí branch naming
- `/sync notes` — zapíš dôležité veci do memory/log
- `/save` — plný sync (viď Save protocol)

### Save protocol (`/save`)

Pri `/save` Chat spraví:
1. skontroluje, či je `COMMANDS.md`, `TOOLS.md`, `SOUL.md`, `IDENTITY.md` konzistentné s aktuálnymi pravidlami
2. skontroluje existenciu denného logu `memory/log-YYYY-MM-DD.md`
3. ak denný log chýba, vytvorí ho zo šablóny
4. doplní do denného logu posledné dôležité udalosti od posledného save
5. vráti stručný report `STATUS + NEXT`
6. v potvrdzujúcej správe pošle aj relevantný GIF (save/locked-in vibe)

---

## 9) Fun / social commands

- `/gif <theme>` — pošli GIF
- `/gif win`
- `/gif doom`
- `/gif overload`

Smart GIF policy:
- max 1 GIF na 3-5 správ
- nepushovať GIF pri serióznych témach

---

## 10) Expensive operations gate

Tieto commandy sú považované za drahšie:
- `/ops email ...`
- `/ops research ...`
- `/ops debug ...`
- `/ops longrun ...`

Pred vykonaním Chat odpovie:
- odhad náročnosti (`LOW/MEDIUM/HIGH`)
- čo presne vykoná
- vyžiada `CONFIRM`

---

## 11) Daily workflow (recommended)

1. `/brief`
2. `/top3`
3. `/focus 60 ...`
4. `/log ...`
5. `/next ...`
6. `/close`

### Morning routine protocol (content CRM)

Trigger: `/brief` (alebo text "morning routine")

Chat spraví:
1. rýchly stav (čo je v queue, čo je ready, čo je deadline)
2. vypýta si od teba materiál podľa plánu dňa
3. pripraví konkrétne tasky na publish

Materiál, ktorý si vypýtam (iba čo chýba):
- 1 hlavná myšlienka dňa
- 1 story/proof (čo sa stalo včera, výsledok, insight)
- 1 CTA (čo chceš od ľudí)
- platforma(e) na dnes (X/LinkedIn/IG...)

Output po routine:
- `TODAY POST PLAN` (čo ide von)
- `MATERIAL MISSING` (čo ešte treba doplniť)
- `NEXT ACTION` (čo máš spraviť hneď)

---

## 12) Naming conventions

Git branches:
- base: `system`
- denný branch: `system/DD-MM-den`
- príklad: `system/18-02-streda`

---

## 13) Quick aliases (human-friendly)

- "teraz log" => `/log`
- "čo ďalej" => `/next`
- "zhrni" => `/review`
- "koniec dňa" => `/close`

---

Maintainer: Chat + xvadur
Version: V1 (2026-02-18)
