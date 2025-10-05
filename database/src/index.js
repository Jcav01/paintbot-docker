import * as db from './db/index.js';
import express from 'express';
const app = express();

// Simple async error wrapper to avoid repetitive try/catch blocks.
// Ensures unhandled errors return a 500 and are logged consistently.
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch((err) => {
    console.error('Unhandled route error:', err);
    if (!res.headersSent) {
      res.status(500).send({ message: 'Internal server error' });
    }
  });
// enable middleware to parse body of Content-type: application/json
app.use(express.json());

// Basic health endpoint used by Kubernetes probes
app.get(
  '/',
  asyncHandler(async (req, res) => {
    res.sendStatus(200);
  })
);

// Get a list of sources for a specific notification source
app.get(
  '/sources/:notificationSource',
  asyncHandler(async (req, res) => {
    console.log('Received request to get sources for:', req.params.notificationSource);
    const result = await db.query('SELECT * FROM sources WHERE notification_source = $1', [
      req.params.notificationSource,
    ]);
    res.json(result.rows);
  })
);

app
  .route('/source/:source')
  .get(
    asyncHandler(async (req, res) => {
      console.log('Received request to get source ID:', req.params.source);
      const result = await db.query('SELECT * FROM sources WHERE source_id = $1', [
        req.params.source,
      ]);
      res.json(result.rows);
    })
  )
  .put(
    asyncHandler(async (req, res) => {
      console.log(
        'Received request to set is_online for',
        req.params.source,
        'to',
        req.query.isOnline
      );
      await db.query('UPDATE sources SET is_online = $2 WHERE source_id = $1', [
        req.params.source,
        req.query.isOnline,
      ]);
      res.send();
    })
  )
  .delete(
    asyncHandler(async (req, res) => {
      console.log('Received request to delete source', req.params.source);
      await db.query('UPDATE sources SET is_online = $2 WHERE source_id = $1', [
        req.params.source,
        req.query.isOnline,
      ]);
      res.send();
    })
  );

app.post(
  '/source',
  asyncHandler(async (req, res) => {
    console.log('Received request to add source:', req.body.source_id);
    const result = await db.query(
      'INSERT INTO sources (source_id, notification_source, source_username) VALUES($1, $2, $3) RETURNING source_id',
      [req.body.source_id, req.body.notification_source, req.body.source_username]
    );
    res.json(result.rows);
  })
);

// Get list of notification types for a specific notification source
app.get(
  '/notifications/types/:notificationSource',
  asyncHandler(async (req, res) => {
    console.log(
      'Received request to get notification types for source:',
      req.params.notificationSource
    );
    const result = await db.query(
      'SELECT * FROM notification_types WHERE notification_source = $1',
      [req.params.notificationSource]
    );
    res.json(result.rows);
  })
);

app.post(
  '/notifications/history',
  asyncHandler(async (req, res) => {
    console.log('Received request to add record to notification history');
    const result = await db.query(
      'INSERT INTO past_notifications (source_id, notification_type, notification_info) VALUES($1, $2, $3)',
      [req.body.sourceId, req.body.notificationType, req.body.notificationInfo]
    );
    res.json(result.rows);
  })
);

app.get(
  '/notifications/history/info',
  asyncHandler(async (req, res) => {
    console.log(
      'Received request to last notification based on notification info:',
      req.query.search
    );
    // Use jsonb containment operator; cast parameter explicitly to jsonb
    const result = await db.query(
      'SELECT * FROM past_notifications WHERE notification_info @> $1::jsonb ORDER BY received_date DESC LIMIT 1',
      [req.query.search]
    );
    res.json(result.rows);
  })
);

app.get(
  '/notifications/history/:source',
  asyncHandler(async (req, res) => {
    console.log('Received request to get last notification for:', req.params.source);
    const result = await db.query(
      'SELECT * FROM past_notifications WHERE source_id = $1 ORDER BY received_date DESC LIMIT 1',
      [req.params.source]
    );
    res.json(result.rows);
  })
);

app.get(
  '/notifications/history/:source/:type',
  asyncHandler(async (req, res) => {
    console.log(
      'Received request to get last notification for:',
      req.params.source,
      req.params.type
    );
    const result = await db.query(
      'SELECT * FROM past_notifications WHERE source_id = $1 AND notification_type = $2 ORDER BY received_date DESC LIMIT 1',
      [req.params.source, req.params.type]
    );
    res.json(result.rows);
  })
);

app.get(
  '/destinations/source/:source',
  asyncHandler(async (req, res) => {
    console.log('Received request to get destinations for:', req.params.source);
    const result = await db.query(
      'SELECT * FROM destinations INNER JOIN sources ON destinations.source_id = sources.source_id WHERE destinations.source_id = $1',
      [req.params.source]
    );
    res.json(result.rows);
  })
);

app.get(
  '/destinations/channel/:channel',
  asyncHandler(async (req, res) => {
    console.log('Received request to get destinations for:', req.params.channel);
    const result = await db.query(
      'SELECT * FROM destinations INNER JOIN sources ON destinations.source_id = sources.source_id WHERE destinations.channel_id = $1',
      [req.params.channel]
    );
    res.json(result.rows);
  })
);

app.put(
  '/destinations/:destination/:source',
  asyncHandler(async (req, res) => {
    console.log('Received request to update last message for destination:', req.params.destination);
    const result = await db.query(
      'UPDATE destinations SET last_message_id = $1 WHERE channel_id = $2 AND source_id = $3',
      [req.body.messageId, req.params.destination, req.params.source]
    );
    res.json(result.rows);
  })
);

app.post(
  '/destination',
  asyncHandler(async (req, res) => {
    console.log(
      'Received request to add destination:',
      req.body.channel_id,
      'for source:',
      req.body.source_id
    );
    const source = await db.query('SELECT * FROM sources WHERE source_id = $1', [
      req.body.source_id,
    ]);
    let result;
    if (source.rows.length === 0) {
      const client = await db.getClient();
      try {
        await client.query('BEGIN');
        await client.query(
          'INSERT INTO sources (source_id, notification_source, source_username) VALUES($1, $2, $3)',
          [req.body.source_id, req.body.notification_source, req.body.source_username]
        );
        result = await client.query(
          'INSERT INTO destinations (channel_id, source_id, minimum_interval, highlight_colour, notification_message) VALUES($1, $2, $3, $4, $5) RETURNING channel_id',
          [
            req.body.channel_id,
            req.body.source_id,
            req.body.minimum_interval,
            req.body.highlight_colour,
            req.body.message,
          ]
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        console.log('Error adding destination:', error);
        return res
          .status(500)
          .send({ message: 'Unable to add destination! No changes were made.' });
      } finally {
        client.release();
      }
    } else {
      try {
        result = await db.query(
          'INSERT INTO destinations (channel_id, source_id, minimum_interval, highlight_colour) VALUES($1, $2, $3, $4) RETURNING channel_id',
          [
            req.body.channel_id,
            req.body.source_id,
            req.body.minimum_interval,
            req.body.highlight_colour,
          ]
        );
      } catch {
        return res
          .status(500)
          .send({ message: 'Unable to add destination! No changes were made.' });
      }
    }
    res.json(result.rows);
  })
);

app.delete(
  '/destination/:destination/:source',
  asyncHandler(async (req, res) => {
    console.log(
      'Received request to remove destination:',
      req.params.destination,
      'for source:',
      req.params.source
    );
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM destinations WHERE channel_id = $1 AND source_id = $2', [
        req.params.destination,
        req.params.source,
      ]);
      const count = await client.query('SELECT COUNT(*) FROM destinations WHERE source_id = $1', [
        req.params.source,
      ]);
      if (count.rows[0].count == 0) {
        await client.query('DELETE FROM sources WHERE source_id = $1', [req.params.source]);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      console.log('Error deleting destination:', error);
      return res
        .status(500)
        .send({ message: 'Unable to delete destination! No changes were made.' });
    } finally {
      client.release();
    }
    res.send();
  })
);

app.get(
  '/notifications/history/types/:videoId',
  asyncHandler(async (req, res) => {
    console.log('Received request to get notification types for video:', req.params.videoId);
    const result = await db.query(
      "SELECT notification_type FROM past_notifications WHERE notification_info->>'id' = $1",
      [req.params.videoId]
    );
    res.json(result.rows.map((r) => r.notification_type));
  })
);

app.post(
  '/notifications/history/claim',
  asyncHandler(async (req, res) => {
    // body: { sourceId, notificationType, notificationInfo }
    console.log(
      'Received request to claim notification stage:',
      req.body.notificationType,
      'for video id:',
      req.body.notificationInfo && JSON.parse(req.body.notificationInfo).id
    );
    const result = await db.query(
      `INSERT INTO past_notifications (source_id, notification_type, notification_info)
		 VALUES ($1, $2, $3)
		 ON CONFLICT ((notification_info->>'id'), notification_type) DO NOTHING
		 RETURNING notification_type`,
      [req.body.sourceId, req.body.notificationType, req.body.notificationInfo]
    );
    res.json({ inserted: result.rowCount === 1 });
  })
);

app.get(
  '/servers',
  asyncHandler(async (req, res) => {
    console.log('Received request to get servers');
    const result = await db.query('SELECT server_id FROM servers');
    res.json(result.rows);
  })
);

app.listen(8002, () => {
  console.log('Database is listening on port 8002');
});
