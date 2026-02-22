# SKILLS-CHEATSHEET.md

Rýchly prehľad všetkých 28 skillov v Jarvis/Chat runtime.

**Posledná aktualizácia:** 2026-02-22  
**Celkový počet:** 28 skills  
**Lokácia:** `~/.openclaw/skills/`

---

## 🚀 KRITICKÉ (Top 8)

### 1. n8n
**Čo robí:** Workflow automation & integrations  
**Použitie:** Riadenie n8n workflow, webhooky, executions  
**API Key:** ✅ N8N_API_KEY + N8N_BASE_URL  
**Príklad:**
```bash
# List workflows
python3 ~/.openclaw/skills/n8n/scripts/n8n_api.py workflows list

# Trigger workflow
python3 ~/.openclaw/skills/n8n/scripts/n8n_api.py executions trigger <workflow_id>
```

### 2. github
**Čo robí:** GitHub CLI operations  
**Použitie:** PRs, issues, repos, actions  
**CLI:** ✅ gh  
**Príklad:**
```bash
gh pr list --repo xvadur/chat
gh issue create --title "Bug fix" --body "Description"
```

### 3. google-calendar
**Čo robí:** Google Calendar API  
**Použitie:** Events, scheduling, reminders  
**API Key:** ✅ OAuth (adam@xvadur.com)  
**Príklad:**
```bash
python3 ~/.openclaw/skills/google-calendar/scripts/google_calendar.py list
```

### 4. cloudflare-toolkit
**Čo robí:** DNS, SSL, zone management  
**Použitie:** Domains, DNS records, SSL settings, tunnels  
**API Key:** ✅ CLOUDFLARE_API_TOKEN  
**Príklad:**
```bash
~/.openclaw/skills/cloudflare-toolkit/scripts/cf.sh zones
~/.openclaw/skills/cloudflare-toolkit/scripts/cf.sh dns-list <zone_id>
```

### 5. supabase
**Čo robí:** Database & vector operations  
**Použitie:** SQL queries, CRUD, vector search, storage  
**API Key:** ✅ SUPABASE_SERVICE_KEY  
**Príklad:**
```bash
~/.openclaw/skills/supabase/scripts/supabase.sh query "SELECT * FROM users LIMIT 5"
~/.openclaw/skills/supabase/scripts/supabase.sh tables
```

### 6. brave-search
**Čo robí:** Web search bez browsera  
**Použitie:** Documentation, research, fact-checking  
**API Key:** ✅ BRAVE_API_KEY  
**Príklad:**
```bash
node ~/.openclaw/skills/brave-search/search.js "query" -n 5 --content
```

### 7. free-ride
**Čo robí:** Free AI models cez OpenRouter  
**Použitie:** Zníženie nákladov na AI  
**API Key:** ✅ OPENROUTER_API_KEY  
**Príklad:**
```bash
# Použitie v skills — automaticky vyberá free modely
```

### 8. linear
**Čo robí:** Task management  
**Použitie:** Issues, projects, team coordination  
**API Key:** ✅ LINEAR_API_KEY  
**Príklad:**
```bash
# Via API alebo web
```

---

## 💼 BUSINESS/OPS

### 9. airtable
**Čo robí:** Database & collaboration  
**API Key:** ✅ AIRTABLE_API_KEY

### 10. calendar-business
**Čo robí:** adam@xvadur.com calendar  
**Poznámka:** Legacy skill, teraz preferuj google-calendar

### 11. calendar-personal  
**Čo robí:** yksvadur.ja@gmail.com calendar  
**Poznámka:** Legacy skill

### 12. crm
**Čo robí:** Contact management  
**Lokácia:** `workspace/crm/pcrm.sqlite`  
**Script:** `workspace/systems/local-scripts/crm.sh`

### 13. gmail-business
**Čo robí:** adam@xvadur.com email

### 14. gmail-personal
**Čo robí:** yksvadur.ja@gmail.com email

---

## 🤖 AI/CONTENT

### 15. humanizer
**Čo robí:** Odstráni AI writing patterns  
**Použitie:** Copywriting, natural text  
**API Key:** ❌ Žiadny (guidelines only)

### 16. news-summary
**Čo robí:** RSS + AI daily briefings  
**Použitie:** BBC, Reuters, NPR, Al Jazeera  
**API Key:** ✅ OPENROUTER + ElevenLabs  
**Príklad:**
```bash
curl -s "https://feeds.bbci.co.uk/news/world/rss.xml"
# + OpenRouter summarization
```

### 17. prompt-engineering-expert
**Čo robí:** Prompt optimization  
**Použitie:** Lepšie prompty pre AI  
**API Key:** ❌ Žiadny (guidelines only)

### 18. self-improving-agent
**Čo robí:** Učenie sa z chýb  
**Použitie:** Automatické vylepšovanie  
**API Key:** ❌ Žiadny (pasívny)

### 19. youtube-transcript
**Čo robí:** YouTube transkripcie  
**Použitie:** Sťahovanie titulkov

---

## 💻 DEV/TECH

### 20. frontend-design
**Čo robí:** Astro web dev guidelines  
**Použitie:** Design systém, Tailwind, components  
**API Key:** ❌ Žiadny

### 21. opencode-controller
**Čo robí:** OpenClaw session control  
**Použitie:** Slash commands, model switching  
**API Key:** ❌ Žiadny

### 22. yahoo-finance
**Čo robí:** Stock data  
**Použitie:** Ceny, fundamentals, earnings  
**API Key:** ❌ Zadarmo (yfinance)

---

## 📱 UTILITY/COMMUNICATION

### 23. blogwatcher
**Čo robí:** RSS/Atom monitoring  
**CLI:** ✅ blogwatcher  
**Príklad:**
```bash
blogwatcher list
blogwatcher watch https://example.com/feed.xml
```

### 24. gifgrep
**Čo robí:** GIF search & extraction  
**CLI:** ✅ gifgrep  
**Príklad:**
```bash
gifgrep search "query"
gifgrep still ./clip.gif --at 1.5s -o still.png
```

### 25. imsg
**Čo robí:** iMessage/SMS z terminálu  
**CLI:** ✅ imsg  
**Príklad:**
```bash
imsg list
imsg send "+421..." "message"
```

### 26. goplaces
**Čo robí:** Google Places API  
**API Key:** ✅ GOOGLE_PLACES_API_KEY

### 27. morning-brief
**Čo robí:** Denný briefing  
**Poznámka:** Legacy skill, teraz preferuj news-summary

### 28. slash-commands
**Čo robí:** Command routing  
**Použitie:** `/crm`, `/linear`, `/gog`, atď.

---

## 🔑 API KEYS REFERENCE

| Premenná | Hodnota (ukážka) | Skill |
|----------|------------------|-------|
| N8N_API_KEY | eyJhbGc... | n8n |
| N8N_BASE_URL | https://xvadur.app.n8n.cloud/ | n8n |
| OPENROUTER_API_KEY | sk-or-v1-... | free-ride, news-summary |
| CLOUDFLARE_API_TOKEN | l4Dul4Vb... | cloudflare-toolkit |
| SUPABASE_URL | https://lapuakam... | supabase |
| SUPABASE_SERVICE_KEY | eyJhbGc... | supabase |
| GOOGLE_CLIENT_ID | 987454869331... | google-calendar |
| GOOGLE_CLIENT_SECRET | GOCSPX-k4yKb... | google-calendar |
| GOOGLE_REFRESH_TOKEN | 1//03xNmw... | google-calendar |
| AIRTABLE_API_KEY | patAGBXt... | airtable |
| LINEAR_API_KEY | lin_api_BDHt... | linear |
| BRAVE_API_KEY | BSAzeV6u... | brave-search |

---

## 🖥️ CLI TOOLS

| Tool | Príkaz | Použitie |
|------|--------|----------|
| gh | `brew install gh` | GitHub CLI |
| imsg | `brew install imsg` | iMessage/SMS |
| gifgrep | `brew install gifgrep` | GIF search |
| blogwatcher | `go install ...` | RSS monitoring |

---

## 🗑️ ABORTED

- **reddit** — Nepotrebný (nahradený inými tools)
- **spotify-player** — Vyžaduje Spotify Premium

---

## 💡 QUICK WINS

1. **Denný news briefing:** `news-summary` → RSS → OpenRouter summary
2. **GitHub ops:** `github` + `gh` CLI
3. **Infra management:** `cloudflare-toolkit` + `supabase`
4. **Copywriting:** `humanizer` + `prompt-engineering-expert`
5. **Automation:** `n8n` workflows
6. **iMessage:** `imsg` send "+421..." "message"

---

*Pre detailné použitie pozri: `~/.openclaw/skills/[skill]/SKILL.md`*
