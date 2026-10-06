import { DETECTOR_VERSION } from './lib/detector-version.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createCanonRun, canonChecksum } from './lib/canon.mjs';
import { auditCanon } from './lib/canon-audit.mjs';
import { mcpCanonReader, CANON_LATEST_URI } from './lib/canon-mcp.mjs';

function fixture(version) {
  const payload = { schemaVersion: 1, version, publishedAt: '2026-09-14T00:00:00Z',
    source: 'https://example.test/canon', license: 'MIT', content: `Test fixture ${version}`,
    rules: [{ id: 'B-1', source: 'https://example.test/canon#B-1', strength: 'hard', mode: 'detector' }] };
  return { payload, checksum: canonChecksum(payload) };
}

test('real stdio MCP: handshake, resources, pin, update and fail-closed revisions', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'unslop-mcp-'));
  const client = new Client({ name: 'unslop-integration-test', version: '1.0.0' });
  t.after(async () => { await client.close(); await rm(directory, { recursive: true, force: true }); });
  for (const version of ['v1', 'v2']) await writeFile(path.join(directory, `${version}.json`), JSON.stringify(fixture(version)));
  await writeFile(path.join(directory, 'latest.json'), JSON.stringify({ version: 'v1' }));
  await client.connect(new StdioClientTransport({ command: process.execPath,
    args: [fileURLToPath(new URL('./canon-server.mjs', import.meta.url)), directory], stderr: 'pipe' }));
  assert.equal((await client.listResources()).resources[0].uri, CANON_LATEST_URI);
  const read = mcpCanonReader(client);
  const cache = new Map();
  const run = createCanonRun({ endpoint: 'stdio:test', read, cache });
  assert.equal((await run.load()).snapshot.payload.version, 'v1');
  const target = path.join(directory, 'target.css');
  await writeFile(target, '.bad { color: #123456; }');
  const audit = await auditCanon(target, run, { bindings: [{
    ruleId: 'B-1', canonChecksum: fixture('v1').checksum, detectorVersion: DETECTOR_VERSION,
  }] });
  assert.equal(audit.status, 'findings');
  assert.equal(audit.findings[0].canon.version, 'v1');
  assert.equal(audit.provenance.origin, 'remote');
  await writeFile(path.join(directory, 'latest.json'), JSON.stringify({ version: 'v2' }));
  assert.equal((await run.load()).snapshot.payload.version, 'v1');
  assert.equal((await createCanonRun({ endpoint: 'stdio:test', read, cache }).load()).snapshot.payload.version, 'v2');
  await assert.rejects(createCanonRun({ endpoint: 'stdio:test', read, version: 'missing' }).load(), e => e.code === 'REVISION');
  await assert.rejects(client.readResource({ uri: 'unslop://canon/../../package' }), e => e.code === -32002);
  await symlink(path.join(directory, '..'), path.join(directory, 'escape.json'));
  await assert.rejects(client.readResource({ uri: 'unslop://canon/escape' }), e => e.code === -32002);
  const changed = fixture('v1'); changed.payload.content = 'replaced'; changed.checksum = canonChecksum(changed.payload);
  await writeFile(path.join(directory, 'v1.json'), JSON.stringify(changed));
  await assert.rejects(createCanonRun({ endpoint: 'stdio:test', read, cache, version: 'v1' }).load(), e => e.code === 'REVISION_CHANGED');
  // An integrity failure must not fall back to an existing good cached revision.
  await client.close();
  const offline = await createCanonRun({ endpoint: 'stdio:test', read, cache, version: 'v2' }).load();
  assert.equal(offline.stale, true);
  assert.equal(offline.origin, 'cache');
  await assert.rejects(createCanonRun({ endpoint: 'stdio:test', read, cache }).load(), e => e.code === 'OFFLINE');
});
