# unslop

An audit skill for coding agents that looks for the tells of AI-generated UI and turns each confirmed finding into a fix plan another agent can execute. The audit is read-only: it writes plans, not code changes.

This repository contains four parts:

| Part | Path | What it does |
|---|---|---|
| Skill | `skills/audit/` | The audit workflow an agent follows (more skills can sit beside it under `skills/`) |
| Plugin | `.claude-plugin/`, `.mcp.json` | Plugin and marketplace manifests for Claude Code and Codex; declares the canon MCP server |
| Detector | `scripts/detect.mjs`, `scripts/rules/` | Deterministic checks over CSS and markup, no network |
| Canon client | `scripts/canon-route.mjs`, `scripts/lib/` | Reads the rule canon over MCP and checks its checksums |

The public rule texts are in `canon/public/` (source) and `canon/public-generated/` (the files the MCP server serves; the endpoint serves `public-2026.10.04-12`, the version in this tree).

## Install

unslop ships as a plugin for Claude Code and Codex. The plugin installs the skill and connects the read-only canon MCP server (`https://oleg.design/unslop/mcp`); there is nothing else to configure. This repository is both the plugin and its marketplace catalog, for both clients.

Claude Code, in your shell:

```sh
claude plugin marketplace add 0design/unslop-skill
claude plugin install unslop@unslop
```

or inside a session: `/plugin marketplace add 0design/unslop-skill`, then `/plugin install unslop@unslop`. Start a new session and run `/unslop:audit` (or ask for an unslop audit). `claude mcp list` shows the server as `plugin:unslop:unslop`.

Codex:

```sh
codex plugin marketplace add 0design/unslop-skill
codex plugin add unslop@unslop
```

or run `/plugins` inside Codex and install unslop from the `unslop` marketplace. Start a new session and ask for an unslop audit; Codex lists the skill as `unslop:audit`. `codex mcp list` shows the `unslop` server.

The first step of every audit checks that the `unslop` server is connected and reports the canon version it serves. The routed canon helper needs Node.js 20 or newer and the MCP SDK. Claude Code installs the SDK with the plugin. In Codex, or wherever it is missing, the skill asks before it downloads anything, then installs a copy per plugin version into the plugin data directory (Claude Code: `${CLAUDE_PLUGIN_DATA}`; Codex: `~/.codex/plugins/data/unslop`, a location this plugin chooses because Codex exposes no data directory to skills). Without consent the audit reports that no verified canon is available and issues no pass.

To remove: `claude plugin uninstall unslop@unslop` or `codex plugin remove unslop@unslop`.

## Canon over MCP

The canon is served read-only at:

```
https://oleg.design/unslop/mcp
```

It is a Streamable HTTP MCP endpoint with resources only (no tools). Health check: `https://oleg.design/unslop/mcp/health`.

Without the plugin, connect it by hand:

```sh
claude mcp add --transport http unslop https://oleg.design/unslop/mcp   # Claude Code
codex mcp add unslop --url https://oleg.design/unslop/mcp               # Codex
```

## Run from a clone

Requires Node.js 20 or newer. The package is not published to npm.

```sh
git clone <this repository> unslop
cd unslop
npm ci
```

Detector:

```sh
node scripts/detect.mjs path/to/project          # table
node scripts/detect.mjs path/to/project --json   # JSON
node scripts/detect.mjs path/to/project --rules B,G
```

Exit codes: `0` no red findings, `1` at least one red finding, `2` usage error.

Canon for a project (reads the index once, then only the topics that match the project's files):

```sh
node scripts/canon-route.mjs --project path/to/project
```

To install the plugin from a local clone instead of GitHub, add the clone directory as the marketplace:

```sh
claude plugin marketplace add ./unslop && claude plugin install unslop@unslop
codex plugin marketplace add ./unslop && codex plugin add unslop@unslop
```

## Tests

```sh
npm test                       # detector, canon client, MCP store, plugin manifests
```

## License

- Code and skill files: MIT, see [LICENSE](LICENSE).
- Rule texts in `canon/public/` and `canon/public-generated/`: CC BY 4.0, attribution "UNSLOP by Oleg.Design" with a link to https://oleg.design, see [LICENSE-RULES.md](LICENSE-RULES.md).

Credits: [CREDITS.md](CREDITS.md). File-by-file list: [PUBLIC_MANIFEST.md](PUBLIC_MANIFEST.md).
