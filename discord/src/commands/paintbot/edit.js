const { SlashCommandBuilder, InteractionContextType } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('edit')
		.setDescription('Will be used to update notifications. Not implemented yet.')
		.setContexts([InteractionContextType.Guild]),
	async execute(interaction) {
		// interaction.user is the object representing the User who ran the command
		// interaction.member is the GuildMember object, which represents the user in the specific guild
		await interaction.reply({ content: `This command was run by ${interaction.user.username}.`, ephemeral: true });
	},
};