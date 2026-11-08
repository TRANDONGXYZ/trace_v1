# Cloudflare deployment and maintenance

The public website is **https://trace-whiteboard.pages.dev**. The application uses Cloudflare Pages for static assets, a small Pages Function for `/api/ai/*`, a **private** `trace-ai` Worker, and Workers AI. The Pages Function reaches the Worker through a service binding; there is no public unrestricted Worker inference URL. Visitors need no account or login.

Diagrams retain the existing `trace.whiteboard.v1` localStorage format and 3-second content-only autosave. Counts, dates, time spacing, node layout, graph traversal, progress comparisons and UI state remain JavaScript in the browser. No database, synchronization, tracking or account system is introduced.

## Requirements and configuration

Use Windows 11 with Node.js 22.12+ (the existing `.tools/node-v22.16.0-win-x64` runtime also works). Wrangler is pinned in `package-lock.json`. Use a **Workers Free** account. Do not add a Workers Paid subscription, prepaid AI credits, or paid inference fallback.

The Worker configuration identifies the connected account. Pages does not accept `account_id` in its configuration file: it uses the authenticated account or the developer-only `CLOUDFLARE_ACCOUNT_ID` environment variable. Account IDs are public identifiers, not credentials. If deploying to another account, update the Worker account ID, set that environment variable for Pages, and choose an available project name.

| Setting | Location | Purpose |
| --- | --- | --- |
| `account_id` | `worker/wrangler.jsonc` | Cloudflare account that owns the Worker |
| `CLOUDFLARE_ACCOUNT_ID` | Optional developer shell environment | Selects the Pages account, especially when the login has multiple accounts |
| `name: trace-whiteboard` | Root `wrangler.jsonc` | Pages project and public hostname |
| `TRACE_AI` | Pages `services` binding | Private service connection to `trace-ai` |
| `AI` | Worker `ai` binding | Cloudflare-managed inference credentials |
| `CLIENT_RATE_LIMIT`, `SITE_RATE_LIMIT` | Worker `ratelimits` bindings | Server-side anonymous abuse limits |
| `PAGES_PROJECT_NAME` | Worker `vars` | Allowed production/preview website origins |
| `AI_ENABLED` | Worker `vars` | Set to `false` and redeploy to suspend new AI requests |
| `LOCAL_DEVELOPMENT` | Worker environment | `false` in production; localhost is allowed only in the development environment |
| `VITE_AI_API_BASE` | Optional public build variable | Defaults to same-origin `/api/ai`; no token belongs here |

There are **no application API secrets to configure**: the private AI binding authenticates inside Cloudflare. `wrangler login` stores the developer's OAuth credential in Wrangler's own user configuration. It is never read by the React application or included in `dist/`. Developer login is separate from visitor access. `.env*`, `.dev.vars*`, logs, `.wrangler/`, dependencies and build output are ignored by Git. Never put Cloudflare credentials in a `VITE_*` variable.

Production builds always select the cloud provider. Optional Ollama support is restricted to the explicit local development mode.

## Run locally

From PowerShell in this project:

```powershell
# If using the included portable runtime:
$env:PATH = "$PWD\.tools\node-v22.16.0-win-x64;$env:PATH"
$env:CLOUDFLARE_ACCOUNT_ID = '51878879655da64260dff719142aac04'
npm ci
npx wrangler login
npm run dev
```

`start.cmd` also starts this workflow and opens the browser. The command runs the frontend at `http://127.0.0.1:5173` (or Vite's next free loopback port) and the Worker at port `8787`. Vite proxies `/api/ai` to that Worker. Its AI binding calls the real Cloudflare service, so **local cloud testing consumes the same free AI allowance**. Keep the terminal open and use Ctrl+C to stop both processes.

The processes can also be run separately:

```powershell
npm run dev:worker
# In another terminal:
npm run dev:frontend
```

To continue the former local-only Ollama workflow instead:

```powershell
npm run dev:ollama
```

That development mode keeps the existing local models and caches. It is not the production deployment mode. Public visitors never need Ollama, your laptop, a local model download, or your development server.

## First deployment

The `trace-whiteboard` Pages project and private `trace-ai` Worker have already been created for this account. For a different account, first update both configuration files, update `PAGES_PROJECT_NAME`, sign in, and create the new project once:

```powershell
npx wrangler pages project create trace-whiteboard --production-branch main
```

Then validate and deploy:

```powershell
npm test
npm run build
npm run check:worker
npm run deploy:worker
npm run deploy:pages
```

The Worker deploy uses the top-level **production** configuration. The named `development` environment is only for local testing. Wrangler may print a reminder about selecting an environment; do not deploy with `--env development`. The private Worker has `workers_dev: false` and preview URLs disabled. Static assets are published to Pages; only `/api/ai/*` invokes Functions, so ordinary whiteboard use does not consume Worker requests.

The root `wrangler.jsonc` includes the service binding, so it is shipped with every Pages deployment. Pages requires this standard filename; it does not accept a custom `--config` path. The separate Worker uses `worker/wrangler.jsonc`. The Pages Function overwrites the client-IP header using Cloudflare's connection metadata before forwarding the request. Browser calls remain same-origin; no wildcard CORS or frontend bearer token is needed. Production and Pages preview origins belonging to this project are allowed. A future custom domain would need an explicit server-side origin allowlist update.

Wrangler reports the deployment URL and version. Open the production URL and verify the checks below. No command in this project upgrades an account or adds a paid service.

## Publish later updates

For changes limited to the browser UI or deterministic calculations:

```powershell
npm test
npm run build
npm run deploy:pages
```

For backend, model, schema or shared prompt changes, also deploy the Worker **before** Pages:

```powershell
npm test
npm run check:worker
npm run deploy:worker
npm run build
npm run deploy:pages
```

Changes to model identity, dimensions, prompts or interpretation semantics also require updating the corresponding browser cache version and rerunning the live Vietnamese regression. Do not simply reuse another embedding model's cosine threshold.

## AI behavior and privacy

Only relevant Mistake/Description text and bounded cluster evidence are transmitted for AI. Action/Success/Blocked/Consequence totals and connected paths remain deterministic and are not uploaded for psychological analysis. The complete diagram, node positions, selection, viewport, and all edges remain in browser storage.

The fixed cloud model allowlist is in `shared/ai-models.js`:

- `@cf/qwen/qwen3-embedding-0.6b`: 1024-dimensional multilingual embeddings. It supports 100+ languages. Browser presets preserve Vietnamese/multilingual and English analysis choices while using the **same fixed server model and shared vector cache**; their observed-behavior thresholds are calibrated separately (0.50 and 0.70).
- `@cf/google/gemma-4-26b-a4b-it`: multilingual reasoning with approximately four billion active parameters. Thinking is disabled; profiles are capped at 256 output tokens and cluster explanations at 512. The lighter Qwen3 reasoning alternative was rejected because Cloudflare scheduled it for retirement on November 20, 2026.

Whole-text embeddings alone cannot recognize all shared causes. Source-grounded profiles separately identify the behavioral mechanism and the specific overvalued priority. In cloud mode, matching known cause/priority roles can group different activities without requiring their surface wording to match. Different roles cannot merge. Unknown priorities require much stronger semantic support. Complete-link compatibility still prevents an ambiguous intermediate entry from bridging unrelated groups. Classification remains approximate, and original occurrences remain visible.

“Possible explanations” analyzes recurring Mistake **clusters**, not individual events. Eligible clusters have at least two past/present occurrences and some activity in the recent period. All their relevant historical Mistake/Description text is read. Large clusters are processed through bounded collective evidence batches followed by one shared psychological hypothesis. At least two distinct in-cluster records must support a displayed result. Observed patterns are labeled as model summaries; deeper motivations are conditional hypotheses, never established facts or diagnoses. Invalid citations/output are rejected without discarding other valid clusters.

Vector/profile caches and completed cloud explanations are saved **only in browser localStorage**. Explanation keys are content hashes and are invalidated when evidence changes. Panning, zooming, selecting and highlighting do not cause inference or diagram autosaves. The server sets `no-store`, stores no diagram content, uses no AI Gateway content logging/caching, and does not write prompts or outputs to logs. Cloudflare necessarily processes the submitted text and operational metadata; its [Workers AI data policy](https://developers.cloudflare.com/workers-ai/platform/data-usage/) explains retention, no-training commitments, and exceptions.

### Cancellation

Cancel and closing the popup abort the browser request, stop queued application work, and prevent stale responses from overwriting a newer result. Completed valid cluster results remain available. The Pages Function forwards cancellation to the private Worker; the Worker passes a request/deadline AbortSignal to `AI.run`. `enable_request_signal` is explicitly enabled because this project's compatibility date predates the default activation.

Cloud inference cancellation is **best effort**. An aborted HTTP request does not prove that a provider GPU immediately stopped or that already consumed tokens are refunded. The application does not claim otherwise. Output-token limits and a 60-second backend deadline bound unnecessary work. See [Workers request cancellation](https://developers.cloudflare.com/workers/runtime-apis/request/#properties) and the [AI binding implementation](https://github.com/cloudflare/workerd/blob/main/src/cloudflare/internal/ai-api.ts).

## Free limits and abuse safeguards

Checked against official Cloudflare documentation on **November 8, 2026**:

| Component | Free allowance / constraint |
| --- | --- |
| Workers AI | 10,000 neurons per account per day; resets 00:00 UTC (07:00 Bangkok) |
| Workers / Pages Functions | 100,000 requests per account per day; Workers Free CPU allowance is 10 ms per invocation |
| Pages static assets | Free, unlimited requests when Functions are not invoked |
| Pages builds | 500 per month; one concurrent build on Free |
| This API | 16 KiB actual request-body limit; at most 8 short embedding inputs; at most 4800 bytes of cluster input per request |
| Application limits | Approximately 20 AI requests/minute/IP and 60/minute/location, plus one active request/IP and two per Worker isolate |

Sources: [AI pricing and quota](https://developers.cloudflare.com/workers-ai/platform/pricing/), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [Pages limits](https://developers.cloudflare.com/pages/platform/limits/), [static/Functions pricing](https://developers.cloudflare.com/pages/functions/pricing/), [rate-limit binding semantics](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).

The models have low unit costs, but the free allowance is **shared across visitors and any other Workers AI usage on the account**. New/changed mistakes can require profile and embedding calls; long clusters require several evidence passes. Reopening unchanged analysis normally reuses browser caches. Clearing browser storage or using another browser removes those caches and can increase usage.

There is no promise of unlimited public AI availability at zero cost. Stay on Workers Free: requests fail when the free allowance is exhausted, rather than automatically enabling paid overage. The app reports unavailable AI while preserving the whiteboard, local autosave and recorded progress. Native rate limits are approximate and per Cloudflare location, not strict global limits. Isolate counters are also not global. Without authentication or a centralized coordinator, a distributed attacker can still exhaust the shared allowance. The server-side safeguards reduce accidental bursts and simple abuse; origin checks are not authentication. They do not create paid infrastructure or permanently store IPs/diagrams in application storage.

## Verification

```powershell
npm test                       # deterministic logic, API security, cache/cancel behavior
npm run build
npm run test:browser -- --grep-invert "real "  # existing whiteboard regressions
npm run test:production         # production bundle; includes one real cloud analysis
npm run test:cloud              # real Vietnamese examples + controls and English/Vietnamese paraphrases
```

For `test:cloud`, run `npm run dev:worker` first. To run its live contract checks against the deployed site instead:

```powershell
$env:TRACE_TEST_API = 'https://trace-whiteboard.pages.dev'
$env:TRACE_TEST_ORIGIN = 'https://trace-whiteboard.pages.dev'
npm run test:cloud
```

To run browser checks against the real public URL rather than the local preview:

```powershell
$env:TRACE_TEST_PUBLIC_URL = 'https://trace-whiteboard.pages.dev'
npm run test:production
```

Tests use isolated headless Edge contexts and synthetic data; they do not modify the diagram in your normal browser profile. Live tests consume free AI allowance. Run them sequentially rather than flooding the anonymous rate limit.

Manual production checks:

1. Visit `/api/ai/status`; confirm `provider: cloudflare` and `available: true`.
2. Create nodes with `/n`, connect them, highlight an incoming chain, and delete an edge. Check shapes, dates and both axes.
3. Make a content change, wait three seconds for the checkmark, then reload. Confirm panning/zooming/highlights do not save.
4. Open Mistake overview. Confirm the supplied Vietnamese achievement examples cluster together, inspect the original entries, and request a psychological explanation.
5. Cancel an active explanation or close the popup. Confirm no late result appears. Do not interpret this as proof of immediate GPU release.
6. Confirm developer tools show same-origin `/api/ai/*` requests and no requests to laptop ports or Ollama. Check that no Action/Success text, diagram positions or edges enter AI payloads.
7. Verify backend rejections with the automated tests; do not deliberately consume the whole daily allowance just to test exhaustion.

## Browser-storage limitations

Storage belongs to the browser profile **and website origin**. The new public URL cannot automatically read data saved at `http://127.0.0.1:5173`; the previous data remains at that local address. Different browsers/devices/profiles have separate diagrams. Clearing site storage removes diagrams and analysis caches. There is no cloud backup or cross-device synchronization. Deployment does not rename or delete the existing local storage key.
