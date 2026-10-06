import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detect } from './detect.mjs';
import { evidenceLineHash } from './lib/project-context.mjs';
import {
  EXAMPLE_RULES,
  FINDING_STATUSES,
  applyVerdicts,
  auditRunStatus,
  buildVerdictShowcaseHtml,
  cardModel,
  classifyVerdict,
  evaluateCondition,
  headerMark,
  presentVerdict,
  showcaseCards,
} from './lib/verdict.mjs';

const fixture = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/verdict-kinds/b2.tsx');

function oneStatus(result) {
  assert.equal(Object.hasOwn(result, 'status'), true);
  assert.ok(FINDING_STATUSES.includes(result.status), result.status);
  const labels = Object.keys(result).filter(key => /status|verdict/i.test(key));
  assert.deepEqual(labels, ['status']);
}

function mark(html) {
  const match = html.match(/<div class="mark"[^>]*data-pass-mark="(yes|no)"[^>]*>([^<]*)</);
  assert.ok(match, 'header mark');
  return { pass: match[1], glyph: match[2] };
}

test('B-2 text-gray-500 is a violation and a line without a palette class is not', () => {
  const { findings } = detect(fixture, { rules: ['B-2'] });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].line, 4);
  assert.match(findings[0].excerpt, /text-gray-500/);
  const classified = classifyVerdict(EXAMPLE_RULES['B-2'], { finding: findings[0] });
  oneStatus(classified);
  assert.equal(classified.status, 'violation');
  assert.equal(classified.question, null);
  const card = cardModel(EXAMPLE_RULES['B-2'], classified, {
    file: 'card.tsx',
    line: 4,
    excerpt: findings[0].excerpt,
  });
  assert.equal(card.asks, false);
  assert.match(card.paragraphs[0], /text-gray-500/);
  assert.equal(card.paragraphs[0].includes('bg-white'), false);
  assert.match(card.paragraphs[2], /No yes\/no question/);
  const bare = cardModel(EXAMPLE_RULES['B-2'], classified, {});
  assert.equal(bare.paragraphs.some(line => /Evidence:/.test(line)), false);
  assert.equal(bare.paragraphs.some(line => line === 'Evidence: .'), false);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unslop-b2-'));
  const file = path.join(dir, 'card.tsx');
  fs.writeFileSync(file, fs.readFileSync(fixture, 'utf8').replace('text-gray-500', 'text-muted'));
  assert.deepEqual(detect(file, { rules: ['B-2'] }).findings, []);
});

test('DS-2 is a warning card naming DS-2a and DS-2b, not a violation', () => {
  const classified = classifyVerdict(EXAMPLE_RULES['DS-2'], {});
  oneStatus(classified);
  assert.equal(classified.status, 'warning');
  assert.equal(classified.question, null);
  assert.deepEqual(classified.replacedBy, ['DS-2a', 'DS-2b']);
  const card = cardModel(EXAMPLE_RULES['DS-2'], classified);
  assert.equal(card.status, 'warning');
  assert.match(card.heading, /retired/);
  assert.match(card.paragraphs[0], /DS-2a \(a literal value used although a matching token is available\)/);
  assert.match(card.paragraphs[0], /DS-2b \(a local re-implementation of something the library provides\)/);
  assert.match(card.paragraphs[1], /a warning, not a violation/);
  const asViolation = { ...EXAMPLE_RULES['DS-2'], verdictKind: 'unconditional-bad', exceptions: [] };
  delete asViolation.replacedBy;
  const mutated = classifyVerdict(asViolation, { finding: { file: 'card.tsx', line: 1 } });
  assert.equal(mutated.status, 'violation');
});

test('DS-4 asks when no branch is true, and a true or-branch does not ask', () => {
  const none = classifyVerdict(EXAMPLE_RULES['DS-4'], {});
  oneStatus(none);
  assert.equal(none.status, 'needs-decision');
  assert.equal(none.question.id, 'source-declared');
  assert.equal(headerMark({ operatorPass: true, findings: [none] }).showCheck, false);
  const card = cardModel(EXAMPLE_RULES['DS-4'], none, { file: 'tokens.css', line: 40 });
  assert.equal(card.asks, true);
  assert.match(card.paragraphs[0], /declare a token source\? Yes \/ No/);
  assert.match(card.paragraphs[1], /scripts\/rules\/ds\.mjs:5/);
  assert.match(card.paragraphs[2], /tokens\.css:40/);
  assert.match(card.paragraphs[3], /no ✓/);

  const secondTrue = classifyVerdict(EXAMPLE_RULES['DS-4'], {
    facts: { 'finding.claimsSourceParity': true, 'finding.parityMissing': true },
  });
  oneStatus(secondTrue);
  assert.equal(secondTrue.status, 'violation');
  assert.equal(secondTrue.question, null);
  const silentCard = cardModel(EXAMPLE_RULES['DS-4'], secondTrue, { file: 'tokens.css', line: 40 });
  assert.equal(silentCard.asks, false);
  assert.equal(silentCard.paragraphs.some(line => /Yes \/ No/.test(line)), false);

  const opened = classifyVerdict(EXAMPLE_RULES['DS-4'], {
    facts: { 'finding.claimsSourceParity': true },
  });
  assert.equal(opened.status, 'needs-decision');
  assert.ok(opened.question);
  const drift = classifyVerdict(EXAMPLE_RULES['DS-4'], {
    facts: { 'project.tokenSourceDeclared': true, 'finding.claimsSourceParity': false },
  });
  assert.equal(drift.question.id, 'value-drift');
  const driftCard = cardModel(EXAMPLE_RULES['DS-4'], drift, { file: 'tokens.css', line: 40 });
  assert.equal(driftCard.paragraphs[0], 'Question: the value in code differs from that source? Yes / No.');
  const stated = { ...drift, question: { ...drift.question, text: 'The value in code differs from that source.' } };
  assert.equal(
    cardModel(EXAMPLE_RULES['DS-4'], stated, { file: 'tokens.css', line: 40 }).paragraphs[0],
    driftCard.paragraphs[0],
  );
});

test('DS-4 is silent when the source is absent and the other branch is false', () => {
  const facts = {
    'project.tokenSourceDeclared': false,
    'finding.claimsSourceParity': false,
    'finding.parityMissing': false,
  };
  const silent = classifyVerdict(EXAMPLE_RULES['DS-4'], { facts });
  oneStatus(silent);
  assert.equal(silent.status, 'not-applicable');
  assert.equal(silent.question, null);
  assert.equal(cardModel(EXAMPLE_RULES['DS-4'], silent), null);

  const drifted = classifyVerdict(EXAMPLE_RULES['DS-4'], {
    facts: { ...facts, 'project.tokenSourceDeclared': true, 'finding.differsFromTokenSource': true },
  });
  assert.equal(drifted.status, 'violation');
  assert.equal(drifted.question, null);

  const driftUnknown = classifyVerdict(EXAMPLE_RULES['DS-4'], {
    facts: { ...facts, 'project.tokenSourceDeclared': false },
  });
  assert.equal(driftUnknown.status, 'not-applicable');
  const sourceUnknown = classifyVerdict(EXAMPLE_RULES['DS-4'], {
    facts: {
      'finding.claimsSourceParity': false,
      'finding.parityMissing': false,
    },
  });
  assert.equal(sourceUnknown.status, 'needs-decision');
});

test('a true or child ignores an unknown sibling', () => {
  const node = {
    join: 'or',
    groups: [
      { id: 'known', text: 'Known branch', predicate: 'branch.known' },
      { id: 'open', text: 'Unknown branch', predicate: 'branch.open' },
    ],
  };
  assert.equal(evaluateCondition(node, { 'branch.known': true }), 'true');
  assert.equal(evaluateCondition(node, { 'branch.known': false }), 'unknown');
  const rule = {
    ...EXAMPLE_RULES['DS-4'],
    conditions: node,
  };
  const classified = classifyVerdict(rule, { facts: { 'branch.known': true } });
  assert.equal(classified.status, 'violation');
  assert.equal(classified.question, null);
});

test('a token colour definition line is not a finding, and a neighbouring hex still is', () => {
  const definition = {
    rule: 'B-1',
    file: 'tokens.css',
    line: 1,
    excerpt: '--color-brand: #123456',
    isTokenColorDefinitionLine: true,
  };
  assert.deepEqual(applyVerdicts([EXAMPLE_RULES['B-1']], [definition]), []);
  const use = { ...definition, line: 2, excerpt: 'color: #123456', isTokenColorDefinitionLine: false };
  const kept = applyVerdicts([EXAMPLE_RULES['B-1']], [use]);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].status, 'violation');
  assert.equal(kept[0].line, 2);
});

test('answering no to the logo question names that answer', () => {
  const finding = {
    file: 'logo.svg',
    line: 4,
    excerpt: 'fill="#123456"',
    exceptionCandidate: 'brand-svg-logo',
  };
  const facts = { 'finding.isBrandColorInSvgLogo': false };
  const classified = classifyVerdict(EXAMPLE_RULES['B-1'], { finding, facts });
  assert.equal(classified.status, 'violation');
  assert.equal(classified.question, null);
  const card = cardModel(EXAMPLE_RULES['B-1'], classified, { file: 'logo.svg', line: 4, finding, facts });
  assert.match(card.paragraphs.join('\n'), /You answered: not a logo → violation/);
  assert.equal(card.paragraphs.some(line => /this is not SVG/.test(line)), false);
  const css = classifyVerdict(EXAMPLE_RULES['B-1'], { finding: { file: 'card.css', line: 12, excerpt: 'color: #123456' } });
  const cssCard = cardModel(EXAMPLE_RULES['B-1'], css, { file: 'card.css', line: 12 });
  assert.match(cssCard.paragraphs.join('\n'), /this is not SVG/);
});

test('header count and cards are one list, so a status mutation moves both', () => {
  const findings = [
    {
      rule: 'B-1',
      status: 'needs-decision',
      question: { id: 'brand-svg-logo', text: 'The colour belongs to an SVG brand logo' },
      file: 'logo.svg',
      line: 4,
      exceptionCandidate: 'brand-svg-logo',
    },
    {
      rule: 'DS-4',
      status: 'needs-decision',
      question: { id: 'value-drift', text: 'The value in code differs from that source' },
      file: 'tokens.css',
      line: 40,
    },
  ];
  const rules = Object.values(EXAMPLE_RULES);
  const open = presentVerdict({ operatorPass: true, findings, rules });
  assert.equal(open.decisionCount, 2);
  assert.equal(open.showCheck, false);
  assert.equal(open.cards.filter(card => card.asks).length, 2);
  const mutated = presentVerdict({
    operatorPass: true,
    findings: [findings[0], { ...findings[1], status: 'violation', question: null }],
    rules,
  });
  assert.equal(mutated.decisionCount, 1);
  assert.equal(mutated.cards.filter(card => card.asks).length, 1);
  assert.equal(mutated.cards.filter(card => card.status === 'violation').length, 1);
  assert.equal(mutated.showCheck, false);
});

test('header check is absent for an open decision or a violation, and present when both are clear', () => {
  const clear = headerMark({ operatorPass: true, findings: [] });
  assert.equal(clear.decisionCount, 0);
  assert.equal(clear.showCheck, true);

  const decision = headerMark({
    operatorPass: true,
    findings: [{ status: 'needs-decision' }],
  });
  assert.equal(decision.decisionCount, 1);
  assert.equal(decision.showCheck, false);

  const violation = headerMark({
    operatorPass: true,
    findings: [{ status: 'violation' }],
  });
  assert.equal(violation.decisionCount, 0);
  assert.equal(violation.showCheck, false);

  const lifted = headerMark({
    operatorPass: true,
    findings: [{ status: 'exception' }, { status: 'warning' }],
  });
  assert.equal(lifted.showCheck, true);

  assert.equal(headerMark({ operatorPass: false, findings: [] }).showCheck, false);
  assert.equal(violation.violationCount, 1);
  assert.equal(decision.violationCount, 0);
  assert.equal(clear.violationCount, 0);
});

test('cards quote the real line and omit invented evidence', () => {
  const b1 = cardModel(EXAMPLE_RULES['B-1'], { status: 'violation', question: null }, {
    excerpt: 'border: 2px solid #abcdef',
  });
  assert.match(b1.paragraphs[0], /#abcdef/);
  assert.equal(b1.paragraphs[0].includes('#123456'), false);
  assert.equal(b1.paragraphs.some(line => /Evidence:/.test(line)), false);
  assert.equal(b1.paragraphs.some(line => /card\.css:12|logo\.svg:4/.test(line)), false);

  const b2 = cardModel(EXAMPLE_RULES['B-2'], { status: 'violation', question: null }, {
    excerpt: 'bg-blue-500  —  <p class="badge bg-blue-500">',
    file: 'next/index.html',
    line: 12,
  });
  assert.match(b2.paragraphs[0], /bg-blue-500/);
  assert.equal(b2.paragraphs[0].includes('text-gray-500'), false);
  assert.match(b2.paragraphs[1], /Evidence: next\/index\.html:12/);

  const asked = cardModel(EXAMPLE_RULES['B-1'], {
    status: 'needs-decision',
    question: { id: 'brand-svg-logo', text: 'The colour belongs to an SVG brand logo' },
  }, {});
  assert.equal(asked.paragraphs.some(line => /Evidence:/.test(line)), false);
  assert.equal(asked.paragraphs.some(line => /logo\.svg:4/.test(line)), false);

  const ds4 = cardModel(EXAMPLE_RULES['DS-4'], classifyVerdict(EXAMPLE_RULES['DS-4'], {}), {});
  assert.equal(ds4.paragraphs.some(line => /Evidence/.test(line)), false);
  assert.equal(ds4.paragraphs.some(line => /tokens\.css:40/.test(line)), false);

  const ds2a = cardModel(
    { id: 'DS-2a', verdictKind: 'unconditional-bad', exceptions: [] },
    { status: 'violation', question: null },
    { excerpt: 'background: #445566', file: 'with-var.css', line: 3 },
  );
  assert.match(ds2a.paragraphs.join('\n'), /This file already uses tokens, but this colour is hardcoded: #445566/);
  assert.equal(ds2a.heading, 'DS-2a · always a violation');
  assert.equal(ds2a.paragraphs.join('\n').includes('The violation condition is already met'), false);
  assert.equal(ds2a.paragraphs.some(line => /Move the colours/.test(line)), false);
});

test('create-next-app globals.css is a violation and the card says to move colours', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unslop-globals-'));
  const app = path.join(dir, 'app');
  fs.mkdirSync(app);
  const source = [
    ':root {',
    '  --background: #ffffff;',
    '  --foreground: #171717;',
    '}',
    '',
    '@media (prefers-color-scheme: dark) {',
    '  :root {',
    '    --background: #0a0a0a;',
    '    --foreground: #ededed;',
    '  }',
    '}',
    '',
    'body {',
    '  color: var(--foreground);',
    '  background: var(--background);',
    '}',
    '',
  ].join('\n');
  const globals = path.join(app, 'globals.css');
  fs.writeFileSync(globals, source);
  const findings = detect(dir, { rules: ['B-1', 'DS-2a'] }).findings;
  assert.deepEqual(findings.map(finding => [finding.rule, finding.line]), [
    ['DS-2a', 2],
    ['DS-2a', 3],
    ['DS-2a', 8],
    ['DS-2a', 9],
  ]);
  assert.equal(findings.length, 4);
  assert.ok(findings.every(finding => finding.rule === 'DS-2a'));
  assert.match(findings[0].excerpt, /#ffffff/);
  assert.match(findings[1].excerpt, /#171717/);
  assert.match(findings[2].excerpt, /#0a0a0a/);
  assert.match(findings[3].excerpt, /#ededed/);
  assert.equal(findings.some(finding => finding.rule === 'B-1'), false);
  const rules = [
    { id: 'B-1', verdictKind: 'unconditional-bad', exceptions: [] },
    { id: 'DS-2a', verdictKind: 'unconditional-bad', exceptions: [] },
  ];
  const presented = presentVerdict({
    operatorPass: true,
    findings: applyVerdicts(rules, findings),
    rules,
  });
  const text = presented.cards.map(card => card.paragraphs.join('\n')).join('\n');
  assert.match(text, /This file already uses tokens, but this colour is hardcoded: #ffffff/);
  assert.match(text, /Move the colours into tokens\.css and import it/);
  assert.equal(presented.showCheck, false);
  const tokens = path.join(dir, 'tokens.css');
  fs.writeFileSync(tokens, source);
  assert.deepEqual(detect(tokens, { rules: ['B-1', 'DS-2a'] }).findings, []);
});

test('an unknown condition that can still change the outcome is not machine-checks-clear', () => {
  const open = auditRunStatus({
    findings: [{ rule: 'DS-4', status: 'needs-decision' }],
    coverage: [{ ruleId: 'DS-4', coverage: 'detector' }],
    scanned: 1,
    stale: false,
  });
  assert.notEqual(open, 'machine-checks-clear');
  const closed = auditRunStatus({
    findings: [],
    coverage: [{ ruleId: 'DS-4', coverage: 'detector' }],
    scanned: 1,
    stale: false,
  });
  assert.equal(closed, 'machine-checks-clear');
});

test('showcase header and cards follow the spec and do not collect an answer', () => {
  const cards = showcaseCards();
  assert.deepEqual(cards.map(card => [card.ruleId, card.status, card.asks]), [
    ['B-1', 'violation', false],
    ['B-1', 'needs-decision', true],
    ['B-2', 'violation', false],
    ['DS-2', 'warning', false],
    ['DS-4', 'needs-decision', true],
  ]);
  const html = buildVerdictShowcaseHtml({ operatorPass: true, cards });
  assert.match(html, /Open violations: <strong>2<\/strong>/);
  assert.match(html, /Needs a decision: <strong>2<\/strong>/);
  assert.equal(mark(html).pass, 'no');
  assert.equal(mark(html).glyph.includes('✓'), false);
  assert.match(html, /Loop consistent \(self-check\)/);
  assert.doesNotMatch(html, /<strong>[^<]*Loop consistent/);
  assert.match(html, /B-1 · always a violation/);
  assert.match(html, /logo question only/);
  assert.match(html, /B-2 · always a violation/);
  assert.match(html, /DS-2 · retired/);
  assert.match(html, /DS-4 · needs a decision/);
  assert.match(html, /this is not SVG/);
  assert.match(html, /No exception applies/);
  assert.doesNotMatch(html, /<button|<form|--answer/);

  const decision = buildVerdictShowcaseHtml({
    operatorPass: true,
    cards: [cards[4]],
  });
  assert.match(decision, /Open violations: <strong>0<\/strong>/);
  assert.match(decision, /Needs a decision: <strong>1<\/strong>/);
  assert.equal(mark(decision).pass, 'no');

  const openViolation = buildVerdictShowcaseHtml({
    operatorPass: true,
    cards: [cards[2]],
  });
  assert.match(openViolation, /Open violations: <strong>1<\/strong>/);
  assert.match(openViolation, /Needs a decision: <strong>0<\/strong>/);
  assert.equal(mark(openViolation).pass, 'no');
  assert.equal(mark(openViolation).glyph.includes('✓'), false);

  const clean = buildVerdictShowcaseHtml({ operatorPass: true, cards: [] });
  assert.match(clean, /Open violations: <strong>0<\/strong>/);
  assert.match(clean, /Needs a decision: <strong>0<\/strong>/);
  assert.equal(mark(clean).pass, 'yes');
  assert.equal(mark(clean).glyph, '✓');
});

test('mutating the answer, the evidence line, or the question text moves the logo card', () => {
  const line = '      <path fill="#0b3d2e" d="M4 16h24" />';
  const logo = {
    rule: 'B-1',
    file: 'Logo.jsx',
    line: 4,
    excerpt: line.trim(),
    exceptionCandidate: 'brand-svg-logo',
    evidenceLine: line,
  };
  const css = {
    rule: 'B-1',
    file: 'styles.css',
    line: 2,
    excerpt: 'border: 2px solid #abcdef',
    evidenceLine: '  border: 2px solid #abcdef;',
  };
  const rules = [EXAMPLE_RULES['B-1']];
  const fact = (value, extra = {}) => ({
    predicate: 'finding.isBrandColorInSvgLogo',
    value,
    evidence: 'next/Logo.jsx:4',
    evidenceHash: evidenceLineHash(line),
    questionText: 'The colour belongs to an SVG brand logo',
    setBy: 'owner',
    ruleId: 'B-1',
    conditionId: 'brand-svg-logo',
    ...extra,
  });
  const view = (findings, projectFacts, ruleSet = rules) => {
    const applied = applyVerdicts(ruleSet, findings, {}, {}, {
      projectFacts,
      evidenceRoot: 'next',
    });
    return {
      applied,
      header: presentVerdict({
        operatorPass: true,
        findings: applied.map(item => (item.file ? { ...item, file: `next/${item.file}` } : item)),
        rules: ruleSet,
        storePath: '/store',
      }),
    };
  };

  const open = view([logo, css], []);
  assert.equal(open.applied.find(item => item.file === 'Logo.jsx').status, 'needs-decision');
  assert.equal(open.header.decisionCount, 1);
  assert.equal(open.header.violationCount, 1);
  assert.equal(open.header.cards.filter(card => card.asks).length, 1);
  const asking = open.header.cards.find(card => card.asks).paragraphs.join('\n');
  assert.match(asking, /Yes: brand logo, exception\. No: violation/);
  assert.match(asking, /fill="#0b3d2e"/);
  assert.match(asking, /record the fact for next\/Logo\.jsx:4 in project-context\.json/);
  assert.doesNotMatch(asking, /operator-loop/);

  const yes = view([logo, css], [fact(true)]);
  const yesLogo = yes.applied.find(item => item.file === 'Logo.jsx');
  assert.equal(yesLogo.status, 'exception');
  assert.equal(yesLogo.question, undefined);
  assert.equal(yes.header.decisionCount, open.header.decisionCount - 1);
  assert.equal(yes.header.violationCount, open.header.violationCount);
  assert.equal(yes.header.cards.filter(card => card.asks).length, 0);
  assert.match(yes.header.cards.find(card => card.ruleId === 'B-1' && card.status === 'exception').paragraphs.join('\n'), /yes, this is the brand logo → exception/);
  assert.equal(yes.header.cards.some(card => /changed/.test(card.paragraphs.join('\n'))), false);

  const no = view([logo, css], [fact(false)]);
  const noLogo = no.applied.find(item => item.file === 'Logo.jsx');
  assert.equal(noLogo.status, 'violation');
  assert.equal(no.header.decisionCount, open.header.decisionCount - 1);
  assert.equal(no.header.violationCount, open.header.violationCount + 1);
  assert.match(no.header.cards.map(card => card.paragraphs.join('\n')).join('\n'), /You answered: not a logo → violation/);

  const lineChanged = view([{ ...logo, evidenceLine: `${line} ` }, css], [fact(true)]);
  assert.equal(lineChanged.applied.find(item => item.file === 'Logo.jsx').status, 'needs-decision');
  assert.equal(lineChanged.header.decisionCount, 1);
  assert.equal(lineChanged.header.cards.filter(card => card.asks).length, 1);

  const rewordedRule = structuredClone(EXAMPLE_RULES['B-1']);
  rewordedRule.exceptions = rewordedRule.exceptions.map(item => (
    item.id === 'brand-svg-logo' ? { ...item, text: 'A different question wording' } : item
  ));
  const reworded = view([logo, css], [fact(true)], [rewordedRule]);
  assert.equal(reworded.applied.find(item => item.file === 'Logo.jsx').status, 'needs-decision');
  assert.equal(reworded.header.cards.filter(card => card.asks).length, 1);

  const renamed = structuredClone(EXAMPLE_RULES['B-1']);
  renamed.exceptions = renamed.exceptions.map(item => (
    item.id === 'brand-svg-logo' ? { ...item, predicate: 'finding.renamedLogoPredicate' } : item
  ));
  const sameWording = view([logo, css], [fact(true, { canonChecksum: 'ignored' })], [renamed]);
  assert.equal(sameWording.applied.find(item => item.file === 'Logo.jsx').status, 'exception');
  assert.equal(sameWording.header.decisionCount, 0);

  const revised = view([logo, css], [fact(true, { revised: true })]);
  assert.match(
    revised.header.cards.find(card => card.status === 'exception').paragraphs.join('\n'),
    /Answer changed: yes, this is the brand logo → exception/,
  );
  const revisedNo = view([logo, css], [fact(false, { revised: true })]);
  assert.match(revisedNo.header.cards.map(card => card.paragraphs.join('\n')).join('\n'), /changed/);
  assert.match(revisedNo.header.cards.map(card => card.paragraphs.join('\n')).join('\n'), /not a logo → violation/);
});
