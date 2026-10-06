import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, unlink, symlink, cp, mkdir, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { canonChecksum } from './lib/canon.mjs';
import { walk, SCANNED_EXTENSIONS } from './lib/walker.mjs';
import { CANON_LATEST_URI, mcpRoutedReader } from './lib/canon-mcp.mjs';
import { auditRouted } from './lib/canon-audit.mjs';
import { DETECTOR_VERSION } from './lib/detector-version.mjs';
import {
  ROUTED_INDEX_LATEST_URI, buildRoutedCanon, writeGenerated, publishRouted, promoteRouted, createRoutedStore,
  createRoutedRun, routeTopics, validateRoutedTopic, validateRoutedIndex, topicUri, compileGlob, readStoreBindings,
  writeStoreBindings, ruleHash, routedInstructions, MAX_INSTRUCTIONS_BYTES,
} from './lib/canon-routed.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const records = JSON.parse(await readFile(path.join(here, 'fixtures/routed-canon/records.json'), 'utf8'));
const cssOnly = path.join(here, 'fixtures/routed-css-only');
const cssMarkup = path.join(here, 'fixtures/routed-css-markup');
const V1 = records.release.version;
const hashOf = id => ruleHash(records.records.find(rule => rule.id === id));
const COPY1 = { id: 'COPY-1', topic: 'copy', title: 'Fixture judgement rule for copy', mode: 'judgement', strength: 'hard', source: 'test-fixture',
  license: 'test-fixture', statement: 'Placeholder statement for a judgement-mode rule in the copy topic.' };

function withRule(base, version) {
  const next = structuredClone(base);
  next.release.version = version;
  next.records = next.records.filter(rule => rule.id !== 'COPY-1' && rule.topic !== 'copy');
  next.topics.copy = { globs: ['**/*.{html,jsx,tsx,vue,svelte,md}'] };
  next.records.push(COPY1);
  return next;
}
async function tmp(t, name) {
  const dir = await mkdtemp(path.join(os.tmpdir(), `unslop-${name}-`));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}
async function storeWith(t, ...inputs) {
  const generated = await tmp(t, 'gen');
  const store = await tmp(t, 'store');
  for (const input of inputs) {
    const built = buildRoutedCanon(input);
    await writeGenerated(generated, built);
    await publishRouted(store, path.join(generated, built.version), { promote: true });
  }
  return { generated, store };
}
const codeOf = error => error.code;
const dataCode = expected => error => error.data?.code === expected;

test('generator is deterministic: same input gives byte-identical files; publishedAt comes from input', async t => {
  const a = await tmp(t, 'gen-a');
  const b = await tmp(t, 'gen-b');
  await writeGenerated(a, buildRoutedCanon(records));
  await writeGenerated(b, buildRoutedCanon(structuredClone(records)));
  const names = (await readdir(path.join(a, V1), { recursive: true })).sort();
  assert.deepEqual(names, (await readdir(path.join(b, V1), { recursive: true })).sort());
  for (const name of names.filter(item => item.endsWith('.json'))) {
    assert.equal(await readFile(path.join(a, V1, name), 'utf8'), await readFile(path.join(b, V1, name), 'utf8'), name);
  }
  const index = JSON.parse(await readFile(path.join(a, V1, 'index.json'), 'utf8'));
  assert.equal(index.payload.publishedAt, records.release.publishedAt);
  assert.equal(await writeGenerated(a, buildRoutedCanon(records)), 'unchanged');
  const changed = structuredClone(records); changed.records[0].statement = 'changed';
  await assert.rejects(writeGenerated(a, buildRoutedCanon(changed)), e => e.code === 'REVISION_CHANGED');
});

test('generator rejects topic names that are not own words and incomplete records', () => {
  const bad = structuredClone(records); bad.topics = { 'B': { globs: ['**/*.css'] } };
  bad.records.forEach(rule => { rule.topic = 'B'; });
  assert.throws(() => buildRoutedCanon(bad), e => e.code === 'BAD_URI');
  const missing = structuredClone(records); delete missing.records[0].license;
  assert.throws(() => buildRoutedCanon(missing), e => e.code === 'SCHEMA');
  const noDate = structuredClone(records); delete noDate.release.publishedAt;
  assert.throws(() => buildRoutedCanon(noDate), e => e.code === 'SCHEMA');
  assert.equal(compileGlob('**/*.{html,tsx}').test('a/b/c.tsx'), true);
  assert.equal(compileGlob('**/*.css').test('styles.css'), true);
  assert.equal(compileGlob('**/*.css').test('styles.scss'), false);
});

test('real stdio MCP: index + topic template, CSS-only project requests only its topic, old resource intact', async t => {
  const { store } = await storeWith(t, records);
  // Old flat resource lives next to the routed tree and keeps working.
  const payload = { schemaVersion: 1, version: 'flat-1', publishedAt: '2026-10-02T00:00:00Z', source: 'test', license: 'MIT',
    content: 'flat', rules: [{ id: 'B-1', source: 'test', strength: 'hard', mode: 'detector' }] };
  await writeFile(path.join(store, 'flat-1.json'), JSON.stringify({ payload, checksum: canonChecksum(payload) }));
  await writeFile(path.join(store, 'latest.json'), JSON.stringify({ version: 'flat-1' }));
  const client = new Client({ name: 'routed-test', version: '1.0.0' });
  t.after(() => client.close());
  await client.connect(new StdioClientTransport({ command: process.execPath,
    args: [path.join(here, 'canon-server.mjs'), store], stderr: 'pipe' }));
  const uris = (await client.listResources()).resources.map(item => item.uri);
  assert.deepEqual(uris, [CANON_LATEST_URI, ROUTED_INDEX_LATEST_URI]);
  const templates = (await client.listResourceTemplates()).resourceTemplates.map(item => item.uriTemplate);
  assert.deepEqual(templates, ['unslop://canon-index/{version}', 'unslop://canon-topic/{version}/{topic}']);
  assert.equal(JSON.parse((await client.readResource({ uri: CANON_LATEST_URI })).contents[0].text).payload.version, 'flat-1');

  const run = createRoutedRun({ endpoint: 'stdio:test', reader: mcpRoutedReader(client) });
  const { envelope: index, bytes: indexBytes } = await run.loadIndex();
  assert.equal(index.payload.version, V1);
  assert.match(index.checksum, /^[a-f0-9]{64}$/);
  const topics = routeTopics(index, ['styles.css']);
  assert.deepEqual(topics, ['css']);
  assert.ok(topics.length < Object.keys(index.payload.topics).length, 'CSS-only must not request every topic');
  const bindings = [{ ruleId: 'B-1', canonChecksum: index.checksum, detectorVersion: DETECTOR_VERSION, ruleHash: hashOf('B-1') }];
  const audit = await auditRouted(cssOnly, run, { topics, bindings, localStore: true });
  assert.equal(audit.status, 'findings');
  assert.deepEqual(audit.coverage.map(item => item.ruleId), ['B-1']);
  assert.equal(audit.findings[0].canon.checksum, index.checksum);
  const { envelope: css, bytes } = await run.loadTopic('css');
  assert.match(css.checksum, /^[a-f0-9]{64}$/);
  const full = indexBytes + Object.values(index.payload.topics).reduce((sum, entry) => sum + entry.bytes, 0);
  assert.ok(indexBytes + bytes < full);
});

test('negatives over real MCP: unknown topic/version, latest in topic, traversal, checksum, missing file', async t => {
  const { store } = await storeWith(t, records);
  const client = new Client({ name: 'routed-negatives', version: '1.0.0' });
  t.after(() => client.close());
  await client.connect(new StdioClientTransport({ command: process.execPath,
    args: [path.join(here, 'canon-server.mjs'), store], stderr: 'pipe' }));
  const read = uri => client.readResource({ uri });
  await assert.rejects(read(`unslop://canon-topic/${V1}/layout`), dataCode('UNKNOWN_TOPIC'));
  await assert.rejects(read('unslop://canon-topic/v999/css'), dataCode('UNKNOWN_VERSION'));
  await assert.rejects(read('unslop://canon-index/v999'), dataCode('UNKNOWN_VERSION'));
  await assert.rejects(read('unslop://canon-topic/latest/css'), dataCode('LATEST_FORBIDDEN'));
  assert.throws(() => topicUri('latest', 'css'), e => e.code === 'LATEST_FORBIDDEN');
  for (const uri of [`unslop://canon-topic/${V1}/../css`, 'unslop://canon-topic/../css', `unslop://canon-topic/${V1}/css/../../x`,
    `unslop://canon-topic/${V1}/%2e%2e`, 'unslop://canon-index/..', `unslop://canon-topic/${V1}`]) {
    await assert.rejects(read(uri), e => e.code === -32002, uri);
  }
  // Symlinked version directory that points outside the store.
  const outside = await tmp(t, 'outside');
  await cp(path.join(store, 'routed', V1), path.join(outside, 'x'), { recursive: true });
  await symlink(path.join(outside, 'x'), path.join(store, 'routed', 'escape'));
  // Out-of-store path is an integrity failure, not "not found".
  await assert.rejects(read('unslop://canon-index/escape'), e => e.code === -32603 && e.data?.code === 'OUT_OF_STORE');
  // Oversized topic file is refused before parsing.
  const markupFile = path.join(store, 'routed', V1, 'topics', 'markup.json');
  const markupText = await readFile(markupFile, 'utf8');
  await writeFile(markupFile, ' '.repeat(1024 * 1024 + 1));
  await assert.rejects(read(`unslop://canon-topic/${V1}/markup`), e => e.code === -32603 && e.data?.code === 'TOO_LARGE');
  await writeFile(markupFile, markupText);
  // Checksum mismatch: edit a statement without touching the index.
  const cssFile = path.join(store, 'routed', V1, 'topics', 'css.json');
  const original = await readFile(cssFile, 'utf8');
  await writeFile(cssFile, original.replace('Placeholder statement', 'Tampered statement'));
  await assert.rejects(read(`unslop://canon-topic/${V1}/css`), dataCode('CHECKSUM'));
  // Recomputed topic checksum still disagrees with the index entry.
  const forged = JSON.parse(original); forged.payload.rules[0].statement = 'Forged';
  forged.checksum = canonChecksum(forged.payload);
  await writeFile(cssFile, JSON.stringify(forged));
  await assert.rejects(read(`unslop://canon-topic/${V1}/css`), dataCode('CHECKSUM'));
  await writeFile(cssFile, original);
  assert.equal(JSON.parse((await read(`unslop://canon-topic/${V1}/css`)).contents[0].text).checksum, JSON.parse(original).checksum);
  // Missing topic file that the index routes.
  await unlink(path.join(store, 'routed', V1, 'topics', 'markup.json'));
  await assert.rejects(read(`unslop://canon-topic/${V1}/markup`), dataCode('MISSING_TOPIC'));
  // Client-side reader maps the server code; no partial content leaks out.
  const run = createRoutedRun({ endpoint: 'stdio:test', reader: mcpRoutedReader(client) });
  await assert.rejects(run.loadTopic('markup'), e => e.code === 'MISSING_TOPIC');
  await assert.rejects(run.loadTopic('layout'), e => e.code === 'UNKNOWN_TOPIC');
  assert.throws(() => createRoutedRun({ endpoint: 'x', reader: mcpRoutedReader(client), version: 'latest' }),
    e => e.code === 'LATEST_FORBIDDEN');
});

test('topic from another version and index checksum mismatch are rejected', async t => {
  const V2 = 'test-2';
  const { store } = await storeWith(t, records, withRule(records, V2));
  const routed = createRoutedStore(store);
  const { envelope: v1css } = await routed.readTopic(V1, 'css');
  const { envelope: v2index } = await routed.readIndex(V2);
  assert.throws(() => validateRoutedTopic(v1css, v2index, 'css'), e => e.code === 'VERSION_MISMATCH');
  await cp(path.join(store, 'routed', V1, 'topics', 'css.json'), path.join(store, 'routed', V2, 'topics', 'css.json'));
  await assert.rejects(createRoutedStore(store).readTopic(V2, 'css'), e => e.code === 'VERSION_MISMATCH');
  const indexFile = path.join(store, 'routed', V1, 'index.json');
  const index = JSON.parse(await readFile(indexFile, 'utf8'));
  index.payload.topics.css.globs.push('**/*.less');
  await writeFile(indexFile, JSON.stringify(index));
  await assert.rejects(createRoutedStore(store).readIndex(V1), e => e.code === 'CHECKSUM');
});

test('published version is immutable; promotion and rollback are explicit', async t => {
  const { generated, store } = await storeWith(t, records);
  const changed = structuredClone(records); changed.records[0].statement = 'Different wording';
  const other = await tmp(t, 'gen-other');
  await writeGenerated(other, buildRoutedCanon(changed));
  const before = await readFile(path.join(store, 'routed', V1, 'topics', 'css.json'), 'utf8');
  await assert.rejects(publishRouted(store, path.join(other, V1)), e => e.code === 'REVISION_CHANGED');
  assert.equal(await readFile(path.join(store, 'routed', V1, 'topics', 'css.json'), 'utf8'), before);
  assert.equal((await publishRouted(store, path.join(generated, V1))).result, 'unchanged');
  const latest = await readFile(path.join(store, 'routed', 'latest.json'), 'utf8');
  await assert.rejects(promoteRouted(store, 'missing'));
  await assert.rejects(promoteRouted(store, 'latest'), e => e.code === 'LATEST_FORBIDDEN');
  assert.equal(await readFile(path.join(store, 'routed', 'latest.json'), 'utf8'), latest);
  // Server-side guard: a version swapped in place after it was served is refused.
  const routed = createRoutedStore(store);
  await routed.readIndex(V1);
  await rm(path.join(store, 'routed', V1), { recursive: true });
  await writeGenerated(path.join(store, 'routed'), buildRoutedCanon(changed));
  await assert.rejects(routed.readIndex(V1), e => e.code === 'REVISION_CHANGED');
});

test('local test PR: new judgement rule -> generate -> publish -> promote -> next run sees it without reinstall', async t => {
  const { generated, store } = await storeWith(t, records);
  const client = new Client({ name: 'routed-pr', version: '1.0.0' });
  t.after(() => client.close());
  await client.connect(new StdioClientTransport({ command: process.execPath,
    args: [path.join(here, 'canon-server.mjs'), store], stderr: 'pipe' }));
  const first = createRoutedRun({ endpoint: 'stdio:test', reader: mcpRoutedReader(client) });
  const { envelope: v1 } = await first.loadIndex();
  const oldBinding = [{ ruleId: 'B-1', canonChecksum: v1.checksum, detectorVersion: DETECTOR_VERSION }];
  const V2 = 'pr-test-2';
  const built = buildRoutedCanon(withRule(records, V2));
  await writeGenerated(generated, built);
  await publishRouted(store, path.join(generated, V2));
  assert.equal((await first.loadIndex()).envelope.payload.version, V1, 'unpromoted version is invisible');
  await promoteRouted(store, V2);
  assert.equal((await first.loadIndex()).envelope.payload.version, V1, 'a running audit stays pinned');
  const next = createRoutedRun({ endpoint: 'stdio:test', reader: mcpRoutedReader(client) });
  const { envelope: v2 } = await next.loadIndex();
  assert.equal(v2.payload.version, V2);
  assert.notEqual(v2.checksum, v1.checksum);
  assert.deepEqual(v2.payload.topics.copy.ruleIds, ['COPY-1']);
  // CSS-only project still does not request the new copy topic.
  assert.deepEqual(routeTopics(v2, ['styles.css']), ['css']);
  const topics = routeTopics(v2, ['index.html', 'styles.css']);
  assert.deepEqual(topics, ['copy', 'css', 'markup']);
  const audit = await auditRouted(cssMarkup, next, { topics, bindings: oldBinding, localStore: true });
  const qf = audit.coverage.find(item => item.ruleId === 'COPY-1');
  assert.equal(qf.coverage, 'judgement');
  assert.equal(qf.version, V2);
  // An explicit binding for the v1 index checksum does not cover v2: shown as binding-stale.
  assert.equal(audit.coverage.find(item => item.ruleId === 'B-1').coverage, 'binding-stale');
  assert.equal(audit.status, 'needs-review');
  // Rollback is a promotion of an older immutable version.
  await promoteRouted(store, V1);
  assert.equal((await createRoutedRun({ endpoint: 'x', reader: mcpRoutedReader(client) }).loadIndex()).envelope.payload.version, V1);
});

test('explicit local store never yields a clean verdict', async t => {
  const { store } = await storeWith(t, records);
  const project = await tmp(t, 'clean');
  await mkdir(project, { recursive: true });
  await writeFile(path.join(project, 'ok.css'), '.ok { color: var(--text); }\n');
  const routed = createRoutedStore(store);
  const run = createRoutedRun({ endpoint: 'local', reader: routed });
  const { envelope: index } = await run.loadIndex();
  const bindings = [{ ruleId: 'B-1', canonChecksum: index.checksum, detectorVersion: DETECTOR_VERSION, ruleHash: hashOf('B-1') }];
  const local = await auditRouted(project, run, { topics: ['css'], bindings, localStore: true });
  assert.equal(local.status, 'needs-review');
  assert.equal(local.provenance.origin, 'local-store');
  const remote = await auditRouted(project, createRoutedRun({ endpoint: 'remote', reader: routed }), { topics: ['css'], bindings });
  assert.equal(remote.status, 'machine-checks-clear');
  assert.equal(remote.ownerAccepted, false);
});

test('ReDoS: pathological globs are rejected and the worst allowed glob stays fast', async t => {
  const started = Date.now();
  assert.throws(() => compileGlob('**a'.repeat(10) + '**b'), e => e.code === 'SCHEMA');
  assert.throws(() => compileGlob('*a'.repeat(9) + 'b'), e => e.code === 'SCHEMA');
  assert.throws(() => compileGlob('a'.repeat(201)), e => e.code === 'SCHEMA');
  const worst = compileGlob('**a**a**a**' + '*a'.repeat(4) + 'b');
  assert.equal(worst.test('a'.repeat(50000)), false);
  assert.equal(compileGlob('**a**a**a**b').test('a/'.repeat(5000) + 'b'), true);
  assert.ok(Date.now() - started < 500, `glob matching took ${Date.now() - started}ms`);
  const bad = structuredClone(records); bad.topics.css.globs = ['**a'.repeat(10) + '**b'];
  assert.throws(() => buildRoutedCanon(bad), e => e.code === 'SCHEMA');
  // Validator refuses the same glob even when the index checksum was recomputed.
  const built = buildRoutedCanon(records);
  const index = JSON.parse(built.files.get('index.json'));
  index.payload.topics.css.globs = ['**a'.repeat(10) + '**b'];
  index.checksum = canonChecksum(index.payload);
  assert.throws(() => validateRoutedIndex(index), e => e.code === 'SCHEMA');
});

test('topic names shorter than 3 chars are rejected by generator and validator; oversized topics are refused', () => {
  for (const name of ['b', 'ab', 'ds']) {
    const bad = structuredClone(records); bad.topics = { [name]: { globs: ['**/*.css'] } };
    bad.records.forEach(rule => { rule.topic = name; });
    assert.throws(() => buildRoutedCanon(bad), e => e.code === 'BAD_URI', name);
  }
  const built = buildRoutedCanon(records);
  const index = JSON.parse(built.files.get('index.json'));
  index.payload.topics.ab = index.payload.topics.css; delete index.payload.topics.css;
  index.checksum = canonChecksum(index.payload);
  assert.throws(() => validateRoutedIndex(index), e => e.code === 'BAD_URI');
  const huge = structuredClone(records); huge.records[0].statement = 'x'.repeat(1024 * 1024);
  assert.throws(() => buildRoutedCanon(huge), e => e.code === 'TOO_LARGE');
  const big = JSON.parse(built.files.get('index.json'));
  big.payload.topics.css.bytes = 1024 * 1024 + 1; big.checksum = canonChecksum(big.payload);
  assert.throws(() => validateRoutedIndex(big), e => e.code === 'TOO_LARGE');
});

test('promote carries bindings forward only for unchanged rules; changed rule shows binding-stale', async t => {
  const { generated, store } = await storeWith(t, records);
  const routed = createRoutedStore(store);
  const { envelope: v1 } = await routed.readIndex(V1);
  const css = (await routed.readTopic(V1, 'css')).envelope.payload.rules[0];
  const markup = (await routed.readTopic(V1, 'markup')).envelope.payload.rules[0];
  await writeStoreBindings(store, v1.checksum, [
    { ruleId: 'B-1', detectorVersion: DETECTOR_VERSION, ruleHash: ruleHash(css) },
    { ruleId: 'B-2', detectorVersion: DETECTOR_VERSION, ruleHash: ruleHash(markup) },
  ]);
  // v2: COPY-1 added, B-2 wording changed -> B-1 carried, B-2 not.
  const next = withRule(records, 'carry-2');
  next.records.find(rule => rule.id === 'B-2').statement = 'Changed B-2 wording.';
  const built = buildRoutedCanon(next);
  await writeGenerated(generated, built);
  await publishRouted(store, path.join(generated, 'carry-2'));
  const promoted = await promoteRouted(store, 'carry-2');
  assert.deepEqual(promoted.carriedBindings, ['B-1']);
  const bindings = await readStoreBindings(store, promoted.checksum);
  assert.ok(bindings.some(item => item.ruleId === 'B-1' && item.canonChecksum === promoted.checksum && item.carriedFrom === v1.checksum));
  const run = createRoutedRun({ endpoint: 'local', reader: createRoutedStore(store) });
  const audit = await auditRouted(cssMarkup, run, { topics: ['css', 'markup'], bindings, localStore: true });
  assert.equal(audit.coverage.find(item => item.ruleId === 'B-1').coverage, 'detector');
  // Store bindings are per checksum: the uncarried B-2 is simply unbound for this version...
  assert.equal(audit.coverage.find(item => item.ruleId === 'B-2').coverage, 'unsupported');
  // ...and shows as binding-stale when the operator passes the older bindings explicitly.
  const withOld = [...bindings, ...await readStoreBindings(store, v1.checksum)];
  const stale = await auditRouted(cssMarkup, run, { topics: ['css', 'markup'], bindings: withOld, localStore: true });
  assert.equal(stale.coverage.find(item => item.ruleId === 'B-2').coverage, 'binding-stale');
  // A binding with another detector version is never carried.
  const { store: other } = await storeWith(t, records);
  await writeStoreBindings(other, v1.checksum, [{ ruleId: 'B-1', detectorVersion: 'sha256:old', ruleHash: ruleHash(css) }]);
  const gen2 = await tmp(t, 'gen-carry');
  await writeGenerated(gen2, buildRoutedCanon(withRule(records, 'carry-3')));
  await publishRouted(other, path.join(gen2, 'carry-3'));
  assert.deepEqual((await promoteRouted(other, 'carry-3')).carriedBindings, []);
});

test('promote and rollback succeed away from a corrupted previous version; carry is best-effort', async t => {
  const V2 = 'carry-r1';
  const { store } = await storeWith(t, records, withRule(records, V2));
  // latest = V2; corrupt it, then roll back to V1.
  await writeFile(path.join(store, 'routed', V2, 'topics', 'css.json'), '{"broken":');
  const rolled = await promoteRouted(store, V1);
  assert.deepEqual(rolled.carriedBindings, []);
  assert.equal(rolled.carryError, 'SCHEMA');
  assert.equal(JSON.parse(await readFile(path.join(store, 'routed', 'latest.json'), 'utf8')).version, V1);
  // Previous version directory missing entirely.
  const { store: other } = await storeWith(t, records, withRule(records, V2));
  await rm(path.join(other, 'routed', V2), { recursive: true });
  const back = await promoteRouted(other, V1);
  assert.equal(back.carryError, 'ENOENT');
  assert.equal((await createRoutedStore(other).readIndex()).envelope.payload.version, V1);
  // Corrupt latest pointer does not block promotion either.
  await writeFile(path.join(other, 'routed', 'latest.json'), 'not json');
  assert.equal((await promoteRouted(other, V1)).carryError, 'LATEST_INVALID');
  assert.equal((await createRoutedStore(other).readIndex()).envelope.payload.version, V1);
});

test('store bindings are read for the current checksum only; invalid JSON is BINDINGS_INVALID', async t => {
  const store = await tmp(t, 'bind-read');
  const current = 'a'.repeat(64);
  const older = 'b'.repeat(64);
  await writeStoreBindings(store, older, [{ ruleId: 'B-1', detectorVersion: DETECTOR_VERSION, ruleHash: hashOf('B-1') }]);
  assert.deepEqual(await readStoreBindings(store, current), []);
  await writeStoreBindings(store, current, [{ ruleId: 'B-2', detectorVersion: DETECTOR_VERSION, ruleHash: hashOf('B-2') }]);
  assert.deepEqual((await readStoreBindings(store, current)).map(item => item.ruleId), ['B-2']);
  await writeFile(path.join(store, 'bindings', `${older}.json`), '{oops');
  assert.deepEqual((await readStoreBindings(store, current)).map(item => item.ruleId), ['B-2']);
  await writeFile(path.join(store, 'bindings', `${current}.json`), '{oops');
  await assert.rejects(readStoreBindings(store, current), e => e.code === 'BINDINGS_INVALID');
  await writeFile(path.join(store, 'bindings', `${current}.json`), '{"not":"array"}');
  await assert.rejects(readStoreBindings(store, current), e => e.code === 'BINDINGS_INVALID');
});

test('a binding without or with a wrong ruleHash is binding-stale', async t => {
  const { store } = await storeWith(t, records);
  const run = createRoutedRun({ endpoint: 'local', reader: createRoutedStore(store) });
  const { envelope: index } = await run.loadIndex();
  const base = { ruleId: 'B-1', canonChecksum: index.checksum, detectorVersion: DETECTOR_VERSION };
  for (const binding of [base, { ...base, ruleHash: 'f'.repeat(64) }, { ...base, ruleHash: hashOf('B-2') }]) {
    const audit = await auditRouted(cssOnly, run, { topics: ['css'], bindings: [binding], localStore: true });
    assert.equal(audit.coverage[0].coverage, 'binding-stale');
    assert.equal(audit.rulesRun, 0);
  }
  const ok = await auditRouted(cssOnly, run, { topics: ['css'], bindings: [{ ...base, ruleHash: hashOf('B-1') }], localStore: true });
  assert.equal(ok.coverage[0].coverage, 'detector');
});

test('concurrent binds do not lose entries (in-process and two CLI processes)', async t => {
  const store = await tmp(t, 'bind-race');
  const checksum = 'c'.repeat(64);
  const ids = Array.from({ length: 20 }, (_, i) => `R-${i}`);
  await Promise.all(ids.map(ruleId => writeStoreBindings(store, checksum, [{ ruleId, detectorVersion: 'x', ruleHash: 'y' }])));
  assert.deepEqual((await readStoreBindings(store, checksum)).map(item => item.ruleId).sort(), [...ids].sort());
  const { store: real } = await storeWith(t, records);
  const { execFile } = await import('node:child_process');
  const cli = rules => new Promise((resolve, reject) => execFile(process.execPath,
    [path.join(here, 'canon-routed.mjs'), 'bind', '--store', real, '--version', V1, '--rules', rules],
    (error, stdout) => error ? reject(error) : resolve(stdout)));
  await Promise.all([cli('B-1'), cli('B-2'), cli('B-1'), cli('B-2')]);
  const { envelope: index } = await createRoutedStore(real).readIndex(V1);
  assert.deepEqual((await readStoreBindings(real, index.checksum)).map(item => item.ruleId), ['B-1', 'B-2']);
  assert.deepEqual((await readdir(path.join(real, 'bindings'))).filter(name => !name.endsWith('.json')), []);
});

async function connectOnly(t, store) {
  const client = new Client({ name: 'instructions-test', version: '1.0.0' });
  t.after(() => client.close());
  await client.connect(new StdioClientTransport({ command: process.execPath,
    args: [path.join(here, 'canon-server.mjs'), store], stderr: 'pipe' }));
  return client.getInstructions();
}

test('initialize returns the compact index without any request; new connection after promote sees the new version', async t => {
  const { generated, store } = await storeWith(t, records);
  const { envelope: index } = await createRoutedStore(store).readIndex();
  const first = await connectOnly(t, store);
  assert.match(first, new RegExp(`canon ${V1.replace(/\./g, '\\.')} checksum ${index.checksum}`));
  for (const name of ['css', 'markup']) assert.ok(first.includes(`- ${name} [`), name);
  assert.match(first, /B-1: Fixture rule bound to detector B-1/);
  assert.match(first, /B-2: /);
  assert.match(first, /unslop:\/\/canon-topic\/\{version\}\/\{topic\}/);
  assert.match(first, /tools: none/);
  for (const rule of records.records) assert.equal(first.includes(rule.statement), false, `full statement leaked: ${rule.id}`);
  assert.equal(first, routedInstructions(index), 'deterministic, generated from index.json');
  const V2 = 'instr-2';
  await writeGenerated(generated, buildRoutedCanon(withRule(records, V2)));
  await publishRouted(store, path.join(generated, V2));
  assert.match(await connectOnly(t, store), new RegExp(`canon ${V1.replace(/\./g, '\\.')} `), 'unpromoted stays invisible');
  await promoteRouted(store, V2);
  const second = await connectOnly(t, store);
  assert.match(second, /canon instr-2 checksum/);
  assert.match(second, /COPY-1: Fixture judgement rule for copy/);
  assert.equal(second.includes(COPY1.statement), false);
});

test('store unavailable at connect is said explicitly, never an empty index', async t => {
  const empty = await tmp(t, 'empty-store');
  const text = await connectOnly(t, empty);
  assert.match(text, /CANON UNAVAILABLE at connect/);
  assert.match(text, /code UNKNOWN_VERSION/);
  assert.doesNotMatch(text, /topics:/);
  const { store } = await storeWith(t, records);
  await writeFile(path.join(store, 'routed', 'latest.json'), '{"version":"' + V1 + '","checksum":"' + '0'.repeat(64) + '"}');
  assert.match(await connectOnly(t, store), /CANON UNAVAILABLE at connect: .*code CHECKSUM/);
});

test('instructions stay under the size cap; overflow topics are listed by name only', () => {
  const big = structuredClone(records);
  big.topics = {}; big.records = [];
  for (let i = 0; i < 300; i++) {
    const name = `topic-${String(i).padStart(3, '0')}`;
    big.topics[name] = { globs: [`**/${name}/*.css`] };
    big.records.push({ id: `R-${i}`, topic: name, title: 'T'.repeat(80), statement: 's', mode: 'judgement',
      strength: 'soft', source: 'x', license: 'y' });
  }
  const index = JSON.parse(buildRoutedCanon(big).files.get('index.json'));
  const text = routedInstructions(index);
  assert.ok(Buffer.byteLength(text) <= MAX_INSTRUCTIONS_BYTES, `${Buffer.byteLength(text)} bytes`);
  assert.match(text, /topics listed by name only \(cap 8192 bytes\): topic-\d{3}/);
  assert.match(text, /- topic-000 \[/);
  assert.match(text, /tools: none$/);
  assert.equal(text, routedInstructions(structuredClone(index)));
  const tiny = routedInstructions(index, { capBytes: 1200 });
  assert.ok(Buffer.byteLength(tiny) <= 1200);
  assert.match(tiny, /\+\d+ more/);
});

test('unbound detector rule carries a bind hint; a failing binding write never blocks promote', async t => {
  const { generated, store } = await storeWith(t, records);
  const run = createRoutedRun({ endpoint: 'local', reader: createRoutedStore(store) });
  const { envelope: index } = await run.loadIndex();
  const audit = await auditRouted(cssOnly, run, { topics: ['css'], localStore: true });
  assert.equal(audit.coverage[0].coverage, 'unsupported');
  assert.equal(audit.coverage[0].hint, `needs bind for ${index.checksum}`);
  await writeStoreBindings(store, index.checksum, [{ ruleId: 'B-1', detectorVersion: DETECTOR_VERSION, ruleHash: hashOf('B-1') }]);
  const V2 = 'n3-2';
  const built = buildRoutedCanon(withRule(records, V2));
  await writeGenerated(generated, built);
  await publishRouted(store, path.join(generated, V2));
  const nextChecksum = JSON.parse(built.files.get('index.json')).checksum;
  await mkdir(path.join(store, 'bindings', `${nextChecksum}.json`), { recursive: true });
  const promoted = await promoteRouted(store, V2);
  assert.deepEqual(promoted.carriedBindings, []);
  assert.equal(promoted.carryError, 'EISDIR');
  assert.equal((await createRoutedStore(store).readIndex()).envelope.payload.version, V2);
});

test('a title equal to the statement or a prefix of it is rejected by generator and validator', () => {
  for (const title of ['Placeholder statement for a detector-mode rule in the css topic.', 'PLACEHOLDER statement, for a detector-mode', 'Placeholder']) {
    const bad = structuredClone(records);
    bad.records.find(rule => rule.id === 'B-1').title = title;
    assert.throws(() => buildRoutedCanon(bad), e => e.code === 'SCHEMA' && /statement/.test(e.message), title);
  }
  // Validator: a forged topic whose title leaks the statement fails even with consistent checksums.
  const built = buildRoutedCanon(records);
  const index = JSON.parse(built.files.get('index.json'));
  const topic = JSON.parse(built.files.get('topics/css.json'));
  const leaked = topic.payload.rules[0].statement.slice(0, 20);
  topic.payload.rules[0].title = leaked; topic.checksum = canonChecksum(topic.payload);
  index.payload.topics.css.titles['B-1'] = leaked; index.payload.topics.css.checksum = topic.checksum;
  index.checksum = canonChecksum(index.payload);
  assert.throws(() => validateRoutedTopic(topic, index, 'css'), e => e.code === 'SCHEMA');
  for (const rule of records.records) {
    assert.equal(rule.statement.toLowerCase().startsWith(rule.title.toLowerCase()), false, rule.id);
  }
});

test('index changes mid-run (deploy/rollback): one index re-read, re-route, explicit note; second failure is explicit', async () => {
  const { createBundledRoutedStore, stableStringify: _s } = await import('./lib/canon-routed-core.mjs');
  const { auditRoutedProject } = await import('./lib/canon-audit.mjs');
  const v1 = buildRoutedCanon(records);
  const v2 = buildRoutedCanon(withRule(records, 'switch-2'));
  const bundleOf = built => ({ [built.version]: Object.fromEntries(built.files) });
  const checksumOf = built => JSON.parse(built.files.get('index.json')).checksum;
  // Fake store: serves v1 for the first index read, then switches to v2 only (v1 gone), like a rollout.
  const bundle = { latest: { version: v1.version, checksum: checksumOf(v1) }, versions: bundleOf(v1) };
  const store = createBundledRoutedStore(bundle);
  let indexReads = 0;
  const reader = {
    readIndex: async version => {
      const result = await store.readIndex(version);
      if (++indexReads === 1) {
        bundle.latest = { version: v2.version, checksum: checksumOf(v2) };
        bundle.versions = bundleOf(v2);
      }
      return result;
    },
    readTopic: (version, topic) => store.readTopic(version, topic),
  };
  const run = createRoutedRun({ endpoint: 'fake', reader });
  const result = await auditRoutedProject(cssMarkup, ['index.html', 'styles.css'], run, { localStore: true });
  assert.equal(indexReads, 2, 'index re-read exactly once');
  assert.deepEqual(run.indexChanged && [run.indexChanged.from, run.indexChanged.to], [V1, 'switch-2']);
  assert.deepEqual(result.notes, [`index changed during run: ${V1} -> switch-2`]);
  assert.equal(result.index.payload.version, 'switch-2');
  assert.deepEqual(result.topics, ['copy', 'css', 'markup'], 're-routed against the new index');
  assert.ok(result.audit.coverage.every(item => item.version === 'switch-2'), 'no mixed versions');
  assert.ok(result.audit.coverage.some(item => item.ruleId === 'COPY-1'));

  // Still failing after the one re-read: explicit UNKNOWN_VERSION, no fallback.
  const broken = {
    readIndex: async () => ({ envelope: JSON.parse(v1.files.get('index.json')), text: v1.files.get('index.json') }),
    readTopic: async () => { const e = new Error('gone'); e.code = 'UNKNOWN_VERSION'; throw e; },
  };
  const failing = createRoutedRun({ endpoint: 'fake', reader: broken });
  await assert.rejects(failing.loadTopic('css'), e => e.code === 'UNKNOWN_VERSION');
  await assert.rejects(failing.loadTopic('css'), e => e.code === 'UNKNOWN_VERSION', 'no second re-read');
  // A run pinned to an explicit version never re-reads latest.
  let pinnedReads = 0;
  const pinned = createRoutedRun({ endpoint: 'fake', version: V1, reader: { ...broken,
    readIndex: async () => { pinnedReads++; return broken.readIndex(); } } });
  await assert.rejects(pinned.loadTopic('css'), e => e.code === 'UNKNOWN_VERSION');
  assert.equal(pinnedReads, 1);
});

test('always topic: requested for every project, no globs; validator rejects malformed flags', async () => {
  const pub = JSON.parse(await readFile(path.join(here, '..', 'canon/public/records.json'), 'utf8'));
  const built = buildRoutedCanon(pub);
  const index = JSON.parse(built.files.get('index.json'));
  assert.equal(index.payload.topics.process.always, true);
  assert.deepEqual(index.payload.topics.process.globs, []);
  assert.deepEqual(routeTopics(index, []), ['process']);
  assert.deepEqual(routeTopics(index, ['styles.css']), ['interface', 'process']);
  assert.deepEqual(routeTopics(index, ['docs/about.md']), ['copy', 'process']);
  // Mixed canon: always topic plus glob topics (fixture release defines no classes).
  const mixed = structuredClone(records);
  mixed.topics.process = { always: true };
  const { class: _class, ...unclassed } = pub.records[0];
  mixed.records.push(unclassed);
  const mixedIndex = JSON.parse(buildRoutedCanon(mixed).files.get('index.json'));
  assert.deepEqual(routeTopics(mixedIndex, ['styles.css']), ['css', 'process']);
  assert.match(routedInstructions(mixedIndex), /- process \[always: every project\]/);
  for (const bad of [{ always: false }, { always: true, globs: ['**/*.css'] }, { always: 'yes' }]) {
    const input = structuredClone(pub); input.topics.process = bad;
    assert.throws(() => buildRoutedCanon(input), e => e.code === 'SCHEMA', JSON.stringify(bad));
  }
  for (const mutate of [entry => { entry.globs = ['**/*']; }, entry => { entry.always = false; }]) {
    const forged = structuredClone(index);
    mutate(forged.payload.topics.process);
    forged.checksum = canonChecksum(forged.payload);
    assert.throws(() => validateRoutedIndex(forged), e => e.code === 'SCHEMA');
  }
  const empty = structuredClone(pub); empty.records[0].attribution = ' ';
  assert.throws(() => buildRoutedCanon(empty), e => e.code === 'SCHEMA');
  // Committed public generated copy is current.
  for (const [name, text] of built.files) {
    assert.equal(await readFile(path.join(here, '..', 'canon/public-generated', pub.release.version, name), 'utf8'), text, name);
  }
});

test('rule classes: defined once per release, carried to the index and every rule, validated on read', () => {
  const pub = structuredClone(records);
  pub.release.classes = { slop: { title: 'Slop', definition: 'Missing judgement.' },
    'bad-tone': { title: 'Bad tone', definition: 'Dishonest communication.' } };
  pub.records[0].class = 'slop';
  const built = buildRoutedCanon(pub);
  const index = JSON.parse(built.files.get('index.json'));
  assert.deepEqual(index.payload.classes, pub.release.classes);
  const topic = pub.records[0].topic;
  const envelope = JSON.parse(built.files.get(`topics/${topic}.json`));
  assert.equal(envelope.payload.rules.find(rule => rule.id === pub.records[0].id).class, 'slop');
  validateRoutedTopic(envelope, validateRoutedIndex(index), topic, built.files.get(`topics/${topic}.json`));
  // A rule without class hashes exactly as before; with a class the hash moves.
  const plain = structuredClone(records.records[0]);
  assert.equal(ruleHash(plain), hashOf(plain.id));
  assert.notEqual(ruleHash({ ...plain, class: 'slop' }), hashOf(plain.id));
  for (const mutate of [
    input => { input.records[0].class = 'project'; },            // undefined class
    input => { input.records[0].class = 'Slop!'; },              // invalid id
    input => { delete input.release.classes; },                  // class without definitions
    input => { input.release.classes.slop.definition = ' '; },   // empty definition
    input => { input.release.classes = {}; },                    // empty map
    input => { input.release.classes.slop.extra = 'x'; },        // unknown key
  ]) {
    const input = structuredClone(pub); mutate(input);
    assert.throws(() => buildRoutedCanon(input), e => e.code === 'SCHEMA');
  }
  // Index forged with a rule class the index does not define fails topic validation.
  const forged = structuredClone(index);
  delete forged.payload.classes.slop;
  forged.checksum = canonChecksum(forged.payload);
  assert.throws(() => validateRoutedTopic(envelope, validateRoutedIndex(forged), topic), e => e.code === 'SCHEMA');
});

// Publication gate for canon/public/records.json: only accepted, globally scoped rules with a public class.
// Candidates, project-scoped rules and project decisions stay in the private base.
// Strength follows the class (owner decision): slop is hard; bad tone and instructions are soft.
// Owner-approved exceptions: slop rules that are recommendations only.
const SOFT_SLOP = new Set(['KR-3d', 'KR-8']);
const strengthFor = record => record.class === 'slop' && !SOFT_SLOP.has(record.id) ? 'hard' : 'soft';
export function publicCanonViolations(input) {
  const problems = [];
  const classes = input.release?.classes ?? {};
  for (const name of ['slop', 'bad-tone', 'instruction', 'project-decision']) {
    if (!Object.hasOwn(classes, name)) problems.push(`release: class ${name} is not defined`);
  }
  for (const record of input.records ?? []) {
    if (record.status !== 'accepted') problems.push(`${record.id}: status ${record.status ?? 'missing'} is not accepted`);
    if (record.scope !== 'global') problems.push(`${record.id}: scope ${record.scope ?? 'missing'} is not global`);
    if (!Object.hasOwn(classes, record.class ?? '')) problems.push(`${record.id}: class ${record.class ?? 'missing'} is not defined`);
    if (record.class === 'project-decision') problems.push(`${record.id}: project decisions are not public`);
    else if (record.strength !== strengthFor(record)) {
      problems.push(`${record.id}: strength ${record.strength} does not match class ${record.class} (expected ${strengthFor(record)})`);
    }
  }
  return problems;
}

test('public canon gate: only accepted global rules with a public class; negatives fail', async () => {
  const pub = JSON.parse(await readFile(path.join(here, '..', 'canon/public/records.json'), 'utf8'));
  assert.deepEqual(publicCanonViolations(pub), []);
  for (const [mutate, expected] of [
    [input => { input.records[0].status = 'candidate'; }, /status candidate is not accepted/],
    [input => { delete input.records[0].status; }, /status missing/],
    [input => { input.records[0].scope = 'project'; }, /scope project is not global/],
    [input => { input.records[0].class = 'project-decision'; }, /project decisions are not public/],
    [input => { delete input.records[0].class; }, /class missing/],
    [input => { delete input.release.classes['bad-tone']; }, /class bad-tone is not defined/],
    [input => { input.records.find(r => r.id === 'KR-1').strength = 'soft'; }, /KR-1: strength soft does not match class slop/],
    [input => { input.records.find(r => r.id === 'LK-01').strength = 'hard'; }, /LK-01: strength hard does not match class bad-tone/],
    [input => { input.records.find(r => r.id === 'US-005').strength = 'hard'; }, /US-005: strength hard does not match class instruction/],
    [input => { input.records.find(r => r.id === 'KR-8').strength = 'hard'; }, /KR-8: strength hard does not match/],
    [input => { input.records.find(r => r.id === 'C-11').strength = 'hard'; }, /C-11: strength hard does not match class bad-tone/],
    [input => { input.records.find(r => r.id === 'UR-1').strength = 'soft'; }, /UR-1: strength soft does not match class slop/],
    [input => { input.records.find(r => r.id === 'US-009').status = 'candidate'; }, /US-009: status candidate is not accepted/],
    [input => { input.records.find(r => r.id === 'DEC-5').strength = 'hard'; }, /DEC-5: strength hard does not match class bad-tone/],
    [input => { input.records.find(r => r.id === 'DEC-3').status = 'candidate'; }, /DEC-3: status candidate is not accepted/],
    [input => { input.records.find(r => r.id === 'US-002').strength = 'hard'; }, /US-002: strength hard does not match class instruction/],
  ]) {
    const input = structuredClone(pub); mutate(input);
    assert.match(publicCanonViolations(input).join('\n'), expected);
  }
});

test('rule credits: optional, carried to the topic and hashed; malformed credits fail', () => {
  const credited = structuredClone(records);
  const credit = { name: 'Someone', work: 'An article', url: 'https://example.com/article' };
  credited.records[0].credits = [credit];
  const built = buildRoutedCanon(credited);
  const topic = credited.records[0].topic;
  const envelope = JSON.parse(built.files.get(`topics/${topic}.json`));
  assert.deepEqual(envelope.payload.rules.find(rule => rule.id === credited.records[0].id).credits, [credit]);
  validateRoutedTopic(envelope, validateRoutedIndex(JSON.parse(built.files.get('index.json'))), topic);
  assert.equal(ruleHash(records.records[0]), hashOf(records.records[0].id), 'uncredited hash unchanged');
  assert.notEqual(ruleHash(credited.records[0]), hashOf(records.records[0].id));
  for (const bad of [[], [{ name: 'X' }], [{ name: 'X', work: 'Y', url: 'http://plain.example' }],
    [{ name: 'X', work: 'Y', extra: 1 }], [{ name: ' ', work: 'Y' }], 'X', Array(6).fill({ name: 'X', work: 'Y' })]) {
    const input = structuredClone(records); input.records[0].credits = bad;
    assert.throws(() => buildRoutedCanon(input), e => e.code === 'SCHEMA', JSON.stringify(bad));
  }
});

test('public routes go through the real walker: a .ts content module routes copy, a .json data file does not', async () => {
  const pub = JSON.parse(await readFile(path.join(here, '..', 'canon/public/records.json'), 'utf8'));
  const index = JSON.parse(buildRoutedCanon(pub).files.get('index.json'));
  const filesOf = dir => walk(dir).map(file => path.relative(dir, file).split(path.sep).join('/'));
  const ts = path.join(here, 'fixtures/routed-copy-ts');
  assert.deepEqual(filesOf(ts), ['content.ts']);
  assert.match(await readFile(path.join(ts, 'content.ts'), 'utf8'), /Prompt heading/);
  assert.deepEqual(routeTopics(index, filesOf(ts)), ['copy', 'process']);
  assert.ok(index.payload.topics.copy.ruleIds.includes('XP-33'));
  assert.ok(index.payload.topics.copy.ruleIds.includes('XP-34'));
  const json = path.join(here, 'fixtures/routed-copy-json');
  assert.deepEqual(filesOf(json), [], 'the walker does not collect .json');
  assert.deepEqual(routeTopics(index, filesOf(json)), ['process']);
  assert.ok(!routeTopics(index, ['package.json', 'tsconfig.json']).includes('copy'), 'no copy route for JSON config');
});

test('every extension in a public glob is collected by the walker (no dead routes)', async () => {
  const pub = JSON.parse(await readFile(path.join(here, '..', 'canon/public/records.json'), 'utf8'));
  for (const [name, topic] of Object.entries(pub.topics)) {
    for (const glob of topic.globs ?? []) {
      const tail = glob.slice(glob.lastIndexOf('/') + 1);
      const braces = tail.match(/^\*\.\{([^}]+)\}$/);
      const extensions = braces ? braces[1].split(',') : [tail.replace(/^\*\./, '')];
      for (const ext of extensions) assert.ok(SCANNED_EXTENSIONS.has(`.${ext}`), `${name}: .${ext} is never collected`);
    }
  }
});
