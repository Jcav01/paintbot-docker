import { youtube_v3 } from '@googleapis/youtube';
import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import express from 'express';
import xmlbodyparser from 'express-xml-bodyparser';
const app = express();

// Environment-specific hostname for callbacks/referer
const HOSTNAME = process.env.PUBLIC_HOSTNAME || 'dev.paintbot.net';

const lease_seconds = 864000; // 10 days

// In Kubernetes, secrets are mounted as individual files in a directory
const secretsPath = '/etc/secrets';
const youtube = new youtube_v3.Youtube({
  // TODO: Switch to service account to remove need for referer
  auth: fs.readFileSync(`${secretsPath}/youtube-api-key`, 'utf8').trim(),
  headers: {
    referer: `https://${HOSTNAME}`,
  },
});

app.post('/add', express.json(), async (req, res) => {
  console.log('Received request to add Youtube source:', req.body);
  try {
    await waitfordb('http://database:8002');

    const handle = (req.body.source_username || '').replace(/^@/, '');
    const response = await youtube.channels.list({
      part: 'id',
      forHandle: handle,
    });

    const user = response.data.items?.[0];
    if (!user) {
      return res.status(404).send({ message: 'User not found' });
    }

    const data = JSON.stringify({
      notification_source: 'youtube',
      source_username: handle,
      source_id: user.id,
      channel_id: req.body.discord_channel,
      minimum_interval: req.body.interval,
      highlight_colour: req.body.highlight,
      message: req.body.message,
    });

    await new Promise((resolve, reject) => {
      const options = {
        host: 'database',
        port: '8002',
        path: '/destination',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      };
      const source_req = http.request(options, (source_res) => {
        let body = '';
        source_res.on('data', (c) => (body += c));
        source_res.on('end', () => {
          if (source_res.statusCode !== 200) {
            console.error('DB /destination failed:', source_res.statusCode, body);
            return reject(new Error(`DB responded ${source_res.statusCode}`));
          }
          resolve();
        });
      });
      source_req.on('error', reject);
      source_req.write(data);
      source_req.end();
    });

    setupYouTubeNotification(user.id)
      .then(() => console.log('Requested WebSub subscription for', user.id))
      .catch((err) => console.error('Failed to request WebSub subscription:', err));

    return res.send();
  } catch (err) {
    console.error('YouTube /add failed:', err.message);
    if (!res.headersSent) {
      return res.status(500).send({ message: 'Internal server error' });
    }
  }
});
app.delete('/remove', express.json(), async (req, res) => {
  console.log(
    'Received request to remove Youtube source:',
    req.body.source_username,
    'for channel',
    req.body.discord_channel
  );
  try {
    await waitfordb('http://database:8002');

    const handle = (req.body.source_username || '').replace(/^@/, '');
    const response = youtube.channels.list({
      part: 'id',
      forHandle: handle,
    });

    const user = response.data.items?.[0];
    if (!user) {
      return res.status(404).send({ message: 'User not found' });
    }

    await new Promise((resolve, reject) => {
      const options = {
        host: 'database',
        port: '8002',
        path: `/destination/${req.body.discord_channel}/${user.id}`,
        method: 'DELETE',
      };
      const delete_req = http.request(options, (destination_res) => {
        let body = '';
        destination_res.on('data', (c) => (body += c));
        destination_res.on('end', () => {
          if (destination_res.statusCode !== 200) {
            console.error('DB delete failed:', destination_res.statusCode, body);
            return reject(new Error(`DB responded ${destination_res.statusCode}`));
          }
          resolve();
        });
      });
      delete_req.on('error', reject);
      delete_req.end();
    });
    return res.send();
  } catch (err) {
    console.error('YouTube /remove failed:', err.message);
    if (!res.headersSent) {
      return res.status(500).send({ message: 'Internal server error' });
    }
  }
});
app.get('/', async (req, res) => {
  await waitfordb('http://database:8002');
  res.status(200).send('OK');
});
// Respond to WebSub verification challenges from YouTube's hub
app
  .route('/webhooks/youtube')
  .get(async (req, res) => {
    const mode = req.query['hub.mode'];
    const topic = req.query['hub.topic'];
    const challenge = req.query['hub.challenge'];
    console.log('YouTube WebSub verify:', { mode, topic });
    if (challenge) {
      return res.status(200).send(challenge);
    }
    return res.sendStatus(400);
  })
  .post(xmlbodyparser(), async (req, res) => {
    res.sendStatus(200);
    console.log('YouTube WebSub notification:', JSON.stringify(req.body));
    if (!req.body) return;

    const entry = req.body?.feed?.entry?.[0];
    const videoId = entry?.['yt:videoid']?.[0] ?? entry?.['yt:videoId']?.[0];
    const channelId = entry?.['yt:channelid']?.[0];
    if (!videoId || !channelId) {
      console.warn('YouTube WebSub: missing identifiers');
      return;
    }

    try {
      // Ensure channel subscribed
      const sourcesRes = await fetch(`http://database:8002/source/${channelId}`);
      const sources = await sourcesRes.json();
      if (!Array.isArray(sources) || sources.length === 0) {
        console.log('Channel not subscribed:', channelId);
        return;
      }
      const sourceId = sources[0].source_id;

      // Fetch video details
      const videoResponse = await youtube.videos.list({
        part: ['snippet', 'status'],
        id: [videoId],
      });
      const video = videoResponse.data.items?.[0];
      if (!video || !video.snippet) return;

      const publishedAt = new Date(video.snippet.publishedAt);
      if (publishedAt.getTime() < Date.now() - 24 * 60 * 60 * 1000) {
        console.log('YouTube video older than 24h, skipping:', videoId);
        return;
      }

      // Determine stage
      let stage = video.snippet.liveBroadcastContent || 'none';
      const notificationType = `yt.${stage}`;

      // Retrieve existing stages for this video
      const existingTypesRes = await fetch(
        `http://database:8002/notifications/history/types/${encodeURIComponent(videoId)}`
      );
      const existingTypes = new Set(await existingTypesRes.json());
      console.log('Existing notification types for', videoId, existingTypes);

      let shouldNotify = false;
      if (stage === 'upcoming') {
        shouldNotify = !existingTypes.has('yt.upcoming');
      } else if (stage === 'live') {
        shouldNotify = !existingTypes.has('yt.live');
      } else if (stage === 'none') {
        // Plain upload only if not previously a live stream
        shouldNotify = !existingTypes.has('yt.live');
      }
      if (!shouldNotify) {
        console.log('Stage already handled for video', videoId, 'stage', stage);
        return;
      }

      // Attempt to claim (race-safe)
      const claimRes = await fetch('http://database:8002/notifications/history/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceId,
          notificationType,
          notificationInfo: JSON.stringify(video),
        }),
      });
      const claim = await claimRes.json();
      if (!claim.inserted) {
        console.log('Lost race to claim notification for', videoId, notificationType);
        return;
      }

      // Build user-facing message
      let videoMessage;
      if (stage === 'live') {
        videoMessage = `${video.snippet.channelTitle} is now live! Watch at https://youtu.be/${video.id}`;
      } else if (stage === 'upcoming') {
        const publishedAt = new Date(video.snippet.publishedAt);
        const publishedTimestamp = Math.floor(publishedAt.getTime() / 1000);
        videoMessage = `${video.snippet.channelTitle} has scheduled a live stream/premiere for <t:${publishedTimestamp}:F>: https://youtu.be/${video.id}`;
      } else {
        // none
        videoMessage = `${video.snippet.channelTitle} has posted a new video: https://youtu.be/${video.id}`;
      }

      // Fetch destinations
      const destinationRes = await fetch(`http://database:8002/destinations/source/${channelId}`);
      const destinations = await destinationRes.json();

      await sendVideoNotifications(videoMessage, destinations, channelId);
    } catch (e) {
      console.error('Error processing YouTube notification for video', videoId, e);
    }
  });

// Bind listener immediately; perform slower startup tasks asynchronously to avoid ingress routing to a closed port.
app.listen(8005, () => {
  console.log('YouTube is listening on port 8005');
  (async () => {
    try {
      await waitfordb('http://database:8002');
      console.log('Database is up');
      await syncEventSubSubscriptions();
    } catch (e) {
      console.error('Post-listen startup task failed:', e.message);
    }
  })();
});

async function setupYouTubeNotification(source_id) {
  // Build WebSub form data (must be x-www-form-urlencoded)
  const hub = {
    'hub.callback': `https://${HOSTNAME}/webhooks/youtube`,
    'hub.mode': 'subscribe',
    'hub.verify': 'async',
    'hub.topic': `https://www.youtube.com/xml/feeds/videos.xml?channel_id=${source_id}`,
    // Optional verification/secret fields; leave empty or wire to a secret to validate signatures
    'hub.verify_token': '',
    // 'hub.secret': '<your-shared-secret>',
    'hub.lease_seconds': lease_seconds,
  };

  const body = new URLSearchParams(hub).toString();

  const reqOptions = {
    method: 'POST',
    hostname: 'pubsubhubbub.appspot.com',
    path: '/subscribe',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body),
    },
  };

  await new Promise((resolve, reject) => {
    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          console.log('WebSub hub response:', res.statusCode, data || '(no body)');
          resolve(undefined);
        } else {
          reject(new Error(`Hub responded ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function waitfordb(DBUrl, interval = 1500, attempts = 10) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const targetUrl = DBUrl || 'http://database:8002';

  // eslint-disable-next-line no-async-promise-executor
  return new Promise(async (resolve, reject) => {
    let delay = interval;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      if (attempt > 1) {
        await sleep(delay);
        delay *= 2;
      }

      try {
        const response = await fetch(targetUrl);
        if (response.ok && response.status === 200) {
          resolve();
          return;
        }
      } catch {
        // ignore error; retry after backoff
      }

      if (attempt < attempts) {
        console.log(`Database still down, trying ${attempt + 1} of ${attempts}`);
      }
    }

    reject(new Error(`Database is down: ${attempts} attempts tried`));
  });
}

async function syncEventSubSubscriptions() {
  // 1. Get all sources from database
  const sourcesRes = await fetch('http://database:8002/sources/youtube');
  const sources = await sourcesRes.json();
  const sourceIds = sources.map((src) => src.source_id);
  console.table(sources);

  // 2. Setup WebSub notifications for each source
  sourceIds.forEach((source_id) => {
    setupYouTubeNotification(source_id);
  });

  // 3. Setup automatic re-subscription for all sources
  setInterval(
    async () => {
      const sourcesRes = await fetch('http://database:8002/sources/youtube');
      const sources = await sourcesRes.json();
      const sourceIds = sources.map((src) => src.source_id);
      sourceIds.forEach((source_id) => {
        setupYouTubeNotification(source_id);
      });
    },
    lease_seconds * 1000 * 0.9 // set resubscribe to trigger after 90% of lease time, in milliseconds
  );
}

async function sendVideoNotifications(message, destinations, channelId) {
  // Create an object to POST to the Discord webhook
  const embed_data = JSON.stringify({
    channelInfo: destinations.map(function (destination) {
      return {
        channelId: destination.channel_id,
        highlightColour: destination.highlight_colour,
        notification_message: destination.notification_message,
      };
    }),
    message: message,
  });

  // An object of options to indicate where to post to
  const embed_options = {
    host: 'discord',
    port: '8001',
    path: '/message/send',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(embed_data),
    },
  };

  const embed_req = http.request(embed_options, (res) => {
    let data = '';

    // A chunk of data has been received.
    res.on('data', (chunk) => {
      data += chunk;
    });

    // The whole response has been received.
    res.on('end', () => {
      const result = JSON.parse(data);
      result.forEach((element) => {
        const lastMessage_data = JSON.stringify({ messageId: element.messageId });
        const lastMessage_options = {
          host: 'database',
          port: '8002',
          path: `/destinations/${element.channelId}/${channelId}`,
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(lastMessage_data),
          },
        };
        const lastMessage_req = http.request(lastMessage_options);
        lastMessage_req.write(lastMessage_data);
        try {
          lastMessage_req.end();
        } catch (error) {
          console.error(error);
        }
      });
    });
  });

  embed_req.write(embed_data);
  embed_req.end();
}
