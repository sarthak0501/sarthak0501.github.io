/** Private owner dashboard assets. Serve only behind the admin authentication boundary. */
export const ADMIN_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow, noarchive">
  <meta name="color-scheme" content="light">
  <title>Assistant activity · Sarthak Bichhawa</title>
  <link rel="stylesheet" href="/admin.css">
  <script src="/admin.js" defer></script>
</head>
<body>
  <a class="skip-link" href="#activity">Skip to saved requests</a>
  <div class="dashboard">
    <header class="page-head">
      <div><p class="eyebrow"><svg width="15" height="17" viewBox="0 0 18 20" fill="none" aria-hidden="true"><path d="M5 8V5a4 4 0 0 1 8 0v3M3 8h12v10H3V8Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg> Private workspace <span>·</span> Sarthak Bichhawa</p><h1>Assistant activity.</h1><p class="page-intro">The questions people ask, and the answers they receive.</p></div>
      <a class="site-link" href="https://sarthak0501.github.io/" target="_blank" rel="noopener noreferrer">View website <span aria-hidden="true">↗</span><span class="sr-only"> (opens a new tab)</span></a>
    </header>

    <section class="activity-controls" aria-labelledby="period-heading">
      <div class="period-head"><div><p class="eyebrow">Your response log</p><h2 id="period-heading">Today</h2><p id="period-description">Loading Pacific-time dates…</p></div><span class="timezone" id="timezone-label">Pacific time</span></div>
      <form id="filters" class="filter-form">
        <div class="preset-row"><div class="presets" role="group" aria-label="Date shortcuts"><button type="button" data-period="today" aria-pressed="true">Today</button><button type="button" data-period="yesterday" aria-pressed="false">Yesterday</button><button type="button" data-period="week" aria-pressed="false">Last 7 days</button></div><button type="button" id="refresh" class="quiet-button"><span aria-hidden="true">↻</span> Refresh</button></div>
        <div class="filter-fields"><div class="date-field"><label for="date-from">From</label><input type="date" id="date-from" name="from" required></div><div class="date-field"><label for="date-to">Through</label><input type="date" id="date-to" name="to" required></div><div class="search-field"><label for="query">Search questions and answers</label><input type="search" id="query" name="q" maxlength="200" placeholder="Try a project, question, or phrase" autocomplete="off"></div><button type="submit" class="primary-button">Apply filters</button></div>
        <p class="filter-note">Dates include the whole day in America/Los_Angeles. Each saved entry is one request, not a unique person.</p>
      </form>
    </section>

    <section class="metrics" aria-label="Totals for the applied dates and search">
      <div class="metric"><span>Saved requests</span><strong id="count-total">—</strong><small>Across the applied filters</small></div>
      <div class="metric"><span><i class="status-dot status-dot--answered" aria-hidden="true"></i>Answered</span><strong id="count-answered">—</strong><small>Response saved</small></div>
      <div class="metric"><span><i class="status-dot status-dot--failed" aria-hidden="true"></i>Failed</span><strong id="count-failed">—</strong><small>No answer returned</small></div>
    </section>

    <div class="health-strip"><p id="logging-status">Checking recording status…</p><p id="backup-status">Checking backup confirmations for retained records…</p></div>
    <section id="activity" class="activity" aria-labelledby="activity-heading" tabindex="-1">
      <div class="activity-head"><div><h2 id="activity-heading">Questions &amp; answers</h2><p id="result-count">Loading saved requests…</p></div><div class="activity-actions"><button type="button" id="expand-all" class="quiet-button" aria-pressed="false" disabled>Expand answers</button><button type="button" id="export" class="secondary-button" disabled>Export loaded (0)</button></div></div>
      <p id="request-status" class="request-status" role="status" aria-live="polite" aria-atomic="true">Loading saved requests…</p>
      <div class="error-state" id="error-state" hidden><p id="error-message"></p><button type="button" id="retry" class="secondary-button">Try again</button></div>
      <div id="empty-state" class="empty-state" hidden><span class="empty-symbol" aria-hidden="true">↗</span><h3>No saved requests yet.</h3><p id="empty-description">Questions will appear here after someone sends a request to your assistant.</p></div>
      <div id="transcripts" class="transcripts" aria-busy="true"></div>
      <div class="pagination"><button type="button" id="load-more" class="secondary-button" hidden>Load more requests</button></div>
      <p class="export-note" id="export-note">Export downloads only the entries loaded in this view. It does not confirm a local backup.</p>
    </section>
    <footer class="page-foot"><p id="retention-note">Cloud records remain for at least 31 days and until a verified local backup exists. Local archives are retained until you delete them.</p><p>Private review only. Questions, answers, and saved metadata are shown as recorded.</p></footer>
    <noscript><p class="error-state">This private dashboard needs JavaScript to load saved requests.</p></noscript>
  </div>
</body>
</html>`;

export const ADMIN_CSS = String.raw`
:root { color-scheme: light; --bg:#faf9f6; --paper:#fff; --text:#26303a; --muted:#5e6874; --line:#dfe3e8; --blue:#3156b5; --teal:#326c5b; --amber:#8b542b; --tint:#eef2fb; }
* { box-sizing:border-box; } [hidden] { display:none !important; }
body { margin:0; background:var(--bg); color:var(--text); font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; font-size:16px; line-height:1.55; -webkit-font-smoothing:antialiased; }
button,input { font:inherit; } button,a,input,summary { -webkit-tap-highlight-color:transparent; }
button { cursor:pointer; } button:disabled { cursor:default; opacity:.5; } input { min-width:0; }
a { color:var(--blue); text-underline-offset:3px; } a:hover { color:var(--text); }
h1,h2,h3,h4,p { margin:0; } h1,h2,h3,h4 { font-weight:600; line-height:1.2; } h1,h2 { letter-spacing:-.045em; }
button:focus-visible,input:focus-visible,summary:focus-visible,a:focus-visible,[tabindex]:focus-visible { outline:3px solid var(--blue); outline-offset:4px; }
.sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
.skip-link { position:absolute; left:16px; top:16px; transform:translateY(-200%); background:var(--paper); padding:12px 16px; z-index:10; border:1px solid var(--blue); border-radius:8px; } .skip-link:focus { transform:translateY(0); }
.dashboard { max-width:1200px; padding:46px 36px 28px; margin:0 auto; }
.page-head { display:flex; justify-content:space-between; align-items:center; gap:24px; margin-bottom:38px; }
.eyebrow { display:flex; align-items:center; flex-wrap:wrap; gap:8px; font-size:.6875rem; font-weight:500; letter-spacing:.025em; color:var(--muted); }
.eyebrow svg { flex:none; color:var(--blue); } .eyebrow > span { color:#929aa2; }
h1 { font-size:clamp(2.25rem,4vw,3.2rem); margin-top:15px; }
.page-intro { color:var(--muted); font-size:.9375rem; margin-top:12px; }
.site-link { display:inline-flex; gap:10px; align-items:center; flex:none; font-size:.8125rem; min-height:44px; text-decoration:none; }
.activity-controls { padding:28px 30px 22px; border:1px solid #dce3ed; border-radius:22px; background:linear-gradient(125deg,#fff 48%,#f0f4fc); }
.period-head { display:flex; justify-content:space-between; align-items:center; gap:16px; margin-bottom:23px; }
.period-head h2 { font-size:2rem; margin-top:9px; }.period-head > div > p:last-child { font-size:.8125rem; color:var(--muted); margin-top:7px; }
.timezone { flex:none; font-size:.6875rem; padding:7px 10px; border-radius:99px; color:#45607f; background:#e9eff8; }
.preset-row { display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:18px; }
.presets { display:flex; flex-wrap:wrap; gap:4px; }
.presets button { min-height:42px; border:1px solid transparent; border-radius:9px; background:transparent; color:var(--muted); padding:9px 13px; font-size:.8125rem; }
.presets button[aria-pressed="true"] { background:var(--paper); color:var(--blue); border-color:#cfdaed; box-shadow:0 2px 5px #25374d08; }
.presets button:hover { color:var(--blue); background:var(--tint); }
.filter-fields { display:grid; grid-template-columns:minmax(140px,1fr) minmax(140px,1fr) minmax(190px,2fr) auto; gap:14px; align-items:end; }
.filter-fields > div { min-width:0; }
.filter-fields label { display:block; font-size:.6875rem; color:var(--muted); font-weight:500; margin-bottom:7px; }
.filter-fields input { display:block; width:100%; height:44px; background:var(--paper); border:1px solid #ccd5e1; border-radius:9px; padding:10px 12px; color:var(--text); font-size:.8125rem; }
.filter-fields input::placeholder { color:#687481; opacity:1; }
.primary-button,.secondary-button,.quiet-button { min-height:44px; display:inline-flex; justify-content:center; align-items:center; gap:7px; font-size:.75rem; line-height:1.35; border-radius:9px; padding:10px 15px; }
.primary-button { background:var(--blue); border:1px solid var(--blue); color:#fff; font-weight:500; }
.primary-button:hover { background:#254798; }
.secondary-button { background:var(--paper); border:1px solid #cbd4e1; color:var(--blue); }
.secondary-button:hover:not(:disabled) { background:var(--tint); }
.quiet-button { color:var(--muted); background:transparent; border:1px solid transparent; padding:9px 8px; }
.quiet-button:hover:not(:disabled) { color:var(--blue); background:var(--tint); }
.filter-note { font-size:.6875rem; line-height:1.6; color:var(--muted); margin-top:13px; }
.metrics { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); margin-top:22px; border:1px solid var(--line); border-radius:18px; background:var(--paper); }
.metric { padding:24px 28px; }.metric + .metric { border-left:1px solid var(--line); }
.metric > span { display:flex; align-items:center; gap:7px; color:var(--muted); font-size:.75rem; }
.metric strong { display:block; font-size:2.5rem; font-weight:500; letter-spacing:-.05em; line-height:1.2; margin-top:10px; font-variant-numeric:tabular-nums; }
.metric small { display:block; color:var(--muted); font-size:.625rem; margin-top:7px; }
.status-dot { display:block; width:6px; height:6px; border-radius:50%; background:var(--teal); }.status-dot--failed { background:var(--amber); }
.health-strip { display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px 20px; padding:14px 3px 0; color:var(--muted); font-size:.6875rem; }
.health-strip .recording-paused { color:var(--amber); }
.activity { margin-top:42px; scroll-margin-top:22px; }
.activity-head { display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:18px; }
.activity-head h2 { font-size:1.6rem; }.activity-head p { font-size:.75rem; color:var(--muted); margin-top:7px; }
.activity-actions { display:flex; gap:8px; flex-wrap:wrap; }
.request-status { font-size:.75rem; color:var(--muted); margin:0 0 16px; }.request-status:empty { display:none; }
.error-state { padding:18px 20px; border:1px solid #e4cbbc; border-radius:14px; background:#fff6ef; color:#7a462b; font-size:.8125rem; margin-bottom:18px; }
.error-state button { margin-top:12px; }
.empty-state { padding:50px 20px 52px; border:1px dashed #d0d9e3; border-radius:18px; text-align:center; background:#ffffff80; }
.empty-symbol { display:inline-grid; place-items:center; width:42px; height:42px; margin-bottom:16px; border:1px solid #d6e0ef; border-radius:12px; color:var(--blue); background:#edf2fb; font-size:1.25rem; }
.empty-state h3 { font-size:1.125rem; letter-spacing:-.025em; }.empty-state p { color:var(--muted); max-width:52ch; margin:10px auto 0; font-size:.8125rem; }
.transcripts { display:grid; gap:12px; }.transcripts[aria-busy="true"] { min-height:60px; }
.transcript { min-width:0; border:1px solid var(--line); border-radius:16px; background:var(--paper); overflow:hidden; }
.transcript > summary { position:relative; display:block; list-style:none; padding:21px 55px 22px 24px; cursor:pointer; }.transcript > summary::-webkit-details-marker { display:none; }
.transcript > summary::after { content:'+'; position:absolute; top:21px; right:24px; color:var(--muted); font-size:1.25rem; }.transcript[open] > summary::after { content:'−'; }
.transcript > summary:hover { background:#f8fafc; }.transcript > summary:focus-visible { outline-offset:-4px; }
.entry-meta { display:flex; flex-wrap:wrap; align-items:center; gap:8px 11px; font-size:.625rem; color:var(--muted); }.entry-meta time { font-variant-numeric:tabular-nums; }
.status-badge { display:inline-block; font-size:.5625rem; font-weight:600; letter-spacing:.015em; padding:3px 7px; border-radius:5px; background:#edf5f0; color:#32634f; }
.status-badge--failed { background:#fcf0e8; color:#87502c; }
.question-preview { font-size:.9375rem; font-weight:500; line-height:1.6; margin-top:12px; overflow-wrap:anywhere; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; white-space:pre-wrap; }
.transcript[open] .question-preview { -webkit-line-clamp:3; }
.transcript-body { padding:0 24px 23px; border-top:1px solid #edf0f3; }
.transcript-section { margin-top:22px; }.transcript-section h3 { color:var(--muted); font-size:.625rem; font-weight:600; letter-spacing:.025em; margin-bottom:10px; }
.saved-text { font-size:.875rem; line-height:1.8; white-space:pre-wrap; overflow-wrap:anywhere; }
.question-full { padding:14px 16px; border-radius:10px; background:#f3f5f8; color:#46515d; }
.evidence-list { display:flex; flex-wrap:wrap; gap:7px 20px; padding:0; margin:10px 0 0; list-style:none; font-size:.75rem; }.evidence-list a { display:inline-block; padding:5px 0; }
.match-list { display:grid; gap:10px; }.match-row { padding:16px; background:#f6f8fb; border:1px solid #e8edf4; border-radius:10px; }
.match-row h4 { font-size:.8125rem; line-height:1.5; margin-bottom:7px; overflow-wrap:anywhere; }.match-row p { font-size:.8125rem; line-height:1.7; margin-top:7px; overflow-wrap:anywhere; }.match-row strong { font-weight:600; }
.unknown-list { margin:0; padding-left:19px; color:#59636f; font-size:.8125rem; line-height:1.75; overflow-wrap:anywhere; }.unknown-list li + li { margin-top:5px; }
.entry-details { display:flex; flex-wrap:wrap; gap:8px 20px; margin:22px 0 0; padding-top:13px; border-top:1px solid #edf0f3; font-size:.625rem; color:var(--muted); }
.entry-details > div { display:flex; flex-wrap:wrap; gap:4px; min-width:0; }.entry-details dt { font-weight:500; }.entry-details dd { margin:0; overflow-wrap:anywhere; }
.pagination { display:flex; justify-content:center; margin-top:22px; }.export-note { text-align:center; font-size:.625rem; color:var(--muted); margin-top:16px; }
.page-foot { border-top:1px solid var(--line); margin-top:40px; padding-top:20px; color:var(--muted); font-size:.6875rem; line-height:1.8; }.page-foot p + p { margin-top:5px; }
@media(max-width:900px) { .filter-fields { grid-template-columns:repeat(2,minmax(0,1fr)); }.search-field { grid-column:1; }.metric { padding:22px; } }
@media(max-width:600px) { .dashboard { padding:27px 18px 22px; }.page-head { display:block; margin-bottom:26px; }.page-head .site-link { margin-top:10px; }h1 { font-size:2.4rem; }.page-intro { font-size:.875rem; }.activity-controls { padding:23px 18px 19px; border-radius:18px; }.period-head { align-items:flex-start; }.period-head h2 { font-size:1.75rem; }.timezone { font-size:.625rem; padding:6px 8px; }.preset-row { align-items:flex-start; gap:4px; }.presets { gap:1px; }.presets button { padding:8px 9px; font-size:.75rem; }.preset-row .quiet-button { padding:8px 4px; font-size:.6875rem; }.filter-fields { gap:13px 10px; }.search-field { grid-column:1/-1; }.filter-fields .primary-button { grid-column:1/-1; }.filter-fields input { font-size:1rem; padding:9px; }.metrics { margin-top:16px; }.metric { padding:18px 12px; }.metric > span { font-size:.625rem; gap:5px; }.metric strong { font-size:1.95rem; }.metric small { font-size:.5625rem; }.health-strip { display:block; line-height:1.8; }.health-strip p + p { margin-top:4px; }.activity { margin-top:32px; }.activity-head { display:block; }.activity-actions { margin-top:12px; justify-content:space-between; }.activity-head h2 { font-size:1.4rem; }.transcript > summary { padding:17px 39px 18px 16px; }.transcript > summary::after { right:16px; top:17px; }.transcript-body { padding:0 16px 20px; }.entry-meta { gap:6px 8px; }.question-preview { font-size:.875rem; }.question-full { padding:12px; }.saved-text { font-size:.8125rem; }.entry-details { gap:9px 13px; }.entry-details > div:last-child { flex-basis:100%; }.empty-state { padding:35px 16px; } }
@media(max-width:360px) { .dashboard { padding-left:14px; padding-right:14px; }.activity-controls { padding-left:12px; padding-right:12px; }.period-head { flex-wrap:wrap; }.timezone { order:-1; }.period-head > div { width:100%; }.presets button { font-size:.6875rem; padding:8px; }.metric { padding:16px 10px; }.metric > span { font-size:.5625rem; }.metric small { font-size:.5625rem; }.status-dot { width:5px; height:5px; }.activity-actions .quiet-button { font-size:.6875rem; padding-left:0; }.secondary-button { padding:10px 12px; } }
@media(prefers-reduced-motion:reduce) { *,*::before,*::after { scroll-behavior:auto !important; animation:none !important; transition:none !important; } }
@media(forced-colors:active) { .activity-controls,.metrics,.transcript,.primary-button,.secondary-button,.status-badge,.timezone { border:1px solid CanvasText; }.presets button[aria-pressed="true"] { outline:2px solid Highlight; }.status-dot { background:CanvasText; } }
@media print { .page-head .site-link,.filter-form,.activity-actions,.pagination,.error-state,.skip-link { display:none; }.dashboard { padding:0; max-width:none; }.transcript { break-inside:avoid; }.activity-controls,.metrics,.transcript { box-shadow:none; }.question-preview { display:block; }.transcript:not([open]) .transcript-body { display:block; } }
`;

export const ADMIN_JS = String.raw`(() => {
  'use strict';
  const ZONE = 'America/Los_Angeles';
  const PUBLIC_SITE = 'https://sarthak0501.github.io';
  const $ = (id) => document.getElementById(id);
  const elements = {
    form: $('filters'), from: $('date-from'), to: $('date-to'), query: $('query'),
    title: $('period-heading'), description: $('period-description'), zone: $('timezone-label'),
    total: $('count-total'), answered: $('count-answered'), failed: $('count-failed'),
    logging: $('logging-status'), backup: $('backup-status'), retention: $('retention-note'),
    refresh: $('refresh'), retry: $('retry'), error: $('error-state'), errorMessage: $('error-message'),
    status: $('request-status'), empty: $('empty-state'), emptyDescription: $('empty-description'),
    list: $('transcripts'), count: $('result-count'), more: $('load-more'), export: $('export'),
    expand: $('expand-all'), exportNote: $('export-note')
  };
  const presets = [...document.querySelectorAll('[data-period]')];
  const dateParts = new Intl.DateTimeFormat('en-US', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
  const dateLabel = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' });
  const timestampLabel = new Intl.DateTimeFormat('en-US', { timeZone: ZONE, month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', timeZoneName: 'short' });
  const state = { items: [], cursor: null, summary: null, filters: null, controller: null, sequence: 0, busy: false, expanded: false, lastAttemptAppend: false };

  function make(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = String(text);
    return element;
  }
  function calendarKey(date) {
    const parts = Object.fromEntries(dateParts.formatToParts(date).map((part) => [part.type, part.value]));
    return parts.year + '-' + parts.month + '-' + parts.day;
  }
  function offsetDay(key, offset) {
    const date = new Date(key + 'T12:00:00.000Z');
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
  }
  function humanDay(key) { return dateLabel.format(new Date(key + 'T12:00:00.000Z')); }
  function humanTimestamp(value) {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? timestampLabel.format(date) : 'Time unavailable';
  }
  function string(value, fallback = '') { return typeof value === 'string' ? value : fallback; }
  function number(value) { return Number.isSafeInteger(value) && value >= 0 ? value : null; }
  function requestWord(count) { return count === 1 ? 'request' : 'requests'; }
  function displayCount(value) { return number(value) === null ? '—' : value.toLocaleString('en-US'); }
  function appliedFilters() {
    const from = elements.from.value;
    const to = elements.to.value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw new Error('Choose both dates to load your requests.');
    if (from > to) throw new Error('The From date must be on or before the Through date.');
    return { from, to, q: elements.query.value.trim().slice(0, 200) };
  }
  function setPeriod(period) {
    const today = calendarKey(new Date());
    elements.from.value = period === 'today' ? today : offsetDay(today, period === 'yesterday' ? -1 : -6);
    elements.to.value = period === 'yesterday' ? offsetDay(today, -1) : today;
    load(false);
  }
  function renderPeriod() {
    const filters = state.filters;
    const today = calendarKey(new Date());
    const yesterday = offsetDay(today, -1);
    let preset = '';
    if (filters.from === today && filters.to === today) preset = 'today';
    else if (filters.from === yesterday && filters.to === yesterday) preset = 'yesterday';
    else if (filters.from === offsetDay(today, -6) && filters.to === today) preset = 'week';
    presets.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.period === preset)));
    elements.title.textContent = ({ today: 'Today', yesterday: 'Yesterday', week: 'Last 7 days' })[preset] || 'Selected dates';
    elements.description.textContent = humanDay(filters.from) + (filters.from === filters.to ? '' : ' – ' + humanDay(filters.to)) + (filters.q ? ' · Search applied' : '');
    elements.zone.textContent = 'Pacific time';
  }
  function updateControls() {
    elements.list.setAttribute('aria-busy', String(state.busy));
    elements.more.hidden = !state.cursor;
    elements.more.disabled = state.busy;
    elements.more.textContent = state.busy ? 'Loading…' : 'Load more requests';
    elements.refresh.disabled = state.busy;
    elements.retry.disabled = state.busy;
    elements.export.disabled = state.busy || !state.items.length;
    elements.export.textContent = 'Export loaded (' + state.items.length.toLocaleString('en-US') + ')';
    elements.expand.disabled = !state.items.length;
    elements.expand.setAttribute('aria-pressed', String(state.expanded));
    elements.expand.textContent = state.expanded ? 'Collapse answers' : 'Expand answers';
  }
  function renderCounts() {
    const summary = state.summary || {};
    elements.total.textContent = displayCount(summary.total);
    elements.answered.textContent = displayCount(summary.answered);
    elements.failed.textContent = displayCount(summary.failed);
    const total = number(summary.total);
    const count = state.items.length.toLocaleString('en-US');
    elements.count.textContent = state.items.length ? count + (total === null ? '' : ' of ' + total.toLocaleString('en-US')) + ' matching ' + requestWord(total === null ? state.items.length : total) + ' loaded · Newest first' : 'No matching requests loaded';
    elements.exportNote.textContent = 'Export downloads only the ' + count + ' loaded entries for the applied dates and search' + (state.cursor ? '; more matching entries are available' : '') + '. It does not confirm a local backup.';
  }
  function renderOperations(payload) {
    elements.logging.classList.toggle('recording-paused', payload.loggingEnabled === false);
    elements.logging.textContent = payload.loggingEnabled === true ? 'Recording is on' : payload.loggingEnabled === false ? 'Recording is paused. Existing saved requests remain available.' : 'Recording status unavailable';
    elements.backup.textContent = payload.lastBackupAt ? 'Latest backup confirmation for retained records: ' + humanTimestamp(payload.lastBackupAt) : 'Retained records have no confirmed local backup.';
    const days = number(payload.retentionDays) || 31;
    elements.retention.textContent = 'Cloud records remain for at least ' + days + ' days and until a verified local backup exists. Local archives are retained until you delete them.';
  }
  function section(title) {
    const block = make('section', 'transcript-section');
    block.append(make('h3', '', title));
    return block;
  }
  function safeSource(source) {
    if (!source || typeof source.url !== 'string') return null;
    try {
      const url = new URL(source.url, PUBLIC_SITE);
      if (url.origin !== PUBLIC_SITE || url.username || url.password || url.protocol !== 'https:') return null;
      return url.href;
    } catch { return null; }
  }
  function parseAnswer(row) {
    if (typeof row.answer_json !== 'string') return null;
    try {
      const answer = JSON.parse(row.answer_json);
      return answer && typeof answer === 'object' && typeof answer.answer === 'string' ? answer : null;
    } catch { return null; }
  }
  function renderTranscript(row, index) {
    const details = make('details', 'transcript');
    details.dataset.requestId = string(row.request_id, String(row.id));
    details.open = state.expanded || index === 0;
    const summary = make('summary');
    const meta = make('div', 'entry-meta');
    const time = make('time', '', humanTimestamp(row.created_at));
    if (typeof row.created_at === 'string' && Number.isFinite(new Date(row.created_at).getTime())) time.dateTime = row.created_at;
    const answered = row.status === 'answered';
    meta.append(time, make('span', '', row.mode === 'match' ? 'Role comparison' : 'Question'), make('span', 'status-badge' + (answered ? '' : ' status-badge--failed'), answered ? 'Answered' : 'Failed'));
    summary.append(meta, make('p', 'question-preview', string(row.question, 'Question unavailable')));
    details.append(summary);
    const body = make('div', 'transcript-body');
    const prompt = section(row.mode === 'match' ? 'Submitted job description' : 'Question received');
    prompt.append(make('p', 'saved-text question-full', string(row.question, 'Question unavailable')));
    body.append(prompt);
    const response = section(answered ? 'Answer returned' : 'Request outcome');
    const answer = parseAnswer(row);
    if (answered && answer) {
      response.append(make('p', 'saved-text', answer.answer));
      body.append(response);
      if (Array.isArray(answer.matches) && answer.matches.length) {
        const comparisons = section('Role comparison');
        const list = make('div', 'match-list');
        for (const match of answer.matches) {
          if (!match || typeof match !== 'object') continue;
          const item = make('div', 'match-row');
          item.append(make('h4', '', string(match.requirement, 'Requirement')));
          for (const [key, label] of [['evidence', 'Evidence: '], ['gap', 'Gap: ']]) {
            if (!string(match[key])) continue;
            const line = make('p');
            line.append(make('strong', '', label), document.createTextNode(match[key]));
            item.append(line);
          }
          list.append(item);
        }
        comparisons.append(list);
        body.append(comparisons);
      }
      if (Array.isArray(answer.unknowns) && answer.unknowns.length) {
        const unknowns = section('Unknowns recorded in the answer');
        const list = make('ul', 'unknown-list');
        for (const item of answer.unknowns) if (typeof item === 'string') list.append(make('li', '', item));
        unknowns.append(list);
        body.append(unknowns);
      }
      if (Array.isArray(answer.evidence) && answer.evidence.length) {
        const evidence = section('Linked sources');
        const list = make('ul', 'evidence-list');
        for (const source of answer.evidence) {
          if (!source || typeof source !== 'object') continue;
          const item = make('li');
          const label = string(source.title, string(source.id, 'Source'));
          const href = safeSource(source);
          if (href) {
            const link = make('a', '', label + ' ↗');
            link.href = href;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.append(make('span', 'sr-only', ' (opens a new tab)'));
            item.append(link);
          } else item.append(make('span', '', label + ' (link unavailable)'));
          list.append(item);
        }
        evidence.append(list);
        body.append(evidence);
      }
    } else {
      response.append(make('p', 'saved-text', answered ? 'The saved response could not be displayed. The original record is available in the JSON export.' : 'No answer was returned for this request.' + (row.error_code ? ' Recorded error: ' + string(row.error_code) : '')));
      body.append(response);
    }
    const metadata = make('dl', 'entry-details');
    const latency = typeof row.latency_ms === 'number' && Number.isFinite(row.latency_ms) && row.latency_ms >= 0 ? (row.latency_ms / 1000).toFixed(2) + ' s' : 'Unavailable';
    for (const [label, value] of [['Response time', latency], ['Source revision', string(row.corpus_revision, 'Unavailable')], ['Local backup', row.backed_up_at ? 'Verified ' + humanTimestamp(row.backed_up_at) : 'Not yet confirmed'], ['Request ID', string(row.request_id, String(row.id))]]) {
      const pair = make('div');
      pair.append(make('dt', '', label + ':'), make('dd', '', value));
      metadata.append(pair);
    }
    body.append(metadata);
    details.append(body);
    return details;
  }
  function showError(message) {
    elements.error.hidden = false;
    elements.errorMessage.textContent = message;
    elements.status.textContent = message;
  }
  async function load(append) {
    let filters;
    try { filters = append ? state.filters : appliedFilters(); }
    catch (error) { showError(error.message); return; }
    if (append && (!state.cursor || state.busy)) return;
    if (state.controller) state.controller.abort();
    const controller = new AbortController();
    const sequence = ++state.sequence;
    state.controller = controller;
    state.busy = true;
    state.lastAttemptAppend = append;
    elements.error.hidden = true;
    elements.empty.hidden = true;
    if (!append) {
      state.filters = filters;
      state.items = [];
      state.cursor = null;
      state.summary = null;
      state.expanded = false;
      elements.list.replaceChildren();
      renderPeriod();
      renderCounts();
      elements.logging.textContent = 'Checking recording status…';
      elements.backup.textContent = 'Checking backup confirmations for retained records…';
    }
    elements.status.textContent = append ? 'Loading more saved requests…' : 'Loading saved requests…';
    updateControls();
    const query = new URLSearchParams(filters);
    if (append) query.set('cursor', state.cursor);
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch('/api/interactions?' + query, { credentials: 'same-origin', cache: 'no-store', signal: controller.signal, headers: { Accept: 'application/json' } });
      if (response.status === 401 || response.status === 403) throw new Error('Your private session needs attention. Reload this page to sign in again.');
      if (!response.ok) throw new Error('The saved requests could not be loaded. Please try again.');
      if (!(response.headers.get('content-type') || '').includes('application/json')) throw new Error('The server did not return activity data. Reload this page to check your private sign-in.');
      const payload = await response.json();
      if (sequence !== state.sequence) return;
      if (!payload || !Array.isArray(payload.items) || !payload.items.every((row) => row && typeof row === 'object')) throw new Error('The server returned an unreadable activity record. Please try again.');
      const keys = new Set(state.items.map((row) => row.id));
      const fragment = document.createDocumentFragment();
      for (const row of payload.items) {
        if (keys.has(row.id)) continue;
        keys.add(row.id);
        const index = state.items.length;
        state.items.push(row);
        fragment.append(renderTranscript(row, index));
      }
      elements.list.append(fragment);
      state.cursor = typeof payload.nextCursor === 'string' && payload.nextCursor ? payload.nextCursor : null;
      state.summary = payload.summary && typeof payload.summary === 'object' ? payload.summary : null;
      renderCounts();
      renderOperations(payload);
      elements.empty.hidden = state.items.length > 0;
      elements.empty.querySelector('h3').textContent = filters.q ? 'No requests match this search.' : 'No saved requests in this period.';
      elements.emptyDescription.textContent = filters.q ? 'Try a different phrase or a wider date range.' : 'Choose an earlier date, or return after someone sends a request to your assistant.';
      elements.status.textContent = state.items.length.toLocaleString('en-US') + ' ' + requestWord(state.items.length) + ' loaded.' + (state.cursor ? ' More results are available below.' : '');
    } catch (error) {
      if (sequence !== state.sequence) return;
      showError(error.name === 'AbortError' ? 'Loading took too long. Please try again.' : error.message || 'The saved requests could not be loaded. Please try again.');
      if (!append) {
        elements.logging.textContent = 'Recording status unavailable';
        elements.backup.textContent = 'Backup confirmations for retained records are unavailable';
      }
    } finally {
      clearTimeout(timer);
      if (sequence === state.sequence) {
        state.busy = false;
        state.controller = null;
        updateControls();
      }
    }
  }
  function exportLoaded() {
    if (state.busy || !state.items.length) return;
    const exportData = {
      format: 'portfolio-assistant-owner-export-v1', exportedAt: new Date().toISOString(), timeZone: ZONE,
      scope: 'loaded_rows_only', filters: { ...state.filters }, loadedCount: state.items.length,
      totalMatching: number(state.summary && state.summary.total), hasMore: Boolean(state.cursor),
      backupAcknowledged: false, items: state.items
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2) + '\n'], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = make('a');
    link.href = url;
    link.download = 'assistant-requests-' + state.filters.from + '-to-' + state.filters.to + '-loaded-' + state.items.length + '.json';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    elements.status.textContent = 'Downloaded ' + state.items.length + ' loaded ' + requestWord(state.items.length) + '. This export does not confirm a local backup.';
  }
  elements.form.addEventListener('submit', (event) => { event.preventDefault(); load(false); });
  presets.forEach((button) => button.addEventListener('click', () => setPeriod(button.dataset.period)));
  elements.refresh.addEventListener('click', () => load(false));
  elements.retry.addEventListener('click', () => load(state.lastAttemptAppend));
  elements.more.addEventListener('click', () => load(true));
  elements.export.addEventListener('click', exportLoaded);
  elements.expand.addEventListener('click', () => {
    state.expanded = !state.expanded;
    elements.list.querySelectorAll('details').forEach((details) => { details.open = state.expanded; });
    updateControls();
  });
  setPeriod('today');
})();`;
