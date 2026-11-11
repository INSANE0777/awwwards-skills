# Awwwards MCP Agent Skills

Nine agent skills for building, studying, documenting, and repairing websites with
[`awwwards-mcp`](https://github.com/INSANE0777/Awwwards-mcp) — a free MCP server
that searches award-winning sites, captures live pages, and measures motion and
structure.

These skills are workflow instructions, not a standalone tool. They teach an
agent the order to call the MCP tools in, what evidence to collect, what to
ignore, and how to verify a build against a real reference.

Tested with `awwwards-mcp` **1.19.0**. The
`awwwards-design-md` skill requires the `publicOnly` capture contract added in
1.18.0; the `awwwards-atlas` skill requires the Atlas tools added in 1.19.0.
Do not run either against older servers.

The `skills` CLI version tested is **1.7.6**.

## Requirements

- Node.js **22.20 or newer** for the `skills` CLI (tested with 1.7.6); the MCP
  server itself requires **22.13+**. Node 22.20 covers both.
- An agent that supports skills and MCP servers. The install examples below use
  the [`skills`](https://skills.sh) CLI; any agent that reads a skill directory
  can use the same files.
- The `awwwards-mcp` server, installed globally or run through `npx`.

### Install the MCP server

Run it without a global install:

```bash
npx -y awwwards-mcp
```

Or install it globally, which is required for the optional browser capture
dependencies to resolve from the same place:

```bash
npm install -g awwwards-mcp
```

Register it with your agent:

```bash
# Claude Code
claude mcp add awwwards -- npx -y awwwards-mcp

# Codex CLI
codex mcp add awwwards -- npx -y awwwards-mcp
```

For OpenCode (`opencode.json`):

```json
{
  "mcp": {
    "awwwards": {
      "type": "local",
      "command": ["npx", "-y", "awwwards-mcp"]
    }
  }
}
```

For clients that use the `mcpServers` shape (Claude Desktop, Cursor, Windsurf,
Gemini CLI, Cline, Continue):

```json
{
  "mcpServers": {
    "awwwards": {
      "command": "npx",
      "args": ["-y", "awwwards-mcp"]
    }
  }
}
```

Restart the agent after registering the server.

## Install the skills

Pin both the CLI and a release tag for a reproducible install (use the newest
`skills-v*` tag):

```bash
npx skills@1.7.6 add INSANE0777/awwwards-skills@skills-v2026.11.11
```

Or follow the default branch:

```bash
npx skills add INSANE0777/awwwards-skills
```

The CLI prompts for scope and target agents. Non-interactive variants:

```bash
# One skill
npx skills add INSANE0777/awwwards-skills --skill recreate

# Several skills
npx skills add INSANE0777/awwwards-skills --skill recreate awwwards-setup

# All skills, all detected agents, no prompts
npx skills add INSANE0777/awwwards-skills --all

# Global (user-level) install
npx skills add INSANE0777/awwwards-skills -g

# Specific agent(s)
npx skills add INSANE0777/awwwards-skills -a claude-code
npx skills add INSANE0777/awwwards-skills -a claude-code codex

# Copy files instead of symlinking
npx skills add INSANE0777/awwwards-skills --copy

# List what the repo contains without installing
npx skills add INSANE0777/awwwards-skills -l

# Machine-readable install result
npx skills add INSANE0777/awwwards-skills --all --json
```

Each installed skill is self-contained: its directory carries `SKILL.md`,
`LICENSE`, the `v2-routing.md` reference it links to, and — for the two skills
that use it — `_memory/techniques.json`. If you install by hand, copy the whole
`skills/<name>/` directory, not only `SKILL.md`.

## The skills

| Skill | Use it when |
|---|---|
| **awwwards-setup** | First run on a machine: asks once about result density, viewport, captures, index, and winner watches, persists the answers to `~/.awwwards-mcp/preferences.json`, and wires the MCP server if it is missing. |
| **awwwards-inspiration** | You need design references before writing UI: search by color/tag/technology/award, build a design brief, browse annual awards, keep the local index fresh, or capture a named reference site. |
| **recreate** | The user gives a URL and asks to rebuild it: collect stack, band, component, token, image, and motion evidence, build a local study recreation, run the QA gate, then optionally convert to Vite/Astro/Next. |
| **awwwards-motion-study** | The reference has animation and you need the full capture → frame review → motion inventory → build → re-record loop, including what to record and what to skip. |
| **awwwards-section-loop** | You are rebuilding a multi-section page: plan from the band map, build one section, verify its band, lock it, and move on without compounding drift. |
| **motion-authoring** | You converted a project with `--authored` and must turn `motion.manifest.json` plus inert skeletons into real per-section/page motion with parity proof. |
| **awwwards-doctor** | The MCP is blocked, parsers drifted, captures fail, searches are empty, or the cache is stale - diagnose, fix what is mechanical, and recover the user's in-flight task. |
| **awwwards-design-md** | You need a cited DESIGN.md plus evidence sidecar for one public URL, using observed tokens, structure, screenshot, and up to three components - not an official brand system or recovered source tokens. |
| **awwwards-atlas** | You need the experimental Atlas section/component evidence layer: enable `AWWWARDS_MCP_ATLAS=1`, import or capture local evidence, search regions, inspect status, export an evidence pack, or maintain the Atlas cache. Atlas is opt-in; section labels and inferred component types are candidate-only. |

## MCP profiles

The server reads `AWWWARDS_MCP_PROFILE` once at startup. Set it in the server
`env` and restart after changing it.

| Profile | Tools | Surface |
|---|---|---|
| `full` (default) | 41 (45 with Atlas) | Every 1.x tool. Examples in the skills use these names. `AWWWARDS_MCP_ATLAS=1` adds the four experimental Atlas tools. |
| `core` | 13 | Build-loop subset, including `get_annual_categories`. Atlas does not change it. |
| `v2` | 15 (16 with Atlas) | 10 consolidated tools plus 5 retained flat tools. Atlas adds `export_evidence_pack` and branches on existing tools. |

Every skill links to its own copy of `v2-routing.md`, which maps each 1.x call to
the v2 request object. In a `v2` session, a 1.x tool name is a routing error, not
a broken install.

## Optional browser dependencies

Search, details, categories, and awards work without a browser. Live captures,
structure analysis, token export, image audits, motion recording, and the
instrumented build verification need Playwright and Chromium; motion recordings
also need ffmpeg:

```bash
npm install -g awwwards-mcp playwright ffmpeg-static
npm exec --global -- playwright install chromium
```

After installing these globally, register the installed `awwwards-mcp` command
instead of `npx -y awwwards-mcp` so the server and Playwright resolve from the
same install.

Optional extras:

- `spectorjs@0.9.33` enables the Spector adapter in 3D scene capture (one WebGL
  frame, command summaries, capped shader source). Without it, the adapter
  reports an install hint and the rest of the capture still succeeds.
- `webcrack` lets `analyze_bundle` de-obfuscate and unpack script chunks. Without
  it, bundle analysis still fetches and keyword-greps raw chunks.
- Performance audits use an installed Chrome or Edge over CDP rather than
  Playwright.

## Checkout-only commands

Some steps use scripts that are **not shipped in the installed copies**. Run
each from the checkout named below:

| Script | Checkout / working directory | Installed fallback |
|---|---|---|
| `scripts/doctor.mjs` | [awwwards-mcp](https://github.com/INSANE0777/Awwwards-mcp) — run `npm run doctor` from that repo's root | Update `awwwards-mcp` (or clear the npx cache) and restart; then use the doctor skill's backup + targeted reset (below) |
| `scripts/parser-drift-probe.mjs` | the same awwwards-mcp checkout (the doctor runs it) | none — attach the raw failing HTML to an MCP issue |
| `scripts/record-scrollthrough.mjs` | the same awwwards-mcp checkout (playwright + ffmpeg-static are its devDependencies) | `record_site_motion` MCP tool |
| `scripts/skill-memory.mjs` | **this** awwwards-skills checkout, repo root | none — the journal and distill step stay in the checkout |

The MCP npm package does not include the first three scripts, and an installed
skill copy does not include `skill-memory.mjs`. The skills label those steps
**repo-checkout only**; everything else works with the installed or `npx`
server.

## Safety and backups

The skills never ask you to delete the cache root. The manual reset in
`awwwards-doctor` backs up `$AWWWARDS_CACHE_DIR` (default `~/.awwwards-mcp`)
and moves only `cache.db*` aside: the search index rebuilds and watches must
be re-added. Setup
preferences (`preferences.json`), learned findings
(`skill-memory/findings.jsonl`) and captures (`images/`, `scene-captures/`) are
kept. The exact commands are in `skills/awwwards-doctor/SKILL.md`, section 3.

## Skill memory (checkout only)

`scripts/skill-memory.mjs` records lessons in a journal and folds recurring
ones into the installed copy's managed section. It accepts only the nine
shipped skill names and refuses paths outside the chosen skills dir.

```bash
node scripts/skill-memory.mjs record --skill awwwards-inspiration --phase verify \
  --symptom "..." --rule "..."
node scripts/skill-memory.mjs recall --skill awwwards-inspiration --dir ~/.claude/skills
node scripts/skill-memory.mjs distill --dir ~/.claude/skills
node scripts/skill-memory.mjs promote --skill awwwards-inspiration --dir ~/.claude/skills
node scripts/skill-memory.mjs stats
```

- `--dir` (or `AWWWARDS_SKILLS_DIR`) names the installed skills dir. If
  omitted, the helper picks the first existing of `~/.agents/skills`,
  `~/.claude/skills`, `~/.zcode/skills`, `~/.pi/agent/skills`, preferring one
  that already contains a shipped skill.
- `AWWWARDS_SKILL_MEMORY_DIR` relocates the journal (default
  `$AWWWARDS_CACHE_DIR/skill-memory`, else `~/.awwwards-mcp/skill-memory`).
- Update installed copies with `npx skills update`, then re-run `distill`; the
  journal is the source of truth and the managed section is rebuildable.
- There is no `sync` command: the `skills` CLI owns installed copies.

## Local validation

No dependencies. Run from the repo root:

```bash
node scripts/validate-skills.mjs
node --test scripts/skill-memory.test.mjs
```

`AWWWARDS_SKIP_NETWORK=1 node scripts/validate-skills.mjs` skips the network
check. Otherwise the validator compares every local `v2-routing.md` with the
raw fixture from `awwwards-mcp` tag `v1.19.0`; if the network is unavailable it
prints a skip instead of failing.

## Scope and fair use

These skills are for study and original work. Recreations produced with the
`recreate` skill must keep their study-build disclaimer, must not be deployed or
presented as original work, and must replace borrowed assets and obtain licenses
before publication. Captures and recordings are local study artifacts — do not
redistribute other people's site media.

## Status

- This repository is the skills source. It is not an npm package; install it with
  the `skills` CLI or copy the skill directories.
- `skills.sh` discovers and indexes repositories through CLI installs and
  telemetry. The homepage link points at
  `https://skills.sh/INSANE0777/awwwards-skills`, but this README does not claim
  that a listing is already live.

## License

MIT — see [LICENSE](LICENSE).

MCP server and skills: <https://github.com/INSANE0777/Awwwards-mcp>
