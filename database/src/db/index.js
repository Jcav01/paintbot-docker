import pg from 'pg';
import { Connector } from '@google-cloud/cloud-sql-connector';
const { Pool } = pg;
import * as fs from 'fs';

// Load the secrets from Kubernetes mounted secrets
let secrets;
try {
	// In Kubernetes, secrets are mounted as individual files in a directory
	const secretsPath = '/etc/secrets';
	secrets = {
		user: fs.readFileSync(`${secretsPath}/postgres-user`, 'utf8').trim(),
		password: fs.readFileSync(`${secretsPath}/postgres-password`, 'utf8').trim(),
		databaseName: fs.readFileSync(`${secretsPath}/postgres-db`, 'utf8').trim(),
		instanceConnectionName: fs.readFileSync(`${secretsPath}/instance-connection-name`, 'utf8').trim()
	};
	
	console.log('Database secrets loaded successfully from Kubernetes');
	console.log('Instance connection name:', secrets.instanceConnectionName);
} catch (err) {
	console.error('Failed to load database secrets:', err.message);
	process.exit(1);
}

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
	const res = await pool.query(text, params);
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