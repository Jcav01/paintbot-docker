import pg from 'pg';
import { Connector } from '@google-cloud/cloud-sql-connector';
import * as fs from 'fs';
const { Pool } = pg;

// Load the secrets from the secrets file
const secrets = JSON.parse(fs.readFileSync('/run/secrets/database-secrets.json', function(err) {
	if (err) {
		throw err;
	}
}));

const connector = new Connector();
const clientOpts = await connector.getOptions({
	instanceConnectionName: secrets.instanceConnectionName,
	ipType: 'PUBLIC',
});
const pool = new Pool({
	...clientOpts,
	user: secrets.user,
	password: secrets.password,
	database: secrets.databaseName,
	max: 5,
});
export const query = async (text, params) => {
	const start = Date.now();
	const res = await pool.query(text, params);
	const duration = Date.now() - start;
	console.log('executed query', { text, duration, rows: res.rowCount });
	return res;
};

export const getClient = async () => {
	const client = await pool.connect();
	const clientQuery = client.query;
	const release = client.release;
	// set a timeout of 5 seconds, after which we will log this client's last query
	const timeout = setTimeout(() => {
		console.error('A client has been checked out for more than 5 seconds!');
		console.error(`The last executed query on this client was: ${client.lastQuery}`);
	}, 5000);
	// monkey patch the query method to keep track of the last query executed
	client.query = (...args) => {
		client.lastQuery = args;
		return clientQuery.apply(client, args);
	};
	client.release = () => {
		// clear our timeout
		clearTimeout(timeout);
		// set the methods back to their old un-monkey-patched version
		client.query = query;
		client.release = release;
		return release.apply(client);
	};
	return client;
};