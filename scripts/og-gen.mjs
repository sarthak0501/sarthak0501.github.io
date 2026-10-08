// Per-page social cards (1200 × 630), rendered with the site's own fonts.
// Run `npm run og` locally. PNGs are committed so publication needs no browser.
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import yaml from 'js-yaml';

const facts = yaml.load(readFileSync('src/_data/facts.yaml', 'utf8'));
const name = facts.identity.name;
const role = `${facts.identity.title} · ${facts.identity.org} ${facts.identity.team}`;
const site = new URL(facts.meta.site_url).hostname;
const receipt = (id) => {
  const result = facts.receipts.find((item) => item.id === id);
  if (!result) throw new Error(`Missing canonical receipt: ${id}`);
  return result;
};
const system = (id) => {
  const result = facts.systems.find((item) => item.id === id);
  if (!result) throw new Error(`Missing canonical system: ${id}`);
  return result;
};
const metric = (text, pattern, label) => {
  const result = String(text).match(pattern);
  if (!result) throw new Error(`Missing canonical metric: ${label}`);
  return result[1] ?? result[0];
};
const writing = (url) => {
  const result = facts.writing.find((item) => item.url === url);
  if (!result) throw new Error(`Missing canonical writing entry: ${url}`);
  return result;
};
const microsoft = facts.record.find((item) => item.id === 'record-microsoft');
const microsoftBullets = microsoft.workstreams.flatMap((item) => item.bullets);
const financeReconciliation = microsoftBullets.find((text) => text.includes('variance vs Finance'));
const falsePositives = microsoftBullets.find((text) => text.includes('false positives'));
const productionizingCount = facts.systems.filter((item) => item.status === 'Productionizing'
  && facts.cases.some((itemCase) => itemCase.slug === item.link)).length;

// Metrics come from facts.yaml by ID, with extraction checks for non-receipts.
// A missing fact fails generation instead of retaining an outdated claim.
const PAGES = [
  {
    slug: 'home', kicker: 'Applied AI & data platforms', title: 'AI that works. Where it matters.', sub: role,
    stats: [
      { value: receipt('revenue').value, label: receipt('revenue').label },
      { value: receipt('incident').value, label: 'On-call incident diagnosis' },
      { value: receipt('health').value, label: 'Executive-review preparation' },
    ],
  },
  {
    slug: 'case-index', kicker: 'Selected work', title: 'Behind the work.',
    sub: 'The architecture, decisions, and public evidence behind the systems.',
    stats: [
      { value: String(facts.cases.length), label: 'Public engineering case studies' },
      { value: String(productionizingCount), label: 'Project productionizing with a first consumer' },
    ],
  },
  {
    slug: 'case-incident-agent', kicker: 'AI & agents / Case study', title: 'The incident agent',
    sub: 'Autonomous severity-2 triage with a planner / executor loop.',
    stats: [
      { value: receipt('incident').value, label: 'On-call incident diagnosis' },
      { value: metric(system('SYS-03').proof, /^(\d+) /, 'MCP servers'), label: 'Reusable MCP servers in org use' },
    ],
  },
  {
    slug: 'case-customer-health-agent', kicker: 'AI & agents / Case study', title: 'The customer-health agent',
    sub: 'Plain-English questions become governed live telemetry queries.',
    stats: [
      { value: receipt('health').value, label: 'Executive-review preparation' },
      { value: metric(system('SYS-02').what, /(\d+) metric domains/, 'metric domains'), label: 'Governed metric domains' },
    ],
  },
  {
    slug: 'case-revenue-attribution', kicker: 'Revenue systems / Case study', title: 'The attribution recovery',
    sub: 'A silent upstream failure on a $5B+/yr platform. Recovered and redesigned.',
    stats: [
      { value: receipt('revenue').value, label: 'Partner revenue attribution recovered' },
      { value: metric(receipt('revenue').sub, /(\d+\+) components/, 'pipeline components'), label: 'Pipeline components traced' },
      { value: metric(financeReconciliation, /(<\d+%)/, 'Finance variance'), label: 'Variance vs Finance actuals' },
    ],
  },
  {
    slug: 'case-data-trust', kicker: 'Data platform / Case study', title: 'The data-trust platform',
    sub: 'Quality gates, an org-wide discovery portal, and an LLM lineage engine.',
    stats: [
      { value: metric(system('SYS-05').proof, /^(\d+\+)/, 'datasets'), label: 'Production datasets profiled hourly' },
      { value: metric(system('SYS-05').proof, /(\d+%) silent row loss/, 'row loss'), label: 'Silent row loss caught' },
      { value: receipt('reliability').value, label: 'Throttling incidents eliminated for the most critical customers' },
    ],
  },
  {
    slug: 'case-account2vec', kicker: 'Applied ML / Case study', title: 'Account behavior embeddings',
    sub: 'Autoencoder + FAISS fingerprints for similarity, segmentation, and drift detection.',
    stats: [
      { value: metric(system('SYS-07').proof, /^(millions)/i, 'account scale'), label: 'Storage accounts represented' },
      { value: system('SYS-07').status, label: 'With a first consumer' },
    ],
  },
  {
    slug: 'case-stress-lab', kicker: 'Experimentation / Case study', title: 'The stress lab',
    sub: 'Adaptive simulations and bandit-prioritized tests inform per-build ship / hold calls.',
    stats: [
      { value: metric(system('SYS-08').proof, /^(\d+\+)/, 'incidents prevented'), label: 'Major customer incidents prevented' },
      { value: metric(system('SYS-08').proof, /(\d+%)$/, 'test cost'), label: 'Test-infrastructure cost reduction' },
      { value: metric(falsePositives, /(\d+%)\./, 'false positives'), label: 'False-positive reduction' },
    ],
  },
  { slug: 'resume', kicker: 'Public résumé', title: name, sub: `${role}. Source revision ${facts.meta.resume_rev}.` },
  { slug: 'receipts', kicker: 'Sources & corrections', title: 'Where every number comes from.', sub: 'Public claims, evidence links, and a single source synced to the résumé.' },
  { slug: 'colophon', kicker: 'How this site is built', title: 'A small site. A clear source of truth.', sub: 'Static Eleventy pages, self-hosted type, and a server-side AI portfolio assistant.' },
  { slug: 'writing', kicker: 'Field notes', title: 'Shipping ML and GenAI in enterprise.', sub: 'Lessons from production, written down.' },
  { slug: 'writing-genai', kicker: 'Essay / April 2026', title: writing('/writing/shipping-genai-enterprise.html').title, sub: 'Grounding, evaluation, and the gap between a demo and production.' },
  { slug: 'writing-a2v', kicker: 'Essay / April 2026', title: writing('/writing/account2vec-platform.html').title, sub: 'The feature matrix, drift monitoring, and the systems around the model.' },
];

const fontData = (filename) => readFileSync(resolve('src/fonts', filename)).toString('base64');
const inter = fontData('inter-var.woff2');
const fraunces = fontData('fraunces-var.woff2');
const esc = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

function html(page) {
  const hasStats = Boolean(page.stats?.length);
  const size = page.slug === 'home' ? 84 : page.title.length > 65 ? 58 : page.title.length > 42 ? 64 : hasStats ? 70 : 80;
  const title = page.emphasis && page.title.endsWith(page.emphasis)
    ? `${esc(page.title.slice(0, -page.emphasis.length))}<em>${esc(page.emphasis)}</em>` : esc(page.title);
  const stats = (page.stats || []).map((item) => `<li><b style="font-size:${item.value.length > 12 ? 32 : item.value.length > 8 ? 40 : 48}px">${esc(item.value)}</b><span>${esc(item.label)}</span></li>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
@font-face{font-family:Inter;src:url(data:font/woff2;base64,${inter}) format('woff2');font-weight:400 700}
@font-face{font-family:Fraunces;src:url(data:font/woff2;base64,${fraunces}) format('woff2');font-weight:440 760}
*{box-sizing:border-box}html,body{margin:0;width:1200px;height:630px;background:#ffffff;color:#1d1d1f;font-family:Inter,sans-serif;-webkit-font-smoothing:antialiased}
.card{position:relative;width:1200px;height:630px;padding:44px 64px 38px;display:flex;flex-direction:column;overflow:hidden}
.top{display:flex;align-items:center;justify-content:space-between;min-height:40px}
.brand{font-size:23px;font-weight:650;letter-spacing:-.04em}.brand-dot{color:#3156c8}
.tag{background:#eef2ff;color:#3156c8;font-size:15px;font-weight:600;letter-spacing:.025em;border-radius:40px;padding:10px 16px;display:flex;align-items:center;gap:15px}.tag .arrow{font-size:23px;line-height:1}
.kicker{margin-top:30px;color:#3156c8;font-size:17px;font-weight:550;letter-spacing:.055em;text-transform:uppercase}
.title{font-size:${size}px;font-weight:650;line-height:1.04;letter-spacing:-.065em;margin-top:14px;max-width:1072px;text-wrap:balance}
.title em{font-family:Fraunces,Georgia,serif;font-weight:560;letter-spacing:-.05em;color:#3156c8}
.sub{font-size:25px;line-height:1.42;letter-spacing:-.02em;color:#51515b;margin-top:17px;max-width:1020px}
.stats{display:grid;grid-template-columns:repeat(${page.stats?.length || 1},minmax(0,1fr));gap:30px;list-style:none;padding:23px 0 0;margin:auto 0 0;border-top:1px solid #e2e2e8}
.stats li{min-width:0}.stats b{display:block;font-weight:650;line-height:1.1;letter-spacing:-.055em;color:#3156c8}.stats span{display:block;margin-top:9px;font-size:18px;line-height:1.35;letter-spacing:-.01em;max-width:315px;color:#51515b}
.foot{display:flex;align-items:center;justify-content:space-between;gap:32px;margin-top:auto;padding-top:24px;font-size:17px;color:#656570}.stats+.foot{margin-top:0;padding-top:26px}.foot .site{font-weight:550;color:#3156c8}.foot .line{height:1px;background:#e2e2e8;flex:1}.foot .note{white-space:nowrap}
</style></head><body><main class="card"><div class="top"><div class="brand">${esc(name)}<span class="brand-dot">.</span></div><div class="tag">PUBLIC PORTFOLIO<span class="arrow" aria-hidden="true">↗</span></div></div><div class="kicker">${esc(page.kicker)}</div><div class="title">${title}</div>${page.sub ? `<div class="sub">${esc(page.sub)}</div>` : ''}${stats ? `<ul class="stats">${stats}</ul>` : ''}<div class="foot"><span class="site">${esc(site)}</span><span class="line"></span><span class="note">Work, with the evidence.</span></div></main></body></html>`;
}

mkdirSync('og', { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
try {
  const context = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, colorScheme: 'light' });
  const page = await context.newPage();
  for (const card of PAGES) {
    await page.setContent(html(card));
    await page.evaluate(() => document.fonts.ready);
    const clipped = await page.evaluate(() => [...document.querySelectorAll('.top,.kicker,.title,.sub,.stats,.foot')].some((element) => {
      const rect = element.getBoundingClientRect();
      return rect.bottom > 608 || rect.right > 1137 || rect.left < 63;
    }));
    if (clipped) throw new Error(`OpenGraph content does not fit: ${card.slug}`);
    await page.screenshot({ path: resolve('og', `${card.slug}.png`), animations: 'disabled' });
    console.log(`✓ og/${card.slug}.png`);
  }
  await context.close();
} finally {
  await browser.close();
}
