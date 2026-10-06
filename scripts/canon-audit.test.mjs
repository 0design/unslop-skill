import { DETECTOR_VERSION } from './lib/detector-version.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createCanonRun, canonChecksum } from './lib/canon.mjs';
import { auditCanon } from './lib/canon-audit.mjs';
import { EXAMPLE_RULES, FINDING_STATUSES } from './lib/verdict.mjs';
import { fileURLToPath } from 'node:url';

function envelope(version = 'v1') {
  const payload = { schemaVersion: 1, version, publishedAt: '2026-09-14T00:00:00Z',
    source: 'https://example.test/canon', license: 'MIT', content: 'Test-only raw-color criterion',
    rules: [{ id: 'B-1', source: 'https://example.test/canon#B-1', strength: 'hard', mode: 'detector' }] };
  return { payload, checksum: canonChecksum(payload) };
}
test('real detector finding keeps pinned provenance and leaves target unchanged', async t => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'unslop-audit-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'style.css');
  const source = '.bad { color: #123456; }'; writeFileSync(file, source);
  const snapshot = envelope();
  const run = createCanonRun({ endpoint: 'test:canon', read: async () => snapshot });
  const result = await auditCanon(dir, run, { bindings: [{ ruleId: 'B-1', canonChecksum: snapshot.checksum, detectorVersion: DETECTOR_VERSION }] });
  assert.equal(result.status, 'findings');
  assert.equal(result.findings[0].canon.version, 'v1');
  assert.equal(result.findings[0].canon.checksum, snapshot.checksum);
  assert.equal(result.findings[0].canon.strength, 'hard');
  assert.equal(result.findings[0].status, undefined);
  assert.equal(result.ownerAccepted, false);
  assert.equal(readFileSync(file, 'utf8'), source);
});
test('old detector binding never silently covers an updated canon or unknown detector', async () => {
  const snapshot = envelope('v2');
  const run = createCanonRun({ endpoint: 'test:canon', read: async () => snapshot });
  const result = await auditCanon('/not-scanned', run, { bindings: [
    { ruleId: 'B-1', canonChecksum: envelope().checksum, detectorVersion: 'old' },
    { ruleId: 'UNKNOWN', canonChecksum: snapshot.checksum, detectorVersion: 'unknown' },
  ] });
  assert.equal(result.status, 'needs-review');
  assert.equal(result.rulesRun, 0);
  assert.equal(result.coverage[0].coverage, 'unsupported');
  assert.deepEqual(result.findings, []);
});
test('unavailable canon fails before a detector can claim a clean target', async () => {
  const run = createCanonRun({ endpoint: 'test:canon', read: async () => { throw new Error('offline'); } });
  await assert.rejects(auditCanon('/not-scanned', run), error => error.code === 'OFFLINE');
});
test('same canon with a wrong detector version is unsupported and never scanned', async () => {
  const snapshot = envelope();
  const run = createCanonRun({ endpoint: 'test:canon', read: async () => snapshot });
  const result = await auditCanon('/must-not-scan', run, { bindings: [
    { ruleId: 'B-1', canonChecksum: snapshot.checksum, detectorVersion: 'wrong-version' },
  ] });
  assert.equal(result.coverage[0].coverage, 'unsupported');
  assert.equal(result.rulesRun, 0);
  assert.equal(result.status, 'needs-review');
});

function verdictEnvelope(rules) {
  const payload = {
    schemaVersion: 1, version: 'verdict-audit', publishedAt: '2026-10-01T00:00:00Z',
    source: 'https://example.test/canon', license: 'MIT', content: 'Verdict audit fixture',
    rules,
  };
  return { payload, checksum: canonChecksum(payload) };
}

const b2Dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/verdict-kinds');

test('audit stamps one status: B-2 violation, DS-2 warning, DS-4 decision', async () => {
  const rules = [
    { ...EXAMPLE_RULES['B-2'], mode: 'detector' },
    EXAMPLE_RULES['DS-2'],
    EXAMPLE_RULES['DS-4'],
  ];
  const snapshot = verdictEnvelope(rules);
  const run = createCanonRun({ endpoint: 'test:canon', read: async () => snapshot });
  const result = await auditCanon(b2Dir, run, {
    bindings: [{ ruleId: 'B-2', canonChecksum: snapshot.checksum, detectorVersion: DETECTOR_VERSION }],
    evidenceByRule: { 'DS-4': { file: 'tokens.css', line: 40 } },
  });
  assert.notEqual(result.status, 'machine-checks-clear');
  const b2 = result.findings.filter(finding => finding.rule === 'B-2');
  assert.equal(b2.length, 1);
  assert.equal(b2[0].status, 'violation');
  assert.equal(b2[0].line, 4);
  assert.equal(b2[0].question, undefined);
  const warning = result.findings.find(finding => finding.rule === 'DS-2');
  assert.equal(warning.status, 'warning');
  assert.deepEqual(warning.replacedBy, ['DS-2a', 'DS-2b']);
  const decision = result.findings.find(finding => finding.rule === 'DS-4');
  assert.equal(decision.status, 'needs-decision');
  assert.equal(decision.question.id, 'source-declared');
  for (const finding of [b2[0], warning, decision]) {
    assert.ok(FINDING_STATUSES.includes(finding.status));
  }
  const silent = await auditCanon(b2Dir, run, {
    bindings: [{ ruleId: 'B-2', canonChecksum: snapshot.checksum, detectorVersion: DETECTOR_VERSION }],
    facts: {
      'project.tokenSourceDeclared': false,
      'finding.claimsSourceParity': false,
      'finding.parityMissing': false,
    },
  });
  assert.equal(silent.findings.some(finding => finding.rule === 'DS-4'), false);
  assert.equal(silent.findings.find(finding => finding.rule === 'DS-2').status, 'warning');
});

test('a clean B-2 sample stays machine-checks-clear when nothing else is open', async () => {
  const snapshot = verdictEnvelope([{ ...EXAMPLE_RULES['B-2'], mode: 'detector' }]);
  const run = createCanonRun({ endpoint: 'test:canon', read: async () => snapshot });
  const result = await auditCanon(path.join(path.dirname(b2Dir), 'B-2/clean'), run, {
    bindings: [{ ruleId: 'B-2', canonChecksum: snapshot.checksum, detectorVersion: DETECTOR_VERSION }],
  });
  assert.equal(result.status, 'machine-checks-clear');
  assert.deepEqual(result.findings, []);
});
