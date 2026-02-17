---
name: morning-brief
description: Spraviť ranný brief so searchom za predchádzajúci deň zo správ, tech a politiky. Použi keď Adam žiada "morning brief" alebo "sprav research za včerajší deň".
---

# Morning Brief Protocol

## Kedy použiť

Keď Adam žiada "morning brief", "ranný brief", "research za včerajší deň" alebo podobne.

## Kroky

1. **Zisti dátum včerajška** — odpočítaj 1 deň od dneška
2. **Sprav 3 web searchy** cez brave-search skill:
   - World news: `"world news [datum]"` (napr. "February 16 2026")
   - Tech: `"tech news AI technology [datum]"`
   - Politika: `"politics Europe [datum]"`
3. **Vytvor brief** s hlavnými správami
4. **Logni XP** do memory file

## Format briefu

```
# ☀️ RANNÝ BRIEF — [DÁTUM]

## 📰 WORLD NEWS
- [správa 1]
- [správa 2]

## 💻 TECH
- [správa 1]
- [správa 2]

## 🏛️ POLITIKA
- [správa 1]
- [správa 2]
```

## XP

| Aktivita | XP |
|----------|-----|
| Research | +20 |
| Brief | +10 |

## Poznámka

Ak je nedeľa alebo pondelok, hľadaj za piatok (pretože vikend nie sú správy).