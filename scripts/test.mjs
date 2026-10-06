// test.mjs — every implemented rule must fire on its slop fixture and stay
// silent on its near-miss clean fixture. Run: node --test scripts/test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_RULES, selectRules, sectionOf } from './rules/index.mjs';
import { detect, parseArgs } from './detect.mjs';
import { classifyVerdict } from './lib/verdict.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(here, 'fixtures');

function fixtureDir(id, kind) {
  return path.join(FIXTURES, id, kind);
}

test('every rule ships a slop and a clean fixture', () => {
  for (const rule of ALL_RULES) {
    for (const kind of ['slop', 'clean']) {
      const dir = fixtureDir(rule.id, kind);
      assert.ok(fs.existsSync(dir), `missing fixture dir ${rule.id}/${kind}`);
      const files = fs.readdirSync(dir).filter((f) => !f.startsWith('.'));
      assert.ok(files.length > 0, `empty fixture dir ${rule.id}/${kind}`);
    }
  }
});

for (const rule of ALL_RULES) {
  test(`${rule.id} fires on its slop fixture`, () => {
    const { findings } = detect(fixtureDir(rule.id, 'slop'), { rules: [rule.id] });
    const mine = findings.filter((f) => f.rule === rule.id);
    assert.ok(
      mine.length > 0,
      `${rule.id} did not fire on ${fixtureDir(rule.id, 'slop')} (got: ${JSON.stringify(findings)})`,
    );
    for (const f of mine) {
      assert.equal(f.severity, rule.severity);
      assert.ok(f.line >= 1, 'finding must carry a 1-based line');
      assert.ok(String(f.excerpt).length > 0, 'finding must carry an excerpt');
    }
  });

  test(`${rule.id} stays silent on its clean fixture`, () => {
    const { findings } = detect(fixtureDir(rule.id, 'clean'), { rules: [rule.id] });
    const mine = findings.filter((f) => f.rule === rule.id);
    assert.deepEqual(
      mine.map((f) => `${f.file}:${f.line} ${f.excerpt}`),
      [],
      `${rule.id} false-positived on its clean fixture`,
    );
  });
}

test('rule objects are well formed', () => {
  const severities = new Set(['red', 'orange', 'white']);
  for (const rule of ALL_RULES) {
    // Catalog v2 splits some criteria into sub-IDs: DS-2a / DS-2b, B-6a / B-6b, …
    assert.match(rule.id, /^[A-Z]{1,2}-\d+[a-z]?$/, `bad rule id: ${rule.id}`);
    assert.ok(severities.has(rule.severity), `bad severity on ${rule.id}`);
    assert.ok(rule.title && rule.why, `${rule.id} needs title and why`);
    assert.ok(Array.isArray(rule.fileTypes) && rule.fileTypes.length > 0, `${rule.id} needs fileTypes`);
    assert.ok(
      typeof rule.test === 'function' ||
        typeof rule.testFile === 'function' ||
        typeof rule.testProject === 'function',
      `${rule.id} needs a test / testFile / testProject`,
    );
  }
});

test('--rules filters by section and by rule id', () => {
  assert.equal(
    selectRules(['G']).every((r) => sectionOf(r.id) === 'G'),
    true,
  );
  assert.deepEqual(selectRules(['g-4']).map((r) => r.id), ['G-4']);
  assert.equal(selectRules(null).length, ALL_RULES.length);
});

test('walker skips node_modules, dist and minified files', () => {
  const { findings } = detect(FIXTURES, { rules: ['B-1'] });
  assert.ok(findings.every((f) => !/node_modules|dist|\.min\./.test(f.file)));
});

test('scanning the whole fixture tree produces findings across sections', () => {
  const { findings, scanned } = detect(FIXTURES);
  assert.ok(scanned >= 74, `expected the full fixture tree, scanned ${scanned}`);
  const sections = new Set(findings.map((f) => sectionOf(f.rule)));
  for (const expected of ['B', 'G', 'J']) {
    assert.ok(sections.has(expected), `no findings from section ${expected}`);
  }
});

function b1Findings(name) {
  return detect(path.join(FIXTURES, 'conditional-b1', name), { rules: ['B-1', 'DS-2a'] }).findings;
}

test('hex in CSS without var is one B-1 violation', () => {
  const findings = b1Findings('css-hex.css');
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, 'B-1');
  assert.equal(findings[0].line, 2);
  assert.equal(findings[0].exceptionCandidate, undefined);
});

test('CSS with var(--x) and a raw hex is one DS-2a finding', () => {
  const findings = b1Findings('css-var.css');
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, 'DS-2a');
  assert.equal(findings[0].line, 3);
  assert.equal(findings.some((f) => f.rule === 'B-1'), false);
});

test('hex fill in an SVG logo is a brand-svg exception candidate', () => {
  const findings = b1Findings('logo.jsx');
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, 'B-1');
  assert.equal(findings[0].line, 4);
  assert.equal(findings[0].exceptionCandidate, 'brand-svg-logo');
  assert.match(findings[0].excerpt, /#123456/);
});

test('JSX with var(--x) and an inline SVG logo keeps one brand-svg question', () => {
  const findings = b1Findings('logo-token.jsx');
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, 'B-1');
  assert.equal(findings[0].exceptionCandidate, 'brand-svg-logo');
  assert.match(findings[0].excerpt, /fill="#ff3b00"/);
  assert.equal(findings.some((f) => f.rule === 'DS-2a'), false);
});

test('the same JSX hex outside the svg is one DS-2a and not a logo question', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unslop-b1-'));
  const file = path.join(dir, 'card.jsx');
  fs.writeFileSync(
    file,
    `export function BrandCard() {
  return (
    <div style={{ color: 'var(--x)', background: '#ff3b00' }}>
      <span>mark</span>
    </div>
  );
}
`,
  );
  const findings = detect(file, { rules: ['B-1', 'DS-2a'] }).findings;
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, 'DS-2a');
  assert.equal(findings[0].exceptionCandidate, undefined);
});

test('dropping the svg wrapper turns the logo hex into DS-2a', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unslop-b1-'));
  const file = path.join(dir, 'card.jsx');
  const source = fs.readFileSync(path.join(FIXTURES, 'conditional-b1', 'logo-token.jsx'), 'utf8');
  fs.writeFileSync(file, source.replace(/<\/?svg[^>]*>/g, ''));
  const findings = detect(file, { rules: ['B-1', 'DS-2a'] }).findings;
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, 'DS-2a');
  assert.equal(findings[0].exceptionCandidate, undefined);
});

test('fill in a non-logo SVG icon is the same exception candidate', () => {
  const findings = b1Findings('icon.jsx');
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, 'B-1');
  assert.equal(findings[0].line, 4);
  assert.equal(findings[0].exceptionCandidate, 'brand-svg-logo');
  assert.match(findings[0].excerpt, /fill="#abcdef"/);
});

test('a token definition line is silent and a neighbour hex in that file is one B-1', () => {
  const findings = b1Findings('tokens.css');
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, 'B-1');
  assert.equal(findings[0].line, 3);
  assert.match(findings[0].excerpt, /color:\s*#123456/);
  assert.equal(findings.some((f) => f.line === 2), false);
  assert.equal(findings.some((f) => f.rule === 'DS-2a'), false);
});

test('a comment inside a token file is B-1, not exempt', () => {
  const findings = b1Findings('tokens-comment.css');
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, 'B-1');
  assert.equal(findings[0].line, 3);
  assert.match(findings[0].excerpt, /#FFFFFF/);
  assert.equal(findings.some((f) => f.line === 2), false);
});

test('a definition line in that token file stays silent', () => {
  const findings = b1Findings('tokens-comment.css');
  assert.equal(findings.some((f) => f.excerpt.includes('--color-brand')), false);
});

test('removing the hex from the token-file comment removes the finding', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unslop-b1-'));
  const file = path.join(dir, 'tokens.css');
  const source = fs.readFileSync(path.join(FIXTURES, 'conditional-b1', 'tokens-comment.css'), 'utf8');
  fs.writeFileSync(file, source.replace('#FFFFFF', 'white'));
  const findings = detect(file, { rules: ['B-1', 'DS-2a'] }).findings;
  assert.deepEqual(findings, []);
});

test('a component variable with a raw colour beside var() is one DS-2a violation', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unslop-c2-'));
  fs.mkdirSync(path.join(dir, 'components'));
  const file = path.join(dir, 'components', 'card.css');
  fs.writeFileSync(file, `.card {\n  --card-accent: #ff3b00;\n  color: var(--card-accent);\n}\n`);
  const findings = detect(dir, { rules: ['B-1', 'DS-2a'] }).findings;
  assert.equal(findings.length, 1);
  assert.equal(findings[0].file, 'components/card.css');
  assert.equal(findings[0].rule, 'DS-2a');
  assert.match(findings[0].excerpt, /--card-accent:\s*#ff3b00/);
  assert.equal(findings.some((f) => f.rule === 'B-1'), false);
  const classified = classifyVerdict({
    id: 'DS-2a',
    verdictKind: 'unconditional-bad',
    exceptions: [],
  }, { finding: findings[0] });
  assert.equal(classified.status, 'violation');
});

test('--x: #f00 in component CSS is B-1 and the same line in a token file is silent', () => {
  const component = b1Findings('components/card.css');
  assert.equal(component.length, 1);
  assert.equal(component[0].rule, 'B-1');
  assert.equal(component[0].line, 2);
  assert.match(component[0].excerpt, /--x:\s*#f00/);
  assert.equal(component.some((f) => f.rule === 'DS-2a'), false);
  assert.deepEqual(b1Findings('palette/tokens.css'), []);
});

test('the same definition is silent once the file is a token file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unslop-b1-'));
  const file = path.join(dir, 'tokens.css');
  fs.writeFileSync(file, fs.readFileSync(path.join(FIXTURES, 'conditional-b1', 'components/card.css')));
  assert.deepEqual(detect(file, { rules: ['B-1', 'DS-2a'] }).findings, []);
});

test('a token-file line that defines and uses a raw colour is B-1 on the use', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unslop-theme-tokens-'));
  const file = path.join(dir, 'theme', 'tokens', 'mixed.css');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, fs.readFileSync(path.join(FIXTURES, 'conditional-b1', 'theme/tokens/mixed.css')));
  const findings = detect(dir, { rules: ['B-1', 'DS-2a'] }).findings;
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, 'B-1');
  assert.equal(findings[0].file, 'theme/tokens/mixed.css');
  assert.equal(findings[0].line, 3);
  assert.match(findings[0].excerpt, /color:\s*#123/);
  assert.equal(findings.some((f) => f.line === 2), false);
});

test('a project folder named tokens or design-tokens does not silence definitions', () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'unslop-root-tokens-'));
  const source = ':root {\n  --background: #ffffff;\n}\n';
  for (const folder of ['tokens', 'design-tokens']) {
    const dir = path.join(parent, folder);
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'app.css'), source);
    const findings = detect(dir, { rules: ['B-1', 'DS-2a'] }).findings;
    assert.equal(findings.length, 1, folder);
    assert.equal(findings[0].rule, 'B-1', folder);
    assert.equal(findings[0].file, 'app.css', folder);
    assert.match(findings[0].excerpt, /--background:\s*#ffffff/);
  }
});

test('a tokens directory is not a token file unless the file name or an explicit path says so', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unslop-any-tokens-'));
  const source = ':root {\n  --background: #ffffff;\n}\n';
  const nested = path.join(dir, 'src', 'tokens', 'colors.css');
  fs.mkdirSync(path.dirname(nested), { recursive: true });
  fs.writeFileSync(nested, source);
  const noisy = detect(dir, { rules: ['B-1', 'DS-2a'] }).findings;
  assert.equal(noisy.length, 1);
  assert.equal(noisy[0].file, 'src/tokens/colors.css');
  assert.equal(noisy[0].rule, 'B-1');
  const named = path.join(dir, 'src', 'tokens', 'tokens.css');
  fs.writeFileSync(named, source);
  const files = detect(dir, { rules: ['B-1', 'DS-2a'] }).findings;
  assert.equal(files.length, 1);
  assert.equal(files[0].file, 'src/tokens/colors.css');
  const explicit = path.join(dir, 'design-tokens', 'palette.css');
  fs.mkdirSync(path.dirname(explicit), { recursive: true });
  fs.writeFileSync(explicit, source);
  const afterExplicit = detect(dir, { rules: ['B-1', 'DS-2a'] }).findings;
  assert.equal(afterExplicit.some((finding) => finding.file === 'design-tokens/palette.css'), false);
  assert.equal(afterExplicit.some((finding) => finding.file === 'src/tokens/colors.css'), true);
});

test('globals.css with a raw custom property is a violation and tokens.css is silent', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unslop-tokens-'));
  const source = ':root {\n  --card-accent: #ff3b00;\n}\n';
  const globals = path.join(dir, 'globals.css');
  fs.writeFileSync(globals, source);
  const broad = detect(globals, { rules: ['B-1', 'DS-2a'] }).findings;
  assert.equal(broad.length, 1);
  assert.equal(broad[0].rule, 'B-1');
  assert.match(broad[0].excerpt, /--card-accent:\s*#ff3b00/);
  for (const name of ['root.css', 'system.css', 'ds.css', 'vars.css']) {
    const file = path.join(dir, name);
    fs.writeFileSync(file, source);
    const findings = detect(file, { rules: ['B-1', 'DS-2a'] }).findings;
    assert.equal(findings.length, 1, name);
    assert.equal(findings[0].rule, 'B-1', name);
  }
  const tokens = path.join(dir, 'tokens.css');
  fs.writeFileSync(tokens, source);
  assert.deepEqual(detect(tokens, { rules: ['B-1', 'DS-2a'] }).findings, []);
  const dotted = path.join(dir, 'brand.tokens.css');
  fs.writeFileSync(dotted, source);
  assert.deepEqual(detect(dotted, { rules: ['B-1', 'DS-2a'] }).findings, []);
  const design = path.join(dir, 'design-tokens.css');
  fs.writeFileSync(design, source);
  assert.deepEqual(detect(design, { rules: ['B-1', 'DS-2a'] }).findings, []);
});

test('a checkout inside tokens-kit or tokens-studio-app does not silence ordinary CSS', () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'unslop-abs-'));
  const source = ':root {\n  --background: #ffffff;\n}\n';
  for (const folder of ['tokens-kit', 'tokens-studio-app']) {
    const dir = path.join(parent, folder);
    fs.mkdirSync(dir);
    const file = path.join(dir, 'app.css');
    fs.writeFileSync(file, source);
    const findings = detect(dir, { rules: ['B-1', 'DS-2a'] }).findings;
    assert.equal(findings.length, 1, folder);
    assert.equal(findings[0].rule, 'B-1', folder);
    assert.equal(findings[0].file, 'app.css', folder);
    assert.match(findings[0].excerpt, /--background:\s*#ffffff/);
  }
});

test('_tokens.scss is a token file and the same colour in a renamed partial is not', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unslop-partial-'));
  const source = ':root {\n  --background: #ffffff;\n}\n.logo {\n  color: #abcdef;\n}\n';
  const partial = path.join(dir, '_tokens.scss');
  fs.writeFileSync(partial, source);
  const silentDef = detect(partial, { rules: ['B-1', 'DS-2a'] }).findings;
  assert.equal(silentDef.length, 1);
  assert.equal(silentDef[0].rule, 'B-1');
  assert.equal(silentDef[0].line, 5);
  assert.match(silentDef[0].excerpt, /#abcdef/);
  assert.equal(silentDef.some((f) => f.excerpt.includes('--background')), false);
  const renamed = path.join(dir, '_colors.scss');
  fs.writeFileSync(renamed, ':root {\n  --background: #ffffff;\n}\n');
  const findings = detect(renamed, { rules: ['B-1', 'DS-2a'] }).findings;
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, 'B-1');
  assert.match(findings[0].excerpt, /--background:\s*#ffffff/);
});

test('replacing the usage with a token removes the finding and leaves the definition', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unslop-b1-'));
  const file = path.join(dir, 'tokens.css');
  const source = fs.readFileSync(path.join(FIXTURES, 'conditional-b1', 'theme/tokens/mixed.css'), 'utf8');
  fs.writeFileSync(file, source.replace('color: #123', 'color: var(--a)'));
  assert.deepEqual(detect(file, { rules: ['B-1', 'DS-2a'] }).findings, []);
});

test('argument parsing', () => {
  assert.deepEqual(parseArgs(['src']).path, 'src');
  assert.equal(parseArgs(['src', '--json']).json, true);
  assert.deepEqual(parseArgs(['src', '--rules', 'B,G']).rules, ['B', 'G']);
  assert.deepEqual(parseArgs(['src', '--rules=B,G']).rules, ['B', 'G']);
  assert.equal(parseArgs(['src', '--max-findings', '5']).maxFindings, 5);
  assert.ok(parseArgs([]).error, 'missing path must be a usage error');
  assert.ok(parseArgs(['src', '--nope']).error, 'unknown flag must be a usage error');
  assert.ok(parseArgs(['src', '--max-findings', 'x']).error, 'bad number must be a usage error');
  assert.ok(parseArgs(['a', 'b']).error, 'extra positional must be a usage error');
  assert.equal(parseArgs(['--help']).help, true);
});
