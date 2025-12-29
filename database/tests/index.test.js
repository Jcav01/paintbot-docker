import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/db/index.js', () => {
  return {
    query: vi.fn(),
    getClient: vi.fn(),
  };
});

import { app, asyncHandler } from '../src/index.js';
import * as db from '../src/db/index.js';

describe('asyncHandler', () => {
  const originalError = console.error;

  beforeEach(() => {
    vi.resetAllMocks();
    console.error = vi.fn();
  });

  afterEach(() => {
    console.error = originalError;
  });

  it('returns 500 response when the handler throws', async () => {
    const status = vi.fn().mockReturnThis();
    const send = vi.fn();
    const res = { status, send, headersSent: false };
    const handler = asyncHandler(async () => {
      throw new Error('boom');
    });

    await handler({}, res, vi.fn());

    expect(status).toHaveBeenCalledWith(500);
    expect(send).toHaveBeenCalledWith({ message: 'Internal server error' });
  });

  it('does not write a response if headers are already sent', async () => {
    const status = vi.fn().mockReturnThis();
    const send = vi.fn();
    const res = { status, send, headersSent: true };
    const handler = asyncHandler(async () => {
      throw new Error('boom');
    });

    await handler({}, res, vi.fn());

    expect(status).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});

describe('database routes', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('claims a notification stage and returns inserted=true when row is added', async () => {
    db.query.mockResolvedValue({ rowCount: 1, rows: [] });

    const payload = {
      sourceId: 'source-1',
      notificationType: 'yt.live',
      notificationInfo: JSON.stringify({ id: 'video-1' }),
    };

    const response = await request(app).post('/notifications/history/claim').send(payload);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ inserted: true });
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO past_notifications'),
      [payload.sourceId, payload.notificationType, payload.notificationInfo]
    );
  });

  it('returns inserted=false when the insert is skipped by ON CONFLICT', async () => {
    db.query.mockResolvedValue({ rowCount: 0, rows: [] });

    const payload = {
      sourceId: 'source-1',
      notificationType: 'yt.live',
      notificationInfo: JSON.stringify({ id: 'video-1' }),
    };

    const response = await request(app).post('/notifications/history/claim').send(payload);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ inserted: false });
  });

  it('updates last message id for a destination', async () => {
    db.query.mockResolvedValue({ rowCount: 1, rows: [{ message_id: '123' }] });

    const response = await request(app)
      .put('/destinations/chan-1/src-1')
      .send({ messageId: '123' });

    expect(response.status).toBe(200);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE destinations SET last_message_id'),
      ['123', 'chan-1', 'src-1']
    );
    expect(response.body).toEqual([{ message_id: '123' }]);
  });

  it('adds a new source and destination', async () => {
    // Mock: source doesn't exist, so we need to create it
    db.query.mockResolvedValueOnce({ rows: [] }); // SELECT check
    const mockClient = {
      query: vi.fn().mockResolvedValue({ rows: [{ channel_id: 'chan-1' }] }),
      release: vi.fn(),
    };
    db.getClient.mockResolvedValue(mockClient);

    const response = await request(app)
      .post('/destination')
      .send({
        channel_id: 'chan-1',
        source_id: 'src-1',
        notification_source: 'twitch',
        source_username: 'testuser',
        minimum_interval: 60,
        highlight_colour: Buffer.from([255, 0, 0]),
        message: 'Live!',
      });

    expect(response.status).toBe(200);
    expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('gets notification types for a video ID', async () => {
    db.query.mockResolvedValue({
      rows: [{ notification_type: 'yt.live' }, { notification_type: 'yt.upcoming' }],
    });

    const response = await request(app).get('/notifications/history/types/video-123');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(['yt.live', 'yt.upcoming']);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining("notification_info->>'id'"), [
      'video-123',
    ]);
  });
});
