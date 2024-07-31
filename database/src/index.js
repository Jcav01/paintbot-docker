import * as db from './db/index.js';
import express from 'express';
const app = express();
// enable middleware to parse body of Content-type: application/json
app.use(express.json());

// Get list of notification types for a specific notification source
app.get('/notifications/types/:notificationSource', async (req, res) => {
	console.log('Received request to get notification types for source:', req.params.notificationSource);
	const result = await db.query('SELECT * FROM notification_types WHERE notification_source = $1', [req.params.notificationSource]);
	res.json(result.rows);
});

// Get a list of sources for a specific notification source
app.get('/sources/:notificationSource', async (req, res) => {
	console.log('Received request to get sources for:', req.params.notificationSource);
	const result = await db.query('SELECT * FROM sources WHERE notification_source = $1', [req.params.notificationSource]);
	res.json(result.rows);
});

app.get('/notifications/history/:source', async (req, res) => {
	console.log('Received request to get notification history for:', req.params.source);
	const result = await db.query('SELECT * FROM past_notifications WHERE source_id = $1', [req.params.source]);
	res.json(result.rows);
});

app.get('/destinations/source/:source', async (req, res) => {
	console.log('Received request to get destinations for:', req.params.source);
	const result = await db.query('SELECT * FROM destinations WHERE source_id = $1', [req.params.source]);
	res.json(result.rows);
});

app.get('/destinations/channel/:channel', async (req, res) => {
	console.log('Received request to get destinations for:', req.params.channel);
	const result = await db.query('SELECT * FROM destinations INNER JOIN sources ON destinations.source_id = sources.channel_id WHERE destinations.channel_id = $1', [req.params.channel]);
	res.json(result.rows);
});

app.listen(8002, () => {
	console.log('Database is listening on port 8002');
});