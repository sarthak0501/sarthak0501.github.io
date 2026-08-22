// Per-page OG images (1200×630), rendered from an SVG template via sharp.
// Run locally (`npm run og`) — output is committed, since CI's font set
// differs. Georgia/Courier are deliberate: librsvg only sees system fonts.
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const G = "#23744d"; // green
const P = "#232d27"; // ink text
const P2 = "#4d5850";
const P3 = "#616b5e";
const BG = "#f7f4ec";
const ORANGE = "#a8481f";

// title lines: arrays of {t, g?} runs — g renders italic green.
const PAGES = [
  {
    slug: "home",
    kicker: "SR. DATA & APPLIED SCIENTIST · MICROSOFT",
    lines: [[{ t: "The case for" }], [{ t: "hiring " }, { t: "Sarthak", g: true }, { t: "." }]],
    sub: "9+ yrs production ML/AI · agents · data platforms · $5B+/yr revenue systems",
  },
  {
    slug: "case-index",
    kicker: "THE CASE FILES · 6 EXHIBITS",
    lines: [[{ t: "The work, " }, { t: "architecture", g: true }], [{ t: "attached", g: true }, { t: "." }]],
    sub: "planner design · prompts · run traces · eval output · one failure",
  },
  {
    slug: "case-incident-agent",
    kicker: "EXHIBIT A · AGENTIC · FLAGSHIP",
    lines: [[{ t: "The " }, { t: "incident agent", g: true }, { t: "." }], [{ t: "Sev2 triage, hrs → min." }]],
    sub: "planner/executor on Azure OpenAI · run trace · confidence rubric · evals",
  },
  {
    slug: "case-customer-health-agent",
    kicker: "EXHIBIT B · GENAI",
    lines: [[{ t: "Customer health," }], [{ t: "days → " }, { t: "under 2 minutes", g: true }, { t: "." }]],
    sub: "plain English → governed live queries · 13 metric domains · eval-gated",
  },
  {
    slug: "case-revenue-attribution",
    kicker: "EXHIBIT C · JUDGMENT UNDER FIRE",
    lines: [[{ t: "The pipeline kept" }], [{ t: "producing numbers", g: true }, { t: "." }]],
    sub: "$5B+/yr broke silently · 20+ components · ~$45M/mo recovered",
  },
  {
    slug: "case-data-trust",
    kicker: "EXHIBIT D · DATA PLATFORM",
    lines: [[{ t: "Can I rely on this" }], [{ t: "data right now?", g: true }]],
    sub: "400+ datasets hourly · 88% row loss caught · LLM lineage engine",
  },
  {
    slug: "case-account2vec",
    kicker: "EXHIBIT E · APPLIED ML",
    lines: [[{ t: "One vector", g: true }], [{ t: "per storage account." }]],
    sub: "autoencoder + FAISS · millions of accounts · 3 tiers",
  },
  {
    slug: "case-stress-lab",
    kicker: "EXHIBIT F · EXPERIMENTATION",
    lines: [[{ t: "Bandits decide", g: true }], [{ t: "what we test next." }]],
    sub: "ship/hold per build · 10+ top-severity prevented · test cost −40%",
  },
  {
    slug: "resume",
    kicker: "THE RÉSUMÉ · REV 2026-08-21",
    lines: [[{ t: "One record," }], [{ t: "one document", g: true }, { t: "." }]],
    sub: "rendered from the same source of truth as the site — it can't drift",
  },
  {
    slug: "receipts",
    kicker: "THE RECEIPTS LEDGER",
    lines: [[{ t: "Every claim," }], [{ t: "audited in public", g: true }, { t: "." }]],
    sub: "a linter fails the deploy if the site contradicts the résumé",
  },
  {
    slug: "colophon",
    kicker: "COLOPHON",
    lines: [[{ t: "Built like the systems" }], [{ t: "it describes", g: true }, { t: "." }]],
    sub: "Eleventy · facts.yaml · receipts linter · self-hosted type",
  },
  {
    slug: "writing",
    kicker: "§05 · FIELD NOTES",
    lines: [[{ t: "Notes from production," }], [{ t: "where demos go to die", g: true }, { t: "." }]],
    sub: "shipping GenAI in enterprise · platforms, not models",
  },
  {
    slug: "writing-genai",
    kicker: "FIELD NOTE · APRIL 2026",
    lines: [[{ t: "Shipping GenAI in enterprise:" }], [{ t: "what actually breaks", g: true }, { t: "." }]],
    sub: "demos lie · grounding is the product · evals before users",
  },
  {
    slug: "writing-a2v",
    kicker: "FIELD NOTE · APRIL 2026",
    lines: [[{ t: "A platform, " }, { t: "not a model", g: true }, { t: "." }]],
    sub: "the feature matrix, the drift plumbing, and the doc that names the abstraction",
  },
];

const esc = (s) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

function titleLine(runs, y) {
  const spans = runs
    .map((r) =>
      r.g
        ? `<tspan fill="${G}" font-style="italic">${esc(r.t)}</tspan>`
        : `<tspan>${esc(r.t)}</tspan>`
    )
    .join("");
  return `<text x="84" y="${y}" xml:space="preserve" font-family="Georgia, serif" font-size="66" font-weight="600" letter-spacing="-1" fill="${P}">${spans}</text>`;
}

function svg({ kicker, lines, sub }) {
  const startY = lines.length === 1 ? 330 : 290;
  const title = lines.map((runs, i) => titleLine(runs, startY + i * 84)).join("\n  ");
  return `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="${BG}"/>
  <radialGradient id="glow" cx="0.12" cy="-0.1" r="1.0">
    <stop offset="0" stop-color="${G}" stop-opacity="0.08"/>
    <stop offset="0.6" stop-color="${G}" stop-opacity="0"/>
  </radialGradient>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <rect x="28" y="28" width="1144" height="574" fill="none" stroke="rgba(35,45,39,0.22)" stroke-width="1.5" rx="14"/>
  <line x1="28" y1="96" x2="1172" y2="96" stroke="rgba(35,45,39,0.16)" stroke-width="1.5"/>
  <text x="84" y="70" font-family="'Courier New', monospace" font-size="21" font-weight="700" letter-spacing="3" fill="${P3}">HIRING BRIEF · DOC SB-26 · ED. 3</text>
  <circle cx="1074" cy="62" r="7" fill="${ORANGE}"/>
  <text x="1094" y="70" font-family="'Courier New', monospace" font-size="21" font-weight="700" letter-spacing="2" fill="${ORANGE}" text-anchor="start">OPEN</text>
  <text x="84" y="182" font-family="'Courier New', monospace" font-size="23" font-weight="700" letter-spacing="4" fill="${G}">${esc(kicker)}</text>
  ${title}
  <text x="84" y="${startY + lines.length * 84 + 20}" font-family="'Courier New', monospace" font-size="24" letter-spacing="0.5" fill="${P2}">${esc(sub)}</text>
  <line x1="28" y1="534" x2="1172" y2="534" stroke="rgba(35,45,39,0.16)" stroke-width="1.5"/>
  <text x="84" y="577" font-family="Georgia, serif" font-size="27" font-weight="600" fill="${P}">Sarthak Bichhawa</text>
  <text x="1116" y="577" font-family="'Courier New', monospace" font-size="21" letter-spacing="1.5" fill="${P3}" text-anchor="end">sarthak0501.github.io · evidence attached</text>
</svg>`;
}

mkdirSync("og", { recursive: true });
for (const page of PAGES) {
  const out = `og/${page.slug}.png`;
  await sharp(Buffer.from(svg(page)), { density: 96 }).png().toFile(out);
  console.log(`✓ ${out}`);
}
