# Paintbot

[![Dependabot Updates](https://github.com/Jcav01/paintbot-docker/actions/workflows/dependabot/dependabot-updates/badge.svg)](https://github.com/Jcav01/paintbot-docker/actions/workflows/dependabot/dependabot-updates)
[![Deployment](https://github.com/Jcav01/paintbot-docker/actions/workflows/deploy-prod.yaml/badge.svg)](https://github.com/Jcav01/paintbot-docker/actions/workflows/deploy-prod.yaml)

Paintbot orchestrates live-content notifications so Twitch and YouTube events can be surfaced in Discord servers. This repository hosts the Dockerized services, Kubernetes manifests, and CI/CD automation that power the production deployment on Google Kubernetes Engine (GKE).

## Overview

- Node.js microservices for Discord command handling, Twitch EventSub ingestion, YouTube WebSub ingestion, and a PostgreSQL-backed API.
- Containers run locally through Docker Compose and in production on GKE; Cloud SQL provides the database backend.
- Secrets are delivered as Kubernetes secrets and mounted as read-only files, keeping credentials out of environment variables and git history.
- GitHub Actions build images in Artifact Registry, synchronize Cloudflare tunnel credentials, and apply Kustomize overlays for development and production.

## Service Topology

| Service     | Description                                                                                                                            | Container Port | Notes                                                                                                                                                               |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| database    | Express API that fronts the Cloud SQL PostgreSQL instance; exposes REST endpoints for sources, destinations, and notification history. | 8002           | Requires `/etc/secrets/{postgres-user,postgres-password,postgres-db,instanceConnectionName}` plus a service account key mounted at `/etc/service-account/key.json`. |
| discord     | Discord bot runtime that manages slash commands and emits embeds/messages into channels.                                               | 8001           | Reads token from `/etc/secrets/bot-token`; talks to `database`, `twitch`, and `youtube`.                                                                            |
| twitch      | Handles Twitch EventSub subscriptions and forwards live state changes to Discord.                                                      | 8004           | Needs `/etc/secrets/{client-id,client-secret,eventsub-secret}` and `TWITCH_PUBLIC_HOSTNAME`.                                                                        |
| youtube     | Optional service that consumes YouTube WebSub notifications and posts to Discord.                                                      | 8005           | Uses `/etc/secrets/youtube-api-key` and `YOUTUBE_PUBLIC_HOSTNAME`.                                                                                                  |
| cloudflared | Lightweight Cloudflare Tunnel sidecar that backhauls HTTPS traffic to in-cluster services.                                             | n/a            | Disabled by default; enable via overlays once credentials are in place.                                                                                             |

## Repository Layout

- Core services: `database/`, `discord/`, `twitch/`, `youtube/` each contain source, Dockerfile, and local secret stubs.
- Kubernetes manifests: `k8s/` holds base definitions, environment overlays, config maps, and secret templates.
- CI/CD workflows: `.github/workflows/` define setup, development, and production GitHub Actions pipelines.
- Discord tooling: `deploy-commands/` publishes slash commands (expects a local `config.json` with Discord token and application id).
- Documentation & helpers: `docs/`, `deploy.ps1`, and `database/scripts/` cover EventSub setup, PowerShell helpers, and schema scaffolding.

## Local Development

### Prerequisites

- Docker Desktop 4.x (or newer) with Compose v2 enabled.
- Node.js 24+ and npm for linting, formatting, and running tests (the repo expects Node 24+ for built-in `fetch`).
- Google Cloud SDK (`gcloud`) if you need Artifact Registry or Cloud SQL access from your workstation.
- Discord bot token, Twitch application credentials, and (optionally) YouTube API key.

### Prepare environment files

1. (Optional) Copy the sample env file if you use `deploy.ps1` helpers or want local defaults for tooling:
   ```powershell
   Copy-Item .env.example .env
   ```
   Runtime secrets are **not** read from environment variables; services read secrets from mounted files under `/etc/secrets`.
2. Populate secret files that mirror the Kubernetes mount layout. Each file must contain only the secret value and should remain untracked by git:
   ```
   discord/secrets/bot-token
   twitch/secrets/client-id
   twitch/secrets/client-secret
   twitch/secrets/eventsub-secret
   database/secrets/postgres-user
   database/secrets/postgres-password
   database/secrets/postgres-db
   database/secrets/instanceConnectionName
   database/secrets/service-account/key.json
   ```
   Optional: add `youtube/secrets/youtube-api-key` if you plan to exercise the YouTube service locally (a `webhook-secret` key exists in templates but is not currently consumed by the service code).
3. Create a Compose override to mount those secrets into the paths the services expect:
   ```yaml
   # docker-compose.override.yaml
   services:
     discord:
       volumes:
         - ./discord/secrets:/etc/secrets:ro
     twitch:
       volumes:
         - ./twitch/secrets:/etc/secrets:ro
     database:
       volumes:
         - ./database/secrets:/etc/secrets:ro
         - ./database/secrets/service-account:/etc/service-account:ro
     youtube:
       volumes:
         - ./youtube/secrets:/etc/secrets:ro
   ```

### Start the stack

```powershell
# From the repository root
docker compose up --build
```

The Compose file is primarily for smoke-testing the containers. Adjust or extend the override above if you want to include additional services such as `youtube`.

Helpful commands while debugging locally:

```powershell
docker compose logs -f database
docker compose exec database sh -c "curl -s http://localhost:8002/"
docker compose down
```

### Linting & formatting

The monorepo uses npm workspaces. Run tooling from the repository root:

```powershell
npm install
npm run lint
npm run lint --workspace=discord
npm run format --workspace=twitch
```

### Discord slash commands

Populate `deploy-commands/config.json` (not tracked) with your bot token and application id, then publish slash commands:

```powershell
cd deploy-commands
npm install
node deploy-commands.js
```

## Database schema

The PostgreSQL schema lives in `database/scripts/scaffolding.sql`. Apply it to a fresh Cloud SQL instance (or local Postgres) before pointing services at the database:

```powershell
psql "sslmode=require host=127.0.0.1 port=5432 dbname=postgres user=paintbot" -f database/scripts/scaffolding.sql
```

## Kubernetes Deployment

### Requirements

- Google Cloud project with a GKE cluster (Autopilot or Standard) and Artifact Registry repository `northamerica-northeast1-docker.pkg.dev/paintbot/paintbot` (update manifests if you use different coordinates).
- `gcloud` configured for your project and `kubectl` pointing at the target cluster.
- Cloudflare tunnel credentials if you plan to expose ingress through `cloudflared`.

### Namespaces & overlays

- Production runs in the `default` namespace via `k8s/overlays/production`.
- Development runs in the `development` namespace via `k8s/overlays/development`.
  Create namespaces if they do not exist: `kubectl create namespace development`.

### Required secrets

Create these secrets in every namespace you intend to deploy to (replace placeholder values):

```powershell
kubectl create secret generic twitch-secrets \
    --from-literal=client-id="..." \
    --from-literal=client-secret="..." \
    --from-literal=eventsub-secret="..."

kubectl create secret generic discord-secrets \
    --from-literal=bot-token="discord-bot-token"

kubectl create secret generic youtube-secrets \
    --from-literal=youtube-api-key="..." \
  --dry-run=client -o yaml | kubectl apply -f -

# Note: a `webhook-secret` key exists in templates/helpers but is not currently consumed by the YouTube service.

kubectl create secret generic database-secrets \
    --from-literal=postgres-user="paintbot" \
    --from-literal=postgres-password="..." \
    --from-literal=postgres-db="paintbot" \
    --from-literal=instanceConnectionName="gcp-project:region:instance"

kubectl create secret generic paintbot-service-account \
    --from-file=key.json=path/to/service-account.json

kubectl create secret generic cloudflared-credentials \
    --from-file=credentials.json=path/to/cloudflare/credentials.json \
    --from-literal=tunnel-token="optional-token"
```

### Apply manifests

Use Kustomize overlays rather than individual manifests:

```powershell
kubectl apply -k k8s/overlays/development
kubectl apply -k k8s/overlays/production
```

Verify deployments:

```powershell
kubectl wait --for=condition=available --timeout=300s deployment/database -n development
kubectl get pods -n development
kubectl get services -n development
```

### Cloudflare tunnel

The production overlay includes a `cloudflared` deployment to route HTTPS traffic through Cloudflare instead of Google HTTP(S) Load Balancing. Populate `k8s/secrets/cloudflared-credentials-template.yaml`, update hostnames in `k8s/overlays/production/configmap.yaml`, and follow `docs/twitch-eventsub-production.md` for the full setup.

## GitHub Actions

| Workflow           | Trigger                              | Purpose                                                                                                          | Secrets & Vars                                                                                     |
| ------------------ | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `deploy-dev.yaml`  | Push to `develop` or manual dispatch | Builds images, syncs Cloudflare credentials, applies the development overlay, and updates deployment image tags. | `WORKLOAD_IDENTITY_PROVIDER`, `CLOUDFLARED_CREDENTIALS_B64`, repository variable `GKE_PROJECT_ID`. |
| `deploy-prod.yaml` | Push to `main`                       | Same pipeline targeting the production namespace (`default`).                                                    | Same as above (production environment).                                                            |
| `setup.yaml`       | Manual dispatch                      | Optionally creates the cluster, validates manifests, and smoke-tests Docker builds.                              | `GCP_SA_KEY` (JSON service account) for bootstrap tasks.                                           |

Workflows abort early if required secrets are missing; make sure the cluster holds all of the Kubernetes secrets listed above.

## PowerShell helper (legacy)

`deploy.ps1` remains available for ad-hoc builds, image pushes, secret creation, and log inspection from Windows. Use `./deploy.ps1 create-secrets [namespace]` to interactively populate Kubernetes secrets, then rely on `kubectl apply -k ...` for deployments; the hard-coded manifest paths in the script are deprecated.

## Troubleshooting

- `kubectl logs deployment/twitch -f -n development` to inspect EventSub errors.
- `kubectl describe secret twitch-secrets -n development` verifies secret keys without printing values.
- `kubectl port-forward service/database 8002:8002 -n development` lets you probe REST endpoints directly.
- `docker compose logs -f discord` for local debugging before shipping changes.
- For Twitch ingress quirks and SSL guidance, read `docs/twitch-eventsub-production.md`.

## License

Paintbot is released under the [GNU Affero General Public License v3.0](LICENSE). If you publish modifications or derivative services that interact with users over a network, you must make your modified source available to those users in compliance with section 13 of the AGPL.

## Contributing & Support

- Branch from `develop`, push updates, and open a PR; merges into `develop` deploy automatically to the development namespace.
- Run linting before opening a PR (`npm run lint`).
- File issues with output from `kubectl` or `./deploy.ps1 debug <service>` when reporting bugs.
