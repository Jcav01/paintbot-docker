const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const http = require('http');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('add')
		.setDescription('Adds a notification source for this channel.')
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
		.setDMPermission(false)
		.addSubcommand(subcommand =>
			subcommand
				.setName('twitch')
				.setDescription('Adds a Twitch channel notification to this channel.')
				.addStringOption(option =>
					option
						.setName('channel')
						.setDescription('The URL of the Twitch channel. (Example: https://www.twitch.tv/jcav)')
						.setRequired(true))
				.addNumberOption(option =>
					option
						.setName('interval')
						.setDescription('The minimum interval (in minutes) between notifications. Default is 15.')
						.setRequired(false))
				.addStringOption(option =>
					option
						.setName('highlight')
						.setDescription('RGB hex code for the colour on the left of the embed. Default is 9146FF.')
						.setRequired(false)))
		.addSubcommand(subcommand =>
			subcommand
				.setName('youtube')
				.setDescription('Adds a Youtube channel notification to this channel.')
				.addStringOption(option =>
					option
						.setName('channel')
						.setDescription('The URL of the Youtube channel.')
						.setRequired(true))
				.addNumberOption(option =>
					option
						.setName('interval')
						.setDescription('The minimum interval (in minutes) between notifications. Default is 15.')
						.setRequired(false))
				.addStringOption(option =>
					option
						.setName('highlight')
						.setDescription('RGB hex code for the colour on the left of the embed. Default is CD201F.')
						.setRequired(false))),
	async execute(interaction) {
        // Extends the interaction timeout to 15 minutes
        await interaction.deferReply({ ephemeral: true });
		if (interaction.options.getSubcommand() === 'twitch') {
			const options = JSON.stringify({
				discord_channel: interaction.channelId,
				source_url: interaction.options.getString('channel'),
				interval: interaction.options.getNumber('interval'),
				highlight: interaction.options.getString('highlight') || '9146FF',
			});
			const request_options = {
				host: 'twitch',
				port: '8004',
				path: '/add',
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Content-Length': Buffer.byteLength(options),
				},
			};
			const req = http.request(request_options, async (res) => {
				console.log(`STATUS: ${res.statusCode}`);
				await interaction.editReply({ content: `Adding Twitch notification for <${interaction.options.getString('channel')}>.` });
			});
			req.write(options);
			req.end();
		}
		else if (interaction.options.getSubcommand() === 'youtube') {
			await interaction.editReply({ content: `Adding Youtube notification for ${interaction.options.getString('channel')}.` });
		}
		else {
			await interaction.editReply({ content: 'Unknown subcommand.' });
		}
	},
};