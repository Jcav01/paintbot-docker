import { AppTokenAuthProvider } from '@twurple/auth';
import { ApiClient } from '@twurple/api';
import { DirectConnectionAdapter, EventSubHttpListener } from '@twurple/eventsub-http';
import { NgrokAdapter } from '@twurple/eventsub-ngrok';
import * as fs from 'fs';
import * as http from 'http';

// Load the secrets from the secrets file
const secrets = JSON.parse(fs.readFileSync('/run/secrets/twitch-secrets.json', function(err) {
	if (err) {
		throw err;
	}
}));

const authProvider = new AppTokenAuthProvider(secrets.clientId, secrets.clientSecret);
const apiClient = new ApiClient({ authProvider });

try {
	const url = 'http://database:8002';
	await waitfordb(url);
	console.log(`Database is up: ${url}`);
}
catch (err) {
	console.log(err.message);
}

// Get the list of destinations from the database
const sourceRes = await fetch('http://database:8002/sources/twitch');
const sources = await sourceRes.json();
console.table(sources);

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
	const user = await apiClient.users.getUserById(broadcasterId);
	const channel = await apiClient.channels.getChannelInfoById(broadcasterId);

	// Get the list of destinations to post to
	const destinationRes = await fetch(`http://database:8002/destinations/source/${broadcasterId}`);
	const destinations = await destinationRes.json();
	console.table(destinations);

	// Set default values for the game box art and game name
	let gameBoxArtUrl = 'https://static-cdn.jtvnw.net/ttv-static/404_boxart.jpg';
	let gameName = 'N/A';

	// If the channel has a category/game set, get the game information, and update the game box art and game name
	if (channel && channel.gameId) {
		const game = await apiClient.games.getGameById(channel.gameId);
		gameBoxArtUrl = game ? game.getBoxArtUrl(500, 700) : gameBoxArtUrl;
		gameName = game ? game.name : gameName;
	}

	// Create an object to POST to the Discord webhook
	const post_data = JSON.stringify({
		channelInfo: destinations.map(function(destination) {return { channelId: destination.channel_id, highlightColour: destination.highlight_colour };}),
		embed: {
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
				url: `https://static-cdn.jtvnw.net/previews-ttv/live_user_${user.name}-1280x720.png?r=${Math.floor(new Date().getTime() / 1000)}`,
			},
		},
	});

	// An object of options to indicate where to post to
	const post_options = {
		host: 'discord',
		port: '8001',
		path: '/embed/send',
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Content-Length': Buffer.byteLength(post_data),
		},
	};
	const post_req = http.request(post_options, (res) => {
		res.on('data', function(chunk) {
			console.log('Response: ' + chunk);
		});
	});
	post_req.write(post_data);
	post_req.end();

	const put_options = {
		host: 'database',
		port: '8002',
		path: `/source/${broadcasterId}?isOnline=true`,
		method: 'PUT',
	};
	const put_req = http.request(put_options);
	try {
		put_req.end();
	}
	catch (error) {
		console.error(error);
	}
}

async function handleStreamOffline(broadcasterId) {
	console.log(`Stream offline: ${broadcasterId}`);

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
}

async function handleChannelUpdate(broadcasterId) {
	console.log(`Stream online: ${broadcasterId}`);
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

	// Create an object to POST to the Discord webhook
	const post_data = JSON.stringify({
		channelId: '598322322310430732',
		embed: {
			title: channel.title || 'Untitled Broadcast',
			url: `https://www.twitch.tv/${user.name}`,
			thumbnail: {
				url: gameBoxArtUrl,
			},
			color: 0x0099FF,
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
				url: `https://static-cdn.jtvnw.net/previews-ttv/live_user_${user.name}-1280x720.png?r=${Math.floor(new Date().getTime() / 1000)}`,
			},
		},
	});

	// An object of options to indicate where to post to
	const post_options = {
		host: 'discord',
		port: '8001',
		path: '/embed/send',
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Content-Length': Buffer.byteLength(post_data),
		},
	};

	// Set up the request
	const post_req = http.request(post_options, (res) => {
		res.on('data', function(chunk) {
			console.log('Response: ' + chunk);
		});
	});

	// Post the data
	post_req.write(post_data);
	post_req.end();
}

function waitfordb(url, interval = 1500, attempts = 10) {
	const sleep = ms => new Promise(r => setTimeout(r, ms));

	let count = 1;

	// eslint-disable-next-line no-async-promise-executor
	return new Promise(async (resolve, reject) => {
		while (count < attempts) {
			await sleep(interval);

			try {
				const response = await fetch(url);
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

function addEvents(sourceId) {
	twitchListener.onStreamOnline(sourceId, e => handleStreamOnline(e.broadcasterId));
	twitchListener.onStreamOffline(sourceId, e => handleStreamOffline(e.broadcasterId));
	twitchListener.onChannelUpdate(sourceId, e => handleChannelUpdate(e.broadcasterId));
}

async function removeEvents(sourceId) {
	const allSubs = await apiClient.eventSub.getSubscriptions();
	const subs = allSubs.data.filter(sub => sub.condition.broadcaster_user_id === sourceId);
	subs.forEach(sub => apiClient.eventSub.deleteSubscription(sub.id));
}