# XP SYSTÉM — Jarvis Tracker

## Základné pravidlá

### Denné aktivity — XP

| Aktivita | XP | Podmienka |
|---------|-----|-----------|
| Deep Work 1h | +50 | 60+ min bez prerušenia |
| Cvičenie | +30 | 1x |
| Cvičenie 4x/týždeň | +20 | Streak bonus |
| Task hotový (Low) | +20 | Nízka priorita |
| Task hotový (Medium) | +35 | Stredná priorita |
| Task hotový (Critical) | +50 | Kritická priorita |
| Outreach | +25 | 1 klient oslovený |
| Karol | +20 | Návšteva |
| Morning Brief | +10 | Automaticky |
| Evening Brief | +10 | Automaticky |

### Multiplikátory

| Stav | Multiplier | Aktivácia |
|------|------------|-----------|
| Streak 3+ dní | x1.2 | 3 dni po sebe 50+ XP |
| Flow 8+/10 | x1.5 | Subjektívny flow score |
| Focus Purity <30% | x0.5 | Prokrastinácia |
| Spánok po 4:00 | x0.8 | Sleep debt |

### Tresty

| Čo | Trest |
|----|-------|
| Infra setup bez výsledku | -20 XP |
| Deep work pod 2h | -15 XP |
| 0 outreach | -10 XP |
| Spánok po 6:00 | -25 XP |

---

## Level System

| Level | XP celkovo | Titul |
|-------|------------|-------|
| 1 | 0 | Nováčik |
| 2 | 200 | Začiatočník |
| 3 | 500 | Robotník |
| 4 | 1,000 | Špecialista |
| 5 | 2,500 | Majster |
| 6 | 5,000 | Expert |
| 7 | 10,000 | Mistr |
| 8 | 25,000 | Legenda |
| 9 | 50,000 | XVADUR |

---

## Denný report — šablóna

```
┌─────────────────────────────────────┐
│  XP REPORT — [DÁTUM]                │
├─────────────────────────────────────┤
│  Získal: [X] XP                     │
│  Level: [N] ([X/N] do ďalšieho)    │
│  Streak: 🔥 X dní                   │
├─────────────────────────────────────┤
│  Deep Work: Xh Xm (target: 4h)     │
│  Cvičenie: X/X                      │
│  Tasks: X hotové / Y začaté        │
│  Outreach: X                        │
├─────────────────────────────────────┤
│  [ZOZNAM AKTIVÍT S XP]              │
├─────────────────────────────────────┤
│  Zajtra: [KALENDÁR]                │
└─────────────────────────────────────┘
```

---

## Ako používať

| Slash | Čo |
|-------|-----|
| `/log [text]` | Loguj aktivitu — ja pridelím XP |
| `/task [text]` | Nový task |
| `/brief` | Ručný brief |

---

## Kalendár — farby

| Kalendár | Farba | Event Color ID |
|----------|-------|----------------|
| karol | Zlatá | 5 (#fbd75b) |
| business | Červená | 3 (#f83a22) |
| xvadur | Ametyst | 17 (#9a9cff) |
| ulohy | Levandulová | 18 (#b99aff) |

---

## Kde to žije

- Denné logy: `memory/log-YYYY-MM-DD.md`
- Celkový stav: `MEMORY.md`
- Tento súbor: `memory/xp-system.md`

---

*Vytvorené: 2026-02-15*
