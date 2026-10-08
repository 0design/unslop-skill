// scripts/check-public-text.mjs fails CI when internal process wording reaches the published tree, a pull request's
// title or description, or its commit messages. Every phrase below is assembled at run time, so this file does not
// carry the wording it checks for and passes its own scan.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const guard = join(root, 'scripts/check-public-text.mjs');
const patternsFile = join(root, 'scripts/public-text-patterns.json');
const scratch = mkdtempSync(join(tmpdir(), 'public-text-guard-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

const cat = (...parts) => parts.join('');
let counter = 0;
function tree(files) {
  counter += 1;
  const dir = join(scratch, `tree-${counter}`);
  for (const [name, content] of Object.entries(files)) {
    const file = join(dir, name);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
  return dir;
}
const scan = (dir, extra = []) => spawnSync(process.execPath, [guard, dir, ...extra], { encoding: 'utf8' });
const scanText = (name, text, extra = []) => spawnSync(process.execPath, [guard, '--stdin', name, ...extra], { input: text, encoding: 'utf8' });
const config = () => JSON.parse(readFileSync(patternsFile, 'utf8'));
function withPatterns(change) {
  counter += 1;
  const file = join(scratch, `patterns-${counter}.json`);
  writeFileSync(file, JSON.stringify(change(config())));
  return file;
}

const OWNER_APPROVED = cat('own', 'er ', 'approved');
// One sample per pattern id. A pattern removed or broken in the list leaves its sample unflagged and the test fails.
const SAMPLES = [
  ['approval-wording', OWNER_APPROVED],
  ['person-approval', cat('approv', 'ed by ', 'Ol', 'eg')],
  ['person-verb', cat('Ol', 'eg ', 'said')],
  ['cyrillic', String.fromCodePoint(0x43f, 0x440, 0x438, 0x432, 0x456, 0x442)],
  ['question-round', cat('qu', 'iz')],
  ['issue-key', cat('0', 'D-', '123')],
  ['tracker-link', cat('linear', '.app/', 'team')],
  ['plan-step', cat('plan ', 'step')],
  ['review-round', cat('review ', 'round')],
  ['pull-request-number', cat('PR ', '#', '12')],
  ['do-not-merge', cat('do not ', 'merge')],
  ['internal-id', cat('BP', '-', '09')],
  ['rule-id', cat('KR', '-', '9990')],
];

test('every pattern id has a sample that the guard flags, in a file and on standard input', () => {
  assert.deepEqual(SAMPLES.map(([id]) => id).sort(), config().patterns.map((pattern) => pattern.id).sort(), 'one sample per pattern id');
  const result = scan(tree(Object.fromEntries(SAMPLES.map(([id, sample]) => [`${id}.md`, `Text: ${sample}\n`]))));
  assert.equal(result.status, 1, result.stdout + result.stderr);
  for (const [id] of SAMPLES) assert.match(result.stdout, new RegExp(`${id}\\.md:1:\\d+  ${id}  "`), `${id} is not flagged`);
  for (const [id, sample] of SAMPLES) {
    const piped = scanText('pull-request-description', `Intro\n${sample}\n`);
    assert.equal(piped.status, 1, `${id}: ${piped.stdout}${piped.stderr}`);
    assert.match(piped.stdout, new RegExp(`pull-request-description:2:\\d+  ${id}  "`), id);
  }
});

test('the negative example fails in a changelog, a script and pull request text', () => {
  const fixture = tree({ 'CHANGELOG.md': `- Fixed a rule (${OWNER_APPROVED}).\n`, 'scripts/x.mjs': `// ${OWNER_APPROVED}\n` });
  const result = scan(fixture);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /CHANGELOG\.md:1:\d+  approval-wording/);
  assert.match(result.stdout, /scripts\/x\.mjs:1:\d+  approval-wording/);
  assert.equal(scanText('pull-request-title', `Fix (${OWNER_APPROVED})`).status, 1);
  assert.equal(scanText('commit-messages', `Fix\n\n${OWNER_APPROVED}\n`).status, 1);
});

test('clean text passes and reports the scanned count', () => {
  const dir = tree({ 'README.md': '# unslop\n\nAn audit skill for coding agents. Co-Authored-By: Someone <a@example.com>\n' });
  const result = scan(dir);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /scanned 1 text file\(s\), 0 hit\(s\), 0 allowlisted/);
  assert.equal(scanText('pull-request-title', 'Add a text guard for pull requests').status, 0);
});

test('escaped and hyphenated forms of the owner wording are flagged', () => {
  const forms = [
    cat('own', 'er&#x27;s ', 'decision'),
    cat('own', 'er&rsquo;s ', 'OK'),
    cat('own', 'er\\u2019s ', 'decision'),
    cat('own', 'er-', 'approved'),
    cat('own', 'er&nbsp;', 'approval'),
  ];
  const result = scan(tree(Object.fromEntries(forms.map((form, index) => [`form-${index}.md`, form]))));
  assert.equal(result.status, 1, result.stdout + result.stderr);
  forms.forEach((form, index) => assert.match(result.stdout, new RegExp(`form-${index}\\.md:1:\\d+  approval-wording`), form));
});

test('a rule id the repository defines is not a hit, one it does not define is', () => {
  const canon = readFileSync(join(root, 'canon/public/records.json'), 'utf8');
  const defined = canon.match(/\b(?:US|UR|KR|XP|DEC|TY|LK|NR)-\d+\b/)?.[0];
  assert.ok(defined, 'the published canon defines at least one such rule id');
  const result = scan(tree({ 'a.md': `See ${defined} and J-3.\n`, 'b.md': `See ${cat('KR', '-', '9990')}.\n` }));
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.doesNotMatch(result.stdout, /a\.md/);
  assert.match(result.stdout, /b\.md:1:\d+  rule-id/);
  assert.match(result.stdout, /1 hit\(s\), 0 allowlisted, \d+ rule id\(s\) defined here/);
});

test('knownFrom pointing at nothing is a configuration error', () => {
  for (const knownFrom of ['canon/no-such-folder', ['canon/public', 'no/such/path']]) {
    const patterns = withPatterns((base) => ({
      ...base,
      patterns: base.patterns.map((pattern) => (pattern.id === 'rule-id' ? { ...pattern, knownFrom } : pattern)),
    }));
    const result = scan(tree({ 'index.md': 'plain' }), ['--patterns', patterns]);
    assert.equal(result.status, 2, `${JSON.stringify(knownFrom)}: ${result.stdout}${result.stderr}`);
  }
});

test('an allowlist entry exempts only its pattern, file glob and exact text', () => {
  const matched = cat('own', 'er ', 'decision');
  const patterns = withPatterns((base) => ({
    ...base,
    allowlist: [{ id: 'approval-wording', file: 'allowed/**/*.md', text: matched, reason: 'fixture' }],
  }));
  const result = scan(tree({ 'allowed/deep/page.md': matched, 'other/page.md': matched }), ['--patterns', patterns]);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /other\/page\.md:1:\d+  approval-wording/);
  assert.doesNotMatch(result.stdout, /allowed\/deep/);
  assert.match(result.stdout, /1 hit\(s\), 1 allowlisted/);
});

test('an allowlist entry without a reason, with an unknown key or an unknown pattern is a configuration error', () => {
  const cases = [
    [{ id: 'plan-step', file: '*.md', text: 'x' }],
    [{ id: 'plan-step', file: '*.md', text: 'x', reason: 'fixture', context: 'x' }],
    [{ id: 'no-such-pattern', file: '*.md', text: 'x', reason: 'fixture' }],
  ];
  for (const allowlist of cases) {
    const patterns = withPatterns((base) => ({ ...base, allowlist }));
    assert.equal(scan(tree({ 'index.md': 'plain' }), ['--patterns', patterns]).status, 2, JSON.stringify(allowlist));
  }
});

test('an empty directory, empty standard input, a missing directory and a bad option are errors, not passes', () => {
  const empty = join(scratch, 'empty');
  mkdirSync(empty);
  assert.equal(scan(empty).status, 2);
  assert.equal(scanText('commit-messages', '  \n').status, 2);
  assert.equal(scan(join(scratch, 'missing')).status, 2);
  assert.equal(spawnSync(process.execPath, [guard, '--stdin'], { encoding: 'utf8' }).status, 2);
  assert.equal(spawnSync(process.execPath, [guard, '--nope'], { encoding: 'utf8' }).status, 2);
});

test('binary files and .map files are skipped, an extensionless text file is scanned', () => {
  const dir = tree({ 'bundle.js.map': OWNER_APPROVED, 'plain': OWNER_APPROVED, 'ok.md': 'fine' });
  writeFileSync(join(dir, 'image.png'), Buffer.concat([Buffer.from([0x89, 0x50, 0, 0]), Buffer.from(OWNER_APPROVED)]));
  const result = scan(dir);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /^plain:1:\d+  approval-wording/m);
  assert.doesNotMatch(result.stdout, /bundle\.js\.map|image\.png/);
});

test('a long one-line file prints a bounded fragment', () => {
  const filler = 'x'.repeat(3000);
  const result = scan(tree({ 'long.md': `${filler} ${OWNER_APPROVED} ${filler}` }));
  assert.equal(result.status, 1, result.stdout + result.stderr);
  const line = result.stdout.split('\n').find((item) => item.startsWith('long.md:'));
  assert.ok(line && line.length < 200, 'the hit line does not echo the whole file line');
});

test('the pattern list and this test file pass their own scan', () => {
  const dir = tree({});
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  copyFileSync(patternsFile, join(dir, 'scripts/public-text-patterns.json'));
  copyFileSync(fileURLToPath(import.meta.url), join(dir, 'scripts/public-text.test.mjs'));
  copyFileSync(guard, join(dir, 'scripts/check-public-text.mjs'));
  const result = scan(dir);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('the tracked files of this repository pass the guard', () => {
  const result = spawnSync(process.execPath, [guard], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('the pattern list and allowlist are well formed', () => {
  const { patterns, allowlist } = config();
  const ids = new Set(patterns.map((pattern) => pattern.id));
  assert.equal(ids.size, patterns.length, 'pattern ids are unique');
  for (const pattern of patterns) {
    assert.ok(pattern.re && pattern.why, `${pattern.id} needs re and why`);
    assert.doesNotThrow(() => new RegExp(pattern.re, `${pattern.flags}g`), pattern.id);
  }
  for (const entry of allowlist) {
    assert.ok(ids.has(entry.id) && entry.file && entry.reason, `${entry.id}: allowlist entry is incomplete`);
    assert.ok((typeof entry.text === 'string') !== (typeof entry.re === 'string'), `${entry.id} needs exactly one of text or re`);
  }
});
