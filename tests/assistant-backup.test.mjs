import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { ACK_BATCH_SIZE, BackupError, DATABASE_NAME, parseOptions, syncAssistantLogs, validateExport } from '../scripts/sync-assistant-logs.mjs';

const instant = '2026-10-10T20:30:00.000Z';
const secretQuestion = "PRIVATE fixture: what about 'quoted' text?\nNever print this.";
const schema = `CREATE TABLE interactions (
 id INTEGER PRIMARY KEY AUTOINCREMENT, request_id TEXT NOT NULL UNIQUE,
 created_at TEXT NOT NULL, mode TEXT NOT NULL, question TEXT NOT NULL,
 answer_json TEXT, status TEXT NOT NULL, error_code TEXT, corpus_revision TEXT,
 latency_ms INTEGER, backed_up_at TEXT
);`;
const columnNames = ['id', 'request_id', 'created_at', 'mode', 'question', 'answer_json', 'status', 'error_code', 'corpus_revision', 'latency_ms', 'backed_up_at'];
function row(id, overrides = {}) {
  return { id: String(id), request_id: `request-${id}`, created_at: '2026-09-01T00:00:00.000Z', mode: 'question', question: secretQuestion,
    answer_json: JSON.stringify({ answer: 'PRIVATE answer', evidence: [], matches: [], unknowns: [] }),
    status: 'answered', error_code: null, corpus_revision: '2026-10-10', latency_ms: 123, backed_up_at: null, ...overrides };
}
const sqlValue = value => value === null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
const dump = rows => schema + rows.map(value => `\nINSERT INTO interactions (${columnNames.join(',')}) VALUES (${columnNames.map(column => sqlValue(value[column])).join(',')});`).join('');
const digest = value => createHash('sha256').update(value).digest('hex');
async function workspace(t) {
  const directory = await fs.mkdtemp(join(await fs.realpath(tmpdir()), 'assistant-backup-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return directory;
}
async function archive(directory) {
  const manifest = JSON.parse(await fs.readFile(join(directory, 'manifest.json'), 'utf8'));
  const interactions = JSON.parse(await fs.readFile(join(directory, 'interactions.json'), 'utf8')).interactions;
  for (const [name, expected] of Object.entries(manifest.files)) {
    const bytes = await fs.readFile(join(directory, name));
    assert.equal(bytes.length, expected.bytes);
    assert.equal(digest(bytes), expected.sha256);
    assert.equal((await fs.stat(join(directory, name))).mode & 0o077, 0);
  }
  assert.equal((await fs.stat(directory)).mode & 0o077, 0);
  assert.equal((await fs.stat(join(directory, 'manifest.json'))).mode & 0o077, 0);
  return { manifest, interactions };
}
function remote(rows, destination, { failExport = false, failAckAt = 0, invalidSql = false } = {}) {
  const calls = [];
  let acknowledgements = 0;
  return {
    calls,
    runWrangler: async args => {
      calls.push(args);
      assert.equal(args[0], 'd1');
      assert.equal(args[2], DATABASE_NAME);
      assert.ok(args.includes('--remote'));
      if (args[1] === 'export') {
        if (failExport) throw new Error(secretQuestion);
        await fs.writeFile(args[args.indexOf('--output') + 1], invalidSql ? 'INVALID SQL PRIVATE content' : dump(rows));
        return { stdout: 'export complete' };
      }
      assert.equal(args[1], 'execute');
      const command = args[args.indexOf('--command') + 1];
      assert.match(command, /^UPDATE interactions SET backed_up_at = /);
      assert.match(command, /AND status IN \('answered','failed'\) AND backed_up_at IS NULL;$/);
      assert.doesNotMatch(command, /DELETE|PRIVATE/);
      const ids = command.match(/WHERE id IN \(([^)]+)\)/)[1].split(',');
      assert.ok(ids.length <= ACK_BATCH_SIZE);
      // Every acknowledgement sees a fully finalized, hash-verified backup, never staging.
      const directories = (await fs.readdir(destination)).filter(name => !name.startsWith('.'));
      assert.ok(directories.length);
      const archives = await Promise.all(directories.map(name => archive(join(destination, name))));
      assert.ok(archives.some(item => ids.every(id => item.manifest.finalRowIds.includes(id))));
      assert.equal((await fs.readdir(destination)).some(name => name.startsWith('.staging-')), false);
      acknowledgements += 1;
      if (acknowledgements === failAckAt) throw new Error(secretQuestion);
      const timestamp = command.match(/SET backed_up_at = '([^']+)'/)[1];
      let changes = 0;
      for (const item of rows) {
        if (ids.includes(item.id) && ['answered', 'failed'].includes(item.status) && item.backed_up_at === null) {
          item.backed_up_at = timestamp; changes += 1;
        }
      }
      return { stdout: JSON.stringify([{ success: true, results: [], meta: { changes } }]) };
    },
  };
}

test('verified SQL, JSON and manifest are atomically complete before final IDs are acknowledged', async t => {
  const directory = await workspace(t);
  const rows = [row(1), row(2, { mode: 'match', status: 'failed', answer_json: null, error_code: 'provider_error' }), row(3, { status: 'pending', answer_json: null })];
  const mocked = remote(rows, directory);
  const result = await syncAssistantLogs({ directory, now: instant }, mocked);
  const saved = await archive(result.directory);
  assert.equal(saved.manifest.integrityCheck, 'ok');
  assert.equal(saved.manifest.recordCount, 3);
  assert.deepEqual(saved.manifest.statusCounts, { answered: 1, failed: 1, pending: 1 });
  assert.deepEqual(saved.manifest.finalRowIds, ['1', '2']);
  assert.equal(saved.interactions[0].question, secretQuestion);
  assert.equal(saved.interactions[0].answer_json, rows[0].answer_json);
  assert.equal(saved.interactions[0].backed_up_at, null);
  assert.equal(rows[0].backed_up_at, instant);
  assert.equal(rows[2].backed_up_at, null);
  assert.equal(result.acknowledgedBatches, 1);
});


test('the production schema and immutable trigger reconstruct without weakening the export', async () => {
  const migration = await fs.readFile(new URL('../assistant/migrations/0001_interactions.sql', import.meta.url), 'utf8');
  const exported = migration + dump([row(1), row(2, { status: 'failed', answer_json: null, error_code: 'unavailable' })]).slice(schema.length);
  const validated = await validateExport(exported);
  assert.equal(validated.rowCount, 2);
  assert.deepEqual(validated.finalRowIds, ['1', '2']);
});

test('records created after the export are never acknowledged by that backup', async t => {
  const directory = await workspace(t);
  const rows = [row(1)];
  const mocked = remote(rows, directory);
  const result = await syncAssistantLogs({ directory, now: instant }, {
    runWrangler: async args => {
      const output = await mocked.runWrangler(args);
      if (args[1] === 'export') rows.push(row(2));
      return output;
    },
  });
  assert.deepEqual((await archive(result.directory)).manifest.finalRowIds, ['1']);
  assert.equal(rows[0].backed_up_at, instant);
  assert.equal(rows[1].backed_up_at, null);
});

test('repeat backups preserve original acknowledgement timestamps and keep both verified snapshots', async t => {
  const directory = await workspace(t);
  const rows = [row(1)];
  const mocked = remote(rows, directory);
  const first = await syncAssistantLogs({ directory, now: instant }, mocked);
  const second = await syncAssistantLogs({ directory, now: '2026-10-11T20:30:00.000Z' }, mocked);
  assert.notEqual(first.directory, second.directory);
  assert.equal(rows[0].backed_up_at, instant);
  assert.equal(rows[0].question, secretQuestion);
  assert.equal((await archive(second.directory)).interactions[0].backed_up_at, instant);
  assert.equal((await fs.readdir(directory)).length, 2);
});

test('failed export and invalid SQL never acknowledge cloud records or leak contents', async t => {
  for (const failure of [{ failExport: true }, { invalidSql: true }]) {
    const directory = await workspace(t);
    const rows = [row(1)];
    const mocked = remote(rows, directory, failure);
    await assert.rejects(syncAssistantLogs({ directory, now: instant }, mocked), error => {
      assert.ok(error instanceof BackupError);
      assert.doesNotMatch(JSON.stringify({ message: error.message, details: error.details }), /PRIVATE/);
      return true;
    });
    assert.equal(mocked.calls.length, 1);
    assert.equal(rows[0].backed_up_at, null);
    assert.deepEqual(await fs.readdir(directory), []);
  }
});

test('local write, finalization and final readback failures prevent every remote acknowledgement', async t => {
  for (const failure of ['write', 'rename', 'readback']) {
    const directory = await workspace(t);
    const rows = [row(1)];
    const mocked = remote(rows, directory);
    const io = { ...fs };
    if (failure === 'write') io.open = async (path, ...args) => {
      if (path.endsWith('interactions.json')) throw new Error('disk full');
      return fs.open(path, ...args);
    };
    if (failure === 'rename') io.rename = async () => { throw new Error('disk failure'); };
    if (failure === 'readback') io.readFile = async (path, ...args) => {
      if (path.endsWith('database.sql') && !dirname(path).includes('.staging-')) return Buffer.from('corrupt');
      return fs.readFile(path, ...args);
    };
    await assert.rejects(syncAssistantLogs({ directory, now: instant }, { ...mocked, fs: io }), error => error.code === 'LOCAL_WRITE_FAILED');
    assert.equal(mocked.calls.filter(args => args[1] === 'execute').length, 0);
    assert.equal(rows[0].backed_up_at, null);
  }
});

test('partial acknowledgement failure preserves the complete backup and limits updates to bounded batches', async t => {
  const directory = await workspace(t);
  const rows = Array.from({ length: ACK_BATCH_SIZE + 2 }, (_, index) => row(index + 1));
  const mocked = remote(rows, directory, { failAckAt: 2 });
  let failure;
  await assert.rejects(syncAssistantLogs({ directory, now: instant }, mocked), error => { failure = error; return error.code === 'ACK_FAILED'; });
  const saved = await archive(failure.details.directory);
  assert.equal(saved.interactions.length, rows.length);
  assert.equal(saved.manifest.finalRowIds.length, rows.length);
  assert.equal(failure.details.acknowledgedBatches, 1);
  assert.equal(rows.filter(item => item.backed_up_at !== null).length, ACK_BATCH_SIZE);
  assert.equal((await fs.readdir(directory)).some(name => name.startsWith('.staging-')), false);
});

test('an unsuccessful acknowledgement result preserves the finalized backup', async t => {
  const directory = await workspace(t);
  const mocked = remote([row(1)], directory);
  let failure;
  await assert.rejects(syncAssistantLogs({ directory, now: instant }, {
    runWrangler: args => args[1] === 'execute' ? Promise.resolve({ stdout: '[{"success":false}]' }) : mocked.runWrangler(args),
  }), error => { failure = error; return error.code === 'ACK_FAILED'; });
  await archive(failure.details.directory);
});

test('empty schema-valid export remains recoverable and needs no acknowledgement', async t => {
  const directory = await workspace(t);
  const mocked = remote([], directory);
  const result = await syncAssistantLogs({ directory, now: instant }, mocked);
  assert.equal(result.recordCount, 0);
  assert.equal(result.acknowledgedBatches, 0);
  assert.deepEqual((await archive(result.directory)).manifest.finalRowIds, []);
  assert.equal(mocked.calls.length, 1);
});

test('SQLite integer IDs retain exact precision in backup and acknowledgement eligibility', async () => {
  const largeId = '9007199254740993';
  const validated = await validateExport(dump([row(largeId)]));
  assert.equal(validated.rows[0].id.toString(), largeId);
  assert.deepEqual(validated.finalRowIds, [largeId]);
});

test('Git, symlink and non-private destinations are rejected before a remote call', async t => {
  const directory = await workspace(t);
  const publicDirectory = join(directory, 'public');
  const gitDirectory = join(directory, 'checkout');
  await fs.mkdir(publicDirectory, { mode: 0o755 });
  await fs.chmod(publicDirectory, 0o755);
  await fs.mkdir(gitDirectory, { mode: 0o700 });
  await fs.mkdir(join(gitDirectory, '.git'));
  await fs.symlink(directory, join(directory, 'link'));
  for (const target of [publicDirectory, join(gitDirectory, 'backups'), join(directory, 'link', 'backups')]) {
    let calls = 0;
    await assert.rejects(syncAssistantLogs({ directory: target }, { runWrangler: async () => { calls += 1; } }));
    assert.equal(calls, 0);
  }
});

test('CLI accepts an explicit private directory and rejects unknown arguments', () => {
  assert.deepEqual(parseOptions(['--directory', '/private/backups']), { directory: '/private/backups' });
  assert.deepEqual(parseOptions(['--help']), { help: true });
  assert.throws(() => parseOptions(['--directory']), { code: 'ARGUMENT_INVALID' });
  assert.throws(() => parseOptions(['--delete-cloud']), { code: 'ARGUMENT_INVALID' });
});
