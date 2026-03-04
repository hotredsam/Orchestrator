# PROMPT 1: Queue this FIRST — Install Ruflo + Claude Code
# ──────────────────────────────────────────────────────────

I realized you may not have actually installed Ruflo or Claude Code CLI. Before doing anything else, verify and install ALL of these dependencies. Do not skip any. Do not assume they are already installed. Actually run the install commands and verify each one works.

1. Install Claude Code globally: npm install -g @anthropic-ai/claude-code
   Verify: claude --version (must print a version)

2. Install Ruflo v3: Run the official installer:
   curl -fsSL https://cdn.jsdelivr.net/gh/ruvnet/claude-flow@main/scripts/install.sh | bash -s -- --full
   If that fails, fall back to: npm install -g claude-flow@alpha
   Then also: npm install -g ruflo@latest
   Verify: npx ruflo --version (must print a version)

3. Clone the ruflo repo for reference: git clone https://github.com/ruvnet/ruflo.git into a temp folder, read the README.md and the Quick Start wiki page at https://github.com/ruvnet/ruflo/wiki/Quick-Start — understand how hive-mind init, hive-mind spawn, orchestrate, sparc, memory, and mcp tools work. Then verify these commands actually run:
   - npx ruflo init --help
   - npx ruflo hive-mind --help  
   - npx ruflo orchestrate --help
   - npx ruflo sparc --help
   - npx ruflo memory --help
   - npx ruflo mcp tools list
   - npx ruflo health check

4. Install Ralph Wiggum plugin: claude plugin install ralph-wiggum@claude-plugins-official
   If the plugin system doesn't exist in your version, note it and move on.

5. Install Whisper: pip install openai-whisper --break-system-packages
   Verify: whisper --help

6. Install pytest: pip install pytest --break-system-packages

7. Verify all orchestrator Python imports work: cd into the project folder and run python3 -c "import orchestrator; print('OK')"

8. Make sure the orchestrator.py references to ruflo commands match the actual CLI syntax. Read the ruflo README you cloned and compare the subprocess calls in orchestrator.py to make sure the command names, flags, and argument order are correct. Fix any mismatches. For example verify whether the command is "npx ruflo" or "npx claude-flow" or just "ruflo", whether hive-mind uses spawn or start, and what flags are available.

Take a screenshot after each install showing it succeeded. If anything fails, use a ralph loop 5x to get it installed and working before moving on to the next one.


# ──────────────────────────────────────────────────────────
# PROMPT 2: Queue this SECOND — Run 100 tests
# ──────────────────────────────────────────────────────────

There is a file called test_swarm.py in the project folder with 100 tests organized in 9 groups covering: Ruflo CLI installation (15 tests), Claude Code CLI (10 tests), per-repo database operations (20 tests), master database (7 tests), state machine (16 tests), command runner (10 tests), credit exhaustion recovery (6 tests), API server endpoints (11 tests), and multi-repo manager (5 tests).

First, make sure the orchestrator server is running in the background on port 6969 so the API tests can hit it. Start it with: python3 orchestrator.py --server-only &

Then run the full test suite: python3 -m pytest test_swarm.py -v --tb=short 2>&1 | tee test_results.txt

If any tests fail, use a ralph loop 10x to fix the issues. The failures might be in orchestrator.py (wrong method signatures, missing imports, broken subprocess calls), in the test file (bad assumptions about API), or in missing dependencies. Fix the ROOT CAUSE in orchestrator.py — do not just patch the tests to pass. After fixing, rerun the full suite. Keep going until you get at least 90 out of 100 tests passing. The only acceptable skips are the API tests (85-95) if the server isn't responding, and the Ralph plugin test if the plugin system doesn't exist.

After the test suite passes, take a screenshot of the pytest output showing the results. Then run the server and take a screenshot of the dashboard at localhost:6969 to confirm the UI still works after any fixes.
