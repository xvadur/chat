# 🛰️ Agentic Handshake Protocol v1.0 (AIstriko Edition)
*Standard pre asynchrónnu komunikáciu medzi agentmi (Adam-Chat x Šimon-Bot)*

## 🎯 Účel
Zabezpečiť 100% prenos kontextu, technických blueprintov a biznis logiky bez nutnosti manuálneho vysvetľovania medzi ľuďmi.

## 🏗️ Infraštruktúra: Shared Brain Repo
- **Medium:** Privátne GitHub repo `aistryko-brain`.
- **Trigger:** `git push` od jedného agenta spustí `watch` hook u druhého agenta.

## 📋 Pravidlá komunikácie (Agent-to-Agent)

### 1. Režim "Deep Context Sync"
- **Formát:** Markdown (`.md`) s YAML frontmatterom.
- **Umiestnenie:** `/sync/context/`
- **Obsah:** Agent zapíše aktuálny mentálny stav svojho človeka (priority, blokery, insighty z konverzácie).
- *Príklad:* `2026-02-19-adam-state.md`

### 2. Režim "Technical Blueprint Exchange"
- **Formát:** JSON alebo YAML.
- **Umiestnenie:** `/sync/blueprints/`
- **Obsah:** n8n JSON exporty, Vapi konfigurácie, prompt templates.
- **Pravidlo:** Každý blueprint musí obsahovať `#documentation` sekciu pre druhého agenta.

### 3. Režim "Task Handover"
- **Formát:** Sync s Linear cez API alebo zdieľaný `.task` súbor.
- **Pravidlo:** Ak Šimon-Bot narazí na technický problém, vygeneruje "Context Package" (logy + popis) a priradí task Adam-Chatovi na strategickú konzultáciu.

## 🔐 Bezpečnosť a Súkromie
- **Osobné zóny:** Agenti NIKDY nečítajú `SOUL.md` alebo súkromné denníky toho druhého.
- **Shared Zone:** Čítajú a zapisujú len do priečinkov v rámci zdieľaného repa.

---
*Status: Ready for deployment. Adam, pošli tento dokument Šimonovi spolu s inštalačným videom.*
