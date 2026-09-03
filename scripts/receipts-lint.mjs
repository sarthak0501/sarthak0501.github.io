// Receipts linter: the site's conceit — claims with receipts — enforced
// at build time. Fails the deploy if built HTML contradicts facts.yaml.
//
// Superseded claims are listed on /receipts/ using numeric HTML entities
// (e.g. 7&#54; tests) so the audit trail can name a forbidden string
// without tripping the rule that forbids it.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";

const facts = yaml.load(readFileSync("src/_data/facts.yaml", "utf8"));

// 1. Claims that must never appear again.
const FORBIDDEN = [
  // superseded by the July 2026 résumé
  /<\s*0\.5%|&lt;\s*0\.5%/, //  old variance claim; résumé says <1%
  /4[- ]orgs?\b/i, //           old Sev2 scope; résumé says 4-team
  /17 PRs/, //                  dropped stat framing
  /REV 0[123]\b/, //            stale revision stamps
  // superseded by the August 2026 résumé (resume_fresh, rev 2026-08-21)
  /\b76 tests\b/, //            count went stale; dropped from the résumé
  /\b47 datasets\b/, //         profiling coverage is now 400+
  /MCP tool servers ×2|two reusable Model Context Protocol/, // now four
  /5\+ downstream consumers/, // corrected DOWN: first consumer, productionizing
  /~?4× (partner )?coverage/, //restated as ~80–90% more partner accounts
  // internal jargon external readers cannot evaluate — the résumé's
  // DESIGN_NOTES translation table, enforced.
  /\bMCC\b/,
  /\bTPIDs?\b/,
  /\bXStore\b/,
  /\bSev[12]\b/,
  /\bIcM\b/,
  /\bMAL\b|MALMinutes/, //        availability-loss minutes, spelled out
  /\bCRI\b/, //                customer-reliability summaries, spelled out
  /xstore/i, //                 internal cluster name, any case
  // the flagship case page once drifted to "two" while facts said four
  /\b(two|2) reusable( MCP)?( tool)? servers\b/i,
];

// 2. Headline claims that must appear on the homepage, verbatim.
const HOMEPAGE_MUST = [
  ...facts.receipts.map((r) => r.value),
  "$5B+/yr",
  "<1% variance",
  "4-team",
  "13 metric domains",
  "400+",
  "hundreds of thousands",
];

// 3. Internal links must resolve to something the build actually emitted.
function* htmlFiles(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* htmlFiles(p);
    else if (name.endsWith(".html")) yield p;
  }
}

const errors = [];
const decode = (s) => s.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");
const files = [...htmlFiles("_site")];

for (const file of files) {
  const html = decode(readFileSync(file, "utf8"));
  for (const pattern of FORBIDDEN) {
    if (pattern.test(html)) errors.push(`${file}: forbidden stale claim ${pattern}`);
  }
}

const home = decode(readFileSync("_site/index.html", "utf8"));
for (const claim of HOMEPAGE_MUST) {
  if (!home.includes(claim)) errors.push(`_site/index.html: missing required claim "${claim}"`);
}

// every /case/ and /resume/ URL facts.yaml points at must exist on disk
const emitted = new Set(
  files.map((f) => "/" + f.replace(/^_site\//, "").replace(/index\.html$/, "")),
);
const internal = [
  ...facts.systems.map((s) => s.link),
  ...facts.cases.map((c) => c.slug),
  ...facts.career_ledger.map((r) => r.ref),
  facts.resume.file,
];
for (const href of internal) {
  const path = href.split("#")[0];
  if (path.endsWith(".pdf")) continue; // passthrough asset, checked below
  if (!emitted.has(path)) errors.push(`facts.yaml: link "${href}" has no emitted page (${path})`);
}
try {
  statSync(join("_site", facts.resume.file));
} catch {
  errors.push(`facts.yaml: résumé PDF missing at _site${facts.resume.file}`);
}

if (errors.length) {
  console.error(`✗ receipts linter: ${errors.length} problem(s)\n` + errors.map((e) => `  - ${e}`).join("\n"));
  process.exit(1);
}
console.log(`✓ receipts linter: ${files.length} pages, all claims consistent with facts.yaml rev ${facts.meta.resume_rev}`);
