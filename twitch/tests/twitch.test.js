import request from 'supertest';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as http from 'http';

// Mock Twurple before importing app
const mockGetUserByName = vi.fn();
const mockGetSubscriptions = vi.fn();

vi.mock('@twurple/auth');
vi.mock('@twurple/api', () => {
  class MockApiClient {
    constructor() {
      this.users = {
        getUserByName: mockGetUserByName,
      };
      this.eventSub = {
        getSubscriptions: mockGetSubscriptions,
      };
    }
  }
  return {
    ApiClient: MockApiClient,
  };
});
vi.mock('@twurple/eventsub-http', () => {
  class MockEventSubMiddleware {
    apply() {}
    markAsReady() {}
    onStreamOnline() {}
    onStreamOffline() {}
    onChannelUpdate() {}
  }
  return {
    EventSubMiddleware: MockEventSubMiddleware,
  };
});

// Mock http module for database calls
vi.mock('http', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    request: vi.fn(),
  };
});

// Import app after mocks
const { app, waitfordb, subs } = await import('../src/twitch.js');

describe('waitfordb', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('resolves when database is reachable', async () => {
    global.fetch.mockResolvedValue({ ok: true, status: 200 });

    await expect(waitfordb('http://database:8002', 50, 3)).resolves.toBeUndefined();
    expect(global.fetch).toHaveBeenCalledWith('http://database:8002');
  });

  it('rejects after max attempts', async () => {
    global.fetch.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(waitfordb('http://database:8002', 50, 2)).rejects.toThrow(
      'Database is down: 2 attempts tried'
    );
  });
});

describe('Twitch routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    mockGetSubscriptions.mockResolvedValue({
      data: [],
      totalCost: 0,
      maxTotalCost: 100,
    });
  });

  it('POST /add creates a destination and starts EventSub', async () => {
    mockGetUserByName.mockResolvedValue({ id: 'twitch-user-123' });

    // Mock http.request to simulate DB responding successfully
    const mockReq = {
      write: vi.fn(),
      end: vi.fn(),
      on: vi.fn(),
    };
    const mockRes = {
      statusCode: 200,
      on: vi.fn(),
    };
    http.request.mockImplementation((options, callback) => {
      // Simulate successful response
      setImmediate(() => callback(mockRes));
      return mockReq;
    });

    const payload = {
      source_username: 'testuser',
      discord_channel: 'chan-123',
      interval: 60,
      highlight: Buffer.from([255, 0, 0]),
      message: 'Now live!',
    };

    const response = await request(app).post('/add').send(payload);

    expect(response.status).toBe(200);
    expect(mockGetUserByName).toHaveBeenCalledWith('testuser');
  });

  it('DELETE /remove preserves EventSub when other destinations exist', async () => {
    mockGetUserByName.mockResolvedValue({ id: 'twitch-user-456' });

    // Add a mock subscription to the subs array
    const mockStop = vi.fn();
    const mockSubscription = {
      source: 'twitch-user-456',
      subscriptions: [
        { stop: mockStop },
        { stop: mockStop },
        { stop: mockStop },
      ],
    };
    subs.push(mockSubscription);

    // Mock http.request to simulate DB responding successfully to DELETE
    const mockReq = {
      write: vi.fn(),
      end: vi.fn(),
      on: vi.fn(),
    };
    const mockRes = {
      statusCode: 200,
      on: vi.fn(),
    };
    http.request.mockImplementation((options, callback) => {
      setImmediate(() => callback(mockRes));
      return mockReq;
    });

    const payload = {
      source_username: 'testuser',
      discord_channel: 'chan-123',
    };

    const response = await request(app).delete('/remove').send(payload);

    expect(response.status).toBe(200);
    expect(response.body.message).toBe('Destination removed successfully');
    expect(mockGetUserByName).toHaveBeenCalledWith('testuser');
    // Verify that EventSub subscriptions were NOT stopped
    expect(mockStop).not.toHaveBeenCalled();
    // Verify subscription is still in the subs array
    expect(subs).toContain(mockSubscription);

    // Clean up
    subs.length = 0;
  });

  it('DELETE /remove stops EventSub when removing last destination', async () => {
    mockGetUserByName.mockResolvedValue({ id: 'twitch-user-789' });

    // Add a mock subscription to the subs array
    const mockStop = vi.fn();
    const mockSubscription = {
      source: 'twitch-user-789',
      subscriptions: [
        { stop: mockStop },
        { stop: mockStop },
        { stop: mockStop },
      ],
    };
    subs.push(mockSubscription);

    // Mock http.request to simulate DB responding successfully to DELETE
    const mockReq = {
      write: vi.fn(),
      end: vi.fn(),
      on: vi.fn(),
    };
    const mockRes = {
      statusCode: 200,
      on: vi.fn(),
    };
    http.request.mockImplementation((options, callback) => {
      setImmediate(() => callback(mockRes));
      return mockReq;
    });

    // Mock fetch: first for waitfordb, then for destinations check
    global.fetch
      .mockResolvedValueOnce({ ok: true, status: 200 }) // waitfordb call
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      }); // destinations check - returns NO remaining destinations

    const payload = {
      source_username: 'testuser',
      discord_channel: 'chan-123',
    };

    const response = await request(app).delete('/remove').send(payload);

    expect(response.status).toBe(200);
    expect(mockGetUserByName).toHaveBeenCalledWith('testuser');
    // Verify that EventSub subscriptions WERE stopped
    expect(mockStop).toHaveBeenCalledTimes(3);
    // Verify subscription was removed from the subs array
    expect(subs).not.toContain(mockSubscription);

    // Clean up
    subs.length = 0;
  });

  it('GET / health check waits for database then returns OK', async () => {
    const response = await request(app).get('/');

    expect(response.status).toBe(200);
    expect(response.text).toBe('OK');
    expect(global.fetch).toHaveBeenCalledWith('http://database:8002');
  });
});
