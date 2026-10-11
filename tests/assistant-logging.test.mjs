import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { logInteraction, normalizeInteraction, pruneBackedUp, RETENTION_DAYS } from '../assistant/logging.mjs';

const publicAnswer = {
  answer: 'Documented public experience. [profile]',
  evidence: [{ id: 'profile', title: 'Public résumé', url: 'https://sarthak0501.github.io/resume/' }],
  matches: [], unknowns: [],
};
const entry = (extra = {}) => ({
  requestId: randomUUID(), createdAt: '2026-10-10T12:00:00.000Z', mode: 'question',
  question: 'What experience is documented?', answer: structuredClone(publicAnswer),
  status: 'answered', errorCode: null, corpusRevision: '2026-10-10', latencyMs: 250,
  ...extra,
});

test('disabled logging needs no database and does not inspect or save visitor content', async () => {
  assert.deepEqual(await logInteraction({}, { arbitrary: 'not persisted' }), { logged: false, reason: 'disabled' });
  assert.deepEqual(await logInteraction({ LOGGING_ENABLED: 'false' }, entry()), { logged: false, reason: 'disabled' });
});

test('normalization permits only bounded disclosed fields and normalized public answers', () => {
  const source = entry();
  const normalized = normalizeInteraction(source);
  assert.deepEqual(JSON.parse(normalized.answerJson), publicAnswer);
  assert.equal(normalized.question, source.question);
  assert.deepEqual(Object.keys(normalized).sort(), ['answerJson', 'corpusRevision', 'createdAt', 'errorCode', 'latencyMs', 'mode', 'question', 'requestId', 'status'].sort());
  for (const change of [
    e => { e.ip = '203.0.113.7'; }, e => { e.context = ['previous question']; },
    e => { e.requestId = 'not-a-uuid'; }, e => { e.createdAt = '2026-10-10'; },
    e => { e.createdAt = '2026-02-30T12:00:00.000Z'; }, e => { e.mode = 'admin'; },
    e => { e.question = 'x'.repeat(1201); }, e => { e.mode = 'match'; e.question = 'x'.repeat(6001); },
    e => { e.question = '   '; }, e => { e.status = 'pending'; },
    e => { e.corpusRevision = 'x'.repeat(121); }, e => { e.latencyMs = -1; },
    e => { e.latencyMs = 600001; }, e => { e.latencyMs = 1.5; },
    e => { e.answer.rawProvider = { id: 'resp_private' }; },
    e => { e.answer.answer = 'x'.repeat(3201); }, e => { e.answer.unknowns = ['x'.repeat(401)]; },
    e => { e.answer.evidence[0].ip = '203.0.113.7'; },
    e => { e.answer.evidence[0].url = 'https://attacker.invalid/'; },
    e => { e.answer.evidence[0].url += '?secret=private'; },
    e => { e.answer.matches = [{ requirement: 'Role', evidence: 'Text', gap: '', sourceIds: ['missing'] }]; },
    e => { e.errorCode = 'timeout'; },
    e => { e.status = 'failed'; e.answer = null; e.errorCode = 'PRIVATE_UPSTREAM_ERROR'; },
  ]) {
    const invalid = entry(); change(invalid);
    assert.throws(() => normalizeInteraction(invalid), { message: 'Invalid interaction record' });
  }
  const failed = normalizeInteraction(entry({ status: 'failed', answer: null, errorCode: 'timeout' }));
  assert.equal(failed.answerJson, null);
  assert.equal(failed.errorCode, 'timeout');
  const match = normalizeInteraction(entry({ mode: 'match', question: 'Public job description', answer: {
    ...publicAnswer, matches: [{ requirement: 'Data science', evidence: 'Public experience. [profile]', gap: '', sourceIds: ['profile'] }],
  } }));
  assert.equal(JSON.parse(match.answerJson).matches.length, 1);
});

test('database errors never expose SQL bindings or private database details', async () => {
  const env = { LOGGING_ENABLED: 'true', ASSISTANT_LOG_DB: {
    prepare() { throw new Error('PRIVATE_SQL_BINDING_AND_QUESTION'); },
  } };
  await assert.rejects(logInteraction(env, entry()), { message: 'Interaction storage unavailable' });
  await assert.rejects(logInteraction({ LOGGING_ENABLED: 'true' }, entry()), { message: 'Interaction storage unavailable' });
  await assert.rejects(pruneBackedUp(env), { message: 'Interaction cleanup unavailable' });
  await assert.rejects(pruneBackedUp(env, NaN), { message: 'Invalid cleanup time' });
});

test('real D1 records survive restart, are immutable, and are retained until old AND backed up', { timeout: 30000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'assistant-d1-test-'));
  const options = convertV4MiniflareOptions({
    script: 'export default { fetch() { return new Response("local test"); } };', modules: true,
    compatibilityDate: '2026-10-07', cf: false,
    d1Databases: { ASSISTANT_LOG_DB: 'assistant-private-log-tests' }, resourcePersistencePath: directory,
  });
  let runtime = new Miniflare(options);
  try {
    let db = await runtime.getD1Database('ASSISTANT_LOG_DB');
    const schema = await readFile(new URL('../assistant/migrations/0001_interactions.sql', import.meta.url), 'utf8');
    // D1's exec() treats each line as a separate query. Keep the migration's
    // multiline CREATE statements and trigger body intact when applying it here.
    const statements = schema.replace(/^--.*$/gm, '').trim().split(/;\s*(?=CREATE\b)/);
    await db.batch(statements.map(sql => db.prepare(sql)));
    let env = { LOGGING_ENABLED: 'true', ASSISTANT_LOG_DB: db };
    const first = entry({ question: "What is the evidence? '; DROP TABLE interactions; --" });
    assert.deepEqual(await logInteraction(env, first), { logged: true, inserted: true });
    assert.deepEqual(await logInteraction(env, { ...first, question: 'A duplicate must not overwrite the first.' }), { logged: true, inserted: false });
    let saved = await db.prepare('SELECT * FROM interactions WHERE request_id = ?').bind(first.requestId).first();
    assert.equal(saved.id, 1);
    assert.equal(saved.question, first.question);
    assert.equal(saved.backed_up_at, null);
    assert.deepEqual(JSON.parse(saved.answer_json), publicAnswer);
    await assert.rejects(db.prepare('UPDATE interactions SET question = ? WHERE id = ?').bind('Changed', saved.id).run(), /immutable/);

    await runtime.dispose();
    runtime = new Miniflare(options);
    db = await runtime.getD1Database('ASSISTANT_LOG_DB');
    env = { LOGGING_ENABLED: 'true', ASSISTANT_LOG_DB: db };
    saved = await db.prepare('SELECT * FROM interactions WHERE request_id = ?').bind(first.requestId).first();
    assert.equal(saved.question, first.question, 'a new runtime recovers the durable record');

    const now = Date.parse('2026-12-01T00:00:00.000Z');
    const cutoff = now - RETENTION_DAYS * 86400000;
    const oldBacked = entry({ createdAt: new Date(cutoff - 1).toISOString() });
    const boundaryBacked = entry({ createdAt: new Date(cutoff).toISOString() });
    const recentBacked = entry({ createdAt: new Date(now - 86400000).toISOString() });
    const oldUnbacked = entry({ createdAt: '2020-01-01T00:00:00.000Z' });
    const failed = entry({ status: 'failed', answer: null, errorCode: 'unavailable' });
    for (const record of [oldBacked, boundaryBacked, recentBacked, oldUnbacked, failed]) await logInteraction(env, record);
    for (const record of [oldBacked, boundaryBacked, recentBacked]) {
      await db.prepare('UPDATE interactions SET backed_up_at = ? WHERE request_id = ?')
        .bind(new Date(now).toISOString(), record.requestId).run();
    }
    assert.equal(await pruneBackedUp(env, now), 1);
    assert.equal(await db.prepare('SELECT id FROM interactions WHERE request_id = ?').bind(oldBacked.requestId).first(), null);
    for (const record of [first, boundaryBacked, recentBacked, oldUnbacked, failed]) {
      assert.ok(await db.prepare('SELECT id FROM interactions WHERE request_id = ?').bind(record.requestId).first(), `retain ${record.requestId}`);
    }
    assert.equal(await pruneBackedUp(env, now), 0, 'cleanup is idempotent');
    assert.equal((await db.prepare('SELECT answer_json FROM interactions WHERE request_id = ?').bind(failed.requestId).first()).answer_json, null);
    const columns = (await db.prepare('PRAGMA table_info(interactions)').all()).results.map(column => column.name);
    assert.deepEqual(columns, ['id', 'request_id', 'created_at', 'mode', 'question', 'answer_json', 'status', 'error_code', 'corpus_revision', 'latency_ms', 'backed_up_at']);
  } finally {
    await runtime.dispose();
    await rm(directory, { recursive: true, force: true });
  }
});
