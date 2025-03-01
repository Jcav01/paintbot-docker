import { AppTokenAuthProvider } from '@twurple/auth';
import { ApiClient } from '@twurple/api';
import { DirectConnectionAdapter, EventSubHttpListener } from '@twurple/eventsub-http';
import { NgrokAdapter } from '@twurple/eventsub-ngrok';
import * as fs from 'fs';
import * as http from 'http';
import express from 'express';
import * as url from 'whatwg-url';
const app = express();
// enable middleware to parse body of Content-type: application/json
app.use(express.json());

app.post('/add', async (req, res) => {
	console.log('Received request to add Twitch source:', req.body);
	await waitfordb('http://database:8002');

	let username;
	try {
		username = url.parseURL(req.body.source_url).path[0];
	} catch (error) {
		console.error(error);
		res.status(400).send({ message: 'Invalid source URL' });
		return;
	}
	apiClient.users.getUserByName(username).then(async user => {
		const data = JSON.stringify({
			notification_source: 'twitch',
			source_url: req.body.source_url,
			source_id: user.id,
			channel_id: req.body.discord_channel,
			source_id: user.id,
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
			apiClient.eventSub.getSubscriptions().then(subs => {
				console.log(`Subscription quota: ${subs.totalCost} / ${subs.maxTotalCost}`);
			});

			res.send();
		});
		source_req.write(data);
		source_req.end();
	});
});
app.delete('/remove', async (req, res) => {
	console.log('Received request to remove Twitch source:', req.body.source_url, 'for channel', req.body.discord_channel);
	await waitfordb('http://database:8002');

	let username;
	try {
		username = url.parseURL(req.body.source_url).path[0];
	} catch (error) {
		console.error(error);
		res.status(400).send({ message: 'Invalid source URL' });
		return;
	}
	apiClient.users.getUserByName(username).then(async user => {
		const subscription = subs.find(element => element.source === user.id);
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
			subscription.subscriptions.forEach(sub => {
				sub.stop();
				subs.splice(subs.indexOf(subscription), 1);
			});

			res.send();
		});
		delete_req.end();
	});
});
app.listen(8004, () => {
	console.log('Twitch is listening on port 8004');
});


// Load the secrets from the secrets file
const secrets = JSON.parse(fs.readFileSync('/run/secrets/twitch-secrets', function (err) {
	if (err) {
		throw err;
	}
}));

const authProvider = new AppTokenAuthProvider(secrets.clientId, secrets.clientSecret);
const apiClient = new ApiClient({ authProvider });

try {
	await waitfordb('http://database:8002');
	console.log('Database is up');
}
catch (err) {
	console.log(err.message);
}

// Get the list of sources from the database
const sourcesRes = await fetch('http://database:8002/sources/twitch');
const sources = await sourcesRes.json();
console.table(sources);

let subs = [];
const twitchListener = await startListener();

// Ensure any changes to the sources are reflected in the listener
sources.forEach(element => addEvents(element.source_id));

async function startListener() {
	const listener = await buildListener();
	listener.start();
	return listener;
}

async function buildListener() {
	const env = process.env.NODE_ENV || 'development';
	console.log(`Environment: ${env}`);
	switch (env) {
		case 'development':
			return new EventSubHttpListener({
				apiClient,
				adapter: new NgrokAdapter({
					ngrokConfig: {
						authtoken_from_env: true,
						domain: 'weasel-ideal-evenly.ngrok-free.app',
					},
				}),
				secret: secrets.eventSubSecret,
			});
		case 'production':
			return new EventSubHttpListener({
				apiClient,
				adapter: new DirectConnectionAdapter({
					hostName: 'example.com',
					sslCert: {
						key: 'aaaaaaaaaaaaaaa',
						cert: 'bbbbbbbbbbbbbbb',
					},
				}),
				secret: secrets.eventSubSecret,
			});
	}
}

async function handleStreamOnline(broadcasterId) {
	console.log(`Stream online: ${broadcasterId}`);

	// Get the source to check if they're online
	const sourceRes = await fetch(`http://database:8002/source/${broadcasterId}`);
	const source = await sourceRes.json();
	console.table(source);

	// If stream is already online, don't do anything
	if (source[0].is_online) {
		return;
	}

	// Get the list of destinations to post to
	const destinationRes = await fetch(`http://database:8002/destinations/source/${broadcasterId}`);
	const destinations = await destinationRes.json();
	console.table(destinations);

	// Get the last offline notification for the source
	const lastNotifRes = await fetch(`http://database:8002/notifications/history/${broadcasterId}/stream.offline`);
	const lastNotif = await lastNotifRes.json();
	console.table(lastNotif);

	// If there was a previous offline notification, check if it was within the minimum interval of any destination
	if (lastNotif[0]) {
		const now = new Date().getTime();
		const lastOffline = new Date(lastNotif[0].received_date).getTime();
		destinations.forEach(destination => {
			// If the last offline notification was within the minumum interval of a destination, remove the destination from the list
			if (lastOffline + (destination.minimum_interval * 60000) > now) {
				const index = destinations.indexOf(destination);
				if (index > -1) {
					destinations.splice(index, 1);
				}
			}
		});
	}

	// Create an object to POST to the Discord webhook
	const embed_data = JSON.stringify({
		channelInfo: destinations.map(function (destination) { return { channelId: destination.channel_id, highlightColour: destination.highlight_colour, notification_message: destination.notification_message }; }),
		embed: await formatEmbed(broadcasterId),
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
			result.forEach(element => {
				const lastMessage_data = JSON.stringify({ messageId: element.messageId });
				const lastMessage_options = {
					host: 'database',
					port: '8002',
					path: `/destinations/${element.channelId}/${broadcasterId}`,
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
				}
				catch (error) {
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
		path: `/source/${broadcasterId}?isOnline=true`,
		method: 'PUT',
	};
	const online_req = http.request(online_options);
	try {
		online_req.end();
	}
	catch (error) {
		console.error(error);
	}

	// Add a row to the notification history
	addHistory(broadcasterId, 'stream.online');
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
	}
	catch (error) {
		console.error(error);
	}

	addHistory(broadcasterId, 'stream.offline');
}

async function handleChannelUpdate(broadcasterId) {
	console.log(`Twitch channel updated: ${broadcasterId}`);

	// Get the last notification for the source
	const lastNotifRes = await fetch(`http://database:8002/notifications/history/${broadcasterId}`);
	const lastNotif = await lastNotifRes.json();
	console.table(lastNotif);

	if (lastNotif[0].notification_type === 'stream.online') {
		// Get the list of destinations to post to
		const destinationRes = await fetch(`http://database:8002/destinations/source/${broadcasterId}`);
		const destinations = await destinationRes.json();
		console.table(destinations);

		// Create an object to POST to the Discord webhook
		const embed_data = JSON.stringify({
			channelInfo: destinations.map(function (destination) { return { channelId: destination.channel_id, highlightColour: destination.highlight_colour, messageId: destination.last_message_id, notification_message: destination.notification_message }; }),
			embed: await formatEmbed(broadcasterId),
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
			path: `/source/${broadcasterId}?isOnline=true`,
			method: 'PUT',
		};
		const online_req = http.request(online_options);
		try {
			online_req.end();
		}
		catch (error) {
			console.error(error);
		}
	}

	addHistory(broadcasterId, 'channel.update');
}

function waitfordb(DBUrl, interval = 1500, attempts = 10) {
	const sleep = ms => new Promise(r => setTimeout(r, ms));

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
				}
				else {
					count++;
				}
			}
			catch {
				count++;
				console.log(`Database still down, trying ${count} of ${attempts}`);
			}
		}

		reject(new Error(`Database is down: ${count} attempts tried`));
	});
}

function addHistory(sourceId, notificationType) {
	const history_data = JSON.stringify({
		sourceId: sourceId,
		notificationType: notificationType,
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
	subs.push({source: sourceId, subscriptions: [twitchListener.onStreamOnline(sourceId, e => handleStreamOnline(e.broadcasterId)),
	twitchListener.onStreamOffline(sourceId, e => handleStreamOffline(e.broadcasterId)),
	twitchListener.onChannelUpdate(sourceId, e => handleChannelUpdate(e.broadcasterId))]});
}

async function formatEmbed(broadcasterId) {
	const user = await apiClient.users.getUserById(broadcasterId);
	const channel = await apiClient.channels.getChannelInfoById(broadcasterId);

	// Set default values for the game box art and game name
	let gameBoxArtUrl = 'https://static-cdn.jtvnw.net/ttv-static/404_boxart.jpg';
	let gameName = 'N/A';

	// If the channel has a category/game set, get the game information, and update the game box art and game name
	if (channel && channel.gameId) {
		const game = await apiClient.games.getGameById(channel.gameId);
		gameBoxArtUrl = game ? game.getBoxArtUrl(500, 700) : gameBoxArtUrl;
		gameName = game ? game.name : gameName;
	}
	return {
		title: channel.title || 'Untitled Broadcast',
		url: `https://www.twitch.tv/${user.name}`,
		thumbnail: {
			url: gameBoxArtUrl,
		},
		author: {
			name: user.displayName,
			iconUrl: user.profilePictureUrl,
			url: `https://www.twitch.tv/${user.name}`,
		},
		fields: [
			{
				name: 'Game',
				value: gameName,
			},
		],
		image: {
			// Appending the date is a hack to force Discord to re-fetch the image every time
			// Divided by 1000 to get seconds, reducing the number of characters in the URL
			url: `https://static-cdn.jtvnw.net/previews-ttv/live_user_${user.name}-1280x720.png?r=${Math.floor(new Date().getTime() / 1000)}`,
		},
	};
}

// async function removeEvents(sourceId) {
// 	const allSubs = await apiClient.eventSub.getSubscriptions();
// 	const subs = allSubs.data.filter(sub => sub.condition.broadcaster_user_id === sourceId);
// 	subs.forEach(sub => apiClient.eventSub.deleteSubscription(sub.id));
// }