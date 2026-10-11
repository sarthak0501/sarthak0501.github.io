import { ADMIN_HTML, ADMIN_CSS, ADMIN_JS } from './admin-ui.mjs';

export const TIME_ZONE = 'America/Los_Angeles';
const PAGE_SIZE = 50;
const commonHeaders = {
  'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', 'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  'Vary': 'Cookie',
};
function response(body, status = 200, type = 'application/json; charset=utf-8') {
  return new Response(type.startsWith('application/json') ? JSON.stringify(body) : body,
    { status, headers: { ...commonHeaders, 'Content-Type': type } });
}
export function pacificDate(now = Date.now()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(now)).map(x => [x.type, x.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function validDay(day) {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(Date.parse(day))
    && new Date(day).toISOString().slice(0, 10) === day;
}
export function pacificMidnight(day) {
  if (!validDay(day)) throw new Error('invalid_date');
  const desired = Date.parse(`${day}T00:00:00Z`);
  let guess = desired + 8 * 3600000;
  for (let i = 0; i < 3; i++) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE,
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(guess)).map(x => [x.type, x.value]));
    const actual = Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`);
    guess += desired - actual;
  }
  return new Date(guess).toISOString();
}
export function parseFilters(url, now = Date.now()) {
  if ([...url.searchParams.keys()].some(key => !['from', 'to', 'q', 'cursor'].includes(key))) throw new Error('invalid_filters');
  const from = url.searchParams.get('from') || pacificDate(now);
  const to = url.searchParams.get('to') || from;
  const q = (url.searchParams.get('q') || '').trim();
  const cursor = url.searchParams.get('cursor');
  if (!validDay(from) || !validDay(to) || to < from || Date.parse(to) - Date.parse(from) > 366 * 86400000
    || q.length > 200 || (cursor !== null && (!/^[1-9]\d{0,14}$/.test(cursor) || !Number.isSafeInteger(Number(cursor))))) throw new Error('invalid_filters');
  const nextDay = new Date(Date.parse(to) + 86400000).toISOString().slice(0, 10);
  return { from, to, q, cursor, start: pacificMidnight(from), end: pacificMidnight(nextDay) };
}
export async function listInteractions(db, filters) {
  const args = [filters.start, filters.end];
  let where = 'created_at >= ? AND created_at < ?';
  if (filters.q) {
    // Search decoded text, not JSON escapes, so quotes and backslashes match
    // the answer the owner actually sees.
    where += " AND (question LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM json_tree(answer_json) AS answer_part WHERE answer_part.type = 'text' AND answer_part.value LIKE ? ESCAPE '\\'))";
    const pattern = `%${filters.q.replace(/[\\%_]/g, char => '\\' + char)}%`;
    args.push(pattern, pattern);
  }
  const [summary, backup] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS total, COALESCE(SUM(status = 'answered'), 0) AS answered, COALESCE(SUM(status = 'failed'), 0) AS failed FROM interactions WHERE ${where}`).bind(...args).first(),
    db.prepare('SELECT MAX(backed_up_at) AS lastBackupAt FROM interactions').first(),
  ]);
  const pageArgs = [...args];
  const pageWhere = filters.cursor ? `${where} AND id < ?` : where;
  if (filters.cursor) pageArgs.push(Number(filters.cursor));
  const { results } = await db.prepare(`SELECT id, request_id, created_at, mode, question, answer_json, status, error_code, corpus_revision, latency_ms, backed_up_at FROM interactions WHERE ${pageWhere} ORDER BY id DESC LIMIT ?`).bind(...pageArgs, PAGE_SIZE + 1).all();
  const items = results.slice(0, PAGE_SIZE);
  return { items, nextCursor: results.length > PAGE_SIZE ? String(items.at(-1).id) : null,
    summary, lastBackupAt: backup?.lastBackupAt || null, timeZone: TIME_ZONE, retentionDays: 31 };
}
export async function authorizedOwner(env, ctx) {
  // ctx.access is supplied by Cloudflare after Access authentication. Never
  // trust an email header or a token supplied without signature verification.
  if (!ctx?.access || !env.ACCESS_AUD || env.ACCESS_AUD === 'not-configured'
    || ctx.access.aud !== env.ACCESS_AUD || !env.OWNER_EMAIL) return false;
  try {
    const identity = await ctx.access.getIdentity();
    return typeof identity?.email === 'string' && identity.email.toLowerCase() === env.OWNER_EMAIL.toLowerCase();
  } catch { return false; }
}
export function createAdminHandler() {
  return {
    async fetch(request, env, ctx) {
      const url = new URL(request.url);
      if (url.origin !== env.ADMIN_ORIGIN || !await authorizedOwner(env, ctx)) {
        return response({ error: 'Owner sign-in required.' }, 403);
      }
      if (request.method !== 'GET') return response({ error: 'Method not allowed.' }, 405);
      if (url.pathname === '/') return response(ADMIN_HTML, 200, 'text/html; charset=utf-8');
      if (url.pathname === '/admin.css') return response(ADMIN_CSS, 200, 'text/css; charset=utf-8');
      if (url.pathname === '/admin.js') return response(ADMIN_JS, 200, 'text/javascript; charset=utf-8');
      if (url.pathname !== '/api/interactions') return response({ error: 'Not found.' }, 404);
      let filters;
      try { filters = parseFilters(url); }
      catch { return response({ error: 'Choose valid dates (up to one year) and search text under 200 characters.' }, 400); }
      try {
        const result = await listInteractions(env.ASSISTANT_LOG_DB, filters);
        return response({ ...result, loggingEnabled: env.LOGGING_ENABLED === 'true' });
      } catch { return response({ error: 'The private log is temporarily unavailable. Please retry.' }, 503); }
    }
  };
}
export default createAdminHandler();
