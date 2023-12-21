import { AppTokenAuthProvider } from '@twurple/auth';
import { ApiClient } from '@twurple/api';
import { DirectConnectionAdapter, EventSubHttpListener } from '@twurple/eventsub-http';
import { NgrokAdapter } from '@twurple/eventsub-ngrok';
import * as fs from 'fs';

const secrets = JSON.parse(fs.readFileSync('/run/secrets/twitch-secrets.json', function(err) {
	if (err) {
		throw err;
	}
}));

const twitchListener = await startListener();
const onlineSubscription = twitchListener.onStreamOnline(484202258, e => {
	console.log(`${e.broadcasterDisplayName} just went live!`);
});
console.log(await onlineSubscription.getCliTestCommand());

async function startListener() {
	const listener = await buildListener();
	listener.start();
	return listener;
}

async function buildListener() {
	const authProvider = new AppTokenAuthProvider(secrets.clientId, secrets.clientSecret);
	const apiClient = new ApiClient({ authProvider });

	const env = process.env.NODE_ENV || 'development';
	console.log(`Environment: ${env}`);
	switch (env) {
	case 'development':
		// This is necessary to prevent conflict errors resulting from ngrok assigning a new host name every time
		await apiClient.eventSub.deleteAllSubscriptions();

		return new EventSubHttpListener({
			apiClient,
			adapter: new NgrokAdapter(),
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