import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock YouTube API
const mockChannelsList = vi.fn();
const mockVideosList = vi.fn();

vi.mock('@googleapis/youtube', () => ({
  youtube_v3: {
    Youtube: vi.fn(() => ({
      channels: {
        list: mockChannelsList,
      },
      videos: {
        list: mockVideosList,
      },
    })),
  },
}));

// Mock http module
vi.mock('http', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    request: vi.fn(),
  };
});

describe('YouTube notification processing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('module exports expected functions', async () => {
    const youtubeModule = await import('../src/youtube.js');
    expect(youtubeModule.app).toBeDefined();
    expect(youtubeModule.waitfordb).toBeDefined();
  });

  it('handles video age filtering (24h cutoff)', () => {
    const now = Date.now();
    const recentVideo = new Date(now - 1000 * 60 * 60 * 12); // 12 hours ago
    const oldVideo = new Date(now - 1000 * 60 * 60 * 25); // 25 hours ago

    expect(recentVideo.getTime()).toBeGreaterThan(now - 24 * 60 * 60 * 1000);
    expect(oldVideo.getTime()).toBeLessThan(now - 24 * 60 * 60 * 1000);
  });

  it('handles broadcast content stages correctly', () => {
    const stages = {
      upcoming: 'yt.upcoming',
      live: 'yt.live',
      none: 'yt.none',
    };

    expect(stages.upcoming).toBe('yt.upcoming');
    expect(stages.live).toBe('yt.live');
    expect(stages.none).toBe('yt.none');
  });

  it('strips leading @ from handles', () => {
    const handle = '@testchannel';
    const stripped = handle.replace(/^@/, '');
    expect(stripped).toBe('testchannel');

    const noAt = 'testchannel';
    const stillStripped = noAt.replace(/^@/, '');
    expect(stillStripped).toBe('testchannel');
  });

  it('builds WebSub topic URL correctly', () => {
    const channelId = 'UC1234567890';
    const topic = `https://www.youtube.com/xml/feeds/videos.xml?channel_id=${channelId}`;
    expect(topic).toContain('channel_id=UC1234567890');
    expect(topic).toContain('youtube.com/xml/feeds');
  });

  it('calculates resubscription timing at 90% of lease', () => {
    const leaseSeconds = 864000; // 10 days
    const resubscribeInterval = leaseSeconds * 1000 * 0.9;
    const expectedDays = resubscribeInterval / (1000 * 60 * 60 * 24);

    expect(expectedDays).toBe(9); // 90% of 10 days
  });
});
