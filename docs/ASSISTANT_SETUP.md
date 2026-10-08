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

- Per visitor network: **5 requests/minute**, **50/day**. Global defaults: **100/day**, **1,000/month**, **$1.50/day** and **$15/month** reserved maximum model cost. Requests reserve counts and worst-case token cost atomically; failed calls also consume the reservation. Daily/monthly boundaries use UTC. The first count or cost limit reached stops further requests. Caps can be lowered in `assistant/wrangler.jsonc`; increases are an owner decision.
- Cost reservations conservatively use **$2.50 per million input tokens** (covering the Standard cache-write rate) and **$10 per million output tokens**, without assuming cache discounts. [Official model pricing](https://developers.openai.com/api/docs/models/gpt-6.1-sol). Recheck prices when changing providers; update the server's price constants and retain the project's hard limit and alerts.
- Questions are limited to **1,200 characters**, public job descriptions to **6,000**, context to **two prior questions**, and each model response to **3,000 total output tokens, including reasoning**. Visible prose targets 240 words and retains server-side character limits. No automatic paid retries. The browser limits a conversation to eight questions; clear or reload starts a fresh local view, while server quotas remain in force.
- The only approved knowledge input is `src/_data/facts.yaml`. `npm run build` regenerates the allowlisted corpus; the Worker also must be redeployed when those facts change. CI checks the corpus, source links, model output contract, abuse controls, responsive layout and accessibility.
- No conversations, raw IP addresses or visitor content are saved by application code. The server retains usage counters and temporary hashed rate-limit identifiers. Cloudflare handles traffic and OpenAI processes sent text; their operational/abuse retention policies still apply. Responses use `store: false`, which does not itself promise zero provider retention. See [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data).
- Origin restrictions help browser isolation; they are not authentication. Server quotas and global spending reservations protect calls even when a non-browser client forges an Origin header. Free hosting quotas can also stop service; the frontend keeps source links available.
- Disable quickly by setting the Worker's `ASSISTANT_ENABLED` variable to `false` and applying the deployment. To remove the frontend connection too, run `npm run assistant:configure -- --disable`, build and publish the changed config. Rotate a compromised key through provider settings, then replace the server secret.
- Browser and contract tests use clearly defined mock responses. They verify UI and transport behavior; they do **not** establish model grounding. `assistant:eval` requires a real configured endpoint and is a separate activation check.

Development dependencies are build/test tools only; the static client and Worker use no runtime package dependencies. Compatible dependency security fixes are applied. Do not use `npm audit fix --force` to downgrade Eleventy or change the framework. Review remaining toolchain advisories separately.
