import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import yaml from 'js-yaml';
import { buildKnowledge, MAX_SOURCE_BYTES } from '../scripts/build-assistant-knowledge.mjs';
import generated from '../assistant/knowledge.generated.mjs';

const publicText = await readFile(new URL('../src/_data/facts.yaml', import.meta.url), 'utf8');
const facts = yaml.load(publicText);
const built = buildKnowledge(facts, publicText);

test('generated knowledge exactly matches the current public facts file', () => {
  assert.deepEqual(generated, built);
  assert.equal(built.revision, facts.meta.resume_rev);
  assert.equal(built.factsSha256.length, 64);
  assert.ok(new TextEncoder().encode(JSON.stringify(built.sources)).length <= MAX_SOURCE_BYTES);
});

test('all citations are stable IDs and canonical public portfolio URLs', () => {
  assert.equal(new Set(built.sources.map(s => s.id)).size, built.sources.length);
  for (const source of built.sources) {
    assert.match(source.id, /^[a-z][a-z0-9-]{0,63}$/);
    assert.equal(new URL(source.url).origin, facts.meta.site_url);
    assert.ok(source.text.trim());
  }
  assert.equal(built.sources.find(s => s.id === 'record-microsoft').url, `${facts.meta.site_url}/resume/#record-microsoft`);
  assert.equal(built.sources.find(s => s.id === 'receipt-revenue').url, `${facts.meta.site_url}/case/revenue-attribution/#recovery`);
});

test('every résumé bullet and system status retains exact public wording', () => {
  for (const record of facts.record) {
    const source = built.sources.find(s => s.id === record.id);
    for (const bullet of [...(record.bullets || []), ...(record.workstreams || []).flatMap(s => s.bullets)]) assert.ok(source.text.includes(bullet));
  }
  for (const system of facts.systems) {
    const source = built.sources.find(s => s.id === system.id.toLowerCase());
    assert.ok(source.text.includes(system.what));
    assert.ok(source.text.includes(system.proof));
    assert.ok(source.text.includes(`Status: ${system.status}.`));
  }
});

test('important metric qualifiers and unfinished production status survive generation', () => {
  const text = built.sources.map(s => s.text).join('\n');
  for (const exact of ['~$45M/month', '$5B+/year', '99% of performance-throttling incidents', '92% across all paying customers', 'productionizing with a first consumer', '~7% category revenue lift', '~1M URLs/day']) assert.ok(text.includes(exact));
});

test('unapproved top-level fields and fabricated case prose are never ingested', () => {
  const injected = structuredClone(facts);
  injected.privateNotes = 'CONFIDENTIAL_SHOULD_NOT_SHIP';
  injected.cases[0].privateDetails = 'CONFIDENTIAL_SHOULD_NOT_SHIP';
  injected.summary.ats = 'CONFIDENTIAL_SHOULD_NOT_SHIP';
  assert.equal(JSON.stringify(buildKnowledge(injected, publicText)).includes('CONFIDENTIAL_SHOULD_NOT_SHIP'), false);
});

test('changed site, duplicate IDs, arbitrary links, or oversized sources fail the build', () => {
  for (const edit of [
    f => { f.meta.site_url = 'https://attacker.example'; },
    f => { f.systems[0].link = 'https://attacker.example'; },
    f => { f.record[1].id = f.record[0].id; },
    f => { f.skills.tools = 'x'.repeat(MAX_SOURCE_BYTES); }
  ]) {
    const bad = structuredClone(facts); edit(bad);
    assert.throws(() => buildKnowledge(bad, publicText));
  }
});
