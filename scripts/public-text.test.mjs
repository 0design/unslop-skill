// scripts/check-public-text.mjs fails CI when internal process wording reaches the published tree, a pull request's
// title or description, or its commit messages. Every phrase below is assembled at run time, so this file does not
// carry the wording it checks for and passes its own scan.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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
  ['question-round', cat('qu', 'iz ', '4')],
  ['issue-key', cat('0', 'D-', '123')],
  ['issue-branch', cat('team/', '0', 'd-123-fix-wording')],
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
  assert.match(result.stdout, /1 hit\(s\), 0 allowlisted, \d+ mention\(s\) of rule ids defined here/);
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

test('the tracked files of this repository pass the guard', { skip: !existsSync(join(root, '.git')) }, () => {
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

test('every file is scanned except binary ones: jsx, tsx, dotfiles, shell and extensionless files included', () => {
  const dir = tree({
    'fixtures/card.jsx': `// ${OWNER_APPROVED}`,
    'fixtures/card.tsx': `// ${OWNER_APPROVED}`,
    '.gitignore': OWNER_APPROVED,
    'run.sh': `# ${OWNER_APPROVED}`,
    'notes.mdx': OWNER_APPROVED,
    'plain': OWNER_APPROVED,
  });
  writeFileSync(join(dir, 'image.png'), Buffer.from([0x89, 0x50, 0, 0]));
  const result = scan(dir);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  for (const name of ['fixtures/card.jsx', 'fixtures/card.tsx', '.gitignore', 'run.sh', 'notes.mdx', 'plain']) {
    assert.match(result.stdout, new RegExp(`^${name.replace('.', '\\.')}:1:\\d+  approval-wording`, 'm'), name);
  }
  assert.match(result.stdout, /scanned 6 text file\(s\).*1 skipped \(binary or \.map\)/);
});

test('emphasis, separators and other approval verbs are flagged', () => {
  const forms = [
    cat('**own', 'er** approved'),
    cat('_own', 'er_ approved'),
    cat('`own', 'er` approved'),
    cat('own', 'er: approved'),
    cat('own', 'er, approved'),
    cat('own', 'er \u2014 approved'),
    cat('own', 'er approves'),
    cat('own', 'er has approved'.replace(' has', '')),
    cat('own', 'er confirmed'),
    cat('own', 'er signed off'),
    cat('approved by ', 'own', 'er'),
    cat('approved by the project ', 'own', 'er'),
    cat('Ol', "eg's approval"),
    cat('Ol', 'eg: OK'),
    cat('Ol', 'eg Smith decided'),
    cat('own', 'er has already approved'),
    cat('[own', 'er] approved'),
    cat('own', 'er said'),
    cat('approved by our ', 'own', 'er'),
    cat('own', 'er/approved'),
  ];
  const result = scan(tree(Object.fromEntries(forms.map((form, index) => [`form-${index}.md`, form]))));
  assert.equal(result.status, 1, result.stdout + result.stderr);
  forms.forEach((form, index) => assert.match(result.stdout, new RegExp(`form-${index}\\.md:1:\\d+  `), form));
});

test('pull request numbers and branch names that carry a work item key are flagged', () => {
  for (const [text, id] of [
    [cat('PR', '#12'), 'pull-request-number'],
    [cat('PR ', '#12'), 'pull-request-number'],
    [cat('PR', '-12'), 'pull-request-number'],
    [cat('Merge pull request #1 from org/', '0', 'd-437-guard'), 'issue-branch'],
    [cat('0', 'D-1'), 'issue-key'],
    [cat('QF', '-GUARD-01'), 'internal-id'],
    [cat('RETRO', '-0927-16'), 'internal-id'],
  ]) {
    const result = scanText('commit-messages', `${text}\n`);
    assert.equal(result.status, 1, `${text}: ${result.stdout}${result.stderr}`);
    assert.match(result.stdout, new RegExp(`  ${id}  `), text);
  }
});

test('zero-width characters, soft hyphens and combining marks do not hide a phrase', () => {
  const hidden = [
    cat('own', '\u200b', 'er approved'),
    cat('own', '\u00ad', 'er approved'),
    cat('ow', '\u200d', 'ner approved'),
    cat('\uff4f\uff57\uff4e\uff45\uff52', ' approved'),
    cat('own', 'er appro\u0301', 'ved'),
  ];
  hidden.forEach((text, index) => assert.equal(scanText(`t-${index}`, `${text}\n`).status, 1, JSON.stringify(text)));
});

test('a quiz is flagged as a review step, not as a word', () => {
  assert.equal(scanText('t', 'per the ' + cat('qu', 'iz') + '\n').status, 1);
  assert.equal(scanText('t', cat('qu', 'iz ', 'round') + '\n').status, 1);
  assert.equal(scanText('t', 'A ' + cat('qu', 'iz') + ' app audit sample\n').status, 0);
});

test('Cyrillic text is reported once per run of letters, not per letter', () => {
  const result = scanText('t', `${String.fromCodePoint(0x43f, 0x440, 0x438, 0x432, 0x456, 0x442)} x\n`);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /1 hit\(s\)/);
});

test('a broken symlink is ignored and an invalid allowlist regex is a configuration error', () => {
  const dir = tree({ 'ok.md': 'plain' });
  symlinkSync(join(scratch, 'does-not-exist'), join(dir, 'dangling.md'));
  assert.equal(scan(dir).status, 0);
  const patterns = withPatterns((base) => ({
    ...base,
    allowlist: [{ id: 'plan-step', file: '*.md', re: '(', reason: 'fixture' }],
  }));
  assert.equal(scan(tree({ 'index.md': 'plain' }), ['--patterns', patterns]).status, 2);
});

test('an allowlist glob with ** matches whole path segments only', () => {
  const matched = cat('plan ', 'step');
  const patterns = withPatterns((base) => ({
    ...base,
    allowlist: [{ id: 'plan-step', file: 'a/**/b.md', text: matched, reason: 'fixture' }],
  }));
  const result = scan(tree({ 'a/b.md': matched, 'a/x/y/b.md': matched, 'a/prefix-b.md': matched }), ['--patterns', patterns]);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /a\/prefix-b\.md:1:\d+  plan-step/);
  assert.doesNotMatch(result.stdout, /a\/b\.md|a\/x\/y/);
});

test('long runs of an identifier prefix do not slow the scan down', () => {
  const started = Date.now();
  const result = scanText('pull-request-description', `${cat('QF', '-').repeat(200000)}\n${cat('BP', '-A1B-').repeat(100000)}\n`);
  assert.ok(result.status === 0 || result.status === 1, result.stderr);
  assert.ok(Date.now() - started < 5000, `scan took ${Date.now() - started} ms`);
});

test('long runs of emphasis characters do not slow the scan down', () => {
  const started = Date.now();
  const result = scanText('pull-request-description', `${cat('own', 'er')}${'*'.repeat(200000)}\n${cat('own', 'er')} ${'_ '.repeat(100000)}\n`);
  assert.ok(result.status === 0 || result.status === 1, result.stderr);
  assert.ok(Date.now() - started < 5000, `scan took ${Date.now() - started} ms`);
});

test('a file that is not valid UTF-8 is still scanned', () => {
  const dir = tree({ 'ok.md': 'plain' });
  writeFileSync(join(dir, 'latin1.md'), Buffer.concat([Buffer.from(OWNER_APPROVED), Buffer.from([0xff, 0xfe, 0x41])]));
  const result = scan(dir);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /latin1\.md:1:\d+  approval-wording/);
});

test('false positives seen in review stay quiet: numbers with PR, the word linear.apply, 3D-style words', () => {
  const clean = ['PR 1.0 of the spec', 'call linear.apply(x) and nonlinear.app', cat('a 4', 'K-60 display'), 'see PR\n12 later'].join('\n');
  const result = scanText('t', `${clean}\n`);
  assert.doesNotMatch(result.stdout, /pull-request-number|tracker-link/);
});
