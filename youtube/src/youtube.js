import { youtube_v3 } from '@googleapis/youtube';
import { parseFeed } from '@rowanmanning/feed-parser';
import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import express from 'express';
const app = express();

// In Kubernetes, secrets are mounted as individual files in a directory
const secretsPath = '/etc/secrets';
const youtube = new youtube_v3.Youtube({
	// TODO: Switch to service account to remove need for referer
	auth: fs.readFileSync(`${secretsPath}/youtube-api-key`, 'utf8').trim(),
	headers: {
		referer: 'https://dev.paintbot.net'
	}
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
				source_res.on('data', c => (body += c));
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

		setupYouTubeNotification({ source_id: user.id })
			.then(() => console.log('Requested WebSub subscription for', user.id))
			.catch(err => console.error('Failed to request WebSub subscription:', err));

		return res.send();
	} catch (err) {
		console.error('YouTube /add failed:', err.message);
		if (!res.headersSent) {
			return res.status(500).send({ message: 'Internal server error' });
		}
	}
});
app.delete('/remove', express.json(), async (req, res) => {
	console.log('Received request to remove Youtube source:', req.body.source_username, 'for channel', req.body.discord_channel);
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

		await new Promise((resolve, reject) => {
			const options = {
				host: 'database',
				port: '8002',
				path: `/destination/${req.body.discord_channel}/${user.id}`,
				method: 'DELETE',
			};
			const delete_req = http.request(options, (destination_res) => {
				let body = '';
				destination_res.on('data', c => (body += c));
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
app.get('/', (req, res) => {
	res.status(200).send('OK');
});
// Respond to WebSub verification challenges from YouTube's hub
app.route('/webhooks/youtube')
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
	.post(async (req, res) => {
		console.log('YouTube WebSub notification:', req.body);
		const notif = parseFeed(req.body);
		console.log('YouTube WebSub notification:', notif);
		if (notif) {
			const sourcesRes = await fetch('http://database:8002/sources/youtube');
			const sources = await sourcesRes.json();
			const sourceIds = sources.map(src => src.source_id);
			addHistory(sourceIds[0], "yt.none", notif);
		}
		return res.sendStatus(200);
	});

try {
	await waitfordb('http://database:8002');
	console.log('Database is up');
}
catch (err) {
	console.log(err.message);
}
let subs = [];

app.listen(8005, async () => {
	console.log('YouTube is listening on port 8005');
	// Kick off sync to ensure (re)subscriptions
	try { await syncEventSubSubscriptions(); } catch (e) { console.error('YouTube sync failed:', e.message); }
});




async function setupYouTubeNotification(source_id) {
	// Build WebSub form data (must be x-www-form-urlencoded)
	const hub = {
		'hub.callback': 'https://dev.paintbot.net/webhooks/youtube',
		'hub.mode': 'subscribe',
		'hub.verify': 'async',
		'hub.topic': `https://www.youtube.com/xml/feeds/videos.xml?channel_id=${source_id}`,
		// Optional verification/secret fields; leave empty or wire to a secret to validate signatures
		'hub.verify_token': '',
		// 'hub.secret': '<your-shared-secret>',
		'hub.lease_seconds': 864000, // 10 days
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
		const req = https.request(reqOptions, res => {
			let data = '';
			res.on('data', chunk => (data += chunk));
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

async function syncEventSubSubscriptions() {
	// 1. Get all sources from your database
	const sourcesRes = await fetch('http://database:8002/sources/youtube');
	const sources = await sourcesRes.json();
	const sourceIds = sources.map(src => src.source_id);
	console.table(sources);

	// 2. Setup WebSub notifications for each source
	sourceIds.forEach(source_id => {
		setupYouTubeNotification(source_id);
	});

	// 3. Setup automatic re-subscription for all sources
	setInterval(() => {
		sourceIds.forEach(source_id => {
			setupYouTubeNotification(source_id);
		});
	}, 777600000); // 9 days rather than 10, to allow for potential downtime or other issues
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