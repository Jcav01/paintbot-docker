const fs = require('fs');
const path = require('path');
const { Client, Collection, Events, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const express = require('express');
const app = express();
// enable middleware to parse body of Content-type: application/json
app.use(express.json());

// Load the secrets from Kubernetes mounted secrets
let secrets;
if (process.env.NODE_ENV === 'test') {
  secrets = {
    token: 'test-token',
  };
  console.log('Using test secrets');
} else {
  try {
    // In Kubernetes, secrets are mounted as individual files in a directory
    const secretsPath = '/etc/secrets';
    secrets = {
      token: fs.readFileSync(`${secretsPath}/bot-token`, 'utf8').trim(),
    };

    console.log('Discord secrets loaded successfully from Kubernetes');
  } catch (err) {
    console.error('Failed to load Discord secrets:', err.message);
    process.exit(1);
  }
}

// Create a new client instance
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Extends client to add collection of commands
client.commands = new Collection();

if (process.env.NODE_ENV !== 'test') {
  const foldersPath = path.join(__dirname, 'commands');
  const commandFolders = fs.readdirSync(foldersPath);

  // Loop through each folder in the commands directory
  for (const folder of commandFolders) {
    const commandsPath = path.join(foldersPath, folder);
    const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));

    // Add each file as a command
    for (const file of commandFiles) {
      const filePath = path.join(commandsPath, file);
      const command = require(filePath);
      // Add each command file to the command collection
      if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
      } else {
        console.log(
          `The command at ${filePath} is missing a required "data" or "execute" property.`
        );
      }
    }
  }
}

// When the client is ready, run this code (only once)
client.once(Events.ClientReady, async (c) => {
  console.log(`Ready! Logged in as ${c.user.tag}`);
  for (const guild of client.guilds.cache.values()) {
    const isWhitelisted = await checkServerWhitelist(guild.id);
    if (!isWhitelisted) {
      console.log(`Leaving guild ${guild.id} as it is not in the whitelist`);
      await guild.leave();
    }
  }
});

// Check if a server is in the whitelist when joining a new one
client.on(Events.GuildCreate, async (guild) => {
  const isWhitelisted = await checkServerWhitelist(guild.id);
  if (!isWhitelisted) {
    console.log(`Leaving guild ${guild.id} as it is not in the whitelist`);
    await guild.leave();
  }
});

// Handle slash commands
client.on(Events.InteractionCreate, async (interaction) => {
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
  } catch (error) {
    console.error(error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: 'There was an error while executing this command!',
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: 'There was an error while executing this command!',
        ephemeral: true,
      });
    }
  }
});

// Log in to Discord with your client's token
if (process.env.NODE_ENV !== 'test') {
  client.login(secrets.token);
}

// Handle requests from other services to post notifications
app.post('/embed/send', async (req, res) => {
  console.log(JSON.stringify(req.body.embed));
  const messages = [];
  await Promise.all(
    req.body.channelInfo.map(async (info) => {
      const channel = client.channels.cache.get(info.channelId);
      const embed = new EmbedBuilder()
        .setColor(`#${Buffer.from(info.highlightColour.data).toString()}`)
        .setTitle(req.body.embed.title)
        .setURL(req.body.embed.url)
        .setAuthor({
          name: req.body.embed.author.name,
          iconURL: req.body.embed.author.iconUrl,
          url: req.body.embed.author.url,
        })
        .setThumbnail(req.body.embed.thumbnail.url)
        .addFields(req.body.embed.fields)
        .setImage(req.body.embed.image.url);

      await channel
        .send({ content: info.notification_message, embeds: [embed] })
        .then((message) => messages.push({ messageId: message.id, channelId: info.channelId }));
    })
  );

  res.send(messages);
});

// Handle requests from other services to post notifications
app.post('/message/send', async (req, res) => {
  console.log(JSON.stringify(req.body.message));
  const messages = [];
  await Promise.all(
    req.body.channelInfo.map(async (info) => {
      const channel = client.channels.cache.get(info.channelId);

      await channel
        .send({ content: `${req.body.message}` })
        .then((message) => messages.push({ messageId: message.id, channelId: info.channelId }));
    })
  );

  res.send(messages);
});

// Handle requests from other services to post notifications
app.post('/embed/edit', (req, res) => {
  req.body.channelInfo.forEach((info) => {
    const channel = client.channels.cache.get(info.channelId);
    channel.messages
      .fetch(info.messageId)
      .then(async (message) => {
        const embed = new EmbedBuilder()
          .setColor(`#${Buffer.from(info.highlightColour.data).toString()}`)
          .setTitle(req.body.embed.title)
          .setURL(req.body.embed.url)
          .setAuthor({
            name: req.body.embed.author.name,
            iconURL: req.body.embed.author.iconUrl,
            url: req.body.embed.author.url,
          })
          .setThumbnail(req.body.embed.thumbnail.url)
          .addFields(req.body.embed.fields)
          .setImage(req.body.embed.image.url);

        await message
          .edit({ content: info.notification_message, embeds: [embed] })
          .catch(console.error);
      })
      .catch(console.error);
  });
  res.send();
});

const port = process.env.PORT || 8001;
if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    console.log(`Discord is listening on port ${port}`);
  });
}

async function checkServerWhitelist(serverId) {
  try {
    await waitfordb();
    const res = await fetch('http://database:8002/servers/' + serverId);
    if (!res.ok) return false;
    const result = await res.json();
    return result?.whitelisted ?? false;
  } catch (error) {
    console.error('Failed to verify server whitelist:', error);
    return true; // Default to true if DB is unreachable
  }
}

function waitfordb(DBUrl, interval = 1500, attempts = 10) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const targetUrl = DBUrl || 'http://database:8002';

  // eslint-disable-next-line no-async-promise-executor
  return new Promise(async (resolve, reject) => {
    let delay = interval;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      if (attempt > 1) {
        await sleep(delay);
        delay *= 2; // exponential backoff
      }

      try {
        const response = await fetch(targetUrl);
        if (response.ok && response.status === 200) {
          resolve();
          return;
        }
      } catch {
        // ignore error; retry after backoff
      }

      if (attempt < attempts) {
        console.log(`Database still down, trying ${attempt + 1} of ${attempts}`);
      }
    }

    reject(new Error(`Database is down: ${attempts} attempts tried`));
  });
}

module.exports = { app, waitfordb };
