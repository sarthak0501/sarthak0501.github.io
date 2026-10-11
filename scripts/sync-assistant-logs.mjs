#!/usr/bin/env node
// An authenticated Wrangler export is verified and made durable before cloud acknowledgement.
// The command never deletes cloud records or prints conversation contents/CLI diagnostics.
import * as fs from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const configPath = join(repoRoot, 'assistant/wrangler.jsonc');
const wranglerPath = join(repoRoot, 'node_modules/wrangler/bin/wrangler.js');
export const DATABASE_NAME = 'portfolio-assistant-logs';
export const ACK_BATCH_SIZE = 100;
export const DEFAULT_DIRECTORY = join(homedir(), 'Documents', 'Portfolio Assistant Backups');
const requiredColumns = ['id', 'request_id', 'created_at', 'mode', 'question', 'answer_json', 'status', 'error_code', 'corpus_revision', 'latency_ms', 'backed_up_at'];
const sha256 = value => createHash('sha256').update(value).digest('hex');
const json = value => JSON.stringify(value, (_, item) => typeof item === 'bigint' ? item.toString() : item, 2) + '\n';

export class BackupError extends Error {
  constructor(code, details = {}) { super(code); this.code = code; this.details = details; }
}

// Use the existing Wrangler login. Credentials are never opened by this script.
export function runWrangler(args) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [wranglerPath, ...args], {
      cwd: repoRoot, shell: false, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false', NO_COLOR: '1' },
    });
    let stdout = '';
    let oversized = false;
    const timeout = setTimeout(() => child.kill('SIGTERM'), 10 * 60_000);
    child.stdout.on('data', chunk => {
      if (stdout.length + chunk.length > 1_000_000) { oversized = true; child.kill('SIGTERM'); }
      else stdout += chunk.toString();
    });
    // Wrangler errors may contain SQL or signed export URLs. Do not collect or print them.
    child.stderr.resume();
    child.on('error', () => { clearTimeout(timeout); reject(new BackupError('WRANGLER_FAILED')); });
    child.on('close', code => {
      clearTimeout(timeout);
      if (code !== 0 || oversized) reject(new BackupError('WRANGLER_FAILED'));
      else resolveRun({ stdout });
    });
  });
}

function inside(parent, child) {
  const part = relative(parent, child);
  return part === '' || (part !== '..' && !part.startsWith(`..${sep}`) && !isAbsolute(part));
}

async function privateDirectory(path, io) {
  const target = resolve(path.startsWith(`~${sep}`) ? join(homedir(), path.slice(2)) : path);
  if (inside(repoRoot, target)) throw new BackupError('DIRECTORY_IN_GIT');
  // Resolve existing ancestors before creating anything; reject symlinks and any Git checkout.
  let current = target;
  while (true) {
    try {
      const stat = await io.lstat(current);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new BackupError('DIRECTORY_INVALID');
      try { await io.lstat(join(current, '.git')); throw new BackupError('DIRECTORY_IN_GIT'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  await io.mkdir(target, { recursive: true, mode: 0o700 });
  const stat = await io.lstat(target);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0
    || (typeof process.getuid === 'function' && stat.uid !== process.getuid())) {
    throw new BackupError('DIRECTORY_NOT_PRIVATE');
  }
  return await io.realpath(target);
}

async function durableFile(path, data, io) {
  const handle = await io.open(path, 'wx', 0o600);
  try { await handle.writeFile(data); await handle.sync(); }
  finally { await handle.close(); }
}
async function syncDirectory(path, io) {
  const handle = await io.open(path, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}

export async function validateExport(sql) {
  let DatabaseSync;
  try { ({ DatabaseSync } = await import('node:sqlite')); }
  catch { throw new BackupError('SQLITE_UNAVAILABLE'); }
  const database = new DatabaseSync(':memory:', { allowExtension: false });
  try {
    database.exec(sql);
    const integrity = database.prepare('PRAGMA integrity_check').all();
    if (integrity.length !== 1 || Object.values(integrity[0])[0] !== 'ok') throw new Error('integrity');
    const columns = database.prepare('PRAGMA table_info(interactions)').all();
    if (requiredColumns.some(name => !columns.some(column => column.name === name))
      || !columns.some(column => column.name === 'id' && column.pk === 1)) throw new Error('schema');
    const statement = database.prepare('SELECT * FROM interactions ORDER BY id');
    statement.setReadBigInts(true);
    const rows = statement.all();
    const count = database.prepare('SELECT COUNT(*) AS count FROM interactions').get().count;
    if (count !== rows.length) throw new Error('count');
    const finalRowIds = [];
    const statuses = {};
    for (const row of rows) {
      if (typeof row.id !== 'bigint' || row.id < 1n || typeof row.request_id !== 'string'
        || !row.request_id || typeof row.created_at !== 'string' || !Number.isFinite(Date.parse(row.created_at))
        || !['question', 'match'].includes(row.mode) || typeof row.question !== 'string'
        || typeof row.status !== 'string') throw new Error('row');
      if (row.status === 'answered') {
        if (typeof row.answer_json !== 'string' || !row.answer_json.trim()) throw new Error('answer');
        JSON.parse(row.answer_json);
      }
      statuses[row.status] = (statuses[row.status] || 0) + 1;
      if (['answered', 'failed'].includes(row.status)) finalRowIds.push(row.id.toString());
    }
    return { rows, rowCount: count, finalRowIds, statuses };
  } catch (error) {
    if (error instanceof BackupError) throw error;
    throw new BackupError('EXPORT_INVALID');
  } finally { database.close(); }
}

function successfulAcknowledgement(output) {
  try {
    const results = JSON.parse(output.stdout);
    if (!Array.isArray(results) || !results.length || results.some(result => result.success !== true)) throw new Error();
  } catch { throw new BackupError('ACK_FAILED'); }
}

export async function syncAssistantLogs({ directory = DEFAULT_DIRECTORY, now = new Date() } = {}, dependencies = {}) {
  const io = dependencies.fs || fs;
  const run = dependencies.runWrangler || runWrangler;
  const validate = dependencies.validateExport || validateExport;
  const timestamp = new Date(now).toISOString();
  let stage;
  let completed;
  let phase = 'DIRECTORY_INVALID';
  let manifest;
  let acknowledgedBatches = 0;
  try {
    const destination = await privateDirectory(directory, io);
    stage = await io.mkdtemp(join(destination, '.staging-'));
    await io.chmod(stage, 0o700);
    const sqlPath = join(stage, 'database.sql');
    phase = 'LOCAL_WRITE_FAILED';
    await durableFile(sqlPath, '', io);
    phase = 'EXPORT_FAILED';
    await run(['d1', 'export', DATABASE_NAME, '--remote', '--config', configPath, '--output', sqlPath, '--skip-confirmation']);
    phase = 'EXPORT_INVALID';
    const sqlStat = await io.lstat(sqlPath);
    if (!sqlStat.isFile() || sqlStat.isSymbolicLink() || sqlStat.size === 0) throw new BackupError('EXPORT_INVALID');
    await io.chmod(sqlPath, 0o600);
    const sql = await io.readFile(sqlPath);
    const verified = await validate(sql.toString('utf8'));
    phase = 'LOCAL_WRITE_FAILED';
    const jsonText = json({ database: DATABASE_NAME, exportedAt: timestamp, interactions: verified.rows });
    const jsonPath = join(stage, 'interactions.json');
    await durableFile(jsonPath, jsonText, io);
    manifest = {
      formatVersion: 1, database: DATABASE_NAME, exportedAt: timestamp,
      integrityCheck: 'ok', recordCount: verified.rowCount, statusCounts: verified.statuses,
      finalRecordCount: verified.finalRowIds.length, finalRowIds: verified.finalRowIds,
      idEncoding: 'Decimal strings preserve SQLite integer precision.',
      files: {
        'database.sql': { sha256: sha256(sql), bytes: sql.length },
        'interactions.json': { sha256: sha256(jsonText), bytes: Buffer.byteLength(jsonText) },
      },
      cloudAcknowledgement: 'Attempted only after this directory is complete and verified; no cloud records are deleted by this command.',
    };
    await durableFile(join(stage, 'manifest.json'), json(manifest), io);
    // Wrangler wrote the SQL; flush it explicitly along with our own files.
    const sqlHandle = await io.open(sqlPath, 'r');
    try { await sqlHandle.sync(); } finally { await sqlHandle.close(); }
    await syncDirectory(stage, io);
    const finalPath = join(destination, `${timestamp.replaceAll(':', '-')}-${randomUUID().slice(0, 8)}`);
    await io.rename(stage, finalPath);
    stage = null;
    completed = finalPath;
    await syncDirectory(destination, io);
    // Read the finalized files back before the first remote UPDATE.
    for (const [name, expected] of Object.entries(manifest.files)) {
      const contents = await io.readFile(join(completed, name));
      if (contents.length !== expected.bytes || sha256(contents) !== expected.sha256) throw new BackupError('LOCAL_WRITE_FAILED');
    }
    const savedManifest = JSON.parse(await io.readFile(join(completed, 'manifest.json'), 'utf8'));
    if (json(savedManifest) !== json(manifest)) throw new BackupError('LOCAL_WRITE_FAILED');
    phase = 'ACK_FAILED';
    for (let offset = 0; offset < manifest.finalRowIds.length; offset += ACK_BATCH_SIZE) {
      const ids = manifest.finalRowIds.slice(offset, offset + ACK_BATCH_SIZE);
      if (ids.some(id => !/^[1-9]\d*$/.test(id))) throw new BackupError('ACK_FAILED');
      // Final statuses are immutable. Preserve the first acknowledgement on retries.
      const command = `UPDATE interactions SET backed_up_at = '${timestamp}' WHERE id IN (${ids.join(',')}) AND status IN ('answered','failed') AND backed_up_at IS NULL;`;
      successfulAcknowledgement(await run(['d1', 'execute', DATABASE_NAME, '--remote', '--config', configPath, '--command', command, '--json', '--yes']));
      acknowledgedBatches += 1;
    }
    return { directory: completed, recordCount: manifest.recordCount, finalRecordCount: manifest.finalRecordCount, acknowledgedBatches };
  } catch (error) {
    if (stage) await io.rm(stage, { recursive: true, force: true }).catch(() => {});
    const code = completed && phase === 'ACK_FAILED' ? 'ACK_FAILED' : error instanceof BackupError ? error.code : phase;
    throw new BackupError(code, { ...(completed ? { directory: completed, recordCount: manifest.recordCount, finalRecordCount: manifest.finalRecordCount } : {}), acknowledgedBatches });
  }
}

export function parseOptions(args) {
  const options = {};
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--help') options.help = true;
    else if (args[i] === '--directory' && args[i + 1] && !args[i + 1].startsWith('--')) options.directory = args[++i];
    else throw new BackupError('ARGUMENT_INVALID');
  }
  return options;
}

async function main() {
  try {
    const options = parseOptions(process.argv.slice(2));
    if (options.help) {
      console.log('Usage: node scripts/sync-assistant-logs.mjs [--directory PRIVATE_DIRECTORY]\nExports through your existing Wrangler login, verifies a local SQL + JSON backup, then marks only backed-up final records. Never deletes cloud data.\nDefault: ~/Documents/Portfolio Assistant Backups. Use Node 22.13+; keep the destination outside Git with owner-only permissions.');
      return;
    }
    const result = await syncAssistantLogs(options);
    console.log(`Verified backup saved: ${result.directory}\nRecords: ${result.recordCount}; final records safely acknowledged: ${result.finalRecordCount}.`);
  } catch (error) {
    const code = error instanceof BackupError ? error.code : 'BACKUP_FAILED';
    console.error(`Assistant backup failed (${code}). Conversation contents and provider diagnostics are not printed.`);
    if (error.details?.directory) console.error(`Local backup preserved: ${error.details.directory}`);
    if (code === 'ACK_FAILED') console.error('Cloud acknowledgement was incomplete. Rerun to retry safely; local backups remain intact.');
    process.exitCode = 1;
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
