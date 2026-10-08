import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import knowledge from '../assistant/knowledge.generated.mjs';

test('every assistant citation resolves to a built public page and anchor', () => {
  for (const source of knowledge.sources) {
    const url = new URL(source.url);
    const html = readFileSync(new URL(`../_site${url.pathname}index.html`, import.meta.url), 'utf8');
    if (url.hash) assert.ok(html.includes(`id="${decodeURIComponent(url.hash.slice(1))}"`), `${source.id} anchor missing`);
  }
});

test('public configuration contains only an endpoint and activation flag', () => {
  const config = JSON.parse(readFileSync(new URL('../src/static/assistant-config.json', import.meta.url), 'utf8'));
  assert.deepEqual(Object.keys(config).sort(), ['enabled', 'endpoint']);
  assert.equal(typeof config.enabled, 'boolean');
  assert.equal(typeof config.endpoint, 'string');
  if (config.enabled) {
    const url = new URL(config.endpoint);
    assert.equal(url.protocol, 'https:');
    assert.equal(url.pathname, '/api/assistant');
    assert.equal(url.username + url.password + url.search + url.hash, '');
    assert.ok(url.hostname.endsWith('.workers.dev'));
  } else assert.equal(config.endpoint, '');
});

test('configuration helper rejects credential-bearing or invalid endpoints without changing the file', () => {
  const location = new URL('../src/static/assistant-config.json', import.meta.url);
  const before = readFileSync(location, 'utf8');
  for (const endpoint of ['http://127.0.0.1:8000/api/assistant', 'https://user:PRIVATE_SECRET@example.workers.dev/api/assistant',
    'https://example.workers.dev/api/assistant?key=PRIVATE_SECRET', 'https://example.invalid/api/assistant']) {
    const result = spawnSync(process.execPath, ['scripts/configure-assistant.mjs', endpoint], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.ok(!`${result.stdout}${result.stderr}`.includes('PRIVATE_SECRET'));
    assert.equal(readFileSync(location, 'utf8'), before);
  }
});
