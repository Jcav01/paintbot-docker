const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

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
						.setDescription('The URL of the Twitch channel.')
						.setRequired(true))
				.addNumberOption(option =>
					option
						.setName('delay')
						.setDescription('The minimum delay (in minutes) between a stream going offline and the next notifcation.')
						.setRequired(false)))
		.addSubcommand(subcommand =>
			subcommand
				.setName('youtube')
				.setDescription('Adds a Youtube channel notification to this channel.')),
	async execute(interaction) {
		if (interaction.options.getSubcommand() === 'twitch') {
			await interaction.reply({ content: `Adding Twitch notification for ${interaction.options.getString('channel')}.`, ephemeral: true });
		}
		else if (interaction.options.getSubcommand() === 'youtube') {
			await interaction.reply({ content: 'Adding Youtube notification.', ephemeral: true });
		}
		else {
			await interaction.reply({ content: 'Unknown subcommand.', ephemeral: true });
		}
	},
};