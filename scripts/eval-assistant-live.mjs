#!/usr/bin/env node
// Real endpoint evaluator. All prompts below are public, synthetic fixtures.
// It never reads provider credentials or prints requests or model responses.
import { readFile, mkdir, writeFile, realpath, lstat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { PRIVACY_REVISION } from "../assistant/core.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const canonicalOrigin = "https://sarthak0501.github.io";
const MIN_DELAY_MS = 15_000;
const MAX_DELAY_MS = 60_000;
const MAX_RESPONSE_BYTES = 64_000;

const help = `Usage: node scripts/eval-assistant-live.mjs [HTTPS_ENDPOINT] [options]

  --endpoint URL       Deployed /api/assistant endpoint; or ASSISTANT_ENDPOINT.
  --output PATH        Save responses and human checklist under artifacts/ only.
  --delay-ms NUMBER    15000–60000ms between calls; or ASSISTANT_EVAL_DELAY_MS.
  --check-fixtures     Validate the nine public fixtures/corpus without AI calls.
  --help               Show this help without AI calls.

Live run: nine real endpoint calls, at least 15 seconds apart. Provider usage may
be billed to the server's configured account. No provider key belongs in this CLI.
The endpoint must already be deployed and activated by the owner.

Deterministic checks: HTTP/schema, citation IDs and exact canonical URLs, known
metric/status wording, unknowns, cited matches/gaps, no fabricated match score.
Human review REQUIRED: semantic grounding, qualifier scope, program attribution,
honest gaps, injection resistance, and absence of unsupported claims.
PASS means automated checks only; it does not certify model answer semantics.
Use --output artifacts/assistant-live-eval.json to review actual answers locally.
This evaluator does not test UI accessibility, responsive layout, or backend
failure handling; run the separate browser and deterministic backend checks.
`;

function optionsFrom(args) {
  const options = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (["--help", "--check-fixtures"].includes(arg)) options[arg.slice(2)] = true;
    else if (["--endpoint", "--output", "--delay-ms"].includes(arg)) {
      if (!args[i + 1] || args[i + 1].startsWith("--")) throw new Error("CLI_ARGUMENT");
      options[arg.slice(2)] = args[++i];
    } else if (!arg.startsWith("-") && !options.endpoint) options.endpoint = arg;
    else throw new Error("CLI_ARGUMENT");
  }
  return options;
}

function endpointURL(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error("ENDPOINT_INVALID"); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/api/assistant") {
    throw new Error("ENDPOINT_INVALID");
  }
  return url;
}

function inside(parent, child) {
  const path = relative(parent, child);
  return path !== "" && path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

// Do not permit output traversal or existing symlinks outside the artifact folder.
async function outputPath(value) {
  const artifacts = resolve(repoRoot, "artifacts");
  const target = resolve(repoRoot, value);
  if (!inside(artifacts, target) || !target.endsWith(".json")) throw new Error("OUTPUT_INVALID");
  try { await lstat(target); throw new Error("OUTPUT_INVALID"); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  let current = repoRoot;
  for (const part of relative(repoRoot, target).split(sep)) {
    current = resolve(current, part);
    try {
      if ((await lstat(current)).isSymbolicLink()) throw new Error("OUTPUT_INVALID");
      if (!inside(await realpath(repoRoot), await realpath(current))) throw new Error("OUTPUT_INVALID");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return target;
}

function corpusMap(knowledge) {
  if (!Array.isArray(knowledge.sources) || knowledge.sources.length === 0) throw new Error("CORPUS_INVALID");
  const sources = new Map();
  for (const source of knowledge.sources) {
    let url;
    try { url = new URL(source.url); } catch { throw new Error("CORPUS_INVALID"); }
    if (!source.id || sources.has(source.id) || url.origin !== canonicalOrigin || url.search || url.username || url.password) throw new Error("CORPUS_INVALID");
    sources.set(source.id, source);
  }
  return sources;
}

function validateFixtures(scenarios, sources) {
  if (!Array.isArray(scenarios) || scenarios.length !== 9 || new Set(scenarios.map((s) => s.id)).size !== 9) throw new Error("FIXTURES_INVALID");
  for (const scenario of scenarios) {
    if (!/^[a-z0-9-]+$/.test(scenario.id) || !["question", "match"].includes(scenario.request?.mode) || !scenario.humanReview) throw new Error("FIXTURES_INVALID");
    if (!Array.isArray(scenario.request.context) || scenario.request.context.length > 2 || !scenario.request.context.every((x) => typeof x === "string")) throw new Error("FIXTURES_INVALID");
    for (const pattern of scenario.requiredPatterns) new RegExp(pattern, "i");
    for (const path of scenario.sourcePaths) {
      if (![...sources.values()].some((s) => new URL(s.url).pathname === path)) throw new Error("FIXTURES_INVALID");
    }
  }
}

function evaluate(response, scenario, sources) {
  const checks = [];
  const check = (id, pass) => checks.push({ id, pass: Boolean(pass) });
  check("response-schema", response && typeof response === "object" && !Array.isArray(response) && typeof response.answer === "string" && response.answer.trim().length > 0 && Array.isArray(response.evidence) && Array.isArray(response.matches) && Array.isArray(response.unknowns) && response.unknowns.every((x) => typeof x === "string"));
  if (!checks[0].pass) return checks;
  check("canonical-citations", response.evidence.every((e) => e && typeof e.id === "string" && typeof e.title === "string" && typeof e.url === "string" && sources.get(e.id)?.title === e.title && sources.get(e.id)?.url === e.url && new URL(e.url).origin === canonicalOrigin));
  check("unique-citation-ids", new Set(response.evidence.map((e) => e?.id)).size === response.evidence.length);
  check("match-schema", response.matches.every((m) => m && typeof m.requirement === "string" && typeof m.evidence === "string" && typeof m.gap === "string" && Array.isArray(m.sourceIds) && m.sourceIds.every((id) => sources.has(id))));
  if (!checks[1].pass || !checks.at(-1).pass) return checks;
  const text = [response.answer, ...response.unknowns, ...response.matches.flatMap((m) => [m?.requirement, m?.evidence, m?.gap])].filter((x) => typeof x === "string").join("\n");
  const inlineIds = [...[response.answer, ...response.matches.map((m) => m.evidence)].join("\n").matchAll(/\[([a-z][a-z0-9-]*)\]/g)].map((match) => match[1]);
  check("canonical-inline-citation-ids", inlineIds.every((id) => sources.has(id) && response.evidence.some((e) => e.id === id)));
  check("no-key-shaped-output", !/\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b/.test(text));
  check("no-unsafe-link-schemes", !/(?:javascript|data|vbscript):/i.test(text));
  const citationLinks = [...text.matchAll(/\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/g)].map((match) => match[1]);
  check("canonical-inline-citation-links", citationLinks.every((url) => [...sources.values()].some((source) => source.url === url)));
  check("no-match-percentage", !/(?:\b(?:match|fit|suitability)\s*(?:score|percentage|rating)?\s*[:=]?\s*\d{1,3}\s*%)|(?:\b\d{1,3}\s*%\s*(?:overall\s*)?(?:match|fit|suitability))/i.test(text));
  for (let i = 0; i < scenario.requiredPatterns.length; i += 1) check(`expected-wording-${i + 1}`, new RegExp(scenario.requiredPatterns[i], "i").test(text));
  if (scenario.sourcePaths.length) check("relevant-citation", response.evidence.some((e) => { try { return scenario.sourcePaths.includes(new URL(e.url).pathname); } catch { return false; } }));
  if (scenario.minimumUnknowns) check("explicit-unknowns", response.unknowns.filter((x) => x.trim()).length >= scenario.minimumUnknowns);
  if (scenario.minimumMatches) check("requirement-comparison", response.matches.length >= scenario.minimumMatches);
  if (scenario.minimumGaps) check("explicit-job-gaps", response.matches.filter((m) => typeof m.gap === "string" && m.gap.trim()).length >= scenario.minimumGaps);
  if (scenario.requireSupportedMatchCitation) check("supported-match-citation", response.matches.some((m) => typeof m.evidence === "string" && m.evidence.trim() && Array.isArray(m.sourceIds) && m.sourceIds.length > 0 && m.sourceIds.every((id) => response.evidence.some((e) => e.id === id))));
  return checks;
}

async function endpointResponse(url, body) {
  const response = await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: canonicalOrigin },
    body: JSON.stringify({ ...body, privacyRevision: PRIVACY_REVISION }), redirect: "error", signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) return { status: response.status, failure: `HTTP_${response.status}` };
  if (!response.headers.get("content-type")?.toLowerCase().includes("application/json")) return { status: response.status, failure: "RESPONSE_NOT_JSON" };
  const reader = response.body?.getReader();
  if (!reader) return { status: response.status, failure: "RESPONSE_EMPTY" };
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_RESPONSE_BYTES) { await reader.cancel(); return { status: response.status, failure: "RESPONSE_TOO_LARGE" }; }
    chunks.push(value);
  }
  try { return { status: response.status, response: JSON.parse(Buffer.concat(chunks).toString("utf8")) }; }
  catch { return { status: response.status, failure: "RESPONSE_INVALID_JSON" }; }
}

async function main() {
  const options = optionsFrom(process.argv.slice(2));
  if (options.help) { console.log(help); return; }
  if (!options["check-fixtures"] && !(options.endpoint || process.env.ASSISTANT_ENDPOINT)) throw new Error("ENDPOINT_MISSING");
  const { default: knowledge } = await import(pathToFileURL(resolve(repoRoot, "assistant/knowledge.generated.mjs")));
  const sources = corpusMap(knowledge);
  const scenarios = JSON.parse(await readFile(resolve(repoRoot, "tests/assistant-eval-scenarios.json"), "utf8"));
  validateFixtures(scenarios, sources);
  if (options["check-fixtures"]) { console.log(`PASS offline fixture validation: ${scenarios.length} public scenarios, ${sources.size} canonical sources; no AI calls.`); return; }
  const endpoint = endpointURL(options.endpoint || process.env.ASSISTANT_ENDPOINT);
  const delayMs = Number(options["delay-ms"] ?? process.env.ASSISTANT_EVAL_DELAY_MS ?? MIN_DELAY_MS);
  if (!Number.isInteger(delayMs) || delayMs < MIN_DELAY_MS || delayMs > MAX_DELAY_MS) throw new Error("DELAY_INVALID");
  const target = options.output ? await outputPath(options.output) : null;
  const results = [];
  const startedAt = new Date().toISOString();
  console.log(`LIVE evaluation: ${scenarios.length} real endpoint calls; ${delayMs}ms minimum spacing. Human semantic review is REQUIRED.`);
  for (let i = 0; i < scenarios.length; i += 1) {
    if (i > 0) await delay(delayMs);
    const scenario = scenarios[i];
    const started = Date.now();
    let outcome;
    try { outcome = await endpointResponse(endpoint, scenario.request); }
    catch { outcome = { status: null, failure: "NETWORK_OR_TIMEOUT" }; }
    const checks = outcome.failure ? [{ id: outcome.failure, pass: false }] : evaluate(outcome.response, scenario, sources);
    const passed = checks.every((c) => c.pass);
    console.log(`${passed ? "PASS" : "FAIL"} ${scenario.id}: ${checks.filter((c) => c.pass).length}/${checks.length} automated checks; ${Date.now() - started}ms; human review pending.`);
    if (!passed) console.log(`  Failed check IDs: ${checks.filter((c) => !c.pass).map((c) => c.id).join(", ")}`);
    results.push({ id: scenario.id, passed, status: outcome.status, checks, humanReview: { status: "pending", checklist: scenario.humanReview }, request: scenario.request, ...(outcome.response ? { response: outcome.response } : { failure: outcome.failure }) });
    // A setup/availability error affects every scenario; avoid seven redundant calls.
    if ([401, 403, 404, 429, 503].includes(outcome.status) || outcome.failure === "NETWORK_OR_TIMEOUT") break;
  }
  const report = { kind: "real-endpoint-evaluation", startedAt, endpointOrigin: endpoint.origin, corpusRevision: knowledge.revision, factsSha256: knowledge.factsSha256, plannedScenarios: scenarios.length, completedScenarios: results.length, automatedPassed: results.filter((r) => r.passed).length, humanSemanticReview: "required-pending", results };
  if (target) {
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    console.log("Saved local JSON report under artifacts/; responses are not printed.");
  } else console.log("Responses were not saved. Use --output artifacts/FILE.json for required human review.");
  const allPassed = results.length === scenarios.length && results.every((r) => r.passed);
  console.log(`${allPassed ? "PASS" : "FAIL"} automated result: ${report.automatedPassed}/${scenarios.length}; semantic review remains pending.`);
  if (!allPassed) process.exitCode = 1;
}

try { await main(); }
catch (error) {
  const messages = {
    ENDPOINT_MISSING: "No configured endpoint. Deploy and activate the Worker with its server-side OPENAI_API_KEY and model settings, then pass its HTTPS /api/assistant URL or set ASSISTANT_ENDPOINT. No AI calls were made.",
    ENDPOINT_INVALID: "Endpoint must be an HTTPS /api/assistant URL without credentials, query, or fragment. No AI calls were made.",
    DELAY_INVALID: "Evaluation spacing must be an integer from 15000 through 60000 milliseconds. No AI calls were made.",
    OUTPUT_INVALID: "Output must be a new .json file inside this repository's artifacts/ directory, without symlinks or traversal. No AI calls were made.",
    CORPUS_INVALID: "Generated knowledge has an invalid canonical source registry. Rebuild knowledge and rerun. No AI calls were made.",
    FIXTURES_INVALID: "Public evaluation fixtures failed validation. No AI calls were made.",
    CLI_ARGUMENT: "Invalid CLI arguments. Run --help. No AI calls were made.",
  };
  console.error(`FAIL ${messages[error.message] || "Evaluator could not complete. Check fixture/corpus files, output permissions, and CLI options. Error details and response contents are not printed."}`);
  process.exitCode = 2;
}
