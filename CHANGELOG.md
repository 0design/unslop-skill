# Changelog

Plugin releases and public canon versions. Rule texts are generated from
`canon/public/records.json` with `npm run canon:generate:public`; never edit
`canon/public-generated/` by hand.

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

**Wording status.** All rule texts and the four class definitions in this version are
owner-approved. US-001, US-003 to US-008 and US-010 keep the wording approved on
2026-10-02; every other text in this version, including the replaced US-002, the
narrowed US-009, the DEC family and the class definitions, was approved by the owner on
2026-10-05 without edits.

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
- The leak scan also rejects private candidate-card and owner-project decision IDs.

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
  English (color, center, neighbor, judgment, catalog), matching the owner-approved
  wording of US-003 and US-006. The schema value `mode: "judgement"` is an identifier and
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
