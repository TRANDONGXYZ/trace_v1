# Deploy and maintain the existing trace Worker

Production URL: **https://trace.trandongxzy.workers.dev/**

The existing **trace** Cloudflare Worker serves the React build as Workers Static Assets and handles `/api/ai/*` using its own Workers AI binding. No new Worker, Pages project, domain, database, or visitor account is required. The diagram remains in browser localStorage with the existing `trace.whiteboard.v1` key and 3-second content-only autosave. Keeping the original origin preserves access to diagrams already saved there.

## Confirmed cause of the November 8 deployment failure

The complete supplied build log shows `npm run build` succeeded, producing `dist/index.html` and bundled assets. Then the existing GitHub integration ran `npx wrangler deploy`. The root configuration had been changed to a **Pages** configuration (`pages_build_output_dir`) without a Worker entry point or Workers assets directory. Wrangler warned about deploying a Pages project and failed with **Missing entry-point to Worker script or to assets directory**. This exact error was also reproduced locally with a dry run before making changes. The React Flow `use client` warning did not fail the build.

The corrected root `wrangler.jsonc` uses `name: trace`, `main: ./worker/site.js`, and `assets.directory: ./dist`, so the existing build and deploy commands remain valid. It includes the AI binding and server-side rate limits, removing the need to deploy a separate backend first.

The previous `trace-whiteboard.pages.dev` deployment followed the originally requested Pages + Worker stack, but it was unnecessary for the pre-existing Workers website. Its deployment commands and Pages Function have been removed from this source. The old Pages project and private `trace-ai` Worker are not needed or called by `trace`. They have been left untouched rather than deleted; this fix creates no additional projects or URLs.

## Existing GitHub integration

Use **Workers & Pages → trace → Settings → Build**. Keep the existing GitHub connection; do not import another project.

| Setting | Required value |
| --- | --- |
| Repository | `TRANDONGXYZ/trace_v1` (matches this checkout's Git remote) |
| Production branch | `main` (this checkout's tracked branch) |
| Root directory | Repository root, `/` (or empty if the dashboard uses empty for root) |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` (or equivalent `npm run deploy`) |
| Wrangler configuration | Root `wrangler.jsonc`, Worker name **trace** |
| Asset output | `dist`, specified by `assets.directory`; Workers has no separate Pages output-directory field |
| Dependency installation | Automatic `npm ci` using committed `package-lock.json` |

The supplied remote log verifies cloning, dependency installation and the exact successful build / failed deploy commands above. The current Wrangler OAuth login can inspect and deploy the Worker but receives HTTP 403 from the Workers Builds settings/log API, which needs **Workers CI Read/Write**. Repository/branch/root dashboard values therefore cannot be independently read or changed with that login. Repository and branch above are verified against local Git metadata, not claimed as a read of the dashboard.

Push the corrected source to the connected production branch to make future GitHub builds use it. A manual CLI deployment updates the live Worker but does not push the checkout or fix an older commit still on GitHub. Retrying the old failed commit will not include local fixes.

Do not change `name` to the npm package name (`trace-whiteboard`): the Cloudflare resource must remain `trace`. Do not use `wrangler pages deploy`, `--assets ./public`, or the local-only `worker/wrangler.jsonc` for production. Do not use a preview/versions command as the production deploy command. Deployment preview URLs are disabled.

## Bindings, environment and credentials

Production configuration is in root `wrangler.jsonc`:

| Setting | Purpose |
| --- | --- |
| `name: trace`, `workers_dev: true` | Update the existing Worker and preserve its original workers.dev URL |
| `account_id` | Existing Cloudflare account; public identifier, not a secret |
| `main: ./worker/site.js` | Website/API entry point |
| `ASSETS` | Built files in `dist`; SPA fallback for website paths |
| `run_worker_first: ["/api", "/api/*"]` | API requests always reach the Worker, including navigations; unknown APIs return JSON 404 rather than HTML |
| `AI` | Direct Workers AI binding; no browser token or separate service binding |
| `CLIENT_RATE_LIMIT`, `SITE_RATE_LIMIT` | Native anonymous request rate limits |
| `SITE_ORIGIN` | Exact allowed origin, `https://trace.trandongxzy.workers.dev` |
| `AI_ENABLED: "true"` | Set to `"false"` and redeploy to pause inference |
| `LOCAL_DEVELOPMENT: "false"` | Production rejects localhost and unrelated website origins |
| `enable_request_signal` | Forward canceled requests to AI as effectively as the platform supports |
| `observability.enabled: false`, `send_metrics: false` | Disable application content logging and Wrangler usage telemetry |

No **runtime application secrets** are required. Cloudflare authenticates the AI binding internally. CLI deployment uses `npx wrangler login`; the existing GitHub build integration uses its deployment credential. That credential needs permission to update the existing Worker and its AI binding. Never put credentials into the repository or any `VITE_*` variable.

The frontend defaults to same-origin `/api/ai`. No build variable is necessary; `.env.example` documents optional **public** `VITE_AI_API_BASE`. Remove any stale dashboard override pointing it to Pages, a separate backend, or localhost. Production builds always choose cloud inference.

`public/_headers` applies CSP and other security headers to static assets. API responses set `no-store` and `nosniff` themselves. POST AI calls require the exact allowed Origin. `worker/site.js` replaces any incoming client-identity header with Cloudflare's `cf-connecting-ip` before rate limiting. Origin checks reduce accidental misuse but are not authentication: non-browser clients can forge Origin.

## Windows development

Use Node.js 22.12+ or the included portable runtime:

```powershell
$env:PATH = "$PWD\.tools\node-v22.16.0-win-x64;$env:PATH"
npm ci
npx wrangler login
npm run dev
```

`start.cmd` starts the frontend and attempts the optional local AI service, then opens the browser. Vite uses `http://127.0.0.1:5173` or the next free loopback port. The local API runs at port 8787 using `worker/wrangler.jsonc`, which intentionally has no assets requirement and allows loopback origins. It imports the same `worker/site.js` and AI implementation as production. Its remote AI binding consumes the same account's free AI allowance. Ctrl+C stops the owned development processes.

To run separately: `npm run dev:worker` and `npm run dev:frontend` in two terminals. Optional former local-only inference remains available with `npm run dev:ollama`. Public visitors never require Ollama or your laptop.

### Windows blocks `workerd.exe` / `spawn UNKNOWN`

On November 13, the Wrangler log traced `spawn UNKNOWN` to Miniflare starting its ProxyWorker runtime. Windows Code Integrity events 3077/3033 identified `node_modules/@cloudflare/workerd-windows-64/bin/workerd.exe`; the installed file was unsigned, while the portable Node executable had a valid signature. Smart App Control was enforcing its policy. This is a native-runtime startup failure, not a Reaction Time calculation failure. [Microsoft explains the signing/reputation checks](https://support.microsoft.com/en-us/windows/security/threat-malware-protection/smart-app-control-frequently-asked-questions).

The launcher now checks active Smart App Control and recent enforced-block records against the exact installed runtime's SHA-256 flat hash. A matching block skips Wrangler without launching the blocked file. The inspection is read-only; it does not disable protection, unblock files or add exclusions. Unknown/unreadable diagnostics fall back to normal startup, but any Worker failure leaves Vite running. Frontend failure and Ctrl+C still stop owned processes.

The launcher conservatively avoids an already blocked binary while the policy remains active. If Windows later trusts it, run `npm run dev:worker` separately; a changed runtime hash is evaluated afresh. Local cloud AI is unavailable while Windows blocks the helper; use the existing `npm run dev:ollama` mode for Ollama analysis. Production still runs on Cloudflare and uses the original configuration/URL.

Verification: 142 unit/security tests plus a headless Edge check against the corrected launcher under the active Windows policy (creation/connections, reaction analysis, unavailable-AI handling, autosave/reload). The reusable smoke test blocks inference requests. To repeat: start `npm run dev -- --port 5197 --strictPort`, then `npm run test:startup` in another terminal. `TRACE_STARTUP_TEST_URL` can select another local test address. Earlier browser suites used Ollama-mode Vite; Wrangler's deploy dry run packages code without exercising the blocked native runtime.

## Deploy or publish updates

For direct deployment to the **existing** Worker:

```powershell
npm test
npm run build
npm run check:worker
npm run deploy
```

`check:worker` is a dry run. `deploy` and the retained `deploy:worker` alias both run root `wrangler deploy`. They update the website, backend and bindings together. No project creation command is needed. For GitHub deployment, push these source/configuration files to the connected production branch and keep the dashboard commands above. Build output and dependencies stay ignored by Git.

Check the log ends with deployment of **trace**, then open the original URL. For rollback, use that Worker's existing version/deployment history. Changes to models, prompts or interpretation semantics also require appropriate browser cache version updates and rerunning the semantic regression.

## Verification

The November 14 Achievement Path Analysis update is **local only; this task did not deploy it**. It passed 167 unit/security tests, 102 whiteboard browser tests, 5 production-bundle tests with mocked AI, production build and Wrangler dry run. Build retains a non-blocking 500 kB chunk-size warning. The feature derives upstream Action counts, complete ancestor graphs and all-route highlights in the browser without new API calls, persistence fields, dependencies or configuration. Its independent analytical viewport/layout never changes saved whiteboard positions. Existing chain, reaction, backup, history, theme and analytics regressions pass. Backup performance samples and limits remain in [Backup schema](docs/backup-schema.md). Worker name/URL, bindings and AI logic are unchanged. The November 8 entry below is the earlier recorded CLI deployment, not verification of the current live site's revision.

Verified on November 8, 2026: production build and Wrangler dry run succeeded; **93 unit/security tests, 42 whiteboard browser regressions, and all 8 public production checks passed**. The public checks ran against the original `trace.trandongxzy.workers.dev` URL and included real Vietnamese inference, cancellation and API guards. Deployed Worker version: `36dd2e85-6c36-43fe-b8bd-7a29e625baca`. Local API startup and loopback validation also passed. This was a direct CLI deployment, not a claim that a new GitHub build has already run.

```powershell
npm test
npm run build
npm run check:worker
npm run test:browser -- --grep-invert "real "
$env:TRACE_TEST_PUBLIC_URL = 'https://trace.trandongxzy.workers.dev'
npm run test:production
```

The public suite checks real cloud clustering/explanations, HTTP cancellation, autosave/restore, error handling, security headers, absence of tracking/laptop calls, invalid bodies/origins and API routing. Tests use isolated Edge contexts and synthetic data; they do not alter your normal browser's saved diagram. Live tests consume free AI allowance. Run sequentially rather than flooding rate limits.

Additional live semantic checks against production:

```powershell
$env:TRACE_TEST_API = 'https://trace.trandongxzy.workers.dev'
$env:TRACE_TEST_ORIGIN = 'https://trace.trandongxzy.workers.dev'
npm run test:cloud
```

Manual checks: create nodes using `/n`, check dates/axes, connect nodes, highlight an incoming chain, and delete an edge. Wait three seconds for the saved checkmark and reload. Verify panning/zooming/selection do not save. Check `/api/ai/status` returns `provider: cloudflare`, `available: true`. Analyze the Vietnamese achievement examples, cancel or close an active explanation, and confirm no late result appears.

## AI privacy and cancellation

This fix changes hosting/routing, not semantic models or analysis logic. Fixed models remain `@cf/qwen/qwen3-embedding-0.6b` for multilingual embeddings and `@cf/google/gemma-4-26b-a4b-it` for source-grounded behavioral profiles and conditional cluster hypotheses. JavaScript still handles counts, dates, node placement, two-month comparisons and graph traversal. Only relevant Mistake/Description text and bounded source references go to inference. The full diagram, positions, edges and other node types remain in browser storage; caches avoid reanalysis of unchanged content.

Interpretations remain hypotheses, not facts or diagnoses, and require at least two distinct cited mistakes in the relevant cluster. Invalid output does not invent evidence or overwrite valid results. No backend diagram storage or AI Gateway content logging is used. Cloudflare processes submitted text and operational metadata under its [Workers AI data policy](https://developers.cloudflare.com/workers-ai/platform/data-usage/).

Cancel or closing the popup aborts the browser request and queued analysis, prevents stale responses, and forwards the signal through the same Worker to `AI.run`, with a 60-second backend deadline. Cloud cancellation remains **best effort**: aborting HTTP does not guarantee immediate GPU release or refund consumed allowance. See [request cancellation](https://developers.cloudflare.com/workers/runtime-apis/request/#properties).

## Free-tier limits

Keep **Workers Free**; do not enable paid inference, prepaid credits, a paid subscription or fallback. Official limits checked November 8, 2026:

- Workers AI: **10,000 neurons/account/day**, shared across visitors and other account AI usage; resets 00:00 UTC, 07:00 Bangkok. Exhaustion fails on Free rather than enabling paid overage.
- Dynamic Worker requests: **100,000/account/day**, with a 10 ms CPU allowance per invocation on Free. Static assets served directly do not invoke the Worker and are free/unlimited.
- Workers Builds: **3,000 build minutes/month** on Free. This is Workers Builds, not the Pages build allowance.
- API: 16 KiB streamed request-body limit, at most eight short embedding inputs, bounded cluster context, fixed models and 256/512-token output limits. Native bindings limit approximately 20 requests/minute/IP and 60/minute/location; in-memory guards allow one active request/IP and two/isolate.

Sources: [AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [static assets billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/), [Builds limits](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/), [rate-limit semantics](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).

New/changed records, long clusters, multiple visitors and cleared caches increase inference usage. Native limits are approximate and per location; isolate concurrency is not global. Without accounts or centralized state, distributed traffic can exhaust the shared allowance. The app reports temporary AI unavailability while keeping the whiteboard, autosave and deterministic findings usable. No paid infrastructure is added.

## Browser storage

Storage belongs to the website origin and browser profile. Diagrams at **https://trace.trandongxzy.workers.dev** remain accessible with the same key; deployment does not clear or migrate them. Localhost and temporary Pages data remain separate and are not automatically copied. Settings offers manual JSON export/import to transfer or back up diagrams locally; files are unencrypted and never uploaded. Import requires confirmation and resets prior history only after persistence succeeds. Clearing storage can remove diagrams and caches. There is no cross-browser/device synchronization or cloud backup.
