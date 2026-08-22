# TADA Project — Agent & Codex Operating Instructions

> **Platform Name:** tada (formerly HASACA)  
> **Repository:** `https://github.com/hasaca-bot/hasacaplatformdbs` (Functional Source of Truth)  
> **Long-Term Project Memory:** `C:\HASACA-beyin` (Obsidian Knowledge Vault)

---

## 1. Operating Protocol

1. **Source of Truth:** The repository codebase is the primary functional truth.
2. **Long-Term Memory Access:**
   - When direct filesystem access is available, consult `C:\HASACA-beyin\00_CORE\CURRENT-STATE.md` to identify the current phase, active work, and priorities.
   - **Environment Limitation Notice:** If running in a sandboxed execution environment where `C:\HASACA-beyin` is outside the visible filesystem, rely on `development-logs/development-status.md` and repository documentation as in-repo memory fallbacks.
3. **Progressive Context Loading:** Only inspect files directly relevant to the current task.
4. **Skills:** Utilize domain skills located in `.agents/skills/` without copying or duplicating them.
5. **Memory Maintenance:** When completing significant architectural, feature, or bug-fix tasks, record the updates in `C:\HASACA-beyin` (or notify the user if direct access is unavailable).
6. **No Fabrication:** Strictly adhere to verified source code behaviors and existing schemas.