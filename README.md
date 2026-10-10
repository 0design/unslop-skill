"I asked you to get rid of this slop everywhere."<br>— You, to your AI-Agent

# Get started

unslop is an auditor. It checks the design your agent has already generated for the typical bad decisions AI makes in generated designs, and proposes fixes.

Claude Code, in your shell:

```sh
claude plugin marketplace add 0design/unslop-skill
claude plugin install unslop@unslop
```

Codex:

```sh
codex plugin marketplace add 0design/unslop-skill
codex plugin add unslop@unslop
```

Start a new session and run `/unslop:audit`. In Codex, ask for an unslop audit instead; it lists the skill as `unslop:audit`. Your agent checks every screen against the canon and writes a fix plan to `plans/`. It changes no code.

## Install

The plugin holds the skill, the detector, the canon client and the rule texts, and declares the canon server at `https://oleg.design/unslop/mcp`; your client connects to it at session start. The canon client needs Node.js 20 or newer and the MCP SDK; where the SDK is missing, the skill tells your agent to ask before it downloads anything and, without your agreement, to report no verified canon and issue no pass. These steps are instructions, not a technical lock; your agent's own permission prompts still apply. To remove the plugin: `claude plugin uninstall unslop@unslop` or `codex plugin remove unslop@unslop`.

Cursor and Lovable get a prompt instead of a plugin; it is on https://oleg.design/unslop.

## How it works

```
  /unslop:audit
       │
       ▼
  your agent ◀──── MCP ────▶ canon server (read-only): index read once, version and checksum pinned for the run
       ├── no `unslop` server ──▶ your agent offers the connect command, runs it only after you agree
       ├── unreadable index or checksum mismatch ──▶ "no verified canon", no pass
       ▼
  recon ──▶ stack, design system, conventions, documented decisions
       │
       ▼
  detector ──▶ "B-1   RED  button.css:2  color: #ff0044;"
       │
       ▼
  judgement against the pinned rules; every finding re-checked before it counts
       │
       ▼
  plans/NNN-slug.md, one per fix or per tight cluster of findings, for a cheaper model to execute
       │
       ▼
  "unslop execute <plan>", said to your agent ──▶ one plan in an isolated worktree, then the diff
```

unslop gives your agent a designer's quality criteria: verifiable, not taste by eye. Every finding is a `file:line` and a fix plan. It does not guarantee good design: that decision is yours; unslop only keeps your agent from breaking it. The catalogue of slop criteria keeps changing, so the audit reads it from the canon server, not from the plugin's own copy: one version per run, pinned by version and checksum, never a silent fallback to local files. A rule fixed or added on the server reaches every agent on its next run, with no reinstall.

## What's in this repo

- [`skills/audit`](skills/audit): the audit skill and its reference on design-system integrity.
- [`.claude-plugin`](.claude-plugin) and [`.mcp.json`](.mcp.json): the plugin and marketplace manifests, and the canon server they declare.
- [`scripts/detect.mjs`](scripts/detect.mjs), [`scripts/rules`](scripts/rules) and [`scripts/fixtures`](scripts/fixtures): the detector, 37 machine checks over CSS and markup, no network, a sample per check.
- [`scripts/canon-route.mjs`](scripts/canon-route.mjs) and [`scripts/lib`](scripts/lib): the canon client that reads the index, routes topics and checks checksums.
- [`canon/public/records.json`](canon/public/records.json): the 48 rules, the source of truth; [`canon/public-generated`](canon/public-generated): what the server serves, version `public-2026.10.04-12`, never edited by hand.

## Contribute

You can improve the skill, the detector or the canon, or propose a rule.

1. Fork the repository and make a branch.
2. Make your change and run the checks: `npm ci`, `npm test`. A rule change is a new canon version: raise the version in `canon/public/records.json`, run `npm run canon:generate:public` and add a `CHANGELOG.md` entry in the same pull request.
3. Open a pull request. The tests run on Node.js 22 for a pull request (20 and 22 on a push to a release line), and a second check keeps internal wording out of the public text.

A rule accepted from a pull request reaches everyone with the next canon version. Have an idea? [Open an issue](https://github.com/0design/unslop-skill/issues/new) and describe what result you want.

## Links

- Site: https://oleg.design/unslop
- Canon server: https://oleg.design/unslop/mcp (resources only, no tools); health: https://oleg.design/unslop/mcp/health
- Changelog, credits, file list: [CHANGELOG.md](CHANGELOG.md), [CREDITS.md](CREDITS.md), [PUBLIC_MANIFEST.md](PUBLIC_MANIFEST.md)
- For AI agents: the audit is read-only, plans only, no pass without a connected canon. The rules are in [the skill](skills/audit/SKILL.md).
- License: [MIT](LICENSE) for the code and skill files, [CC BY 4.0](LICENSE-RULES.md) for the rule texts
