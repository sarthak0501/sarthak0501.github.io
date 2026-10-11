import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { authorizedOwner, createAdminHandler, listInteractions, pacificDate, pacificMidnight, parseFilters } from '../assistant/admin-worker.mjs';
import { logInteraction } from '../assistant/logging.mjs';

const ORIGIN = 'https://private-dashboard.example.workers.dev';
const ownerEnv = { ADMIN_ORIGIN: ORIGIN, ACCESS_AUD: 'test-dashboard-audience', OWNER_EMAIL: 'owner@example.com', LOGGING_ENABLED: 'true' };
const ownerContext = () => ({ access: { aud: ownerEnv.ACCESS_AUD, getIdentity: async () => ({ email: 'Owner@example.com' }) } });
const req = (path = '/', options = {}) => new Request(`${ORIGIN}${path}`, options);
const answer = { answer: 'Public answer. [profile]', evidence: [{ id: 'profile', title: 'Profile', url: 'https://sarthak0501.github.io/resume/' }], matches: [], unknowns: [] };
const record = (extra = {}) => ({ requestId: randomUUID(), createdAt: '2026-10-10T15:00:00.000Z', mode: 'question', question: 'Current question', answer, status: 'answered', errorCode: null, corpusRevision: '2026-10-10', latencyMs: 20, ...extra });

async function privateDb(t) {
  const runtime = new Miniflare(convertV4MiniflareOptions({
    script: 'export default { fetch() { return new Response("local fixture"); } };', modules: true,
    compatibilityDate: '2026-10-07', cf: false, d1Databases: ['ASSISTANT_LOG_DB'],
  }));
  t.after(() => runtime.dispose());
  const db = await runtime.getD1Database('ASSISTANT_LOG_DB');
  const schema = await readFile(new URL('../assistant/migrations/0001_interactions.sql', import.meta.url), 'utf8');
  await db.batch(schema.replace(/^--.*$/gm, '').trim().split(/;\s*(?=CREATE\b)/).map(sql => db.prepare(sql)));
  return db;
}
function filters(query = 'from=2026-10-10&to=2026-10-10', now) {
  return parseFilters(new URL(`${ORIGIN}/api/interactions?${query}`), now);
}

test('every admin path rejects absent, misconfigured, mismatched or spoofed authentication before database access', async () => {
  let databaseCalls = 0;
  const db = { prepare() { databaseCalls++; throw new Error('PRIVATE_DATABASE_DETAIL'); } };
  const handler = createAdminHandler();
  const cases = [
    [{}, undefined], [{}, {}],
    [{ ACCESS_AUD: undefined }, ownerContext()], [{ ACCESS_AUD: 'not-configured' }, ownerContext()],
    [{ OWNER_EMAIL: '' }, ownerContext()],
    [{}, { access: { aud: 'wrong-audience', getIdentity: async () => ({ email: ownerEnv.OWNER_EMAIL }) } }],
    [{}, { access: { aud: ownerEnv.ACCESS_AUD, getIdentity: async () => ({ email: 'another@example.com' }) } }],
    [{}, { access: { aud: ownerEnv.ACCESS_AUD, getIdentity: async () => null } }],
    [{}, { access: { aud: ownerEnv.ACCESS_AUD, getIdentity: async () => { throw new Error('PRIVATE_ACCESS_DETAIL'); } } }],
  ];
  for (const [override, context] of cases) {
    for (const path of ['/', '/admin.js', '/admin.css', '/api/interactions', '/unknown']) {
      for (const method of ['GET', 'POST']) {
        const response = await handler.fetch(req(path, { method, headers: {
          'Cf-Access-Authenticated-User-Email': ownerEnv.OWNER_EMAIL,
          'Cf-Access-Jwt-Assertion': 'spoofed-unsigned-token', Authorization: 'Bearer spoofed-token',
        } }), { ...ownerEnv, ASSISTANT_LOG_DB: db, ...override }, context);
        assert.equal(response.status, 403);
        assert.match(response.headers.get('Cache-Control'), /no-store/);
        assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
        assert.deepEqual(await response.json(), { error: 'Owner sign-in required.' });
      }
    }
  }
  assert.equal(databaseCalls, 0);
  assert.equal(await authorizedOwner(ownerEnv, ownerContext()), true);
});

test('the dedicated origin, GET-only boundary and private security headers apply to authenticated requests', async () => {
  let calls = 0;
  const db = { prepare() { calls++; throw new Error('PRIVATE_DATABASE_DETAIL'); } };
  const env = { ...ownerEnv, ASSISTANT_LOG_DB: db };
  const handler = createAdminHandler();
  const context = ownerContext();
  assert.equal((await handler.fetch(new Request('https://other.example/api/interactions'), env, context)).status, 403);
  for (const path of ['/', '/admin.js', '/admin.css', '/api/interactions']) {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']) {
      assert.equal((await handler.fetch(req(path, { method }), env, context)).status, 405);
    }
  }
  for (const [path, type] of [['/', 'text/html'], ['/admin.js', 'text/javascript'], ['/admin.css', 'text/css']]) {
    const response = await handler.fetch(req(path), env, context);
    assert.equal(response.status, 200);
    assert.ok(response.headers.get('Content-Type').startsWith(type));
    assert.match(response.headers.get('Content-Security-Policy'), /frame-ancestors 'none'/);
    assert.match(response.headers.get('Cache-Control'), /private, no-store/);
    assert.equal(response.headers.get('X-Frame-Options'), 'DENY');
    assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer');
    assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  }
  assert.equal((await handler.fetch(req('/unknown'), env, context)).status, 404);
  assert.equal(calls, 0);
});

test('Today and inclusive Pacific day filters use the correct 23-hour and 25-hour DST boundaries', () => {
  assert.equal(pacificDate(Date.parse('2026-10-11T06:59:59.999Z')), '2026-10-10');
  const today = filters('', Date.parse('2026-10-11T06:59:59.999Z'));
  assert.equal(today.from, '2026-10-10'); assert.equal(today.to, '2026-10-10');
  assert.equal(today.start, '2026-10-10T07:00:00.000Z');
  assert.equal(today.end, '2026-10-11T07:00:00.000Z');
  for (const [day, start, end, hours] of [
    ['2026-03-08', '2026-03-08T08:00:00.000Z', '2026-03-09T07:00:00.000Z', 23],
    ['2026-11-01', '2026-11-01T07:00:00.000Z', '2026-11-02T08:00:00.000Z', 25],
  ]) {
    const result = filters(`from=${day}&to=${day}`);
    assert.equal(pacificMidnight(day), start);
    assert.equal(result.start, start); assert.equal(result.end, end);
    assert.equal((Date.parse(result.end) - Date.parse(result.start)) / 3600000, hours);
  }
  for (const query of ['from=2026-02-30', 'from=2026-10-11&to=2026-10-10', 'from=2020-01-01&to=2026-01-01', 'cursor=0', 'cursor=-1', 'cursor=9007199254740992', 'q=' + 'x'.repeat(201), 'admin=true']) assert.throws(() => filters(query));
});

test('real D1 day filtering includes both sides of DST transitions but excludes adjacent days', async t => {
  const db = await privateDb(t);
  const env = { LOGGING_ENABLED: 'true', ASSISTANT_LOG_DB: db };
  for (const day of ['2026-03-08', '2026-11-01']) {
    const range = filters(`from=${day}&to=${day}`);
    const times = [Date.parse(range.start) - 1, Date.parse(range.start), Date.parse(range.end) - 1, Date.parse(range.end)];
    for (const time of times) await logInteraction(env, record({ createdAt: new Date(time).toISOString() }));
    const result = await listInteractions(db, range);
    assert.equal(result.summary.total, 2);
    assert.deepEqual(result.items.map(item => item.created_at).sort(), [range.start, new Date(Date.parse(range.end) - 1).toISOString()]);
  }
});

test('real D1 pagination limits rows to 50 while summaries cover the entire filter', async t => {
  const db = await privateDb(t);
  const env = { LOGGING_ENABLED: 'true', ASSISTANT_LOG_DB: db };
  for (let index = 0; index < 55; index++) {
    await logInteraction(env, record({ question: `Question ${index}`, ...(index % 5 === 0 ? { status: 'failed', answer: null, errorCode: 'timeout' } : {}) }));
  }
  const outside = record({ createdAt: '2026-10-11T10:00:00.000Z' });
  await logInteraction(env, outside);
  await db.prepare('UPDATE interactions SET backed_up_at = ? WHERE request_id = ?').bind('2026-10-12T00:00:00.000Z', outside.requestId).run();
  const first = await listInteractions(db, filters());
  assert.equal(first.items.length, 50);
  assert.deepEqual(first.summary, { total: 55, answered: 44, failed: 11 });
  assert.equal(first.lastBackupAt, '2026-10-12T00:00:00.000Z');
  assert.equal(first.timeZone, 'America/Los_Angeles'); assert.equal(first.retentionDays, 31);
  const response = await createAdminHandler().fetch(req('/api/interactions?from=2026-10-10&to=2026-10-10'), { ...ownerEnv, ASSISTANT_LOG_DB: db }, ownerContext());
  assert.equal(response.status, 200);
  const responseBody = await response.json();
  assert.deepEqual(responseBody.summary, first.summary);
  assert.equal(responseBody.loggingEnabled, true);
  const second = await listInteractions(db, filters(`from=2026-10-10&to=2026-10-10&cursor=${first.nextCursor}`));
  assert.equal(second.items.length, 5); assert.equal(second.nextCursor, null);
  assert.deepEqual(second.summary, first.summary);
  const ids = [...first.items, ...second.items].map(row => row.id);
  assert.equal(new Set(ids).size, 55);
  assert.deepEqual(ids, [...ids].sort((a, b) => b - a));
});

test('real D1 search finds question and answer text while treating SQL syntax and wildcard characters literally', async t => {
  const db = await privateDb(t);
  const env = { LOGGING_ENABLED: 'true', ASSISTANT_LOG_DB: db };
  const needle = '100%_complete\\done';
  for (const value of [
    record({ question: `How do I reach ${needle}?` }),
    record({ question: 'How do I reach 100XcompleteYdone?' }),
    record({ question: 'A regular question', answer: { ...answer, answer: `Use ${needle} as the marker. [profile]` } }),
    record({ question: "A literal ' OR 1=1 -- question" }),
  ]) await logInteraction(env, value);
  const result = await listInteractions(db, filters('from=2026-10-10&to=2026-10-10&q=' + encodeURIComponent(needle)));
  assert.equal(result.summary.total, 2);
  assert.equal(result.items.length, 2);
  const injection = await listInteractions(db, filters('from=2026-10-10&to=2026-10-10&q=' + encodeURIComponent("' OR 1=1 --")));
  assert.equal(injection.summary.total, 1);
  assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM interactions').first()).count, 4);
});

test('invalid API filters do not query D1, and database failures return safe 503 responses', async () => {
  let calls = 0;
  const env = { ...ownerEnv, ASSISTANT_LOG_DB: { prepare() { calls++; throw new Error('PRIVATE_D1_CONTENT_AND_SQL'); } } };
  const handler = createAdminHandler();
  const invalid = await handler.fetch(req('/api/interactions?from=not-a-date'), env, ownerContext());
  assert.equal(invalid.status, 400); assert.equal(calls, 0);
  const unavailable = await handler.fetch(req('/api/interactions?from=2026-10-10&to=2026-10-10'), env, ownerContext());
  assert.equal(unavailable.status, 503);
  assert.equal(JSON.stringify(await unavailable.json()).includes('PRIVATE_D1_CONTENT_AND_SQL'), false);
  assert.match(unavailable.headers.get('Cache-Control'), /no-store/);
});
