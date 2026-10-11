import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ADMIN_HTML, ADMIN_CSS, ADMIN_JS } from '../assistant/admin-ui.mjs';

// Isolated test fixture only. The production worker provides its own auth boundary.
let server, browser, origin;
let requests = [];
let api = () => ({ body: result() });
const sampleAnswer = { answer: 'A saved answer with evidence. [profile]', evidence: [{ id: 'profile', title: 'Public résumé', url: 'https://sarthak0501.github.io/resume/' }], matches: [], unknowns: [] };
function row(id = 1, overrides = {}) {
  return { id, request_id: 'request-' + id, created_at: '2026-11-01T08:30:00.000Z', mode: 'question', question: 'How does Sarthak investigate incidents?', answer_json: JSON.stringify(sampleAnswer), status: 'answered', error_code: null, corpus_revision: '2026-10-10', latency_ms: 1240, backed_up_at: null, ...overrides };
}
function result(overrides = {}) {
  return { items: [row()], nextCursor: null, summary: { total: 1, answered: 1, failed: 0 }, timeZone: 'America/Los_Angeles', retentionDays: 31, loggingEnabled: true, lastBackupAt: null, ...overrides };
}
function pacificDay(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date).map(part => [part.type, part.value]));
  return parts.year + '-' + parts.month + '-' + parts.day;
}
function shiftDay(key, offset) {
  const date = new Date(key + 'T12:00:00.000Z');
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}
async function open(options = {}) {
  const context = await browser.newContext({ timezoneId: 'Asia/Kolkata', viewport: { width: 1440, height: 1000 }, ...options });
  const page = await context.newPage();
  await page.goto(origin);
  return { context, page };
}
before(async () => {
  server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/interactions') {
      requests.push(url);
      const reply = await api(url);
      res.writeHead(reply.status || 200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(reply.body));
      return;
    }
    const asset = ({ '/': [ADMIN_HTML, 'text/html'], '/admin.css': [ADMIN_CSS, 'text/css'], '/admin.js': [ADMIN_JS, 'application/javascript'] })[url.pathname];
    if (!asset) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': asset[1], 'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'", 'Cache-Control': 'no-store' });
    res.end(asset[0]);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
});
after(async () => { await browser?.close(); await new Promise(resolve => server?.close(resolve)); });

test('private dashboard assets use external scripts and safe DOM rendering', () => {
  assert.match(ADMIN_HTML, /src="\/admin.js" defer/);
  assert.match(ADMIN_HTML, /href="\/admin.css"/);
  assert.doesNotMatch(ADMIN_HTML, /on(?:click|load|error|submit)=|<script[^>]*>[^<]+/i);
  assert.doesNotMatch(ADMIN_JS, /innerHTML|outerHTML|insertAdjacentHTML|\beval\(|localStorage|sessionStorage/);
});

test('Today is Pacific, counts cover the filter, both DST offsets render, and hostile content stays text', async () => {
  requests = [];
  const hostile = '<img src=x onerror="window.compromised=true">';
  api = () => ({ body: result({ items: [row(2, { question: hostile, answer_json: JSON.stringify({ ...sampleAnswer, answer: '<script>window.compromised=true</script>', evidence: [{ title: 'Unsafe source', url: 'javascript:alert(1)' }] }) }), row(1, { created_at: '2026-11-01T09:30:00.000Z' })], nextCursor: 'next-1', summary: { total: 6, answered: 5, failed: 1 } }) });
  const { context, page } = await open();
  try {
    await expect(page.locator('#count-total')).toHaveText('6');
    assert.equal(requests[0].searchParams.get('from'), pacificDay());
    assert.equal(requests[0].searchParams.get('to'), pacificDay());
    await expect(page.locator('#period-heading')).toHaveText('Today');
    await expect(page.locator('#backup-status')).toHaveText('Retained records have no confirmed local backup.');
    await expect(page.locator('#result-count')).toContainText('2 of 6');
    await expect(page.locator('.entry-meta time').first()).toContainText('1:30:00 AM PDT');
    await expect(page.locator('.entry-meta time').nth(1)).toContainText('1:30:00 AM PST');
    await expect(page.locator('.question-preview').first()).toHaveText(hostile);
    await expect(page.locator('.saved-text').nth(1)).toHaveText('<script>window.compromised=true</script>');
    await expect(page.locator('.evidence-list').first()).toContainText('Unsafe source (link unavailable)');
    await expect(page.locator('#transcripts img, #transcripts script, #transcripts a[href^="javascript:"]')).toHaveCount(0);
    assert.equal(await page.evaluate(() => window.compromised), undefined);
  } finally { await context.close(); }
});

test('date/search filters are explicit, presets use calendar days, and invalid ranges do not fetch', async () => {
  requests = [];
  api = () => ({ body: result() });
  const { context, page } = await open();
  try {
    await expect(page.locator('#count-total')).toHaveText('1');
    await page.locator('#date-from').fill('2026-03-07');
    await page.locator('#date-to').fill('2026-03-09');
    await page.locator('#query').fill('revenue & <test>');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(page.locator('#period-heading')).toHaveText('Selected dates');
    await expect(page.locator('#request-status')).toHaveText('1 request loaded.');
    const request = requests.at(-1);
    assert.deepEqual(Object.fromEntries(request.searchParams), { from: '2026-03-07', to: '2026-03-09', q: 'revenue & <test>' });
    const count = requests.length;
    await page.locator('#date-to').fill('2026-03-01');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(page.locator('#error-message')).toContainText('on or before');
    assert.equal(requests.length, count);
    await page.getByRole('button', { name: 'Yesterday', exact: true }).click();
    await expect(page.locator('#period-heading')).toHaveText('Yesterday');
    await expect(page.locator('#request-status')).toHaveText('1 request loaded.');
    assert.equal(requests.at(-1).searchParams.get('from'), shiftDay(pacificDay(), -1));
    assert.equal(requests.at(-1).searchParams.get('to'), shiftDay(pacificDay(), -1));
  } finally { await context.close(); }
});

test('pagination deduplicates IDs and exports the exact loaded scope without acknowledging backup', async () => {
  requests = [];
  api = url => ({ body: result({ items: url.searchParams.has('cursor') ? [row(2), row(1)] : [row(3), row(2)], nextCursor: url.searchParams.has('cursor') ? null : 'cursor-2', summary: { total: 3, answered: 3, failed: 0 }, lastBackupAt: '2026-11-01T09:45:00.000Z' }) });
  const { context, page } = await open({ acceptDownloads: true });
  try {
    await expect(page.locator('#export')).toHaveText('Export loaded (2)');
    const firstDownload = page.waitForEvent('download');
    await page.locator('#export').click();
    const partial = JSON.parse(await readFile(await (await firstDownload).path(), 'utf8'));
    assert.equal(partial.scope, 'loaded_rows_only');
    assert.equal(partial.loadedCount, 2);
    assert.equal(partial.totalMatching, 3);
    assert.equal(partial.hasMore, true);
    assert.equal(partial.backupAcknowledged, false);
    assert.equal(partial.items.length, 2);
    await page.locator('#load-more').click();
    await expect(page.locator('.transcript')).toHaveCount(3);
    await expect(page.locator('#load-more')).toBeHidden();
    assert.equal(requests.at(-1).searchParams.get('cursor'), 'cursor-2');
    await expect(page.locator('#backup-status')).toHaveText('Latest backup confirmation for retained records: Nov 1, 2026, 1:45:00 AM PST');
    const finalDownload = page.waitForEvent('download');
    await page.locator('#export').click();
    const complete = JSON.parse(await readFile(await (await finalDownload).path(), 'utf8'));
    assert.equal(complete.loadedCount, 3);
    assert.equal(complete.hasMore, false);
    assert.deepEqual(complete.items.map(item => item.id), [3, 2, 1]);
    await expect(page.locator('#request-status')).toContainText('does not confirm a local backup');
    assert.equal(requests.length, 2);
  } finally { await context.close(); }
});

test('failed requests, malformed saved responses, role comparisons and empty filters are explicit', async () => {
  api = url => ({ body: url.searchParams.get('q') === 'no match' ? result({ items: [], summary: { total: 0, answered: 0, failed: 0 } }) : result({ items: [row(3, { status: 'failed', answer_json: null, error_code: 'upstream_timeout' }), row(2, { answer_json: '{broken' }), row(1, { mode: 'match', answer_json: JSON.stringify({ ...sampleAnswer, matches: [{ requirement: 'Data leadership', evidence: 'Led a documented program.', gap: 'Direct-report scope is not established.' }], unknowns: ['Compensation is not public.'] }) })], summary: { total: 3, answered: 2, failed: 1 }, loggingEnabled: false }) });
  const { context, page } = await open();
  try {
    await expect(page.locator('#count-failed')).toHaveText('1');
    await expect(page.locator('#logging-status')).toContainText('Recording is paused');
    await expect(page.locator('.transcript').first()).toContainText('No answer was returned');
    await expect(page.locator('.transcript').first()).toContainText('upstream_timeout');
    await page.locator('#expand-all').click();
    await expect(page.locator('.transcript').nth(1)).toContainText('saved response could not be displayed');
    await expect(page.locator('.match-row')).toContainText('Direct-report scope is not established.');
    await expect(page.locator('.unknown-list')).toContainText('Compensation is not public.');
    await page.locator('#query').fill('no match');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(page.locator('#empty-state')).toBeVisible();
    await expect(page.locator('#empty-state')).toContainText('No requests match this search.');
    await expect(page.locator('#export')).toBeDisabled();
  } finally { await context.close(); }
});

test('authentication and pagination failures allow recovery without discarding loaded records', async () => {
  let authenticated = false, pageAvailable = false;
  api = url => !authenticated ? { status: 403, body: { error: 'forbidden' } } : url.searchParams.has('cursor') && !pageAvailable ? { status: 503, body: {} } : { body: result({ items: [row(url.searchParams.has('cursor') ? 1 : 2)], nextCursor: url.searchParams.has('cursor') ? null : 'next', summary: { total: 2, answered: 2, failed: 0 } }) };
  const { context, page } = await open();
  try {
    await expect(page.locator('#error-message')).toContainText('sign in again');
    await expect(page.locator('#export')).toBeDisabled();
    authenticated = true;
    await page.locator('#retry').click();
    await expect(page.locator('.transcript')).toHaveCount(1);
    await page.locator('#load-more').click();
    await expect(page.locator('#error-message')).toContainText('could not be loaded');
    await expect(page.locator('.transcript')).toHaveCount(1);
    await expect(page.locator('#export')).toBeEnabled();
    pageAvailable = true;
    await page.locator('#retry').click();
    await expect(page.locator('.transcript')).toHaveCount(2);
    await expect(page.locator('#error-state')).toBeHidden();
  } finally { await context.close(); }
});

for (const width of [320, 390, 1440]) {
  test('private dashboard is readable, keyboard-operable and accessible at ' + width + 'px', async () => {
    api = () => ({ body: result({ items: [row(), row(2, { status: 'failed', error_code: 'upstream_failure', answer_json: null })], summary: { total: 2, answered: 1, failed: 1 } }) });
    const { context, page } = await open({ viewport: { width, height: 900 } });
    try {
      await expect(page.locator('#count-total')).toHaveText('2');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('body *')].filter(el => el.getBoundingClientRect().right > innerWidth + 1).map(el => ({tag: el.tagName, id: el.id, className: el.className, right: el.getBoundingClientRect().right})))));
      await page.locator('.transcript summary').nth(1).focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('.transcript').nth(1)).toHaveAttribute('open', '');
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      assert.deepEqual(results.violations, []);
      await page.screenshot({ path: '/tmp/assistant-admin-' + width + '.png', fullPage: true });
    } finally { await context.close(); }
  });
}
