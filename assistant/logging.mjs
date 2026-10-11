// Private interaction records contain only the disclosed current input and
// normalized public response. No IP, prior context, credentials or provider data.
export const RETENTION_DAYS = 31;
const DAY_MS = 86400000;
const ENTRY_KEYS = ['requestId', 'createdAt', 'mode', 'question', 'answer', 'status', 'errorCode', 'corpusRevision', 'latencyMs'];
const ERROR_CODES = new Set(['invalid_input', 'input_too_large', 'invalid_response', 'unavailable', 'timeout', 'rate_limited', 'budget_exhausted', 'forbidden_origin', 'not_found', 'method_not_allowed', 'unsupported_content_type']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SOURCE_ID = /^[a-zA-Z0-9_-]{1,80}$/;

function invalid() { throw new TypeError('Invalid interaction record'); }
function exact(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key));
}
function text(value, limit, required = true) {
  return typeof value === 'string' && value.length <= limit && (!required || value.trim().length > 0);
}
function iso(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
function ids(value) {
  return Array.isArray(value) && value.length <= 12 && new Set(value).size === value.length
    && value.every(id => typeof id === 'string' && SOURCE_ID.test(id));
}
function publicAnswer(value) {
  if (!exact(value, ['answer', 'evidence', 'matches', 'unknowns']) || !text(value.answer, 3200)
    || !Array.isArray(value.evidence) || value.evidence.length > 12
    || !Array.isArray(value.matches) || value.matches.length > 6
    || !Array.isArray(value.unknowns) || value.unknowns.length > 6
    || !value.unknowns.every(item => text(item, 400))) invalid();
  const evidence = value.evidence.map(source => {
    if (!exact(source, ['id', 'title', 'url']) || typeof source.id !== 'string' || !SOURCE_ID.test(source.id)
      || !text(source.title, 180) || !text(source.url, 500)) invalid();
    let url;
    try { url = new URL(source.url); } catch { invalid(); }
    if (url.origin !== 'https://sarthak0501.github.io' || url.username || url.password || url.search) invalid();
    return { id: source.id, title: source.title, url: source.url };
  });
  const sourceIds = new Set(evidence.map(source => source.id));
  if (sourceIds.size !== evidence.length) invalid();
  const matches = value.matches.map(match => {
    if (!exact(match, ['requirement', 'evidence', 'gap', 'sourceIds'])
      || !text(match.requirement, 240) || !text(match.evidence, 500, false)
      || !text(match.gap, 500, false) || !ids(match.sourceIds)
      || match.sourceIds.some(id => !sourceIds.has(id))) invalid();
    return { requirement: match.requirement, evidence: match.evidence, gap: match.gap, sourceIds: [...match.sourceIds] };
  });
  return { answer: value.answer, evidence, matches, unknowns: [...value.unknowns] };
}

export function normalizeInteraction(entry) {
  if (!exact(entry, ENTRY_KEYS) || typeof entry.requestId !== 'string' || !UUID.test(entry.requestId) || !iso(entry.createdAt)
    || !['question', 'match'].includes(entry.mode) || !text(entry.question, entry.mode === 'match' ? 6000 : 1200)
    || !['answered', 'failed'].includes(entry.status) || !text(entry.corpusRevision, 120)
    || !Number.isSafeInteger(entry.latencyMs) || entry.latencyMs < 0 || entry.latencyMs > 600000) invalid();
  let answerJson = null;
  if (entry.status === 'answered') {
    if (entry.errorCode !== null) invalid();
    const answer = publicAnswer(entry.answer);
    if (entry.mode === 'question' && answer.matches.length) invalid();
    answerJson = JSON.stringify(answer);
    if (new TextEncoder().encode(answerJson).length > 50000) invalid();
  } else if (entry.answer !== null || !ERROR_CODES.has(entry.errorCode)) invalid();
  return {
    requestId: entry.requestId.toLowerCase(), createdAt: entry.createdAt, mode: entry.mode,
    question: entry.question.trim(), answerJson, status: entry.status,
    errorCode: entry.errorCode, corpusRevision: entry.corpusRevision.trim(), latencyMs: entry.latencyMs,
  };
}

function database(env) {
  if (!env?.ASSISTANT_LOG_DB?.prepare) throw new Error('Interaction storage unavailable');
  return env.ASSISTANT_LOG_DB;
}

export async function logInteraction(env, entry) {
  if (env?.LOGGING_ENABLED !== 'true') return { logged: false, reason: 'disabled' };
  const row = normalizeInteraction(entry);
  try {
    const result = await database(env).prepare(`INSERT INTO interactions
      (request_id, created_at, mode, question, answer_json, status, error_code, corpus_revision, latency_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(request_id) DO NOTHING`)
      .bind(row.requestId, row.createdAt, row.mode, row.question, row.answerJson,
        row.status, row.errorCode, row.corpusRevision, row.latencyMs).run();
    if (!result.success) throw new Error();
    return { logged: true, inserted: result.meta.changes === 1 };
  } catch {
    // The database's error details may contain SQL bindings. Never expose them.
    throw new Error('Interaction storage unavailable');
  }
}

export async function pruneBackedUp(env, now = Date.now()) {
  const timestamp = now instanceof Date ? now.getTime() : now;
  if (!Number.isFinite(timestamp) || timestamp < RETENTION_DAYS * DAY_MS) throw new TypeError('Invalid cleanup time');
  const cutoff = new Date(timestamp - RETENTION_DAYS * DAY_MS).toISOString();
  try {
    const result = await database(env).prepare('DELETE FROM interactions WHERE created_at < ? AND backed_up_at IS NOT NULL').bind(cutoff).run();
    if (!result.success) throw new Error();
    return result.meta.changes;
  } catch {
    throw new Error('Interaction cleanup unavailable');
  }
}
