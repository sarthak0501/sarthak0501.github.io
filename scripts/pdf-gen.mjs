// Tailored résumé PDFs, printed from the built site's /resume/print/*
// pages so they can never drift from facts.yaml. Run locally after
// `npm run build`; the PDFs are committed artifacts (CI has no browser).
// The master PDF stays the canonical Word-authored document.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:http";

const execFileP = promisify(execFile);
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { homedir } from "node:os";

const SITE = "_site";
const JOBS = [
  { url: "/resume/print/ml/", out: "resumes/SeniorDS_ML_AppliedScience.pdf" },
  { url: "/resume/print/lead/", out: "resumes/MLManager_TechnicalLead.pdf" },
];

// Playwright's cached headless shell — newest build wins.
function headlessShell() {
  const cache = join(homedir(), "Library/Caches/ms-playwright");
  const builds = readdirSync(cache)
    .filter((d) => d.startsWith("chromium_headless_shell-"))
    .sort();
  for (const build of builds.reverse()) {
    const bin = join(cache, build, "chrome-headless-shell-mac-arm64/chrome-headless-shell");
    if (existsSync(bin)) return bin;
  }
  throw new Error("no chromium_headless_shell found in ms-playwright cache");
}

const MIME = {
  ".html": "text/html", ".css": "text/css", ".js": "text/javascript",
  ".woff2": "font/woff2", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".pdf": "application/pdf", ".xml": "application/xml",
};

const server = createServer((req, res) => {
  let path = join(SITE, decodeURIComponent(new URL(req.url, "http://x").pathname));
  try {
    if (statSync(path).isDirectory()) path = join(path, "index.html");
    res.setHeader("content-type", MIME[extname(path)] ?? "application/octet-stream");
    res.end(readFileSync(path));
  } catch {
    res.statusCode = 404;
    res.end("not found");
  }
});

await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const { port } = server.address();
const shell = headlessShell();

for (const job of JOBS) {
  // async exec — a sync wait would block the event loop and with it
  // the very server the browser is trying to fetch from
  await execFileP(shell, [
    "--headless",
    "--disable-gpu",
    `--print-to-pdf=${job.out}`,
    "--no-pdf-header-footer",
    "--virtual-time-budget=6000",
    "--timeout=20000", // hard cap: print whatever has rendered
    `http://127.0.0.1:${port}${job.url}`,
  ], { timeout: 60_000 });
  console.log(`✓ ${job.out} ← ${job.url}`);
}

server.close();
