# Copilot Instructions

## Orientation

- Paintbot routes Twitch and YouTube live events into Discord via four Node.js services plus a PostgreSQL API.
- Containers talk over internal DNS names (`database`, `discord`, `twitch`, `youtube`) whether in Docker Compose or Kubernetes.
- Secrets are mounted as files under `/etc/secrets` (and `/etc/service-account` for DB) rather than environment variables.
- Node 20+ runtime is assumed; global `fetch` is used heavily for inter-service calls.

## Service Notes

- `database/` exposes the REST API backing everything else; it uses the Cloud SQL Connector (`@google-cloud/cloud-sql-connector`) and sets `search_path=paintbot`.
- `database/src/index.js` wraps handlers with `asyncHandler`; match that pattern when adding routes and keep SQL in `database/src/db/index.js`.
- `discord/src/index.js` bootstraps slash commands from `commands/`, enforces guild whitelisting via `GET /servers/:id`, and exposes `/embed/send` & `/message/send` for other services.
- `twitch/src/twitch.js` relies on Twurple (`@twurple/*`) to manage EventSub subscriptions, mirrors DB state through `syncEventSubSubscriptions()`, and updates Discord plus DB histories when events fire.
- `youtube/src/youtube.js` consumes WebSub callbacks, claims notification stages via `/notifications/history/claim`, and re-subscribes every 90% of `lease_seconds`.

## Data & Schema

- Schema lives in `database/scripts/scaffolding.sql`; migrations are manual, so update the script and note downstream callers when changing tables.
- `destinations` records track Discord channel, interval minutes, highlight colour bytes, and last message ID; keep payload shapes consistent with existing JSON bodies.
- Notification dedupe relies on `past_notifications` uniqueness (`notification_info->>'id'`), so reuse `claim` when coordinating multi-stage alerts.
- Server whitelist lives in `servers`; returning `{ whitelisted: false }` from `/servers/:id` causes the Discord bot to auto-leave.

## Local Workflow

- Copy secrets into each service’s `secrets/` directory and mount them with a `docker-compose.override.yaml` before running `docker compose up --build`.
- The monorepo uses npm workspaces; install deps with `npm install` at root, then lint via `npm run lint --workspace=<service>`.
- Register slash commands by populating `deploy-commands/config.json` and running `node deploy-commands/deploy-commands.js`.
- `deploy.ps1` offers ad-hoc helpers on Windows but Kubernetes deployments rely on `kubectl apply -k k8s/overlays/<env>`.

## Patterns & Gotchas

- Each service waits for the database using the shared `waitfordb()` exponential backoff helper; reuse it for new startup logic.
- Inter-service calls are raw HTTP with JSON bodies (`http` module), so mind headers and `Content-Length` when adding endpoints.
- Colour values passed to Discord embeds arrive as a Postgres `bytea`; convert with `Buffer.from(...).toString()` to retain existing behaviour.
- Twitch event handlers must update both Discord and the DB (`/destinations/...` and `/notifications/history`) to keep state in sync.
- YouTube handlers strip leading `@` from handles and ignore videos older than 24h; follow those heuristics to avoid noisy notifications.

## Deployment & CI

- Kubernetes manifests are organized under `k8s/` with environment overlays (`overlays/development`, `overlays/production`) that set hostnames and optional `cloudflared` sidecars.
- Production images live in Artifact Registry; update image tags via the GitHub Actions deploy workflows rather than editing manifests directly.
- `deploy-dev.yaml` runs on `develop`, `deploy-prod.yaml` on `main`; both expect GKE Workload Identity plus Cloudflare credentials in repo secrets.
- Missing K8s secrets cause Health/Readiness check failures—ensure secret file names match the ones read in each service before deploying.
