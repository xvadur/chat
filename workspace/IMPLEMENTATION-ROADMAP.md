# XVADUR Singularity OS — Implementation Roadmap
*Čo všetko potrebujeme vytvoriť pre plne funkčný systém*

**Status:** Blueprint complete → Implementation pending  
**Target:** Full deployment within 7 days  
**Priority:** Critical path identified

---

## ✅ FÁZA 1: Foundation (Day 1-2) — CRITICAL

### 1.1 Command Layer
- [x] `COMMANDS.md` v2.0 — **HOTOVO**
- [ ] Command parser — rozpoznávanie všetkých slash príkazov
- [ ] Command routing — smerovanie na správne nástroje

### 1.2 Memory Infrastructure
- [ ] `memory/` štruktúra reorganization
- [ ] Daily log template (YAML frontmatter)
- [ ] SQLite schema extensions:
  - [ ] `sleep_log` table (in/out times, quality)
  - [ ] `meals` table (food, calories, time)
  - [ ] `exercise` table (type, duration, intensity)
  - [ ] `laura_schedule` table (transports)
  - [ ] `maintenance_log` table (cleaning, system)
  - [ ] `karol_events` table (visits, payments, health)

### 1.3 Daily Ritual Templates
- [ ] Morning Brief template (Obsidian)
- [ ] Evening Brief template (Obsidian)
- [ ] Auto-generation script

---

## 🔧 FÁZA 2: Tool Integration (Day 2-4) — HIGH PRIORITY

### 2.1 Linear Hard-Coding
- [ ] Linear API wrapper module
- [ ] `/linear` command handler
- [ ] Auto-linking tasks with GitHub issues
- [ ] Priority-based notifications

### 2.2 Google Workspace (gog)
- [ ] `/calendar` command implementation
- [ ] `/plan` — Kalendár + Linear sync
- [ ] Gmail integration for notifications

### 2.3 Obsidian Integration
- [ ] `obsidian-local-rest-api` setup
- [ ] `/obsidian` search/create handlers
- [ ] File system watcher for `+/`

### 2.4 Git Automation
- [ ] `/git` command handlers
- [ ] Auto-commit scripts
- [ ] Multi-repo sync (Astro + Workspace)

### 2.5 CRM Enhancement
- [ ] `/crm ludia` — masívny prehľad
- [ ] Psychoprofil query engine
- [ ] Contact relationship mapping

### 2.6 Finance Tracking
- [ ] `/fin` module
- [ ] Expense categorization
- [ ] Monthly reporting

---

## 🤖 FÁZA 3: Multi-Agent System (Day 4-5) — INNOVATION

### 3.1 Agent Spawner
- [ ] `sessions_spawn` configuration
- [ ] Analyzer Agent (Kimi K2.5)
  - [ ] Text analysis
  - [ ] Title generation
  - [ ] Content classification
- [ ] Taxonomist Agent (Gemini Flash)
  - [ ] YAML property generation
  - [ ] Tag suggestions
  - [ ] XP calculation
  - [ ] Project classification

### 3.2 `/obsidian properties` Pipeline
- [ ] Input: Raw text from user
- [ ] Spawn 2 agents simultaneously
- [ ] Merge outputs
- [ ] Create file in `+/` with YAML
- [ ] Index to RAG

### 3.3 Agent Handshake Protocol
- [ ] Shared GitHub repo setup (`aistryko-brain`)
- [ ] Inter-agent communication standard
- [ ] Message passing format

---

## 🧠 FÁZA 4: RAG & Intelligence (Day 5-6) — MEMORY

### 4.1 RAG Infrastructure
- [ ] `sqlite-vec` installation
- [ ] Vector database setup
- [ ] Embedding model (local)
- [ ] Indexing pipeline:
  - [ ] Daily logs → vectors
  - [ ] Meeting notes → vectors
  - [ ] Ideas → vectors

### 4.2 Query Engine
- [ ] Semantic search implementation
- [ ] "Čo sme riešili s X pred Y?" handler
- [ ] Context retrieval for conversations

### 4.3 Automated Indexing
- [ ] Cron job: index new content every 6h
- [ ] Real-time indexing for critical notes

---

## ⚙️ FÁZA 5: Automation & Rituals (Day 6-7) — SYSTEM

### 5.1 03:00 System Clean (CRON)
**Components:**
- [ ] Cleanup `+/` inbox
- [ ] Calculate XP for previous day
- [ ] Generate Morning Brief docs
- [ ] Check all tasks, calendar, CRM
- [ ] Git commit all changes
- [ ] RSS feed update
- [ ] Astro rebuild (if needed)
- [ ] Prepare dashboard data

### 5.2 30-Minute Monitor
- [ ] Background process
- [ ] Priority task checking
- [ ] Context-aware reminders

### 5.3 XP System
- [ ] XP calculation engine
- [ ] Level progression
- [ ] Streak tracking
- [ ] Historical charts

---

## 🌐 FÁZA 6: Public Presence (Week 2) — VISIBILITY

### 6.1 Astro Website
- [ ] Landing page (xvadur.com)
- [ ] Blog section (z Obsidian notes)
- [ ] Dashboard (live data z CRM)
- [ ] RSS feed generation

### 6.2 GitHub Public
- [ ] `xvadur-singularity` repo
- [ ] Documentation
- [ ] Open source components

### 6.3 Content Pipeline
- [ ] Auto-publish z Obsidian
- [ ] Scheduled posts
- [ ] Cross-platform sync

---

## 📦 Infrastructure Requirements

### Binaries/Tools
- [ ] `obsidian-cli` — installed ✓
- [ ] `sqlite-vec` — pending
- [ ] `node` + `npm` — for Astro
- [ ] `git` — configured ✓

### API Keys/Auth
- [ ] Linear API — configured ✓
- [ ] Google OAuth (gog) — needs re-auth
- [ ] Brave Search API — pending
- [ ] GitHub token — pending
- [ ] OpenRouter (for Kimi) — pending

### Storage
- [ ] Local SQLite — ✓
- [ ] GitHub repos — pending setup
- [ ] Obsidian vault — ✓
- [ ] Astro build — initialized ✓

---

## 🎯 CRITICAL PATH (Čo blokuje ostatné)

1. **sqlite-vec setup** → Blocks RAG
2. **Linear hard-coding** → Blocks `/linear`, `/plan`
3. **Agent spawner config** → Blocks `/obsidian properties`
4. **03:00 cron setup** → Blocks automation
5. **Astro content integration** → Blocks public presence

---

## 💡 Estimated Effort

| Fáza | Čas | Priorita |
|------|-----|----------|
| 1. Foundation | 4h | 🔴 Critical |
| 2. Tool Integration | 8h | 🔴 Critical |
| 3. Multi-Agent | 6h | 🟡 High |
| 4. RAG | 4h | 🟡 High |
| 5. Automation | 4h | 🟢 Medium |
| 6. Public | 8h | 🔵 Low (Week 2) |

**Celkom: 26-30h práce** (rozdelené cez týždeň)

---

## 🚀 NEXT ACTION

**Zajtra ráno ( prioritized):**
1. Install `sqlite-vec`
2. Setup RAG infrastructure
3. Extend SQLite schema
4. Test `/sleep in/out` commands

**Súhlasíš s týmto plánom? Chceš začať Fázu 1 teraz, alebo máš priority inak?** 🦾⚡️
