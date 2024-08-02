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
						.setDescription('The URL of the Twitch channel. (Example: https://www.twitch.tv/jcav)')
						.setRequired(true))
				.addNumberOption(option =>
					option
						.setName('interval')
						.setDescription('The minimum interval (in minutes) between notifications. Default is 15.')
						.setRequired(false))
				.addNumberOption(option =>
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
						.setDescription('The URL of the Youtube channel. (Example: https://www.youtube.com/@ConeDodger240)')
						.setRequired(true))
				.addNumberOption(option =>
					option
						.setName('interval')
						.setDescription('The minimum interval (in minutes) between notifications. Default is 15.')
						.setRequired(false))
				.addNumberOption(option =>
					option
						.setName('highlight')
						.setDescription('RGB hex code for the colour on the left of the embed. Default is CD201F.')
						.setRequired(false))),
	async execute(interaction) {
		if (interaction.options.getSubcommand() === 'twitch') {
			await interaction.reply({ content: `Adding Twitch notification for ${interaction.options.getString('channel')}.`, ephemeral: true });
		}
		else if (interaction.options.getSubcommand() === 'youtube') {
			await interaction.reply({ content: `Adding Youtube notification for ${interaction.options.getString('channel')}.`, ephemeral: true });
		}
		else {
			await interaction.reply({ content: 'Unknown subcommand.', ephemeral: true });
		}
	},
};