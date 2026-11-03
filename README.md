# Awwwards MCP Agent Skills

Seven agent skills for building, studying, and repairing websites with
[`awwwards-mcp`](https://github.com/INSANE0777/Awwwards-mcp) — a free MCP server
that searches award-winning sites, captures live pages, and measures motion and
structure.

These skills are workflow instructions, not a standalone tool. They teach an
agent the order to call the MCP tools in, what evidence to collect, what to
ignore, and how to verify a build against a real reference.

## Requirements

- Node.js **22.13 or newer** (the MCP server's engine requirement).
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

Each installed skill is self-contained: its directory carries `SKILL.md`, the
`v2-routing.md` reference it links to, and — for the two skills that use it —
`_memory/techniques.json`. If you install by hand, copy the whole
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
| **awwwards-doctor** | The MCP is blocked, parsers drifted, captures fail, searches are empty, or the cache is stale — diagnose, fix what is mechanical, and recover the user's in-flight task. |

## MCP profiles

The server reads `AWWWARDS_MCP_PROFILE` once at startup. Set it in the server
`env` and restart after changing it.

| Profile | Tools | Surface |
|---|---|---|
| `full` (default) | 41 | Every 1.x tool. Examples in the skills use these names. |
| `core` | 13 | Build-loop subset, including `get_annual_categories`. |
| `v2` | 15 | 10 consolidated tools plus 5 retained flat tools. |

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

## Repo-checkout-only commands

Some skills mention scripts that live only in the
[awwwards-mcp source repository](https://github.com/INSANE0777/Awwwards-mcp):
`scripts/doctor.mjs`, `scripts/parser-drift-probe.mjs`,
`scripts/record-scrollthrough.mjs`, and `scripts/skill-memory.mjs`. They are not
part of this skills repository and are not shipped in the npm package. The
skills label those steps **repo-checkout only**; everything else works with the
installed or `npx` server.

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
