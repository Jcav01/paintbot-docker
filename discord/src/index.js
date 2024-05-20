const fs = require('fs');
const path = require('path');
const { Client, Collection, Events, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const secrets = require('/run/secrets/discord-secrets.json');
const express = require('express');
const app = express();
// enable middleware to parse body of Content-type: application/json
app.use(express.json());

// Create a new client instance
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Extends client to add collection of commands
client.commands = new Collection();

const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

// Loop through each folder in the commands directory
for (const folder of commandFolders) {
	const commandsPath = path.join(foldersPath, folder);
	const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

	// Add each file as a command
	for (const file of commandFiles) {
		const filePath = path.join(commandsPath, file);
		const command = require(filePath);
		// Add each command file to the command collection
		if ('data' in command && 'execute' in command) {
			client.commands.set(command.data.name, command);
		}
		else {
			console.log(`The command at ${filePath} is missing a required "data" or "execute" property.`);
		}
	}
}

// When the client is ready, run this code (only once)
client.once(Events.ClientReady, c => {
	console.log(`Ready! Logged in as ${c.user.tag}`);
});

// Hande slash commands
client.on(Events.InteractionCreate, async interaction => {
	// Ignore interactions that are not slash commands
	if (!interaction.isChatInputCommand()) return;

	// Retrieve command from collection
	const command = interaction.client.commands.get(interaction.commandName);

	if (!command) {
		console.error(`No command matching ${interaction.commandName} was found.`);
		return;
	}

	try {
		await command.execute(interaction);
	}
	catch (error) {
		console.error(error);
		if (interaction.replied || interaction.deferred) {
			await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
		}
		else {
			await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
		}
	}
});

// Log in to Discord with your client's token
client.login(secrets.token);

// Handle requests from other services to post notifications
app.post('/embed/send', (req, res) => {
	const channel = client.channels.cache.get(req.body.channelId);
	const exampleEmbed = new EmbedBuilder()
		.setColor(req.body.embed.color)
		.setTitle(req.body.embed.title)
		.setURL(req.body.embed.url)
		.setAuthor({ name: req.body.embed.author.name, iconURL: req.body.embed.author.iconUrl, url: req.body.embed.author.url })
		.setThumbnail(req.body.embed.thumbnail.url)
		.addFields(req.body.embed.fields)
		.setImage(req.body.embed.image.url);

	// console.log(JSON.stringify(exampleEmbed));
	channel.send({ embeds: [exampleEmbed] });
    res.send();
});

app.listen(8001, () => {
        console.log('Discord is listening on port 8001');
    });