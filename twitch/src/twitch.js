import { AppTokenAuthProvider } from '@twurple/auth';
import { ApiClient } from '@twurple/api';
import { DirectConnectionAdapter, EventSubHttpListener } from '@twurple/eventsub-http';
import { NgrokAdapter } from '@twurple/eventsub-ngrok';
import * as fs from 'fs';

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
	const { clientId, clientSecret } = await readSecrets();
	const authProvider = new AppTokenAuthProvider(clientId, clientSecret);
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

async function readSecrets() {
	let clientId = '';
	let clientSecret = '';
	clientId = fs.readFileSync('/run/secrets/twitch-client-id', function(err) {
		if (err) {
			throw err;
		}
	}).toString();
	clientSecret = fs.readFileSync('/run/secrets/twitch-client-secret', function(err) {
		if (err) {
			throw err;
		}
	}).toString();
	return { clientId, clientSecret };
}