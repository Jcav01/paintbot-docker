# Testing Documentation

## Overview

This project now has comprehensive unit and integration testing using **Vitest** and **Supertest**.

## Running Tests

```bash
# Run all tests across all workspaces
npm test

# Run tests for a specific service
npm test --workspace=database
npm test --workspace=discord
npm test --workspace=twitch
npm test --workspace=youtube

# Watch mode (auto-rerun on file changes)
npm run test:watch --workspace=database
```

## Test Coverage

### Database Service

- **Files**: `database/tests/index.test.js`
- **Coverage**:
  - `asyncHandler` error handling (500 responses, header-sent edge cases)
  - `/notifications/history/claim` race-safe notification insertion
  - `/notifications/history/types/:videoId` retrieves notification stages for deduplication
  - `/destinations/:destination/:source` message ID updates
  - `POST /destination` creates new source and destination in transaction
  - Mocked PostgreSQL queries and transactions

### Discord Service

- **Files**: `discord/tests/index.test.js`
- **Coverage**:
  - `waitfordb()` exponential backoff retry logic
  - `/embed/send` endpoint validation
  - `/message/send` endpoint validation
  - Discord.js client mocking

### Twitch Service

- **Files**: `twitch/tests/twitch.test.js`, `twitch/tests/handlers.test.js`
- **Coverage**:
  - `waitfordb()` database connection retry
  - `POST /add` Twitch source subscription flow (mocked Twurple API)
  - `DELETE /remove` Twitch source removal and EventSub cleanup
  - `GET /` health check endpoint
  - EventSub subscription management
  - Event handler module loading and structure validation

### YouTube Service

- **Files**: `youtube/tests/youtube.test.js`, `youtube/tests/notifications.test.js`
- **Coverage**:
  - `waitfordb()` retry mechanism
  - `POST /add` YouTube channel subscription (mocked googleapis)
  - `DELETE /remove` YouTube channel removal
  - 404 handling for nonexistent channels
  - `GET /webhooks/youtube` WebSub challenge-response verification
  - `POST /webhooks/youtube` video notification processing
  - Health endpoint
  - Video age filtering (24h cutoff logic)
  - Broadcast content stage handling (upcoming/live/none)
  - WebSub topic URL construction
  - Resubscription timing calculations

## Framework Choice: Vitest

Vitest was selected over Jest, Mocha, or other frameworks because:

- **Native ESM support**: 3 of 4 services use `"type": "module"` – Vitest handles this seamlessly
- **Jest-compatible API**: Zero learning curve for teams familiar with Jest (`describe`, `it`, `expect`, `vi`)
- **Performance**: Faster startup and re-runs vs Jest
- **Built-in features**: Assertions, mocking, coverage, and snapshots included
- **Monorepo-friendly**: Works excellently with npm workspaces

## Test Environment Setup

All services set `NODE_ENV=test` guards:

- Port binding disabled (prevents EADDRINUSE in tests)
- Test secrets loaded instead of reading from `/etc/secrets`
- Discord client login skipped
- Command folder loading skipped

## Mocking Strategy

- **Database**: `vi.mock` on `db/index.js` for `query()` and `getClient()`
- **Discord**: `vi.mock('discord.js')` to stub Client, EmbedBuilder, Events
- **Twitch**: `vi.mock('@twurple/api')` and `vi.mock('@twurple/eventsub-http')`
- **YouTube**: `vi.mock('@googleapis/youtube')`
- **HTTP**: `vi.mock('http')` for inter-service calls to database

## Next Steps

1. **Refactor for testability**: Extract event handlers (`handleStreamOnline`, `handleChannelUpdate`, etc.) into separate modules for isolated unit testing
2. **Integration tests**: Spin up real Postgres via Docker Compose for full database integration tests
3. **E2E tests**: Test complete notification flow (Twitch event → DB → Discord webhook) with all services running
4. **Coverage reporting**: Add `--coverage` flag and track metrics in CI (`vitest --coverage`)
5. **Contract testing**: Validate inter-service payload shapes with JSON schemas or Pact
6. **Snapshot testing**: Use Vitest snapshots for Discord embed structures
7. **Performance tests**: Benchmark database queries and HTTP endpoint latency
