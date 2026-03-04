/ralph-loop "You are setting up the Swarm Orchestrator v3 — a fully autonomous multi-repo coding agent system. All source files are already in this folder. Your job is to get EVERYTHING working end-to-end so the user can double-click a launcher, see a beautiful dashboard at localhost:6969, and manage autonomous coding agents across multiple repos.

## FILES ALREADY HERE:
- orchestrator.py — Python backend (API server on port 6969 + multi-repo orchestrator engine)
- swarm-dashboard.jsx — React dashboard (Los Lunas cartoon style, 9 tabs, repo cards on home page)  
- setup.sh — Dependency installer (ruflo, ralph-wiggum, whisper, permissions, desktop shortcuts)
- launch-swarm.sh — Mac/Linux launcher (starts backend + opens browser)
- launch-swarm.bat — Windows launcher
- Swarm Orchestrator.command — macOS Finder double-click launcher
- create-shortcut.ps1 — Windows desktop shortcut creator
- CLAUDE.md — System documentation

## WHAT YOU NEED TO DO:

### 1. SERVE THE DASHBOARD
The React JSX dashboard needs to be served as a real web page. Create an index.html that:
- Loads React 18 via CDN (react, react-dom, babel standalone)
- Loads the fonts: Bangers + Fredoka from Google Fonts
- Embeds or loads swarm-dashboard.jsx as a Babel JSX script
- Renders the Dashboard component into a root div
- Has proper viewport meta, title 'Swarm Town', favicon emoji
- The HTML must work by just opening it in a browser OR being served

### 2. INTEGRATE DASHBOARD SERVING INTO THE BACKEND
Modify orchestrator.py so the API server on port 6969 ALSO serves:
- GET / → serves index.html
- GET /swarm-dashboard.jsx → serves the JSX file
- All /api/* routes continue working as-is
This way localhost:6969 shows the dashboard AND handles the API. Single port, no CORS issues.

### 3. FIX AND VERIFY THE BACKEND
- Make sure orchestrator.py runs clean with: python3 orchestrator.py --server-only
- Fix any syntax errors, import issues, or Python version problems
- Verify all API endpoints return valid JSON
- Test: curl http://localhost:6969/api/repos should return []
- Test: POST a repo, GET it back, POST an item, GET it back
- Make sure the SQLite databases get created properly (master DB + per-repo DBs)
- Verify the static file serving works: curl http://localhost:6969/ should return HTML

### 4. MAKE THE LAUNCHERS WORK
- chmod +x all .sh and .command files
- Verify launch-swarm.sh starts the backend and opens the browser
- Make sure the launchers use the correct path to orchestrator.py (same directory)

### 5. CREATE A DESKTOP ICON
- Detect the OS (macOS vs Linux vs Windows/WSL)
- For macOS: copy 'Swarm Orchestrator.command' to ~/Desktop, chmod +x it
- For Linux: create a .desktop file on ~/Desktop
- For Windows: advise running create-shortcut.ps1

### 6. TEST THE FULL FLOW
- Start the server: python3 orchestrator.py --server-only
- Verify http://localhost:6969 loads the dashboard
- Verify the dashboard connects (green LIVE indicator)
- Test adding a repo via the API
- Test adding an item via the API
- Test that the dashboard displays them
- Kill the server when tests pass

### 7. VALIDATE EVERYTHING
Run through this checklist:
- [ ] index.html exists and loads dashboard correctly
- [ ] orchestrator.py serves both static files and API on port 6969
- [ ] All 14+ API endpoints work (repos, items, plan, logs, agents, memory, mistakes, audio, start, stop, push, state)
- [ ] SQLite databases create correctly with WAL mode
- [ ] Dashboard JSX has no syntax errors
- [ ] Launchers are executable
- [ ] Desktop shortcut created
- [ ] curl localhost:6969 returns the dashboard HTML
- [ ] curl localhost:6969/api/repos returns valid JSON

## CRITICAL RULES:
- Do NOT change the visual style of the dashboard — it's a Los Lunas cartoon theme with Bangers/Fredoka fonts, bold colors, thick borders, desert vibes
- Do NOT change the API port — it MUST be 6969
- Do NOT remove any features — all 9 tabs must work (Home/Town Square, Road Map/Flow, Bounty Board/Items, Build Plan, Voice Review/Audio, The Crew/Agents, Memory, Mistakes, Logs)
- The home page MUST show all repos as cards with stats, progress bars, start/stop buttons
- Audio recording in the browser MUST work (MediaRecorder API)
- The START ALL button must be prominent on the home page
- Keep the state machine flow map SVG working with active state highlighting + animation
- Use grep to check existing code before making changes
- After ANY change, test that the server still starts and serves correctly

## COMPLETION CRITERIA:
You are DONE when:
1. python3 orchestrator.py --server-only starts without errors
2. http://localhost:6969 shows the full cartoon-style dashboard
3. All API endpoints return valid responses
4. The dashboard live-updates every 3 seconds
5. Desktop launcher exists and works
6. You can add a repo, add items, and see them reflected in the UI

Output SWARM_TOWN_READY when everything works." --max-iterations 15 --completion-promise "SWARM_TOWN_READY"

