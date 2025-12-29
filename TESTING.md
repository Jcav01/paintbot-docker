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

# Generate coverage reports
npm run test:coverage

# Coverage for a specific service
npm run test:coverage --workspace=database
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

## Coverage Reporting

Vitest is configured with `@vitest/coverage-v8` to track test coverage across all services.

### Viewing Coverage

- **Terminal output**: `npm run test:coverage` prints coverage summary to console
- **HTML reports**: Each service generates `coverage/index.html` (open in browser for interactive reports)
- **CI artifacts**: GitHub Actions uploads coverage reports; download from PR artifacts

### Coverage Files

Each service generates coverage in its `coverage/` directory:

- `index.html` – Interactive coverage report
- `coverage.json` – Machine-readable metrics
- Console output shows line, branch, function, and statement coverage percentages

### CI Integration

The test workflow automatically:

1. Runs tests with `npm test`
2. Generates coverage with `npm run test:coverage`
3. Uploads coverage artifacts to GitHub (available for 30 days)
4. Adds summary to PR showing pass/fail status

## Next Steps

1. **Coverage thresholds**: Set minimum coverage requirements (e.g., `lines: 70%`) to block PRs below target
2. **Refactor for testability**: Extract event handlers (`handleStreamOnline`, `handleChannelUpdate`, etc.) into separate modules for isolated unit testing
3. **Integration tests**: Spin up real Postgres via Docker Compose for full database integration tests
4. **E2E tests**: Test complete notification flow (Twitch event → DB → Discord webhook) with all services running
5. **Contract testing**: Validate inter-service payload shapes with JSON schemas or Pact
6. **Snapshot testing**: Use Vitest snapshots for Discord embed structures
7. **Performance tests**: Benchmark database queries and HTTP endpoint latency
