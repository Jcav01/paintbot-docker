const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  codeBlock,
  InteractionContextType,
  MessageFlags,
} = require('discord.js');
const table = require('text-table');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('list')
    .setDescription('Shows a list of notifications set up for this channel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts([InteractionContextType.Guild]),
  async execute(interaction) {
    // Extends the interaction timeout to 15 minutes
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const res = await fetch(`http://database:8002/destinations/channel/${interaction.channel.id}`);
    const data = await res.json();

    const dataArr = [['ID', 'Username', 'Minimum Interval', 'Highlight Colour']];
    const transformedData = data.map((element) => [
      element.source_id,
      element.source_username,
      element.minimum_interval ?? 0,
      Buffer.from(element.highlight_colour.data).toString(),
    ]);
    dataArr.push(...transformedData);

    const listTable = table(dataArr);
    await interaction.editReply({ content: codeBlock(listTable) });
  },
};
