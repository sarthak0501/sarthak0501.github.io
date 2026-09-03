// Per-page preview images (1200×630), rendered from an HTML template with the
// site's own fonts and palette by the Playwright headless shell, so the card
// looks like the page it links to. Run locally (`npm run og`); output is
// committed because CI has no browser.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import yaml from "js-yaml";

const facts = yaml.load(readFileSync("src/_data/facts.yaml", "utf8"));
const SHELL = join(homedir(), "Library/Caches/ms-playwright/chromium_headless_shell-1217/chrome-headless-shell-mac-arm64/chrome-headless-shell");
const FONTS = resolve("src/fonts");
const TMP = resolve(".og-tmp");

const name = facts.identity.name;
const role = `${facts.identity.title} · ${facts.identity.org}, ${facts.identity.team}`;
const r = facts.receipts;

// kicker: small label; title: the big line (may contain <em>); sub: one line; stats: up to 3 {v,d}
const PAGES = [
  { slug: "home", kicker: role, title: facts.summary.statement, stats: [{ value: r[0].value, label: "partner revenue attribution recovered" }, { value: r[2].value, label: "on-call incident diagnosis" }, { value: r[3].value, label: "executive-review prep" }] },
  { slug: "case-index", kicker: "Work", title: "Six systems in production, written up with the architecture.", sub: "Each with users, an on-call rotation, and the number it moved." },
  { slug: "case-incident-agent", kicker: "AI & agents · case study", title: "The incident agent", sub: "Autonomous severity-2 investigation — multi-hour investigations → minutes.", stats: [{ value: "hrs → min", label: "on-call diagnosis" }, { value: "4", label: "reusable MCP servers" }, { value: "100%", label: "of runs traced" }] },
  { slug: "case-customer-health-agent", kicker: "AI & agents · case study", title: "The customer-health agent", sub: "Plain-English questions over live telemetry — days to under two minutes.", stats: [{ value: "days → <2 min", label: "time-to-insight" }, { value: "13", label: "governed metric domains" }, { value: "~180", label: "golden-set eval cases" }] },
  { slug: "case-revenue-attribution", kicker: "Revenue systems · case study", title: "The attribution recovery", sub: "A silent upstream failure on a $5B+/yr platform — traced, recovered, redesigned.", stats: [{ value: "~$45M/mo", label: "recovered and sustained" }, { value: "20+", label: "pipeline components traced" }, { value: "<1%", label: "variance vs Finance" }] },
  { slug: "case-data-trust", kicker: "Data platform · case study", title: "The data-trust platform", sub: "Quality gates, an org-wide portal, and an LLM lineage engine that reads pipeline code.", stats: [{ value: "400+", label: "datasets profiled hourly" }, { value: "~88%", label: "silent row loss caught" }, { value: "99%", label: "throttling incidents eliminated" }] },
  { slug: "case-account2vec", kicker: "Applied ML · case study", title: "Account behavior embeddings", sub: "Every storage account compressed to a vector fingerprint.", stats: [{ value: "millions", label: "of accounts embedded" }, { value: "3 tiers", label: "account · subscription · customer" }, { value: "1st", label: "consumer productionizing" }] },
  { slug: "case-stress-lab", kicker: "Experimentation · case study", title: "The stress lab", sub: "Multi-armed bandits decide what to test next — ship/hold calls per build.", stats: [{ value: "10+", label: "top-severity incidents prevented" }, { value: "−40%", label: "test-infrastructure cost" }, { value: "−60%", label: "false positives" }] },
  { slug: "resume", kicker: "Résumé", title: `${name}`, sub: `${role}. Updated ${facts.meta.resume_rev}.` },
  { slug: "receipts", kicker: "Sources and corrections", title: "Where every number comes from.", sub: "One source file, synced to the résumé; a build check refuses contradictions." },
  { slug: "colophon", kicker: "How this site is built", title: "Eleventy, one source of truth, a build check.", sub: "Self-hosted type, no frameworks, every page works without JavaScript." },
  { slug: "writing", kicker: "Writing", title: "Shipping ML and GenAI inside an enterprise.", sub: "Essays from production." },
  { slug: "writing-genai", kicker: "Essay · April 2026", title: "Shipping GenAI in enterprise: what actually breaks", sub: "Demos lie · grounding is the product · evals before users." },
  { slug: "writing-a2v", kicker: "Essay · April 2026", title: "Why we built account embeddings as a platform, not a model", sub: "The feature matrix, the drift plumbing, and the doc that names the abstraction." },
];

const esc = (s) => String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

function html(p) {
  const stats = (p.stats || []).map((s) => `<li><b>${esc(s.value)}</b><span>${esc(s.label)}</span></li>`).join("");
  const big = p.slug === "home" || p.slug === "resume";
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:'Fraunces';src:url('file://${FONTS}/fraunces-var.woff2') format('woff2');font-weight:440 760}
@font-face{font-family:'Inter';src:url('file://${FONTS}/inter-var.woff2') format('woff2');font-weight:400 700}
html,body{margin:0;width:1200px;height:630px;background:#f7f4ec;color:#1f2a24;font-family:Inter,sans-serif;-webkit-font-smoothing:antialiased}
.card{position:relative;width:1200px;height:630px;padding:64px 72px 44px;box-sizing:border-box;display:flex;flex-direction:column}
.kicker{font-size:24px;font-weight:600;color:#5c665e;letter-spacing:.005em}
.title{font-family:Fraunces,Georgia,serif;font-weight:560;font-size:${big ? 72 : 64}px;line-height:1.06;letter-spacing:-.018em;margin-top:22px;max-width:${p.stats ? 1000 : 960}px;text-wrap:balance}
.sub{font-size:28px;line-height:1.4;color:#4b564f;margin-top:22px;max-width:960px}
.stats{list-style:none;padding:0;margin:auto 0 0;display:flex;gap:56px;border-top:1px solid #ddd8c9;padding-top:26px}
.stats span{max-width:300px}
.stats li{display:flex;flex-direction:column;gap:6px;min-width:0}
.stats b{font-family:Fraunces,Georgia,serif;font-weight:560;font-size:44px;line-height:1;letter-spacing:-.02em}
.stats span{font-size:20px;color:#4b564f}
.foot{margin-top:auto;padding-top:28px;display:flex;justify-content:space-between;align-items:baseline;font-size:22px;color:#5c665e}
.stats+.foot{margin-top:34px}
.foot b{color:#1f2a24;font-family:Fraunces,Georgia,serif;font-weight:600;font-size:24px}
.bar{position:absolute;left:0;top:0;width:1200px;height:8px;background:#23744d}
</style></head><body><div class="card"><div class="bar"></div>
<div class="kicker">${esc(p.kicker)}</div>
<div class="title">${esc(p.title)}</div>
${p.sub ? `<div class="sub">${esc(p.sub)}</div>` : ""}
${stats ? `<ul class="stats" style="${p.stats ? "" : "display:none"}">${stats}</ul>` : ""}
<div class="foot"><b>${esc(name)}</b><span>sarthak0501.github.io</span></div>
</div></body></html>`;
}

mkdirSync("og", { recursive: true });
mkdirSync(TMP, { recursive: true });
for (const page of PAGES) {
  const file = join(TMP, `${page.slug}.html`);
  writeFileSync(file, html(page));
  const out = resolve(`og/${page.slug}.png`);
  execFileSync(SHELL, ["--headless", "--disable-gpu", "--hide-scrollbars", "--window-size=1200,630", "--virtual-time-budget=3000", `--screenshot=${out}`, `file://${file}`], { stdio: "ignore" });
  console.log(`✓ og/${page.slug}.png`);
}
