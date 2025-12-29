# Copilot Instructions

## Big Picture

- Services: Node.js `discord/`, `twitch/`, `youtube/`, and `database/` coordinate live notifications into Discord; PostgreSQL backs state via REST.
- Networking: Containers use internal DNS (`database`, `discord`, `twitch`, `youtube`) in Compose and Kubernetes.
- Secrets: Mounted as files under `/etc/secrets` (and `/etc/service-account/key.json` for DB). Do not read from env vars.
- Runtime: Node 20+ with global `fetch`; inter-service calls are raw `http` with JSON and explicit `Content-Length`.

## Service Patterns

- `database/src/index.js`: Route handlers wrapped in `asyncHandler(...)`; keep SQL in `database/src/db/index.js`. Examples: `/destinations/:destination/:source` updates `last_message_id`, `/notifications/history/claim` dedupes by `notification_info->>'id'`.
- `discord/src/index.js`: Loads slash commands from `src/commands/**`, enforces guild whitelist via `GET /servers/:id` (auto-leaves on `{ whitelisted: false }`), exposes `/embed/send`, `/message/send`.
- `twitch/src/twitch.js`: Uses Twurple (`@twurple/*`), binds EventSub via `EventSubMiddleware`, mirrors DB with `syncEventSubSubscriptions()`, and on events calls Discord then DB (`/destinations/...`, `/notifications/history`).
- `youtube/src/youtube.js`: Consumes WebSub callbacks at `/webhooks/youtube`, claims stages via `/notifications/history/claim`, re-subscribes at 90% of `lease_seconds`.

## Data & Conventions

- Schema: `database/scripts/scaffolding.sql` (manual migrations). Tables include `sources`, `destinations`, `past_notifications`, `servers`.
- Dedupe: Multi-stage notifications keyed by `notification_info->>'id'`; use `/notifications/history/claim` for race-safe inserts.
- Colors: Discord embed color comes from PostgreSQL `bytea`; convert as `Buffer.from(info.highlightColour.data).toString()`.
- YouTube: Strip leading `@` from handles; ignore videos older than 24h.
- Startup: Use shared `waitfordb()` exponential backoff before network calls.

## Local Workflow

- Secrets: Populate service `secrets/` files and mount via `docker-compose.override.yaml` (see README for paths). Start with `docker compose up --build`.
- Workspaces: Install at root (`npm install`), then lint per service (`npm run lint --workspace=<service>`).
- Slash commands: Fill `deploy-commands/config.json` and run `node deploy-commands/deploy-commands.js`.

## Kubernetes & CI

- Deploy via Kustomize overlays: `k8s/overlays/development` and `k8s/overlays/production`; set `TWITCH_PUBLIC_HOSTNAME` and `YOUTUBE_PUBLIC_HOSTNAME` via configmaps.
- Images & automation: GitHub Actions `deploy-dev.yaml` (develop) and `deploy-prod.yaml` (main) update image tags and apply overlays; Artifact Registry hosts images.
- Prereqs: Missing secrets cause probe failures; ensure keys match file names each service reads.

## Examples (referenced files)

- Update Discord embed color: see `discord/src/index.js` (`EmbedBuilder().setColor(`#${Buffer.from(info.highlightColour.data).toString()}`)`).
- Twitch "stream.online": build embed, POST to `discord:/embed/send`, then PUT `database:/destinations/<channelId>/<sourceId>` and record history (`twitch/src/twitch.js`).
- YouTube WebSub: verify challenge on GET, handle XML payload, claim stage, send message via `discord:/message/send`, update last message id (`youtube/src/youtube.js`).

Keep new routes and handlers consistent with the above patterns; prefer minimal changes that align with existing inter-service contracts and payload shapes.

## Quick Start for Agents

- Add Twitch source: POST `twitch:8004/add`
  Body: `{ source_username, discord_channel, interval, highlight, message }`
  Effect: Creates DB destination, starts EventSub for `source_id`.
- Remove Twitch source: DELETE `twitch:8004/remove`
  Body: `{ source_username, discord_channel }`
  Effect: Removes DB destination, unsubscribes EventSub.
- Send initial live embed: POST `discord:8001/embed/send`
  Example body:
  ```json
  {
    "channelInfo": [
      {
        "channelId": "123456789012345678",
        "highlightColour": { "type": "Buffer", "data": [255, 0, 0] },
        "messageId": null,
        "notification_message": "Now live!"
      }
    ],
    "embed": {
      "title": "Untitled Broadcast",
      "url": "https://www.twitch.tv/username",
      "author": { "name": "DisplayName", "iconUrl": "https://...", "url": "https://..." },
      "thumbnail": { "url": "https://static-cdn.jtvnw.net/ttv-static/404_boxart.jpg" },
      "fields": [{ "name": "Game", "value": "N/A" }],
      "image": {
        "url": "https://static-cdn.jtvnw.net/previews-ttv/live_user_name-1280x720.png?r=1735470000"
      }
    }
  }
  ```
  Then update DB last message id: PUT `database:8002/destinations/<channelId>/<sourceId>` with `{ "messageId": "<discordMessageId>" }`.
- Record history (simple insert): POST `database:8002/notifications/history`
  Body: `{ sourceId, notificationType: "stream.online", notificationInfo: { ... } }`.
- Claim stage (race-safe, YouTube): POST `database:8002/notifications/history/claim`
  Body: `{ sourceId, notificationType: "yt.live|yt.upcoming|yt.none", notificationInfo: "<JSON stringified video>" }`.
  On `{ inserted: true }`, send plain message: POST `discord:8001/message/send` with:
  ```json
  {
    "channelInfo": [
      {
        "channelId": "123456789012345678",
        "highlightColour": { "type": "Buffer", "data": [0, 255, 0] },
        "notification_message": ""
      }
    ],
    "message": "Channel posted: https://youtu.be/VIDEOID"
  }
  ```
- Whitelist check: GET `database:8002/servers/<guildId>` → `{ whitelisted: boolean }`; Discord auto-leaves on false.
- Health/backoff: GET `database:8002/` and use `waitfordb()` before cross-service calls.
