# Ruflo README Feature Matrix

- Source README: `https://github.com/ruvnet/ruflo`
- Source commit inspected: `15664e0727799b8d9e5b43e7a1e878f1ff62949f`
- Purpose: drive local Ruflo/Claude integration tests from the upstream README instead of relying on stale assumptions.

## Buckets

### Locally testable now

- Core bootstrap and health: `init`, `doctor`, `config`
- Claude integration surfaces: `mcp`, `hooks`, `guidance`
- Multi-agent orchestration: `swarm`, `hive-mind`, `route`, `agent`, `task`, `session`
- Intelligence stack: `memory`, `embeddings`, `neural`
- Operational tooling: `performance`, `analyze`, `workflow`, `daemon`, `process`
- Governance and collaboration: `issues`, `claims`
- Plugin SDK scaffolding and local plugin management

### External or credential-gated

- Provider connectivity and usage that requires `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_GEMINI_API_KEY`, or similar
- GitHub-backed workflows that require `GITHUB_TOKEN`
- RuVector PostgreSQL bridge commands that require a configured PostgreSQL target
- IPFS / Web3 plugin and pattern transfer paths that require `WEB3_STORAGE_TOKEN`, `W3_TOKEN`, `IPFS_TOKEN`, `PINATA_API_KEY`, or `PINATA_API_SECRET`

### Cloud or remote-integration only

- Flow Nexus deployment and sandboxes
- Remote MCP integrations for ChatGPT and hosted clients
- IDE-specific MCP wiring for Claude Desktop, VS Code, Cursor, Windsurf, JetBrains, and Google AI Studio

### Marketing claims that need indirect validation

- Token efficiency claims
- Speedup claims for Agent Booster, HNSW, RuVector, Flash Attention, and AIDefence
- Success-rate and routing-accuracy claims
- Cost-reduction claims

## Test Strategy

1. Run exact README example commands first.
2. If a README example fails, run a fallback command using the current CLI syntax when known.
3. Classify outcomes as:
   - `working_as_documented`
   - `docs_drift_current_cli_works`
   - `broken_readme_command`
   - `broken_both`
   - `skipped`
4. Run Claude Code coding tasks on synthetic fixtures under selected Ruflo variants to measure:
   - code quality
   - token use
   - speed
   - end-result correctness

## Current Harness

- Script: [scripts/ruflo_readme_experiment.py](/C:/Users/hotre/OneDrive/Desktop/Coding%20Projects/swarm-town/scripts/ruflo_readme_experiment.py)
- Live outputs: `benchmark-results/ruflo-readme-experiment/`
