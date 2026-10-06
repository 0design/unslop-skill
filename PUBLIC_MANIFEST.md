# Public manifest

Every file in this tree, why it is public, and its license. Generated from `git ls-files`; the leak scan that runs before each export must pass on this exact list.

| File | Why public | License |
|---|---|---|
| `.claude-plugin/marketplace.json` | Marketplace manifest: lets Claude Code and Codex install the plugin from this repository | MIT |
| `.claude-plugin/plugin.json` | Plugin manifest for Claude Code and Codex: name, version, the root skill | MIT |
| `.github/workflows/test.yml` | CI: npm ci, npm test; no secrets | MIT |
| `.gitignore` | Keeps caches, env files and keys out of git | MIT |
| `.mcp.json` | Plugin MCP declaration: the read-only canon endpoint, no credentials | MIT |
| `CHANGELOG.md` | What each public canon version adds, changes and removes | MIT |
| `CREDITS.md` | Attribution of prior work | MIT |
| `LICENSE` | Licence text for code and skill files | MIT |
| `LICENSE-RULES.md` | Licence notice and scope for rule texts | MIT (notice for CC BY 4.0 files) |
| `LICENSES/emilkowalski-skills-MIT.txt` | Third-party notice: motion thresholds adapted from Emil Kowalski (MIT) | MIT (© Emil Kowalski) |
| `PUBLIC_MANIFEST.md` | This list | MIT |
| `README.md` | What this is, MCP endpoint, how to run | MIT |
| `canon/public-generated/public-2026.10.04-12/index.json` | Generated routed canon (published version, served by the MCP endpoint) | CC BY 4.0 |
| `canon/public-generated/public-2026.10.04-12/topics/copy.json` | Generated routed canon (published version, served by the MCP endpoint) | CC BY 4.0 |
| `canon/public-generated/public-2026.10.04-12/topics/interface.json` | Generated routed canon (published version, served by the MCP endpoint) | CC BY 4.0 |
| `canon/public-generated/public-2026.10.04-12/topics/process.json` | Generated routed canon (published version, served by the MCP endpoint) | CC BY 4.0 |
| `canon/public/records.json` | Public rule texts (source), owner-approved wording | CC BY 4.0 |
| `package-lock.json` | Dependencies (MCP SDK only), test command; private: true blocks npm publish | MIT |
| `package.json` | Dependencies (MCP SDK only), test command; private: true blocks npm publish | MIT |
| `scripts/canon-audit.test.mjs` | Test suite | MIT |
| `scripts/canon-mcp.test.mjs` | Test suite | MIT |
| `scripts/canon-route.mjs` | Canon client CLI used by the skill | MIT |
| `scripts/canon-routed.mjs` | Generator for canon/public-generated and binding CLI | MIT |
| `scripts/canon-routed.test.mjs` | Test suite | MIT |
| `scripts/canon-server.mjs` | Local stdio MCP server for --store development runs | MIT |
| `scripts/canon.test.mjs` | Test suite | MIT |
| `scripts/detect.mjs` | Detector CLI | MIT |
| `scripts/fixtures/B-1/clean/tokens.css` | Detector and routing test fixture | MIT |
| `scripts/fixtures/B-1/slop/button.css` | Detector and routing test fixture | MIT |
| `scripts/fixtures/B-2/clean/card.jsx` | Detector and routing test fixture | MIT |
| `scripts/fixtures/B-2/slop/card.jsx` | Detector and routing test fixture | MIT |
| `scripts/fixtures/B-3/clean/badge.jsx` | Detector and routing test fixture | MIT |
| `scripts/fixtures/B-3/slop/badge.jsx` | Detector and routing test fixture | MIT |
| `scripts/fixtures/B-4/clean/feature-card.tsx` | Detector and routing test fixture | MIT |
| `scripts/fixtures/B-4/slop/feature-card.tsx` | Detector and routing test fixture | MIT |
| `scripts/fixtures/B-6a/clean/user-list.jsx` | Detector and routing test fixture | MIT |
| `scripts/fixtures/B-6a/slop/user-list.jsx` | Detector and routing test fixture | MIT |
| `scripts/fixtures/B-7/clean/hero.jsx` | Detector and routing test fixture | MIT |
| `scripts/fixtures/B-7/slop/hero.jsx` | Detector and routing test fixture | MIT |
| `scripts/fixtures/B-8a/clean/open-panel.jsx` | Detector and routing test fixture | MIT |
| `scripts/fixtures/B-8a/slop/open-panel.jsx` | Detector and routing test fixture | MIT |
| `scripts/fixtures/C-4/clean/sections.jsx` | Detector and routing test fixture | MIT |
| `scripts/fixtures/C-4/slop/sections.jsx` | Detector and routing test fixture | MIT |
| `scripts/fixtures/C-6/clean/label.css` | Detector and routing test fixture | MIT |
| `scripts/fixtures/C-6/slop/hero.css` | Detector and routing test fixture | MIT |
| `scripts/fixtures/C-9/clean/about.md` | Detector and routing test fixture | MIT |
| `scripts/fixtures/C-9/slop/about.md` | Detector and routing test fixture | MIT |
| `scripts/fixtures/D-3/clean/title.css` | Detector and routing test fixture | MIT |
| `scripts/fixtures/D-3/slop/title.css` | Detector and routing test fixture | MIT |
| `scripts/fixtures/D-4/clean/badge.css` | Detector and routing test fixture | MIT |
| `scripts/fixtures/D-4/slop/badge.css` | Detector and routing test fixture | MIT |
| `scripts/fixtures/DS-2a/clean/panel.css` | Detector and routing test fixture | MIT |
| `scripts/fixtures/DS-2a/slop/panel.css` | Detector and routing test fixture | MIT |
| `scripts/fixtures/E-3/clean/card.css` | Detector and routing test fixture | MIT |
| `scripts/fixtures/E-3/slop/card.css` | Detector and routing test fixture | MIT |
| `scripts/fixtures/E-4/clean/panel.css` | Detector and routing test fixture | MIT |
| `scripts/fixtures/E-4/slop/panel.css` | Detector and routing test fixture | MIT |
| `scripts/fixtures/E-5/clean/tag.css` | Detector and routing test fixture | MIT |
| `scripts/fixtures/E-5/slop/card.css` | Detector and routing test fixture | MIT |
| `scripts/fixtures/E-8/clean/card.css` | Detector and routing test fixture | MIT |
| `scripts/fixtures/E-8/slop/card.css` | Detector and routing test fixture | MIT |
| `scripts/fixtures/F-6/clean/prose.css` | Detector and routing test fixture | MIT |
| `scripts/fixtures/F-6/slop/prose.css` | Detector and routing test fixture | MIT |
| `scripts/fixtures/G-1/clean/menu.css` | Detector and routing test fixture | MIT |
| `scripts/fixtures/G-1/slop/menu.css` | Detector and routing test fixture | MIT |
| `scripts/fixtures/G-10/clean/dropdown.css` | Detector and routing test fixture | MIT |
| `scripts/fixtures/G-10/slop/dropdown.css` | Detector and routing test fixture | MIT |
| `scripts/fixtures/G-2/clean/pop.css` | Detector and routing test fixture | MIT |
| `scripts/fixtures/G-2/slop/pop.css` | Detector and routing test fixture | MIT |
| `scripts/fixtures/G-4/clean/button.css` | Detector and routing test fixture | MIT |
| `scripts/fixtures/G-4/slop/button.css` | Detector and routing test fixture | MIT |
| `scripts/fixtures/G-5/clean/modal.css` | Detector and routing test fixture | MIT |
| `scripts/fixtures/G-5/slop/modal.css` | Detector and routing test fixture | MIT |
| `scripts/fixtures/G-6/clean/row.css` | Detector and routing test fixture | MIT |
| `scripts/fixtures/G-6/slop/row.css` | Detector and routing test fixture | MIT |
| `scripts/fixtures/G-9/clean/motion.css` | Detector and routing test fixture | MIT |
| `scripts/fixtures/G-9/slop/motion.css` | Detector and routing test fixture | MIT |
| `scripts/fixtures/H-1/clean/page.html` | Detector and routing test fixture | MIT |
| `scripts/fixtures/H-1/slop/page.html` | Detector and routing test fixture | MIT |
| `scripts/fixtures/H-6/clean/page.html` | Detector and routing test fixture | MIT |
| `scripts/fixtures/H-6/slop/page.html` | Detector and routing test fixture | MIT |
| `scripts/fixtures/I-1a/clean/team.html` | Detector and routing test fixture | MIT |
| `scripts/fixtures/I-1a/slop/team.html` | Detector and routing test fixture | MIT |
| `scripts/fixtures/I-2/clean/office.html` | Detector and routing test fixture | MIT |
| `scripts/fixtures/I-2/slop/office.html` | Detector and routing test fixture | MIT |
| `scripts/fixtures/J-10/clean/type.css` | Detector and routing test fixture | MIT |
| `scripts/fixtures/J-10/slop/type.css` | Detector and routing test fixture | MIT |
| `scripts/fixtures/J-3a/clean/button.css` | Detector and routing test fixture | MIT |
| `scripts/fixtures/J-3a/slop/button.css` | Detector and routing test fixture | MIT |
| `scripts/fixtures/J-4/clean/copy.css` | Detector and routing test fixture | MIT |
| `scripts/fixtures/J-4/slop/copy.css` | Detector and routing test fixture | MIT |
| `scripts/fixtures/J-5/clean/caption.css` | Detector and routing test fixture | MIT |
| `scripts/fixtures/J-5/slop/intro.css` | Detector and routing test fixture | MIT |
| `scripts/fixtures/J-6/clean/page.html` | Detector and routing test fixture | MIT |
| `scripts/fixtures/J-6/slop/page.html` | Detector and routing test fixture | MIT |
| `scripts/fixtures/J-7/clean/paragraph.css` | Detector and routing test fixture | MIT |
| `scripts/fixtures/J-7/slop/paragraph.css` | Detector and routing test fixture | MIT |
| `scripts/fixtures/J-8/clean/article.css` | Detector and routing test fixture | MIT |
| `scripts/fixtures/J-8/slop/article.css` | Detector and routing test fixture | MIT |
| `scripts/fixtures/J-9/clean/focus.css` | Detector and routing test fixture | MIT |
| `scripts/fixtures/J-9/slop/focus.css` | Detector and routing test fixture | MIT |
| `scripts/fixtures/conditional-b1/components/card.css` | Detector and routing test fixture | MIT |
| `scripts/fixtures/conditional-b1/css-hex.css` | Detector and routing test fixture | MIT |
| `scripts/fixtures/conditional-b1/css-var.css` | Detector and routing test fixture | MIT |
| `scripts/fixtures/conditional-b1/icon.jsx` | Detector and routing test fixture | MIT |
| `scripts/fixtures/conditional-b1/logo-token.jsx` | Detector and routing test fixture | MIT |
| `scripts/fixtures/conditional-b1/logo.jsx` | Detector and routing test fixture | MIT |
| `scripts/fixtures/conditional-b1/palette/tokens.css` | Detector and routing test fixture | MIT |
| `scripts/fixtures/conditional-b1/theme/tokens/mixed.css` | Detector and routing test fixture | MIT |
| `scripts/fixtures/conditional-b1/tokens-comment.css` | Detector and routing test fixture | MIT |
| `scripts/fixtures/conditional-b1/tokens.css` | Detector and routing test fixture | MIT |
| `scripts/fixtures/routed-canon/records.json` | Synthetic placeholder canon for tests (not rule text) | MIT |
| `scripts/fixtures/routed-copy-json/site.json` | Detector and routing test fixture | MIT |
| `scripts/fixtures/routed-copy-ts/content.ts` | Detector and routing test fixture | MIT |
| `scripts/fixtures/routed-css-markup/index.html` | Detector and routing test fixture | MIT |
| `scripts/fixtures/routed-css-markup/styles.css` | Detector and routing test fixture | MIT |
| `scripts/fixtures/routed-css-only/styles.css` | Detector and routing test fixture | MIT |
| `scripts/fixtures/verdict-kinds/b2.tsx` | Detector and routing test fixture | MIT |
| `scripts/lib/canon-audit.mjs` | Shared library for detector and canon client | MIT |
| `scripts/lib/canon-mcp-core.mjs` | Shared library for detector and canon client | MIT |
| `scripts/lib/canon-mcp.mjs` | Shared library for detector and canon client | MIT |
| `scripts/lib/canon-routed-core.mjs` | Shared library for detector and canon client | MIT |
| `scripts/lib/canon-routed.mjs` | Shared library for detector and canon client | MIT |
| `scripts/lib/canon.mjs` | Shared library for detector and canon client | MIT |
| `scripts/lib/css.mjs` | Shared library for detector and canon client | MIT |
| `scripts/lib/detector-version.mjs` | Shared library for detector and canon client | MIT |
| `scripts/lib/heuristics.mjs` | Shared library for detector and canon client | MIT |
| `scripts/lib/project-context.mjs` | Shared library for detector and canon client | MIT |
| `scripts/lib/reporter.mjs` | Shared library for detector and canon client | MIT |
| `scripts/lib/scan.mjs` | Shared library for detector and canon client | MIT |
| `scripts/lib/sha256.mjs` | Shared library for detector and canon client | MIT |
| `scripts/lib/verdict.mjs` | Shared library for detector and canon client | MIT |
| `scripts/lib/walker.mjs` | Shared library for detector and canon client | MIT |
| `scripts/plugin.test.mjs` | Test suite | MIT |
| `scripts/rules/b.mjs` | Detector rules by section | MIT |
| `scripts/rules/c.mjs` | Detector rules by section | MIT |
| `scripts/rules/d.mjs` | Detector rules by section | MIT |
| `scripts/rules/ds.mjs` | Detector rules by section | MIT |
| `scripts/rules/e.mjs` | Detector rules by section | MIT |
| `scripts/rules/f.mjs` | Detector rules by section | MIT |
| `scripts/rules/g.mjs` | Detector rules by section | MIT |
| `scripts/rules/h.mjs` | Detector rules by section | MIT |
| `scripts/rules/i.mjs` | Detector rules by section | MIT |
| `scripts/rules/index.mjs` | Detector rules by section | MIT |
| `scripts/rules/j.mjs` | Detector rules by section | MIT |
| `scripts/test.mjs` | Test suite | MIT |
| `scripts/verdict.test.mjs` | Test suite | MIT |
| `skills/audit/SKILL.md` | Skill: the audit workflow the agent follows | MIT |
| `skills/audit/references/design-system-integrity.md` | Skill reference read during recon and verification | MIT |

## Not in this tree

- Working notes, planning material and reference documents that are not part of the product.
- Rule texts that have not been approved for publication.
- Deployment configuration for the hosted MCP endpoint.
- Development and demo tooling that the skill, the detector and the canon client do not need,
  including the leak scan, which runs before each export.
- Session recordings and screenshots.

Files: 149.
