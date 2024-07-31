const { SlashCommandBuilder, PermissionFlagsBits, codeBlock } = require('discord.js');
const table = require('text-table');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('list')
		.setDescription('Shows a list of notifications set up for this channel.')
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
		.setDMPermission(false),
	async execute(interaction) {
        // Extends the interaction timeout to 15 minutes
        await interaction.deferReply({ ephemeral: true });

        console.log('Fetching data from database:8002/destinations/channel');
        const res = await fetch(`http://database:8002/destinations/channel/${interaction.channel.id}`);
        console.log('Status Code:', res.status);
        const data = await res.json();

        const dataArr = [['Source ID', 'Source URL', 'Minimum Interval', 'Highlight Colour']];
        const transformedData = data.map(element => [
            element.source_id,
            element.source_url,
            element.minimum_interval,
            Buffer.from(element.highlight_colour.data).toString(),
        ]);
        dataArr.push(...transformedData);

        const listTable = table(dataArr);
		await interaction.editReply({ content: codeBlock(listTable) });
	},
};