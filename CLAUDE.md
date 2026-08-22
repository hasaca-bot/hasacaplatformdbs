# TADA Project — Claude Operating Instructions

> **Platform Name:** tada (formerly HASACA)  
> **Repository:** `https://github.com/hasaca-bot/hasacaplatformdbs` (Functional Source of Truth)  
> **Long-Term Memory Vault:** `C:\HASACA-beyin` (Interconnected Obsidian Knowledge Base)  
> **Local Server:** Port `12999` (`npm run dev` in `backend/` or `START ADMIN.bat`)

---

## 1. Operating Principles

1. **Source Code is the Truth:** The actual code in this repository defines what the system does. Inspect the relevant files before making assumptions.
2. **Obsidian is Long-Term Memory:** Read notes from `C:\HASACA-beyin` for architecture, design tokens, bug history, and past decisions.
3. **Progressive Context Loading:** Never load the entire Obsidian vault or entire codebase at once.
   - Step 1: Read `C:\HASACA-beyin\00_CORE\CURRENT-STATE.md`.
   - Step 2: Classify the task and follow links to relevant feature/architecture notes.
   - Step 3: Inspect specific source code files in this repository.
   - Step 4: Implement and verify.
   - Step 5: Update relevant Obsidian notes after significant changes.
4. **Reusable Skills:** Reusable executable skills live in `.agents/skills/` (see `07_SKILLS/SKILL-INDEX.md` in Obsidian). Read them on demand; do not copy duplicate skill files.
5. **No Fabrication:** Never invent endpoints, database columns, routes, or historical rationale. If unknown, mark as "Unknown — requires verification."
6. **Preserve Isolation:** Never perform destructive actions, modify unrelated files, or push to GitHub without explicit user approval.