import request from 'supertest';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as http from 'http';
import * as https from 'https';

// Mock YouTube API before importing app
const mockChannelsList = vi.fn();
const mockVideosList = vi.fn();

vi.mock('@googleapis/youtube', () => {
  class MockYoutube {
    constructor() {
      this.channels = {
        list: mockChannelsList,
      };
      this.videos = {
        list: mockVideosList,
      };
    }
  }
  return {
    youtube_v3: {
      Youtube: MockYoutube,
    },
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

// Mock https module for WebSub calls
vi.mock('https', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    request: vi.fn(),
  };
});

// Import app after mocks
const { app, waitfordb } = await import('../src/youtube.js');

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

  it('rejects after exhausting attempts', async () => {
    global.fetch.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(waitfordb('http://database:8002', 50, 2)).rejects.toThrow(
      'Database is down: 2 attempts tried'
    );
  });
});

describe('YouTube routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
  });

  it('POST /add creates a destination and subscribes to WebSub', async () => {
    mockChannelsList.mockResolvedValue({
      data: {
        items: [{ id: 'yt-channel-123' }],
      },
    });

    // Mock http.request for database call
    const mockReq = {
      write: vi.fn(),
      end: vi.fn(),
      on: vi.fn(),
    };
    const mockRes = {
      statusCode: 200,
      on: vi.fn((event, cb) => {
        if (event === 'end') setImmediate(cb);
      }),
    };
    http.request.mockImplementation((options, callback) => {
      setImmediate(() => callback(mockRes));
      return mockReq;
    });

    const payload = {
      source_username: '@testchannel',
      discord_channel: 'chan-123',
      interval: 60,
      highlight: Buffer.from([0, 255, 0]),
      message: 'New video!',
    };

    const response = await request(app).post('/add').send(payload);

    expect(response.status).toBe(200);
    expect(mockChannelsList).toHaveBeenCalledWith({
      part: 'id',
      forHandle: 'testchannel', // leading @ stripped
    });
  });

  it('POST /add returns 404 when YouTube channel not found', async () => {
    mockChannelsList.mockResolvedValue({
      data: {
        items: [],
      },
    });

    const payload = {
      source_username: 'nonexistent',
      discord_channel: 'chan-123',
      interval: 60,
      highlight: Buffer.from([0, 255, 0]),
      message: '',
    };

    const response = await request(app).post('/add').send(payload);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ message: 'User not found' });
  });

  it('GET /webhooks/youtube responds to hub challenge', async () => {
    const response = await request(app).get('/webhooks/youtube').query({
      'hub.mode': 'subscribe',
      'hub.topic': 'https://www.youtube.com/xml/feeds/videos.xml?channel_id=UC123',
      'hub.challenge': 'challenge-token-123',
    });

    expect(response.status).toBe(200);
    expect(response.text).toBe('challenge-token-123');
  });

  it('DELETE /remove removes a destination without unsubscribing when destinations remain', async () => {
    mockChannelsList.mockResolvedValue({
      data: {
        items: [{ id: 'yt-channel-789' }],
      },
    });

    // Mock http.request for database call
    const mockReq = {
      write: vi.fn(),
      end: vi.fn(),
      on: vi.fn(),
    };
    const mockRes = {
      statusCode: 200,
      on: vi.fn((event, cb) => {
        if (event === 'data') setImmediate(() => cb(JSON.stringify({ sourceDeleted: false })));
        if (event === 'end') setImmediate(cb);
      }),
    };
    http.request.mockImplementation((options, callback) => {
      setImmediate(() => callback(mockRes));
      return mockReq;
    });

    const payload = {
      source_username: '@testchannel',
      discord_channel: 'chan-123',
    };

    const response = await request(app).delete('/remove').send(payload);

    expect(response.status).toBe(200);
    expect(mockChannelsList).toHaveBeenCalledWith({
      part: 'id',
      forHandle: 'testchannel',
    });
  });

  it('DELETE /remove unsubscribes from WebSub when source is deleted', async () => {
    mockChannelsList.mockResolvedValue({
      data: {
        items: [{ id: 'yt-channel-456' }],
      },
    });

    const httpMockReq = {
      write: vi.fn(),
      end: vi.fn(),
      on: vi.fn(),
    };
    const httpMockRes = {
      statusCode: 200,
      on: vi.fn((event, cb) => {
        if (event === 'data') setImmediate(() => cb(JSON.stringify({ sourceDeleted: true })));
        if (event === 'end') setImmediate(cb);
      }),
    };

    const httpsMockReq = {
      write: vi.fn(),
      end: vi.fn(),
      on: vi.fn(),
    };
    const httpsMockRes = {
      statusCode: 202,
      on: vi.fn((event, cb) => {
        if (event === 'data') setImmediate(() => cb(''));
        if (event === 'end') setImmediate(cb);
      }),
    };

    // Mock http for database and https for WebSub
    http.request.mockImplementation((options, callback) => {
      setImmediate(() => callback(httpMockRes));
      return httpMockReq;
    });

    https.request.mockImplementation((options, callback) => {
      setImmediate(() => callback(httpsMockRes));
      return httpsMockReq;
    });

    const payload = {
      source_username: '@testchannel',
      discord_channel: 'chan-999',
    };

    const response = await request(app).delete('/remove').send(payload);

    expect(response.status).toBe(200);
    expect(https.request).toHaveBeenCalledWith(
      expect.objectContaining({
        hostname: 'pubsubhubbub.appspot.com',
        path: '/subscribe',
      }),
      expect.any(Function)
    );
    expect(httpsMockReq.write).toHaveBeenCalledWith(
      expect.stringContaining('hub.mode=unsubscribe')
    );
  });

  it('DELETE /remove returns 404 when channel not found', async () => {
    mockChannelsList.mockResolvedValue({
      data: {
        items: [],
      },
    });

    const payload = {
      source_username: 'nonexistent',
      discord_channel: 'chan-123',
    };

    const response = await request(app).delete('/remove').send(payload);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ message: 'User not found' });
  });

  it('POST /webhooks/youtube handles video notification', async () => {
    // Mock database responses for WebSub handler
    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve([{ source_id: 'yt-123' }]),
      }) // sources check
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve([]) }) // existing types
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ inserted: true }),
      }) // claim
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve([{ channel_id: 'chan-1' }]),
      }); // destinations

    mockVideosList.mockResolvedValue({
      data: {
        items: [
          {
            id: 'video-123',
            snippet: {
              publishedAt: new Date().toISOString(),
              liveBroadcastContent: 'none',
              channelTitle: 'Test Channel',
            },
          },
        ],
      },
    });

    // Mock http.request for Discord message send
    const mockReq = {
      write: vi.fn(),
      end: vi.fn(),
      on: vi.fn(),
    };
    http.request.mockReturnValue(mockReq);

    const xmlPayload = `<?xml version="1.0" encoding="UTF-8"?>
      <feed xmlns:yt="http://www.youtube.com/xml/schemas/2015">
        <entry>
          <yt:videoId>video-123</yt:videoId>
          <yt:channelId>yt-123</yt:channelId>
        </entry>
      </feed>`;

    const response = await request(app)
      .post('/webhooks/youtube')
      .set('Content-Type', 'application/xml')
      .send(xmlPayload);

    expect(response.status).toBe(200);
  });

  it('GET / health check waits for database then returns OK', async () => {
    const response = await request(app).get('/');

    expect(response.status).toBe(200);
    expect(response.text).toBe('OK');
    expect(global.fetch).toHaveBeenCalledWith('http://database:8002');
  });
});
