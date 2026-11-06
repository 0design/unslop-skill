# Changelog

Plugin releases and public canon versions. Rule texts are generated from
`canon/public/records.json` with `npm run canon:generate:public`; never edit
`canon/public-generated/` by hand.

## Unreleased: candidate canon public-2026.11.06-2 and audit levels

Candidate, not published. The served canon stays `public-2026.11.06-1`. On this branch `canon/public/records.json` and `canon/public-generated/public-2026.11.06-2` are byte-identical copies of the candidate, because the skill text names its new rules; the branch therefore merges only after that version is served. The plugin version stays `1.0.3`.

### Added
- **US-011 · An existing page is the approved baseline** (topic `process`, class `slop`, hard). What a page that existed before the task uses consistently counts as its design system, but only for the exceptions of DEC-1, DEC-2, DEC-7, DEC-9, KR-19 and ST-5; an element stays in the baseline only while it passes the role test of US-012, so repetition alone protects nothing. A list of always-findings stays a finding on any page and is fixed, not only reported: content items are removed or replaced, and contrast, size and touch-target defects are restyled.
- **US-012 · Restyle first, remove last** (topic `process`, class `slop`, hard). A defect is fixed by restyling; an element is removed only when it is the defect; a group is fixed in the same way or not at all; a role test asks what job each element does and whether a more fitting element does it better (then it is replaced, for example numbers on a link list by icons); every report ends with an element table.
- Audit skill: intensity levels `level=1` (just fix the slop, the default), `level=2` (Unslop) and `level=3` (Total unslop). Every level runs the same read-only audit; levels 2 and 3 add a short creative direction, offered as a proposal.

### Changed
- **UR-1** is about invented content (text, data, claims, features); it is never a reason to remove parts of an existing page, and content already on a page does not exempt proof and claims from DEC-5.
- **DEC-1**: the removal test covers the decorations the rule names, not illustrations, sections or motion; consistent decoration of an existing page counts as its design system while it passes the role test of US-012.
- **DEC-5** also covers counts, versions, pricing terms and promises, defines an item without a source as fabricated, and says how to fix it: remove it, or replace it with a marked slot that XP-33 keeps out of production. Proof that a person wrote on a live product waits for its source instead.
- **DEC-7**: a pill or badge above the H1, is a finding on any page, and turning it into a text label is not a fix; numbering such as "01/" on items that are not a sequence is replaced by what does its job better, such as icons on a list of links.
- Counter-examples: selectable option tiles (**DEC-3**, **DEC-8**), a lifted product mock or device frame (**DEC-4**), a one-off product demo that respects reduced motion (**KR-15**), one consistent monospace layer for one role (**KR-19**), a data tooltip (**KR-21**), tabular figures scoped to amounts and counters (**TY-1**).
- Detector: J-5 skips text inside an illustration (an `svg`, or an `aria-hidden="true"` or `role="img"` element that holds no headings, paragraphs, links or controls and only short text). G-5 counts every transition and every animation except a one-off entrance that plays once, declares a fill mode, uses its own keyframe and, in markup, has a class that sits on one element; a scroll-reveal, a stagger, a finite loop or a script-inserted item still counts. A classless subject on several elements, staggered only through `animation-delay`, is left to judgement under KR-15. The detector version changes, so detector bindings read `binding-stale` until bound again.
- After the second test round: **US-012** makes the element table a condition of done for any change, however it was made, bounds size, weight, letter-spacing, timing and layout changes to a named defect, treats a weaker replacement or a repeated decoration as a finding and keeps an icon that supports a label, defines a content group as every claim of the same kind (fabricated items fixed, sourced items kept) and fixes contrast by the text color of the failing role; **US-011** keeps the product's own logo or a mark that depicts what the product is or does, and adds the letter case of headings, labels and buttons (**ST-5**) to the baseline exceptions; **US-003** requires screenshots at 1440 and 390 before the first edit and after the last; **DEC-5** fixes a whole group of fabricated claims and puts marked slots, never plausible numbers, where a page made from scratch needs prices or terms the request does not give; **DEC-6** names the smallest contrast fix; **ST-5** keeps a case style an existing page uses consistently for a role; **UR-1** does not count those slots as invented items.
- After the third test round (owner's annotations): new **US-013 · Keep the page's selling copy** (topic `process`, class `slop`, hard): on an existing page a new-feature badge, trial and pricing terms, "no credit card", integrations and benefit lines stay word for word, and weakening them is a very heavy finding; **DEC-7** keeps such a badge on an existing page (a decorative pill above the H1 stays a finding on a page made in the task); **DEC-5** no longer counts an existing page's offer copy as fabricated proof, and a slot replaces only the fabricated item; **US-011** drops the pill from the always-findings, keeps the product's logo whatever it looks like, adds **DEC-9** to the baseline exceptions and counts information labels inside illustrations at their rendered size; **US-012** reverts any visible change without a defect a visitor would notice and never replaces the logo in a fix task; **ST-13** keeps an existing page's own logo and requires real brand icons for other brands; **US-003** scrolls before full-page screenshots, keeps them next to the result and lists every visible difference.
- Audit skill: a task that asks for the page to be changed runs the audit, then `unslop execute` on each plan in the same run (in place where the project does not use git); Hard Rule 10 covers every answer that changed a page; new Hard Rule 11 makes the visual check part of done.

The ids, titles, strength and credits of the 15 changed rules stay; the other 41 rules are unchanged, and with the three new rules the version holds 59 rules.

### Retired at release
- `public-2026.11.06-1`, answered with the new version and marked in `_meta`, as before.

## public-2026.11.06-1 (published 2026-11-06)

Base: `public-2026.10.14-1`, which was served by the MCP endpoint but never reached this
repository's copy; its one change is listed under "Changed" too. The plugin version stays
`1.0.3`: the audit reads the canon from the server, so the new rules reach every agent on its
next run. `canon/public/records.json` and `canon/public-generated/public-2026.11.06-1` here are
byte-identical to the served version; the `public-2026.10.11-1` copy is removed.

### Added

All in topic `interface`, class `slop`, adapted from Stageshow by Benji Taylor (MIT; see
`CREDITS.md` and `LICENSES/benjitaylor-skills-MIT.txt`) and credited in each rule's `credits`.

- **ST-1 · Icons come from one chosen set.** Icons come from the product's own set or one set
  chosen on purpose; a glyph drawn ad hoc is a finding.
- **ST-2 · AI features are named by what they do.** A sparkle, wand, star, gradient "AI" chip
  or purple as the color of AI is a finding; the product's own mark is allowed.
- **ST-3 · No near-touching edges.** Neighboring edges line up exactly or sit at least the
  gutter apart, never under 8px; a 1 to 3px gap is a finding.
- **ST-4 · No layout jumps on state change.** A new row carries what follows or has reserved
  space; a button keeps one width across its states; an open popover keeps its size and anchor.
- **ST-5 · Sentence case by default** (soft: a recommendation). Title Case and tracked capitals
  only where the design system or the platform defines them.
- **ST-11 · Emoji are content, not interface icons.**
- **ST-13 · No invented logo.** A letter in a colored square is not a mark; other companies'
  logos come only from their real files.

### Changed

- **KR-7 · Line breaks follow the sentence** (from `public-2026.10.14-1`, was «Balanced wrapping
  for content text»). A heading that fits stays on one line; when it does not, it breaks at a
  sentence boundary or between word groups; `text-wrap: balance` on a short multi-sentence
  heading is a finding.
- **KR-4** also covers centering a label on its letters rather than its line box (button and
  pill labels, avatar initials, `text-box: trim-both cap alphabetic`) and a centered price whose
  currency sign sits outside the centered digits.
- **KR-11** also asks for one icon family and one stroke width per screen; a filled icon among
  outlined ones of the same group is a finding.
- **US-003** also says that the reviewer gets the result and the requirement without the
  author's explanations, that a finding is backed by a screenshot, and that each theme, such as
  light and dark, is checked on its own.

The ids of KR-4, KR-7, KR-11 and US-003 stay; their texts (and, except KR-7, their credits)
change. The texts of the other 45 rules are unchanged, so the version holds 56 rules.

### Retired

- `public-2026.10.14-1` and `public-2026.10.11-1`, answered with the new version and marked in
  `_meta`, as before.

## public-2026.10.11-1 (published 2026-10-11)

Base: `public-2026.10.04-12`. The plugin version stays `1.0.2`: the skill reads the canon from
the MCP endpoint at the start of every run, so an installed plugin gets this version without
reinstalling.

### Added

- **XP-18 · No gray text on colored backgrounds** (topic `interface`, class `slop`, strength
  `hard`). On a colored background, such as a brand or accent fill, text is white or black;
  muted text lowers the opacity of that white or black instead of using a gray token or a
  gray hex value. Accent-colored text is the only exception, and muted text still meets the
  contrast in DEC-6.

### Retired

- `public-2026.10.04-12`. Its texts are no longer served. A request for that version (index
  or topic) is answered with the current version, `public-2026.10.11-1`, under the requested
  URI; the response's `_meta` carries `requestedVersion`, `servedVersion` and `retired: true`.
  Its generated files leave `canon/public-generated/`; the texts of the other 48 rules are
  unchanged in this version.

## 1.0.3 (plugin, 2026-10-11)

The skill folder now carries what it runs, so a skill-only install with the skills CLI
(`npx skills add 0design/unslop-skill`) gets a working detector. Rule texts are unchanged.

- Plugin and package version `1.0.3`.
- The detector (`detect.mjs`, `rules/`, `lib/`) and the canon client (`canon-route.mjs`,
  `canon-server.mjs`, `canon-routed.mjs`) moved from `scripts/` to `skills/audit/scripts/`.
  There is one copy; `scripts/` keeps the tests, the fixtures and the public text guard.
- `skills/audit/SKILL.md`: `scripts/…` paths are relative to the skill directory, not the
  plugin root. The dependency copy for the canon client now copies `skills/` and runs
  `node DEPS/skills/audit/scripts/canon-route.mjs`; a copy made for 1.0.2 has the old layout,
  which is why the version changes. A skill-only install has no `package.json`, so the canon
  client's dependencies cannot be installed there: the skill says so and issues no pass.
- The detector now also runs when it is started through a symlink, as the skills CLI links
  agent folders to one shared copy. Before, it exited 0 with no output there. This changes
  the detector version (`sha256:1eba5755…`), so existing detector bindings report
  `binding-stale` until they are bound again.
- Tests check that every import under `skills/audit` resolves inside that folder, that the
  detector imports only Node built-ins, and that it finds issues when run from a copy of the
  skill folder alone and through a symlink, in a path with a space.
- `README.md`: the skills CLI install now delivers the detector; `PUBLIC_MANIFEST.md`: new
  paths, file count corrected to 153.

## 1.0.2 (plugin, 2026-10-07)

Corrects statements in 1.0.1 that did not match the plugin. Wording only: the skill's
workflow, the detector, the canon client and the rule texts are unchanged.

- Plugin and package version `1.0.2`.
- `plugin.json` description: 1.0.1 said the plugin "never edits source code". The skill's
  execute mode, `unslop execute <plan>`, applies one plan in an isolated worktree.
- Marketplace description: 1.0.1 said the plugin "connects the UNSLOP canon MCP server on
  install". The plugin declares the remote server in `.mcp.json`; the client connects to it
  at session start.
- `skills/audit/SKILL.md`, description and opening: 1.0.1 said the skill is read-only on
  source code and never touches it. The audit is; the execute mode changes code. The opening
  said each confirmed finding becomes a fix plan; Phase 4 writes one plan per fix or per
  tight cluster of findings.
- `skills/audit/SKILL.md`, Phase 0: 1.0.1 said Claude Code installs `node_modules/` in the
  plugin root. Claude Code's automatic dependency install skips plugins whose `package.json`
  sets npm `overrides`, and this one does.
- `README.md`: the same corrections in the summary (plan granularity) and in Install (the
  plugin declares the server, it does not connect it; Claude Code does not install the MCP
  SDK). Install no longer says that the skill asks before it downloads: the skill tells your
  agent to ask, and these steps are instructions, not a technical lock; your agent's own
  permission prompts still apply.

## 1.0.1 (plugin, 2026-10-06)

- Plugin and package version `1.0.1`.
- This changelog records the retirement of canon version `public-2026.10.02-2` (next
  entry). The skill, the detector, the canon client and the rule texts are unchanged.

## public-2026.10.02-2 retired (2026-10-06)

Since 2026-10-06 the MCP endpoint no longer serves the texts of `public-2026.10.02-2`.
A request for that version (`unslop://canon-index/public-2026.10.02-2` or one of its
topics) is answered with the current version, `public-2026.10.04-12`, under the requested
URI. The response's `_meta` carries `requestedVersion`, `servedVersion` and
`retired: true`, and the file's checksum is the served version's. A version that never
existed still returns `UNKNOWN_VERSION`.

## 1.0.0 (plugin, 2026-10-06)

First release of the unslop plugin from the repository https://github.com/0design/unslop-skill.

- Plugin and package version `1.0.0` (was `0.1.0`).
- Author in `plugin.json` and `package.json`, and marketplace owner: "Oleg.Design"
  (https://oleg.design). The copyright holder in `LICENSE` is unchanged.
- The install commands in `README.md` add the marketplace from that repository.
- Contents: the `audit` skill (`/unslop:audit`), the detector, the canon client, the
  `.mcp.json` declaration of the read-only canon server `https://oleg.design/unslop/mcp`,
  and the rule texts of canon version `public-2026.10.04-12`. On 2026-10-06 the endpoint's
  health check reports that same version.
- Rule texts keep the attribution "UNSLOP by Oleg.Design".
- The leak scan no longer ships in this tree: it runs before each export, outside the
  published files. `npm test` and CI no longer run `scan:public`.

## public-2026.10.04-12 (published 2026-10-05)

Base: `public-2026.10.02-2`, the version the MCP endpoint served before this one. The intermediate
candidates `public-2026.10.04-1` (attribution change only) and `public-2026.10.04-2`,
`-3`, `-4`, `-5`, `-6`, `-7`, `-8`, `-9`, `-10` and `-11` (drafts of this release) were never shipped; this version
supersedes them. The generator refuses to rewrite an existing version with different
content, so each corrected candidate takes the next number. Since 2026-10-05 the MCP
endpoint serves this version; its health check reports `public-2026.10.04-12`.

**Wording status.** US-001, US-003 to US-008 and US-010 keep the wording of 2026-10-02.
Every other text in this version, including the replaced US-002, the narrowed US-009, the
DEC family and the class definitions, dates from 2026-10-05.

### Added

- **Rule classes.** Each rule names its class; the release defines all four classes with
  their definitions (index field `classes`, rule field `class`):
  - `slop`: a result of missing judgement (a substituted default, a broken approved
    decision, a defect or unfinished work);
  - `bad-tone`: dishonest or disrespectful communication (pressure, manipulation, dark
    patterns, false signals);
  - `instruction`: how the agent works (permissions, scope, order of checks), verified
    through the process;
  - `project-decision`: an approved decision of one product; defined so the class is
    known, but such rules are never part of the public canon.
- **Rule credits.** Optional rule field `credits` (`name`, `work`, `url`) names the
  third-party work a rule is adapted from (Jakub Krehel, invisibledetails.com, Benji
  Taylor, Nick DiLallo, Refactoring UI, Aurora Harley of NN/g, impeccable.style); `CREDITS.md` lists the same authors. The
  rights attribution in `attribution` is unchanged.
- **Strength follows the class.** `slop` is `hard`; `bad-tone` and `instruction` are
  `soft`. Two slop rules are recommendations and therefore `soft`: KR-3d and KR-8. A test
  enforces the mapping.
- **Topic `interface`** (style and markup files), slop unless noted: KR-1 concentric
  radii, KR-3 touch targets on touch screens, KR-3d desktop hit areas (soft, split from
  KR-3 so that its desktop recommendation can carry its own strength), KR-4 optical centering, KR-5 shadow for layers, KR-7 balanced
  wrapping, KR-8 font smoothing per typeface and size (soft, a recommendation), KR-9
  image outlines only as an option for content images, KR-10 press scale 0.96, KR-11
  icon stroke, KR-13 interruptible motion, KR-15 no first-render animation, KR-16
  duration by action weight, KR-18 smooth scroll and scripted scroll, KR-19 monospace
  only in code, CLI commands and diffs, KR-21 hover needs a click, C-11 prose on all-caps display pages (bad tone, soft),
  TY-1 plain font numerals in regular text, J-12 disclosure indicator, XP-31 indented lists keep markers, NR-02 icon transitions.
- **Topic `copy`** (markup, Markdown, JavaScript and TypeScript): LK-01 no false urgency (bad tone), XP-22b only
  verified claims about competitors (bad tone), KR-20 machine formats for people (slop),
  XP-22a compare at the level of intent (slop), XP-23 use the approved positioning (slop),
  XP-33 no placeholder or service text in production (slop), XP-34 stage shows exactly
  what production will show, with no visible build markers (slop), US-009 no agent or
  process service notes on production pages (slop; narrowed so that sources meant for
  readers, such as citations in science or medicine, stay allowed).
- **Decoration family DEC** ("structure before decoration"; all slop and hard except
  DEC-5): DEC-1 structure before decoration (the parent rule), DEC-2 lines only where
  structure needs them (including lines between rows only in dense data), DEC-3 cards are
  not the default container, DEC-4 shadows only for real layers, DEC-5 no fabricated
  proof (bad tone, soft), DEC-6 muted text needs a role and contrast, DEC-7 labels above
  headings only as a system, DEC-8 no identical feature grids with icon tiles, DEC-9
  decorative gradients and glow only from the design system. DEC-5 is routed to `copy`
  because fabricated metrics and testimonials are copy; the rest are visual and go to
  `interface`. Detection signals in these rules only prompt a review and give no
  verdict: their thresholds are not calibrated, and no detector rule is bound to them.
- **Topic `process`** (every project): UR-1 ship only requested content (slop). UR-1 and
  US-002 form two linked lanes: UR-1 is the content lane (what a person sees ships only
  on request; approval of a direction unlocks proposals, not implementation; a repeat
  after a correction raises severity), US-002 the proposal and execution lane.
- Generator and validators accept the optional `class` and `credits` fields; records
  without them hash exactly as before.
- Test gate for `canon/public/records.json`: every record is `accepted`, `global` and has
  a public class; candidates, project-scoped rules and project decisions fail the suite.
- The leak scan also rejects private candidate-card and project-decision IDs.

### Changed

- **US-002 replaced.** New title "Needed additions are proposed; execution is
  proactive" (was "Agent-added elements need a purpose"); class `instruction`, strength
  `soft` (was `hard`). A needed element outside the request goes out as a proposal with
  its purpose and a preview; technical steps, checks, defect fixes and signals inside
  the authorized scope are done without asking; outside the scope, or for an
  irreversible or external step, the agent reports and asks. The ID is kept so that
  citations of the served version stay valid.
- KR-5: unlike the source recipe, a 0-blur ring shadow counts as a border; whether an
  edge is needed is decided by DEC-2.
- **Spelling.** All public rule texts, titles, class definitions and credit titles use US
  English (color, center, neighbor, judgment, catalog), matching the wording of
  US-003 and US-006. The schema value `mode: "judgement"` is an identifier and
  stays as it is. A test rejects British forms in public prose.
- KR-19 and TY-1 agree on numerals: regular text never uses monospace digits; code keeps
  its own digits.
- J-12 sizes the summary's hit area per KR-3 on touch screens and KR-3d on desktop.
- Attribution of US-001 to US-008 and US-010: "UNSLOP by Oleg.Design" (was a credit under
  the author's personal name). Statements unchanged.
- US-001, US-003, US-004, US-007, US-008 and US-010 are classed `slop` and stay `hard`;
  US-005 and US-006 are classed `instruction` and become `soft`. Rule hashes change because
  attribution, class and strength are hashed.
- Rules generalised from one product to every project are published under the `XP-`
  prefix (cross-project) with their original numbers: XP-22a, XP-22b, XP-23, XP-31,
  XP-33, XP-34. Each
  maps one-to-one to the internal rule with the same number; the mapping table stays in
  the private base because the internal product prefix is not public.
- Routing: a style or markup project now requests `interface` (and `copy` for markup or
  Markdown) in addition to `process`. `copy` is also requested for `.js` and `.ts` files,
  because placeholder text, build stamps and other interface copy often live in content
  modules. Routing only decides which rule texts the agent reads, so this adds no
  detector findings; the cost is one more small topic for most JavaScript projects.
  Routes use only extensions the file walker collects (`.css`, `.scss`, `.html`, `.js`,
  `.jsx`, `.ts`, `.tsx`, `.vue`, `.svelte`, `.md`); a test walks real fixtures and fails
  on a glob the walker can never match.
- The audit skill describes the class, credits and routed topics.

### Removed

- No rule was removed. Generated output of the unshipped candidates
  `public-2026.10.04-1` to `-11` (each one listed above) is removed from the tree.

### Known

- JSON, `.mjs`, `.cjs`, `.astro`, `.mdx`, `.sass` and `.less` files do not route any topic:
  the walker does not collect them. JSON is left out on purpose, because a JSON route
  would request `copy` for every project through `package.json` and `tsconfig.json`.
  Interface copy kept only in such files is not routed to the `copy` rules. (The draft
  `public-2026.10.04-8` claimed a JSON, `.mjs` and `.cjs` route; the walker never passed
  those files, so the claim was wrong and is withdrawn here.)

- The `KR-` prefix covers both rules adapted from Jakub Krehel and rules from the
  author's own reviews (KR-18 to KR-21). It is an internal series name, not a claim of
  authorship; `credits` on each rule and `CREDITS.md` say which rules are adapted.

### Checksums

| File | SHA-256 of the payload (`checksum`) | Bytes |
|---|---|---|
| `index.json` | `8edff0793f949353cf31219ffccfb3a9d75690cd790e7bcc915a101ea9ea706f` | 6065 |
| `topics/copy.json` | `9752a7dcf487a36b0fe1e86520071aad2a9563016c5f309c6d231162d79cecaf` | 7019 |
| `topics/interface.json` | `fb1cdc4c6e4be0471c0af3a072d710a08b6923abbe0d8a76c883927c87a98068` | 28090 |
| `topics/process.json` | `c7d860c08a5020d6bab4310fa66efeb36a6833b50f2a69b5054e95dc4fb335f7` | 7325 |
