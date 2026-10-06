import test from 'node:test';
import assert from 'node:assert/strict';
import { canonChecksum, createCanonRun, validateCanon, ruleCoverage } from './lib/canon.mjs';

function snapshot(version = 'v1') {
  const payload = {
    schemaVersion: 1, version, publishedAt: '2026-09-14T00:00:00Z',
    source: 'https://example.test/canon', license: 'MIT', content: `Test canon ${version}`,
    rules: [
      { id: 'B-1', source: 'https://example.test/canon#B-1', strength: 'hard', mode: 'detector' },
      { id: 'DS-1', source: 'https://example.test/canon#DS-1', strength: 'soft', mode: 'judgement' },
    ],
  };
  return { payload, checksum: canonChecksum(payload) };
}
const endpoint = 'http://localhost/unslop/mcp';
const rejectsCode = code => error => error.code === code;

test('concurrent calls pin one revision; a new run sees an update', async () => {
  let current = snapshot();
  let calls = 0;
  const read = async () => { calls++; return current; };
  const run = createCanonRun({ endpoint, read });
  const [a, b] = await Promise.all([run.load(), run.load()]);
  current = snapshot('v2');
  assert.equal(a, b);
  assert.equal((await run.load()).snapshot.payload.version, 'v1');
  assert.equal(calls, 1);
  assert.equal((await createCanonRun({ endpoint, read }).load()).snapshot.payload.version, 'v2');
  assert.throws(() => { a.snapshot.payload.rules[0].strength = 'soft'; }, TypeError);
});

test('offline cache only reproduces explicit pins, never latest or another endpoint', async () => {
  const cache = new Map();
  await createCanonRun({ endpoint, read: async () => snapshot(), cache }).load();
  const read = async () => { throw new Error('network'); };
  const cached = await createCanonRun({ endpoint, read, cache, version: 'v1' }).load();
  assert.equal(cached.origin, 'cache');
  assert.equal(cached.stale, true);
  await assert.rejects(createCanonRun({ endpoint, read, cache }).load(), rejectsCode('OFFLINE'));
  await assert.rejects(createCanonRun({ endpoint: 'http://other.test', read, cache, version: 'v1' }).load(), rejectsCode('OFFLINE'));
});

test('schema, checksum and missing revision errors do not fall back', async () => {
  const cache = new Map();
  await createCanonRun({ endpoint, read: async () => snapshot(), cache }).load();
  const invalidSchema = snapshot(); invalidSchema.payload.schemaVersion = 9;
  const tampered = snapshot(); tampered.payload.content = 'changed';
  for (const [value, code] of [[invalidSchema, 'SCHEMA'], [tampered, 'CHECKSUM'], [snapshot('v2'), 'REVISION']]) {
    await assert.rejects(createCanonRun({ endpoint, read: async () => value, cache, version: 'v1' }).load(), rejectsCode(code));
  }
});

test('unchanged revision cannot silently replace cached canon; explicit rollback is supported', async () => {
  const cache = new Map();
  await createCanonRun({ endpoint, read: async () => snapshot(), cache }).load();
  await createCanonRun({ endpoint, read: async () => snapshot('v2'), cache }).load();
  const changed = snapshot(); changed.payload.content = 'rewrite'; changed.checksum = canonChecksum(changed.payload);
  await assert.rejects(createCanonRun({ endpoint, read: async () => changed, cache }).load(), rejectsCode('REVISION_CHANGED'));
  const rollback = await createCanonRun({ endpoint, read: async () => snapshot(), version: 'v1', cache }).load();
  assert.equal(rollback.snapshot.payload.version, 'v1');
});

test('timeout is bounded and aborts the reader', async () => {
  let signal;
  const run = createCanonRun({ endpoint, timeoutMs: 10, read: args => { signal = args.signal; return new Promise(() => {}); } });
  await assert.rejects(run.load(), rejectsCode('TIMEOUT'));
  assert.equal(signal.aborted, true);
  await assert.rejects(run.load(), rejectsCode('TIMEOUT'));
});

test('unknown rules fail; unsupported detectors and judgement retain provenance without claiming pass', () => {
  const value = validateCanon(snapshot());
  assert.throws(() => ruleCoverage(value, 'unknown'), rejectsCode('UNKNOWN_RULE'));
  assert.equal(ruleCoverage(value, 'B-1').coverage, 'unsupported');
  assert.equal(ruleCoverage(value, 'B-1', ['B-1']).coverage, 'detector');
  const judgement = ruleCoverage(value, 'DS-1', ['DS-1']);
  assert.equal(judgement.coverage, 'judgement');
  assert.equal(judgement.version, 'v1');
  assert.equal(judgement.strength, 'soft');
  assert.equal(judgement.source, value.payload.rules[1].source);
  assert.equal('pass' in judgement, false);
});

test('duplicate IDs and missing provenance fail even with a valid checksum', () => {
  for (const mutate of [p => p.rules.push(p.rules[0]), p => { delete p.source; }]) {
    const value = snapshot(); mutate(value.payload); value.checksum = canonChecksum(value.payload);
    assert.throws(() => validateCanon(value), rejectsCode('SCHEMA'));
  }
});

function verdictEnvelope(rules) {
  const payload = {
    schemaVersion: 1, version: 'verdict-v1', publishedAt: '2026-10-01T00:00:00Z',
    source: 'https://example.test/canon', license: 'MIT', content: 'Verdict contract fixture',
    rules,
  };
  return { payload, checksum: canonChecksum(payload) };
}

const verdictRules = {
  'B-1': {
    id: 'B-1',
    statement: 'Component styles hardcode a hex colour instead of using a token.',
    source: 'UNKNOWN',
    strength: 'hard',
    mode: 'judgement',
    verdictKind: 'unconditional-bad',
    exceptions: [
      { id: 'brand-svg-logo', text: 'The colour belongs to an SVG brand logo', predicate: 'finding.isBrandColorInSvgLogo' },
      { id: 'token-color-definition', text: 'The line defines a token colour', predicate: 'finding.isTokenColorDefinitionLine' },
    ],
  },
  'B-2': {
    id: 'B-2',
    statement: 'Markup uses a fixed Tailwind palette step where a token utility belongs.',
    source: 'UNKNOWN',
    strength: 'hard',
    mode: 'judgement',
    verdictKind: 'unconditional-bad',
    exceptions: [],
  },
  'DS-2': {
    id: 'DS-2',
    statement: 'Retired combined rule. Use DS-2a and DS-2b instead.',
    source: 'UNKNOWN',
    strength: 'soft',
    mode: 'judgement',
    verdictKind: 'deprecated',
    replacedBy: ['DS-2a', 'DS-2b'],
  },
  'DS-4': {
    id: 'DS-4',
    statement: 'Values in code no longer match the declared token source.',
    source: 'UNKNOWN',
    strength: 'soft',
    mode: 'judgement',
    verdictKind: 'conditional',
    defaultVerdict: 'ok-unless',
    conditions: {
      join: 'or',
      groups: [
        {
          join: 'and',
          items: [
            { id: 'source-declared', text: 'The project names its token source file', predicate: 'project.tokenSourceDeclared' },
            { id: 'value-drift', text: 'The value in code differs from that source', predicate: 'finding.differsFromTokenSource' },
          ],
        },
        {
          join: 'and',
          items: [
            { id: 'claims-parity', text: 'The block itself claims to match the source', predicate: 'finding.claimsSourceParity' },
            { id: 'parity-missing', text: 'It does not match', predicate: 'finding.parityMissing' },
          ],
        },
      ],
    },
    exceptions: [],
  },
};

test('verdictKind accepts B-1, B-2, DS-2 and DS-4', () => {
  const value = validateCanon(verdictEnvelope(Object.values(verdictRules)));
  assert.deepEqual(value.payload.rules.map(rule => rule.verdictKind), [
    'unconditional-bad', 'unconditional-bad', 'deprecated', 'conditional',
  ]);
  assert.equal(value.payload.rules[3].defaultVerdict, 'ok-unless');
  assert.equal(value.payload.rules[3].conditions.join, 'or');
});

test('a snapshot without verdict fields stays valid', () => {
  const value = validateCanon(snapshot());
  assert.equal(Object.hasOwn(value.payload.rules[0], 'verdictKind'), false);
  assert.equal(value.payload.rules[0].id, 'B-1');
  assert.equal(value.payload.rules[1].mode, 'judgement');
});

test('conditional rules reject an empty tree, both polarities, and a missing default', () => {
  const base = {
    id: 'DS-4', source: 'UNKNOWN', strength: 'soft', mode: 'judgement', verdictKind: 'conditional',
  };
  const leaf = { id: 'source-declared', text: 'The project names its token source file', predicate: 'project.tokenSourceDeclared' };
  const cases = [
    { ...base, defaultVerdict: 'ok-unless', conditions: { join: 'or', groups: [] } },
    { ...base, defaultVerdict: 'bad-unless', conditions: { join: 'and', items: [] } },
    { ...base, defaultVerdict: 'ok-unless' },
    {
      ...base,
      defaultVerdict: 'ok-unless',
      'bad-when': { join: 'or', groups: [leaf] },
      'ok-when': { join: 'and', items: [leaf] },
      conditions: { join: 'or', groups: [leaf] },
    },
    { ...base, defaultVerdict: 'bad-when', conditions: { join: 'or', groups: [leaf] } },
    { ...base, verdictKind: 'bad-when', defaultVerdict: 'bad-unless', conditions: { join: 'or', groups: [leaf] } },
  ];
  for (const rule of cases) {
    assert.throws(() => validateCanon(verdictEnvelope([rule])), rejectsCode('SCHEMA'));
  }
});

const validConditionalTree = {
  join: 'or',
  groups: [
    {
      join: 'and',
      items: [
        { id: 'source-declared', text: 'The project names its token source file', predicate: 'project.tokenSourceDeclared' },
        { id: 'value-drift', text: 'The value in code differs from that source', predicate: 'finding.differsFromTokenSource' },
      ],
    },
  ],
};

test('conditional without defaultVerdict fails on a valid tree', () => {
  const withDefault = {
    id: 'DS-4', source: 'UNKNOWN', strength: 'soft', mode: 'judgement', verdictKind: 'conditional',
    defaultVerdict: 'ok-unless', conditions: validConditionalTree,
  };
  assert.equal(validateCanon(verdictEnvelope([withDefault])).payload.rules[0].defaultVerdict, 'ok-unless');
  const missingDefault = { ...withDefault };
  delete missingDefault.defaultVerdict;
  assert.throws(() => validateCanon(verdictEnvelope([missingDefault])), rejectsCode('SCHEMA'));
});

test('unknown verdictKind is rejected', () => {
  assert.throws(() => validateCanon(verdictEnvelope([{
    ...verdictRules['B-2'],
    verdictKind: 'maybe',
  }])), rejectsCode('SCHEMA'));
});

const conditionLeaf = (id, extra = {}) => ({
  id, text: `Leaf ${id}`, predicate: `finding.${id}`, ...extra,
});

function conditionalEnvelope(conditions, extra = {}) {
  return verdictEnvelope([{
    id: 'DS-4', source: 'UNKNOWN', strength: 'soft', mode: 'judgement',
    verdictKind: 'conditional', defaultVerdict: 'ok-unless', conditions, ...extra,
  }]);
}

function conditionChain(depth) {
  let node = conditionLeaf('only-leaf');
  for (let level = 1; level < depth; level += 1) node = { join: 'and', items: [node] };
  return node;
}

test('duplicate condition leaf ids are rejected', () => {
  assert.throws(() => validateCanon(conditionalEnvelope({
    join: 'or',
    groups: [conditionLeaf('same'), conditionLeaf('same')],
  })), rejectsCode('SCHEMA'));
});

test('a condition leaf cannot share an id with an exception', () => {
  assert.throws(() => validateCanon(conditionalEnvelope(
    { join: 'or', groups: [conditionLeaf('brand-svg-logo')] },
    { exceptions: [{ id: 'brand-svg-logo', text: 'The colour belongs to an SVG brand logo', predicate: 'finding.isBrandColorInSvgLogo' }] },
  )), rejectsCode('SCHEMA'));
});

test('defaultVerdict and conditions stay off unconditional-bad and deprecated', () => {
  const leaf = conditionLeaf('source-declared');
  const tree = { join: 'or', groups: [leaf] };
  const cases = [
    { ...verdictRules['B-1'], defaultVerdict: 'bad-unless' },
    { ...verdictRules['B-1'], conditions: tree },
    { ...verdictRules['DS-2'], defaultVerdict: 'ok-unless' },
    { ...verdictRules['DS-2'], conditions: tree },
  ];
  for (const rule of cases) {
    assert.throws(() => validateCanon(verdictEnvelope([rule])), rejectsCode('SCHEMA'));
  }
});

test('defaultVerdict without verdictKind is rejected', () => {
  assert.throws(() => validateCanon(verdictEnvelope([{
    id: 'B-1', source: 'UNKNOWN', strength: 'hard', mode: 'detector', defaultVerdict: 'ok-unless',
  }])), rejectsCode('SCHEMA'));
});

test('conditions without verdictKind is rejected the same way', () => {
  const legacy = { id: 'B-1', source: 'UNKNOWN', strength: 'hard', mode: 'detector' };
  assert.equal(validateCanon(verdictEnvelope([legacy])).payload.rules[0].id, 'B-1');
  const mutated = {
    ...legacy,
    conditions: { join: 'or', groups: [conditionLeaf('source-declared')] },
  };
  assert.throws(() => validateCanon(verdictEnvelope([mutated])), rejectsCode('SCHEMA'));
  const withDefault = { ...mutated, defaultVerdict: 'ok-unless' };
  assert.throws(() => validateCanon(verdictEnvelope([withDefault])), rejectsCode('SCHEMA'));
});

test('a condition leaf must not store value', () => {
  assert.throws(() => validateCanon(conditionalEnvelope({
    join: 'and',
    items: [conditionLeaf('source-declared', { value: true })],
  })), rejectsCode('SCHEMA'));
});

test('deprecated replacedBy cannot name the same rule', () => {
  for (const replacedBy of [['DS-2'], ['DS-2a', 'DS-2']]) {
    assert.throws(() => validateCanon(verdictEnvelope([{
      ...verdictRules['DS-2'],
      replacedBy,
    }])), rejectsCode('SCHEMA'));
  }
});

test('deprecated without replacedBy is rejected', () => {
  const rule = { ...verdictRules['DS-2'] };
  delete rule.replacedBy;
  assert.throws(() => validateCanon(verdictEnvelope([rule])), rejectsCode('SCHEMA'));
});

test('duplicate exception ids are rejected', () => {
  const exception = { id: 'brand-svg-logo', text: 'The colour belongs to an SVG brand logo', predicate: 'finding.isBrandColorInSvgLogo' };
  assert.throws(() => validateCanon(verdictEnvelope([{
    ...verdictRules['B-1'],
    exceptions: [exception, { ...exception }],
  }])), rejectsCode('SCHEMA'));
});

test('a condition leaf without text is rejected', () => {
  const leaf = conditionLeaf('source-declared');
  delete leaf.text;
  assert.throws(() => validateCanon(conditionalEnvelope({ join: 'or', groups: [leaf] })), rejectsCode('SCHEMA'));
});

test('a condition tree deeper than 32 is a schema error', () => {
  assert.equal(validateCanon(conditionalEnvelope(conditionChain(32))).payload.rules[0].verdictKind, 'conditional');
  let error;
  try {
    validateCanon(conditionalEnvelope(conditionChain(33)));
  } catch (caught) {
    error = caught;
  }
  assert.equal(error?.code, 'SCHEMA');
  assert.equal(error instanceof RangeError, false);
  assert.equal(error.name, 'CanonError');
});
