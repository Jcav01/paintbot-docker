import * as db from './db/index.js';
import express from 'express';
const app = express();
// enable middleware to parse body of Content-type: application/json
app.use(express.json());

// Get list of notification types for a specific notification source
app.get('', async (req, res) => {
	res.sendStatus(200);
});

// Get a list of sources for a specific notification source
app.get('/sources/:notificationSource', async (req, res) => {
	console.log('Received request to get sources for:', req.params.notificationSource);
	const result = await db.query('SELECT * FROM sources WHERE notification_source = $1', [req.params.notificationSource]);
	res.json(result.rows);
});

app.route('/source/:source')
	.get(async (req, res) => {
		console.log('Received request to get source ID:', req.params.source);
		const result = await db.query('SELECT * FROM sources WHERE source_id = $1', [req.params.channel]);
		res.json(result.rows);
	})
	.put(async (req, res) => {
		console.log('Received request to set is_online for', req.params.source, 'to', req.query.isOnline);
		await db.query('UPDATE sources SET is_online = $2 WHERE source_id = $1', [req.params.source, req.query.isOnline]);
		res.send();
	});

// Get list of notification types for a specific notification source
app.get('/notifications/types/:notificationSource', async (req, res) => {
	console.log('Received request to get notification types for source:', req.params.notificationSource);
	const result = await db.query('SELECT * FROM notification_types WHERE notification_source = $1', [req.params.notificationSource]);
	res.json(result.rows);
});

app.get('/notifications/history/:source', async (req, res) => {
	console.log('Received request to get last notification for:', req.params.source);
	const result = await db.query('SELECT * FROM past_notifications WHERE source_id = $1 ORDER BY received_date DESC LIMIT 1', [req.params.source]);
	res.json(result.rows);
});

app.post('/notifications/history', async (req, res) => {
	console.log('Received request to add record to notification history');
	const result = await db.query('INSERT INTO past_notifications (source_id, notification_type) VALUES($1, $2)', [req.body.sourceId, req.body.notificationType]);
	res.json(result.rows);
});

app.get('/destinations/source/:source', async (req, res) => {
	console.log('Received request to get destinations for:', req.params.source);
	const result = await db.query('SELECT * FROM destinations INNER JOIN sources ON destinations.source_id = sources.source_id WHERE destinations.source_id = $1', [req.params.source]);
	res.json(result.rows);
});

app.get('/destinations/channel/:channel', async (req, res) => {
	console.log('Received request to get destinations for:', req.params.channel);
	const result = await db.query('SELECT * FROM destinations INNER JOIN sources ON destinations.source_id = sources.source_id WHERE destinations.channel_id = $1', [req.params.channel]);
	res.json(result.rows);
});

app.put('/destinations/:destination/:source', async (req, res) => {
	console.log('Received request to update last message for destination:', req.params.destination);
	const result = await db.query('UPDATE destinations SET last_message_id = $1 WHERE channel_id = $2 AND source_id = $3', [req.body.messageId, req.params.destination, req.params.source]);
	res.json(result.rows);
});

app.listen(8002, () => {
	console.log('Database is listening on port 8002');
});