// Receipts linter: the site's conceit — claims with receipts — enforced
// at build time. Fails the deploy if built HTML contradicts facts.yaml.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";

const facts = yaml.load(readFileSync("src/_data/facts.yaml", "utf8"));

// 1. Claims that must never appear again (superseded by the July 2026 resume).
const FORBIDDEN = [
  /<\s*0\.5%|&lt;\s*0\.5%/, // old variance claim; resume says <1%
  /4[- ]orgs?\b/i, //          old Sev2 scope; resume says 4-team
  /17 PRs/, //                 dropped stat framing
  /REV 0[123]\b/, //           stale revision stamps
];

// 2. Headline claims that must appear on the homepage, verbatim.
const HOMEPAGE_MUST = [
  ...facts.receipts.map((r) => r.value),
  "<1% variance",
  "4-team",
  "13 metric domains",
  "hundreds of thousands",
];

function* htmlFiles(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* htmlFiles(p);
    else if (name.endsWith(".html")) yield p;
  }
}

const errors = [];
const decode = (s) => s.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");

for (const file of htmlFiles("_site")) {
  const html = decode(readFileSync(file, "utf8"));
  for (const pattern of FORBIDDEN) {
    if (pattern.test(html)) errors.push(`${file}: forbidden stale claim ${pattern}`);
  }
}

const home = decode(readFileSync("_site/index.html", "utf8"));
for (const claim of HOMEPAGE_MUST) {
  if (!home.includes(claim)) errors.push(`_site/index.html: missing required claim "${claim}"`);
}

if (errors.length) {
  console.error(`✗ receipts linter: ${errors.length} problem(s)\n` + errors.map((e) => `  - ${e}`).join("\n"));
  process.exit(1);
}
console.log("✓ receipts linter: all claims consistent with facts.yaml");
