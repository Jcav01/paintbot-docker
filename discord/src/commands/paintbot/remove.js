const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType } = require('discord.js');
const http = require('http');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('remove')
		.setDescription('Removes a notification source for this channel.')
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
		.setContexts([InteractionContextType.Guild])
		.addSubcommand(subcommand =>
			subcommand
				.setName('twitch')
				.setDescription('Removes a Twitch channel notification from this channel.')
				.addStringOption(option =>
					option
						.setName('channel')
						.setDescription('The username for the Twitch channel. (Example: jcav)')
						.setRequired(true)))
		.addSubcommand(subcommand =>
			subcommand
				.setName('youtube')
				.setDescription('Removes a Youtube channel notification from this channel.')
				.addStringOption(option =>
					option
						.setName('channel')
						.setDescription('The Youtube channel\'s handle.')
						.setRequired(true))),
	async execute(interaction) {
		// Extends the interaction timeout to 15 minutes
		await interaction.deferReply({ ephemeral: true });
		if (interaction.options.getSubcommand() === 'twitch') {
			const options = JSON.stringify({
				discord_channel: interaction.channelId,
				source_username: interaction.options.getString('channel')
			});
			const request_options = {
				host: 'twitch',
				port: '8004',
				path: '/remove',
				method: 'DELETE',
				headers: {
					'Content-Type': 'application/json',
					'Content-Length': Buffer.byteLength(options),
				},
			};
			const req = http.request(request_options, async (res) => {
				if (res.statusCode !== 200) {
					await interaction.editReply({ content: 'Failed to remove Twitch notification. No changes have been made.' });
					return;
				}
				await interaction.editReply({ content: `Removed Twitch notification for <${interaction.options.getString('channel')}>.` });
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