# HEARTBEAT.md

## Daily operator loop (every ~30-60 min, daytime only)

1. Check latest `memory/YYYY-MM-DD.md` entries and keep timeline consistent.
2. If new tasks/commitments appear in chat, capture them into the day log.
3. If there are unresolved execution items, prepare concise next-step prompt.
4. Check CRM open reminders (`workspace/crm/pcrm.sqlite`) and flag overdue follow-ups.
5. If CRM follow-up has fixed time, ensure calendar scheduling exists.
6. If CRM follow-up is execution-heavy, ensure a Linear task exists.
7. Do lightweight Obsidian hygiene pass: route obvious notes from `+` inbox and flag misnamed/misplaced notes.
8. For template usage, prefer Obsidian template sources over workspace-local copies.
9. Avoid spam: only ping user when there is a blocker, deadline risk, or high-value alert.
10. Keep quiet at night unless urgent.
