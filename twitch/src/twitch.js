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

const twitchListener = await startListener();
const userId = 484202258;
const onlineSubscription = twitchListener.onStreamOnline(userId, e => {
	handleStreamOnline(e.broadcasterId);
});
console.log(await onlineSubscription.getCliTestCommand());

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
		// This is necessary to prevent conflict errors resulting from ngrok assigning a new host name every time
		// await apiClient.eventSub.deleteAllSubscriptions();
		return new EventSubHttpListener({
			apiClient,
			adapter: new NgrokAdapter({
				ngrokConfig: {
					authtoken_from_env: true,
					domain: 'weasel-ideal-evenly.ngrok-free.app',
				},
			}),
			secret: '70579801-ad5c-4552-a1d2-23253272ecb0',
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
			secret: '70579801-ad5c-4552-a1d2-23253272ecb0',
		});
	}
}

async function handleStreamOnline(broadcasterId) {
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
			title: channel.title,
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