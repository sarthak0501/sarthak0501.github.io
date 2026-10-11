# Activate the portfolio assistant

The homepage stays on GitHub Pages. A small Cloudflare Worker calls OpenAI; no credential belongs in the static site, GitHub source, or chat. Until activation, the homepage clearly says AI answers are unavailable and keeps the public sources accessible.

## 1. Prepare your OpenAI project

1. Sign in at <https://platform.openai.com> and create a dedicated project named `Portfolio assistant` under your own account. Use existing API billing if available; any required billing setup or purchase must be completed by you. A ChatGPT subscription does not configure this project's API access.
2. In the project, open **Limits → Spend → Edit spend limit**. Set **$15/month**, enable **Enforce a hard limit** if available, and save. Set a lower amount if preferred. Keep usage notifications enabled. The application also reserves a conservative maximum cost before every request; project enforcement alone can have a short propagation delay.
3. Under the project's **API keys**, create a project key with **Restricted** permissions and write access to `/v1/responses`. The visitor service uses `gpt-6.1-sol` with low reasoning effort and Standard service for concise, grounded public portfolio answers. The Codex implementation settings are separate from this visitor service.
4. Copy the key only into Cloudflare's secret setting or Wrangler's hidden interactive prompt below. Never paste it into chat, a command argument, `facts.yaml`, frontend configuration, or a GitHub issue.

Official guidance: [OpenAI production security](https://developers.openai.com/api/docs/guides/production-best-practices), [spend limits](https://developers.openai.com/api/docs/guides/spend-limits).

## 2. Deploy the server from this checkout

Use an existing Cloudflare account, or create one yourself at <https://dash.cloudflare.com>. The Worker uses SQLite Durable Objects, supported on Workers Free; no custom domain, vector database, paid integration, or Pages migration is required. You handle account creation and any service terms.

From the repository directory in your own terminal:

```sh
npm ci
npx wrangler login
npm run assistant:check
npm run assistant:deploy
```

Wrangler opens a browser for your Cloudflare authorization. The deployment prints a URL shaped like `https://sarthak-portfolio-assistant.YOUR-SUBDOMAIN.workers.dev`. It will remain unavailable until both secrets exist.

Add secrets to **Workers & Pages → sarthak-portfolio-assistant → Settings → Variables and Secrets → Add → Secret**:

| Name | Value you enter privately |
| --- | --- |
| `OPENAI_API_KEY` | The dedicated OpenAI project key |
| `RATE_LIMIT_SALT` | A unique random value of at least 32 characters from your password manager |

Keep **Secret** checked and use **Add 1 variable and deploy** (or **Deploy**) to apply each setting. Alternatively, enter each value into a hidden local prompt:

```sh
npx wrangler secret put OPENAI_API_KEY --config assistant/wrangler.jsonc
npx wrangler secret put RATE_LIMIT_SALT --config assistant/wrangler.jsonc
```

Do not type either value into a shell command or share it with the assistant. You can report only that setup is complete and share the public Worker URL.

Official guidance: [Cloudflare secrets](https://developers.cloudflare.com/workers/configuration/secrets/), [SQLite Durable Objects pricing and Free quotas](https://developers.cloudflare.com/durable-objects/platform/pricing/).

## 3. Verify and enable the homepage

Substitute your public Worker URL, keeping `/api/assistant`:

```sh
npm run assistant:eval -- https://sarthak-portfolio-assistant.YOUR-SUBDOMAIN.workers.dev/api/assistant --output artifacts/assistant-live-eval.json
npm run assistant:configure -- https://sarthak-portfolio-assistant.YOUR-SUBDOMAIN.workers.dev/api/assistant
npm run build
npm run lint:receipts
npm run test:assistant
npm run test:browser
```

The evaluations make real, capped model requests using synthetic public prompts. They check confident evidence-backed advocacy, grounding, unsupported questions, prompt injection, source links and role gaps; review the complete answers and human-review checklist in the saved artifact as well as the automated result. Use a new output filename on each run; the evaluator refuses to overwrite existing files. They deliberately space requests to respect rate limits. `assistant:configure` makes a health request without invoking the model and refuses an unavailable Worker. It writes only the public URL to `src/static/assistant-config.json`.

After passing evaluations and reviewing the answers, commit and push the configuration file to `main` to publish activation. In the Codex chat, say **“API setup is complete; the public Worker URL is …”** and the assistant can finish these checks and publication. No key is needed in chat.

Confirm GitHub's **Build & deploy** workflow succeeded for that exact commit, then test the real homepage on a phone and desktop. A published homepage does not prove the backend works: an actual answer with valid source links is the final check.

## Limits, privacy and maintenance

- Per visitor network: **5 requests/minute**, **50/day**. Global defaults: **100/day**, **1,000/month**, **$5/day** and **$15/month** reserved maximum model cost. Requests reserve counts and worst-case token cost atomically; failed calls also consume the reservation. Daily/monthly boundaries use UTC. The first count or cost limit reached stops further requests. Caps can be lowered in `assistant/wrangler.jsonc`; increases require updating the reviewed ceilings in `assistant/core.mjs` and are an owner decision.
- Cost reservations conservatively use **$2.50 per million input tokens** (covering the Standard cache-write rate) and **$10 per million output tokens**, without assuming cache discounts. [Official model pricing](https://developers.openai.com/api/docs/models/gpt-6.1-sol). Recheck prices when changing providers; update the server's price constants and retain the project's hard limit and alerts.
- Questions are limited to **1,200 characters**, public job descriptions to **6,000**, context to **two prior questions**, and each model response to **3,000 total output tokens, including reasoning**. Visible prose targets 240 words and retains server-side character limits. No automatic paid retries. The browser limits a conversation to eight questions; clear or reload starts a fresh local view, while server quotas remain in force.
- The only approved knowledge input is `src/_data/facts.yaml`. `npm run build` regenerates the allowlisted corpus; the Worker also must be redeployed when those facts change. CI checks the corpus, source links, model output contract, abuse controls, responsive layout and accessibility.
- When `LOGGING_ENABLED=true`, the application saves the submitted question or public job description, normalized answer, timestamp, mode, outcome, corpus revision and duration in a private D1 database. It does not store raw IP addresses, browser identifiers, duplicated prior-question context, provider response metadata or provider diagnostics. Usage counters and temporary hashed rate-limit identifiers remain separate. Cloudflare handles traffic and OpenAI processes sent text; their operational/abuse retention policies still apply. Responses use `store: false`, which does not itself promise zero provider retention. See [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data).
- Origin restrictions help browser isolation; they are not authentication. Server quotas and global spending reservations protect calls even when a non-browser client forges an Origin header. Free hosting quotas can also stop service; the frontend keeps source links available.
- Disable quickly by setting the Worker's `ASSISTANT_ENABLED` variable to `false` and applying the deployment. To remove the frontend connection too, run `npm run assistant:configure -- --disable`, build and publish the changed config. Rotate a compromised key through provider settings, then replace the server secret.
- Browser and contract tests use clearly defined mock responses. They verify UI and transport behavior; they do **not** establish model grounding. `assistant:eval` requires a real configured endpoint and is a separate activation check.

Development dependencies are build/test tools only; the static client and Worker use no runtime package dependencies. Compatible dependency security fixes are applied. Do not use `npm audit fix --force` to downgrade Eleventy or change the framework. Review remaining toolchain advisories separately.

## Private question dashboard and backups

The dashboard is a separate Worker at <https://sarthak-assistant-dashboard.sarthak0501-github-io.workers.dev/>. It uses the same private D1 binding as the assistant; no transcript is copied into the public site or this repository. All dashboard routes, scripts, styles and API responses require Cloudflare Access plus the exact owner identity `sarthaksgsits@gmail.com`. The application checks the trusted `ctx.access` audience and identity; an email header alone cannot grant access. Unconfigured Access fails closed.

### Activation order

1. Create `portfolio-assistant-logs` once and put its database ID in both Worker configs. Apply `npx wrangler d1 migrations apply portfolio-assistant-logs --remote --config assistant/wrangler.jsonc`.
2. Deploy the admin Worker with `npm run assistant:admin:deploy`. Keep both `LOGGING_ENABLED` flags false while preparing access and disclosure.
3. Enable Cloudflare Zero Trust Free in the account (the owner completes any required billing or service agreement). Create an Access application protecting **only** `sarthak-assistant-dashboard`. Protect all Worker URLs and disable preview URLs. Set an Allow policy including only the owner's exact email, use email one-time PIN or an existing trusted identity provider, and do not add an Everyone, email-domain, Bypass or standalone identity-provider allow rule. Keep the public assistant Worker outside Access.
4. Copy that application's audience tag into `ACCESS_AUD` in `assistant/admin.wrangler.jsonc` and redeploy. Verify owner sign-in succeeds, other identities are denied, and unauthenticated or forged-email requests never return data.
5. Publish the updated visitor notice and client before enabling logging. The HTML carries privacy revision `2026-10-10-logging-v1`; the client submits that revision with requests. A logging-enabled backend rejects old/missing notice revisions with 409 before charging or storing content. CSS and JS URLs contain content hashes so new documents use matching assets.
6. Set `LOGGING_ENABLED=true` in both Worker configs and deploy each. Run a synthetic public question, confirm its normalized answer in the private log, run the backup below, and check its backup confirmation. If Access onboarding is pending, logging may start after the notice is published: the database remains private, the admin Worker denies all requests, and the authenticated local sync still works. Do not substitute a public or shared-password dashboard.

Dashboard filters use inclusive dates in **America/Los_Angeles**, including daylight-saving changes. It opens on Today, supports question/answer search and shows 50 records per page. **Export loaded** exports only loaded rows; it is a convenience download and never marks records safely backed up. The sync command is the archival path.

The live dashboard is <https://sarthak-assistant-dashboard.sarthak0501-github-io.workers.dev/>. Sign in as `sarthaksgsits@gmail.com` using the email code or the existing Cloudflare account. Cloudflare Access protects all traffic to this Worker with the exact-email Allow policy; the Worker also verifies the application audience and owner identity before serving any page, asset or data. Keep the Access application audience in the admin config synchronized if the application is ever recreated. The public assistant is outside this Access application.

### Local archival sync

```sh
npm run assistant:logs:sync
```

This uses your existing Wrangler login and saves timestamped archives in `~/Documents/Portfolio Assistant Backups/`, outside Git. Each archive contains the full D1 SQL export, normalized JSON and a SHA-256 manifest. Directories are owner-only and files are owner-readable/writable. A private alternative directory can be specified with `npm run assistant:logs:sync -- --directory /absolute/private/path`.

The command restores the export into local SQLite, checks database integrity, schema and record counts, finalizes files atomically, then verifies them again before acknowledging **only the exact exported record IDs** in the cloud. A new question arriving during a sync remains unacknowledged. If exporting, writing or verification fails, it does not acknowledge any records. If acknowledgement fails, the completed local archive remains intact. No conversation contents are printed. A D1 export may briefly pause database queries, so prefer a quiet moment.

Cloud records are kept for **at least 31 full days**. A daily cleanup can remove an older record only when its local backup has been verified and acknowledged. If the computer is offline or a sync is missed, unbacked cloud records stay in place. Local archives remain until the owner deletes them. This is a backup safeguard, not a claim that a computer's disk cannot fail; include this private folder in the owner's normal encrypted computer backup.

The sync command currently runs on demand. Run it whenever reviewing the dashboard or doing site maintenance. No background local scheduler is installed by this code. To restore or review old records, use an archive's JSON or restore its SQL into a separate local SQLite database; never overwrite the live database as a routine restore test.

Successful responses are returned only after their log record is saved. The bounded generation and final write are registered with Cloudflare's `waitUntil` so closing the tab or pressing Stop does not immediately cancel logging. Accepted provider failures save a safe outcome code and no raw provider error. Validation failures, rate-limited requests and requests from an outdated notice are not saved. If storage is unavailable, the assistant returns a safe retry message rather than silently losing an apparently successful interaction. Nothing sent before logging was enabled can be reconstructed by this feature.
