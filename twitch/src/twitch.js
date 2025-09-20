import { AppTokenAuthProvider } from '@twurple/auth';
import { ApiClient } from '@twurple/api';
import { EventSubMiddleware } from '@twurple/eventsub-http';
import * as fs from 'fs';
import * as http from 'http';
import express from 'express';
const app = express();

app.post('/add', express.json(), async (req, res) => {
  console.log('Received request to add Twitch source:', req.body);
  await waitfordb('http://database:8002');

  apiClient.users.getUserByName(req.body.source_username).then(async (user) => {
    const data = JSON.stringify({
      notification_source: 'twitch',
      source_username: req.body.source_username,
      source_id: user.id,
      channel_id: req.body.discord_channel,
      minimum_interval: req.body.interval,
      highlight_colour: req.body.highlight,
      message: req.body.message,
    });
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
      // The response has been received.
      if (source_res.statusCode !== 200) {
        res.status(source_res.statusCode).send({ message: source_res.message });
        return;
      }

      // Start listening for events for the new source
      addEvents(user.id);
      apiClient.eventSub.getSubscriptions().then((subs) => {
        console.log(`Subscription quota: ${subs.totalCost} / ${subs.maxTotalCost}`);
      });

      res.send();
    });
    source_req.write(data);
    source_req.end();
  });
});
app.delete('/remove', express.json(), async (req, res) => {
  console.log(
    'Received request to remove Twitch source:',
    req.body.source_username,
    'for channel',
    req.body.discord_channel
  );
  await waitfordb('http://database:8002');

  apiClient.users.getUserByName(req.body.source_username).then(async (user) => {
    const subscription = subs.find((element) => element.source === user.id);
    if (!subscription) {
      res.status(404).send({ message: 'Source not found' });
      return;
    }
    // Remove the destination from the database
    const options = {
      host: 'database',
      port: '8002',
      path: `/destination/${req.body.discord_channel}/${user.id}`,
      method: 'DELETE',
    };
    const delete_req = http.request(options, (destination_res) => {
      // The response has been received.
      if (destination_res.statusCode !== 200) {
        res.status(destination_res.statusCode).send({ message: destination_res.message });
        return;
      }

      // Stop listening for events for the removed source
      subscription.subscriptions.forEach((sub) => {
        sub.stop();
        subs.splice(subs.indexOf(subscription), 1);
      });

      // Log the current subscription quota
      apiClient.eventSub.getSubscriptions().then((subs) => {
        console.log(`Subscription quota: ${subs.totalCost} / ${subs.maxTotalCost}`);
      });

      res.send();
    });
    delete_req.end();
  });
});
app.get('/', async (req, res) => {
  await waitfordb('http://database:8002');
  res.status(200).send('OK');
});

// Load the secrets from Kubernetes mounted secrets
let secrets;
try {
  // In Kubernetes, secrets are mounted as individual files in a directory
  const secretsPath = '/etc/secrets';
  secrets = {
    clientId: fs.readFileSync(`${secretsPath}/client-id`, 'utf8').trim(),
    clientSecret: fs.readFileSync(`${secretsPath}/client-secret`, 'utf8').trim(),
    eventSubSecret: fs.readFileSync(`${secretsPath}/eventsub-secret`, 'utf8').trim(),
  };

  console.log('Secrets loaded successfully from Kubernetes');
} catch (err) {
  console.error('Failed to load secrets:', err.message);
  process.exit(1);
}

const authProvider = new AppTokenAuthProvider(secrets.clientId, secrets.clientSecret);
const apiClient = new ApiClient({ authProvider });

const twitchListener = new EventSubMiddleware({
  apiClient,
  hostName: 'dev.paintbot.net',
  pathPrefix: '/webhooks/twitch',
  secret: secrets.eventSubSecret,
});
twitchListener.apply(app);

const subs = [];

// Bind listener immediately; perform slower startup tasks asynchronously to avoid ingress routing to a closed port.
app.listen(8004, () => {
  console.log('Twitch is listening on port 8004');
  (async () => {
    try {
      await waitfordb('http://database:8002');
      console.log('Database is up');
      await twitchListener.markAsReady();
      await syncEventSubSubscriptions();
    } catch (e) {
      console.error('Post-listen startup task failed:', e.message);
    }
  })();
});

async function handleStreamOnline(event) {
  console.log(`Stream online: ${event.broadcasterId}`);

  // Get the source to check if they're online
  const sourceRes = await fetch(`http://database:8002/source/${event.broadcasterId}`);
  const source = await sourceRes.json();
  console.table(source);

  // If stream is already online, don't do anything
  if (source[0].is_online) {
    return;
  }

  // Get the list of destinations to post to
  const destinationRes = await fetch(
    `http://database:8002/destinations/source/${event.broadcasterId}`
  );
  const destinations = await destinationRes.json();
  console.table(destinations);

  // Get the last offline notification for the source
  const lastNotifRes = await fetch(
    `http://database:8002/notifications/history/${event.broadcasterId}/stream.offline`
  );
  const lastNotif = await lastNotifRes.json();
  console.table(lastNotif);

  // If there was a previous offline notification, check if it was within the minimum interval of any destination
  if (lastNotif[0]) {
    const now = new Date().getTime();
    const lastOffline = new Date(lastNotif[0].received_date).getTime();
    destinations.forEach((destination) => {
      // If the last offline notification was within the minumum interval of a destination, remove the destination from the list
      if (lastOffline + destination.minimum_interval * 60000 > now) {
        const index = destinations.indexOf(destination);
        if (index > -1) {
          destinations.splice(index, 1);
        }
      }
    });
  }

  // Create an object to POST to the Discord webhook
  const stream = await event.getStream();
  let game;
  if (stream) {
    game = await stream.getGame();
  }
  const user = await event.getBroadcaster();
  // Create an object to POST to the Discord webhook
  const embed_data = JSON.stringify({
    channelInfo: destinations.map(function (destination) {
      return {
        channelId: destination.channel_id,
        highlightColour: destination.highlight_colour,
        messageId: destination.last_message_id,
        notification_message: destination.notification_message,
      };
    }),
    embed: {
      title: stream.title || 'Untitled Broadcast',
      url: `https://www.twitch.tv/${event.broadcasterName}`,
      thumbnail: {
        url: game
          ? game.getBoxArtUrl(500, 700)
          : 'https://static-cdn.jtvnw.net/ttv-static/404_boxart.jpg',
      },
      author: {
        name: event.broadcasterDisplayName,
        iconUrl: user.profilePictureUrl,
        url: `https://www.twitch.tv/${event.broadcasterName}`,
      },
      fields: [
        {
          name: 'Game',
          value: stream.gameName || 'N/A',
        },
      ],
      image: {
        // Appending the date to force Discord to re-fetch the image for every change
        // Divided by 1000 to get seconds, reducing the number of characters in the URL
        url: `https://static-cdn.jtvnw.net/previews-ttv/live_user_${user.name}-1280x720.png?r=${Math.floor(new Date().getTime() / 1000)}`,
      },
    },
  });

  // An object of options to indicate where to post to
  const embed_options = {
    host: 'discord',
    port: '8001',
    path: '/embed/send',
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
        const lastMessage_data = JSON.stringify({
          messageId: element.messageId,
        });
        const lastMessage_options = {
          host: 'database',
          port: '8002',
          path: `/destinations/${element.channelId}/${event.broadcasterId}`,
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

  const online_options = {
    host: 'database',
    port: '8002',
    path: `/source/${event.broadcasterId}?isOnline=true`,
    method: 'PUT',
  };
  const online_req = http.request(online_options);
  try {
    online_req.end();
  } catch (error) {
    console.error(error);
  }

  // Add a row to the notification history
  addHistory(event.broadcasterId, 'stream.online');
}

async function handleStreamOffline(broadcasterId) {
  console.log(`Stream offline: ${broadcasterId}`);

  // Get the source to check if they're online
  const sourceRes = await fetch(`http://database:8002/source/${broadcasterId}`);
  const source = await sourceRes.json();
  console.table(source);

  // If stream is already offline, don't do anything to avoid bobble protection extending longer than necessary
  if (!source[0].is_online) {
    return;
  }

  const put_options = {
    host: 'database',
    port: '8002',
    path: `/source/${broadcasterId}?isOnline=false`,
    method: 'PUT',
  };
  const put_req = http.request(put_options);
  try {
    put_req.end();
  } catch (error) {
    console.error(error);
  }

  addHistory(broadcasterId, 'stream.offline');
}

async function handleChannelUpdate(event) {
  console.log(`Twitch channel updated: ${event.broadcasterId}`);

  // Get the last notification for the source
  const sourceRes = await fetch(`http://database:8002/source/${event.broadcasterId}`);
  const sources = await sourceRes.json();
  console.table(sources);

  if (sources[0].is_online) {
    // Get the list of destinations to post to
    const destinationRes = await fetch(
      `http://database:8002/destinations/source/${event.broadcasterId}`
    );
    const destinations = await destinationRes.json();
    console.table(destinations);

    const game = await event.getGame();
    const user = await event.getBroadcaster();
    // Create an object to POST to the Discord webhook
    const embed_data = JSON.stringify({
      channelInfo: destinations.map(function (destination) {
        return {
          channelId: destination.channel_id,
          highlightColour: destination.highlight_colour,
          messageId: destination.last_message_id,
          notification_message: destination.notification_message,
        };
      }),
      embed: {
        title: event.streamTitle || 'Untitled Broadcast',
        url: `https://www.twitch.tv/${event.broadcasterName}`,
        thumbnail: {
          url: game
            ? game.getBoxArtUrl(500, 700)
            : 'https://static-cdn.jtvnw.net/ttv-static/404_boxart.jpg',
        },
        author: {
          name: event.broadcasterDisplayName,
          iconUrl: user.profilePictureUrl,
          url: `https://www.twitch.tv/${event.broadcasterName}`,
        },
        fields: [
          {
            name: 'Game',
            value: event.categoryName || 'N/A',
          },
        ],
        image: {
          // Appending the date to force Discord to re-fetch the image for every change
          // Divided by 1000 to get seconds, reducing the number of characters in the URL
          url: `https://static-cdn.jtvnw.net/previews-ttv/live_user_${user.name}-1280x720.png?r=${Math.floor(new Date().getTime() / 1000)}`,
        },
      },
    });

    // An object of options to indicate where to post to
    const embed_options = {
      host: 'discord',
      port: '8001',
      path: '/embed/edit',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(embed_data),
      },
    };
    const embed_req = http.request(embed_options);
    embed_req.write(embed_data);
    embed_req.end();

    const online_options = {
      host: 'database',
      port: '8002',
      path: `/source/${event.broadcasterId}?isOnline=true`,
      method: 'PUT',
    };
    const online_req = http.request(online_options);
    try {
      online_req.end();
    } catch (error) {
      console.error(error);
    }
  }

  const eventInfo = {
    broadcasterId: event.broadcasterId,
    streamTitle: event.streamTitle,
    categoryId: event.categoryId,
    categoryName: event.categoryName,
    contentClassificationLabels: event.contentClassificationLabels,
  };
  addHistory(event.broadcasterId, 'channel.update', eventInfo);
}

function waitfordb(DBUrl, interval = 1500, attempts = 10) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  let count = 1;

  // eslint-disable-next-line no-async-promise-executor
  return new Promise(async (resolve, reject) => {
    while (count < attempts) {
      await sleep(interval);

      try {
        const response = await fetch(DBUrl);
        if (response.ok) {
          if (response.status === 200) {
            resolve();
            break;
          }
        } else {
          count++;
        }
      } catch {
        count++;
        console.log(`Database still down, trying ${count} of ${attempts}`);
      }
    }

    reject(new Error(`Database is down: ${count} attempts tried`));
  });
}

function addHistory(sourceId, notificationType, info = null) {
  const history_data = JSON.stringify({
    sourceId: sourceId,
    notificationType: notificationType,
    notificationInfo: info,
  });
  const history_options = {
    host: 'database',
    port: '8002',
    path: '/notifications/history',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(history_data),
    },
  };
  const history_req = http.request(history_options);
  history_req.write(history_data);
  history_req.end();
}

function addEvents(sourceId) {
  subs.push({
    source: sourceId,
    subscriptions: [
      twitchListener.onStreamOnline(sourceId, (e) => handleStreamOnline(e)),
      twitchListener.onStreamOffline(sourceId, (e) => handleStreamOffline(e.broadcasterId)),
      twitchListener.onChannelUpdate(sourceId, (e) => handleChannelUpdate(e)),
    ],
  });
}

async function syncEventSubSubscriptions() {
  // 1. Get all sources from your database
  const sourcesRes = await fetch('http://database:8002/sources/twitch');
  const sources = await sourcesRes.json();
  const sourceIds = sources.map((src) => src.source_id);
  console.table(sources);

  // 2. Get all current EventSub subscriptions from Twitch
  const twitchSubs = await apiClient.eventSub.getSubscriptions();
  console.table(
    twitchSubs.data.map((sub) => ({
      id: sub.id,
      type: sub.type,
      status: sub.status,
      cost: sub.cost,
      condition: sub.condition,
    }))
  );

  // 3. Remove subscriptions that are not in your source list
  for (const sub of twitchSubs.data) {
    // Check if the subscription's broadcasterId is in your sourceIds
    const broadcasterId = sub.condition?.broadcaster_user_id || sub.condition?.user_id;
    if (broadcasterId && !sourceIds.includes(broadcasterId)) {
      await sub.unsubscribe();
      console.log(`Removed stale EventSub subscription: ${sub.id}`);
    }
  }

  // 4. Add subscriptions for all sources to listener
  for (const sourceId of sourceIds) {
    addEvents(sourceId); // Your existing function to add subscriptions
    console.log(`Created EventSub subscription for source: ${sourceId}`);
    console.log(await subs[0].subscriptions[0].getCliTestCommand());
  }

  // 5. Log the current subscription quota
  apiClient.eventSub.getSubscriptions().then((quota) => {
    console.log(`Subscription quota: ${quota.totalCost} / ${quota.maxTotalCost}`);
  });
}
