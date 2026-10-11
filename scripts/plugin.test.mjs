// Plugin and marketplace manifests for Claude Code and Codex. Both clients read
// .claude-plugin/plugin.json, .claude-plugin/marketplace.json, .mcp.json and
// skills/<name>/SKILL.md from this repository root, so these checks pin the
// fields both depend on.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const json = file => JSON.parse(read(file));

const ENDPOINT = 'https://oleg.design/unslop/mcp';
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const RESERVED_MARKETPLACES = new Set([
  'claude-code-marketplace', 'claude-code-plugins', 'claude-plugins-official', 'anthropic-marketplace',
  'anthropic-plugins', 'agent-skills', 'anthropic-agent-skills', 'first-party-plugins', 'claude-community',
  'claude-plugins-community', 'inline', 'builtin', 'skills-dir', 'synced', 'npm', 'pip', 'uv', 'cargo', 'github', 'gh',
]);

const plugin = json('.claude-plugin/plugin.json');
const marketplace = json('.claude-plugin/marketplace.json');
const mcp = json('.mcp.json');
const pkg = json('package.json');
const SKILL = 'skills/audit/SKILL.md';

test('plugin.json carries the identity both clients read', () => {
  assert.equal(plugin.name, 'unslop');
  assert.match(plugin.name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'kebab-case');
  assert.doesNotMatch(plugin.name, /^(?:claude|anthropic|cc-plugin)/i, 'reserved prefix');
  assert.equal(plugin.version, pkg.version, 'plugin version follows package.json');
  assert.equal(typeof plugin.description, 'string');
  assert.ok(plugin.description.length > 20);
  assert.equal(typeof plugin.author?.name, 'string');
  assert.equal(plugin.license, 'MIT AND CC-BY-4.0');
  assert.equal(plugin.repository, 'https://github.com/0design/unslop-skill');
  new URL(plugin.homepage);
});

test('skills live in skills/<name>/SKILL.md, the layout both clients scan', () => {
  assert.equal(plugin.skills, undefined, 'default skills/ scan; Codex ignores a custom skills path');
  assert.ok(!fs.existsSync(path.join(root, 'SKILL.md')), 'no skill at the plugin root');
  const names = fs.readdirSync(path.join(root, 'skills')).filter(name => !name.startsWith('.'));
  assert.ok(names.includes('audit'), 'the audit skill runs as /unslop:audit');
  for (const name of names) {
    assert.match(name, /^[a-z0-9-]+$/, name);
    const file = `skills/${name}/SKILL.md`;
    assert.match(read(file), new RegExp(`^---\\nname: ${name}\\n`), `${file}: frontmatter name equals folder`);
    for (const link of read(file).matchAll(/\]\((references\/[\w.-]+\.md)\)/g)) {
      assert.ok(fs.existsSync(path.join(root, 'skills', name, link[1])), `${file}: ${link[1]}`);
    }
  }
});

test('plugin.json declares no extra components and no paths outside the root', () => {
  const allowed = new Set(['name', 'displayName', 'version', 'description', 'author', 'homepage', 'repository',
    'license', 'keywords']);
  for (const key of Object.keys(plugin)) assert.ok(allowed.has(key), `unexpected key ${key}`);
});

test('.mcp.json declares exactly the read-only canon server over HTTPS, without credentials', () => {
  assert.deepEqual(Object.keys(mcp), ['mcpServers']);
  assert.deepEqual(Object.keys(mcp.mcpServers), ['unslop']);
  assert.deepEqual(mcp.mcpServers.unslop, { type: 'http', url: ENDPOINT });
  assert.equal(new URL(mcp.mcpServers.unslop.url).protocol, 'https:');
});

test('marketplace.json lists this repository root as the unslop plugin', () => {
  assert.equal(marketplace.name, 'unslop');
  assert.match(marketplace.name, ID);
  assert.ok(!RESERVED_MARKETPLACES.has(marketplace.name.toLowerCase()));
  assert.equal(typeof marketplace.description, 'string');
  assert.equal(typeof marketplace.owner?.name, 'string');
  assert.equal(marketplace.plugins.length, 1);
  const [entry] = marketplace.plugins;
  assert.equal(entry.name, plugin.name, 'entry name equals manifest name');
  assert.match(entry.name, ID);
  assert.equal(entry.source, './');
  assert.equal(entry.version, undefined, 'version lives in plugin.json only');
  assert.equal(entry.mcpServers, undefined, 'MCP servers live in .mcp.json only');
});

test('README install commands match the manifest names', () => {
  const readme = read('README.md');
  const id = `${plugin.name}@${marketplace.name}`;
  for (const line of [
    'claude plugin marketplace add 0design/unslop-skill',
    `claude plugin install ${id}`,
    '/unslop:audit',
    'unslop:audit',
    'codex plugin marketplace add 0design/unslop-skill',
    `codex plugin add ${id}`,
    `claude plugin uninstall ${id}`,
    `codex plugin remove ${id}`,
    ENDPOINT,
  ]) assert.ok(readme.includes(line), line);
});

test('SKILL.md Phase 0 connects the declared server before anything else', () => {
  const skill = read(SKILL);
  const phase0 = skill.slice(skill.indexOf('### Phase 0'), skill.indexOf('### Phase 1'));
  assert.ok(phase0.indexOf('unslop://canon-index/latest') < phase0.indexOf('canon-route.mjs'));
  for (const text of ['plugin:unslop:unslop', `claude mcp add --transport http unslop ${ENDPOINT}`,
    `codex mcp add unslop --url ${ENDPOINT}`, 'only after the user agrees', 'from the plugin root',
    '${CLAUDE_PLUGIN_DATA}/deps-<version>', '$CODEX_HOME/plugins/data/unslop/deps-<version>',
    'npm ci --ignore-scripts --prefix DEPS', 'run it only after the user agrees', 'never install without consent',
    'Without consent, if the install fails, or in a skill-only install, do not run the helper',
    'cp -R package.json package-lock.json skills DEPS/', 'node DEPS/skills/audit/scripts/canon-route.mjs',
    'A skill-only install (no plugin root, so no `package.json`)']) {
    assert.ok(phase0.includes(text), text);
  }
});

test('SKILL.md never installs into the plugin root and never installs without consent', () => {
  const skill = read(SKILL);
  const installs = [...skill.matchAll(/npm (?:ci|install)[^`\n]*/g)].map(match => match[0]);
  assert.deepEqual(installs, ['npm ci --ignore-scripts --prefix DEPS']);
  const at = skill.indexOf('npm ci --ignore-scripts --prefix DEPS');
  assert.ok(skill.lastIndexOf('run it only after the user agrees', at) > skill.lastIndexOf('### Phase 0', at), 'consent precedes the install');
});

test('plugin files are listed in PUBLIC_MANIFEST.md', () => {
  const manifest = read('PUBLIC_MANIFEST.md');
  for (const file of [SKILL, '.claude-plugin/plugin.json', '.claude-plugin/marketplace.json', '.mcp.json', 'scripts/plugin.test.mjs']) {
    assert.ok(manifest.includes(`| \`${file}\` |`), file);
  }
});

// The authoritative validator ships with Claude Code; run it when the CLI is installed.
test('claude plugin validate --strict passes (when the claude CLI is installed)', t => {
  const probe = spawnSync('claude', ['--version'], { encoding: 'utf8' });
  if (probe.status !== 0) return t.skip('claude CLI not installed');
  for (const target of ['.', '.claude-plugin/plugin.json']) {
    const run = spawnSync('claude', ['plugin', 'validate', target, '--strict'], { cwd: root, encoding: 'utf8' });
    assert.equal(run.status, 0, `${target}: ${run.stdout}${run.stderr}`);
  }
});

test('rule texts carry the attribution "UNSLOP by Oleg.Design" everywhere', () => {
  const ATTRIBUTION = 'UNSLOP by Oleg.Design';
  const records = json('canon/public/records.json');
  assert.ok(records.records.length > 0);
  for (const record of records.records) assert.equal(record.attribution, ATTRIBUTION, record.id);
  const generated = path.join(root, 'canon/public-generated', records.release.version, 'topics');
  for (const file of fs.readdirSync(generated)) {
    for (const rule of JSON.parse(fs.readFileSync(path.join(generated, file), 'utf8')).payload.rules) {
      assert.equal(rule.attribution, ATTRIBUTION, `${file} ${rule.id}`);
    }
  }
  const license = read('LICENSE-RULES.md');
  assert.ok(license.includes(`Attribution: **${ATTRIBUTION}** (https://oleg.design)`));
  assert.ok(read('README.md').includes('[CC BY 4.0](LICENSE-RULES.md)'), 'README links the rule licence');
  for (const file of ['LICENSE-RULES.md', 'README.md', 'canon/public/records.json']) {
    assert.ok(!read(file).includes('Oleg.Design — https://oleg.design'), `${file}: old attribution`);
  }
});

test('rules adapted from others carry credits, and CREDITS.md names every credited author', () => {
  const BORROWED = { 'KR-1': 'Jakub Krehel', 'KR-3': 'Jakub Krehel', 'KR-3d': 'Jakub Krehel', 'KR-4': 'Jakub Krehel', 'KR-5': 'Jakub Krehel',
    'KR-7': 'Jakub Krehel', 'KR-8': 'Jakub Krehel', 'KR-9': 'Jakub Krehel', 'KR-10': 'Jakub Krehel', 'KR-11': 'Jakub Krehel', 'KR-13': 'Jakub Krehel', 'KR-15': 'Jakub Krehel',
    'KR-16': 'Jakub Krehel', 'NR-02': 'Benji Taylor', 'LK-01': 'Nick DiLallo',
    'DEC-2': 'Refactoring UI', 'DEC-3': 'impeccable.style', 'DEC-6': 'impeccable.style', 'DEC-7': 'impeccable.style',
    'DEC-8': 'impeccable.style', 'DEC-9': 'impeccable.style' };
  const records = json('canon/public/records.json');
  const byId = new Map(records.records.map(record => [record.id, record]));
  for (const [id, name] of Object.entries(BORROWED)) {
    assert.ok(byId.get(id)?.credits?.some(credit => credit.name === name), `${id} credits ${name}`);
  }
  assert.ok(byId.get('KR-16').credits.some(credit => credit.name === 'invisibledetails.com'), 'KR-16 second source');
  for (const name of ['Aurora Harley (NN/g)', 'impeccable.style']) assert.ok(byId.get('DEC-2').credits.some(credit => credit.name === name), `DEC-2 credits ${name}`);
  for (const id of ['DEC-1', 'DEC-4', 'DEC-5']) assert.equal(byId.get(id).credits, undefined, `${id} has no external source`);
  const credits = read('CREDITS.md');
  for (const record of records.records) {
    for (const credit of record.credits ?? []) assert.ok(credits.includes(credit.name), `CREDITS.md names ${credit.name}`);
  }
});

test('public rule texts use US English spelling', () => {
  const records = json('canon/public/records.json');
  const texts = [
    ...records.records.flatMap(record => [record.title, record.statement, ...(record.credits ?? []).map(credit => credit.work)]),
    ...Object.values(records.release.classes ?? {}).flatMap(entry => [entry.title, entry.definition]),
  ];
  // `judgement` survives only as the schema value of `mode`, never in prose.
  const british = /\b\w*(?:colour|centre|centring|neighbour|catalogue|behaviour|judgement|organis|recognis|normalis|licence|favour|honour|grey)\w*\b/i;
  for (const text of texts) assert.doesNotMatch(text, british, text);
});

// A skill-only install (the skills CLI) copies skills/audit and nothing else, so everything the skill runs must
// resolve inside that folder. The detector itself must need nothing but Node.
const SKILL_DIR = path.join(root, 'skills/audit');
const SPECIFIERS = /^\s*(?:import|export)\b[^;'"]*?\bfrom\s*['"]([^'"\n]+)['"]|\bimport\s*\(\s*['"]([^'"\n]+)['"]\s*\)|^\s*import\s*['"]([^'"\n]+)['"]|new URL\(\s*['"](\.[^'"\n]*)['"]\s*,\s*import\.meta\.url\s*\)/gm;
const specifiersOf = file => [...fs.readFileSync(file, 'utf8').matchAll(SPECIFIERS)]
  .map(match => match[1] ?? match[2] ?? match[3] ?? match[4]);
const allMjs = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const full = path.join(dir, entry.name);
  return entry.isDirectory() ? allMjs(full) : entry.name.endsWith('.mjs') ? [full] : [];
});

function closureOutside(skillDir, entries, allowBare) {
  const problems = [];
  const seen = new Set();
  const queue = [...entries];
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    for (const spec of specifiersOf(file)) {
      if (spec.startsWith('node:')) continue;
      if (!spec.startsWith('.')) {
        if (!allowBare(spec)) problems.push(`${path.relative(skillDir, file)}: bare import ${spec}`);
        continue;
      }
      const target = path.resolve(path.dirname(file), spec);
      const inside = path.relative(skillDir, target);
      if (inside.startsWith('..') || path.isAbsolute(inside)) {
        problems.push(`${path.relative(skillDir, file)}: ${spec} leaves the skill folder`);
      } else if (!fs.existsSync(target)) {
        problems.push(`${path.relative(skillDir, file)}: ${spec} does not exist`);
      } else if (target.endsWith('.mjs')) {
        queue.push(target);
      }
    }
  }
  return { problems, files: seen };
}

test('the skill folder is self-contained: every import resolves inside skills/audit', () => {
  const entries = allMjs(SKILL_DIR);
  assert.ok(entries.length > 20, 'the detector and canon client ship in the skill folder');
  const { problems } = closureOutside(SKILL_DIR, entries, spec => spec.startsWith('@modelcontextprotocol/sdk/'));
  assert.deepEqual(problems, []);
  const detector = closureOutside(SKILL_DIR, [path.join(SKILL_DIR, 'scripts/detect.mjs')], () => false);
  assert.deepEqual(detector.problems, [], 'the detector imports only node: built-ins');
  assert.ok(detector.files.size > 10);
  for (const name of ['detect.mjs', 'canon-route.mjs', 'canon-server.mjs', 'canon-routed.mjs', 'lib', 'rules']) {
    assert.ok(!fs.existsSync(path.join(root, 'scripts', name)), `scripts/${name} has one copy, in the skill folder`);
  }
});

test('the self-containment check catches an import that leaves the skill folder', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unslop skill '));
  try {
    fs.mkdirSync(path.join(dir, 'skill/scripts'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'outside.mjs'), 'export const x = 1;\n');
    fs.writeFileSync(path.join(dir, 'skill/scripts/a.mjs'), "import { x } from '../../outside.mjs';\nimport 'left-pad';\n");
    const { problems } = closureOutside(path.join(dir, 'skill'), [path.join(dir, 'skill/scripts/a.mjs')], () => false);
    assert.equal(problems.length, 2, problems.join('\n'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('every scripts/ path named in SKILL.md exists in the skill folder', () => {
  const named = new Set([...read(SKILL).matchAll(/\bscripts\/[\w./-]*[\w/]/g)].map(match => match[0])
    .filter(name => !name.startsWith('scripts/…')));
  assert.ok(named.has('scripts/detect.mjs') && named.has('scripts/canon-route.mjs'));
  for (const name of named) assert.ok(fs.existsSync(path.join(SKILL_DIR, name)), name);
});

test('the detector runs from a copy of the skill folder alone and through a symlink, in a path with a space', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unslop skill '));
  try {
    const copy = path.join(dir, 'copied skills/audit');
    fs.cpSync(SKILL_DIR, copy, { recursive: true });
    const link = path.join(dir, 'linked skills/audit');
    fs.mkdirSync(path.dirname(link));
    fs.symlinkSync(copy, link, 'dir');
    const project = path.join(dir, 'my project');
    fs.mkdirSync(project);
    fs.copyFileSync(path.join(root, 'scripts/fixtures/B-1/slop/button.css'), path.join(project, 'button.css'));
    for (const skill of [copy, link]) {
      const run = spawnSync(process.execPath, [path.join(skill, 'scripts/detect.mjs'), project, '--json'],
        { cwd: dir, encoding: 'utf8' });
      assert.equal(run.status, 1, `${skill}: ${run.stderr}`);
      const findings = JSON.parse(run.stdout);
      assert.ok(findings.some(finding => finding.rule === 'B-1'), `${skill}: ${run.stdout}`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
