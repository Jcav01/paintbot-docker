const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType } = require('discord.js');
const http = require('http');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('add')
		.setDescription('Adds a notification source for this channel.')
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
		.setContexts([InteractionContextType.Guild])
		.addSubcommand(subcommand =>
			subcommand
				.setName('twitch')
				.setDescription('Adds a Twitch channel notification to this channel.')
				.addStringOption(option =>
					option
						.setName('channel')
						.setDescription('The username for the Twitch channel. (Example: jcav)')
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
						.setRequired(false))
				.addStringOption(option =>
					option
						.setName('message')
						.setDescription('The message to display before the embed.')
						.setRequired(false)))
		.addSubcommand(subcommand =>
			subcommand
				.setName('youtube')
				.setDescription('Adds a Youtube channel notification to this channel.')
				.addStringOption(option =>
					option
						.setName('channel')
						.setDescription('The Youtube channel\'s handle. With or without @ (Example: @ConeDodger)')
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
						.setRequired(false))
				.addStringOption(option =>
					option
						.setName('message')
						.setDescription('The message to display before the link.')
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
				message: interaction.options.getString('message'),
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
				if (res.statusCode !== 200) {
					await interaction.editReply({ content: 'Failed to add Twitch notification. No changes have been made.' });
					return;
				}
				await interaction.editReply({ content: `Added Twitch notification for <${interaction.options.getString('channel')}>.` });
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