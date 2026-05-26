const { REST, Routes, SlashCommandBuilder } = require("discord.js");

function buildTwicordCommand() {
    return new SlashCommandBuilder()
        .setName("twicord")
        .setDescription("Manage Twicord private channels")
        .addSubcommand((subcommand) =>
            subcommand
                .setName("create")
                .setDescription("Create your private channel")
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("request")
                .setDescription("Request access to another user's channel")
                .addUserOption((option) =>
                    option
                        .setName("user")
                        .setDescription("The channel owner to request from")
                        .setRequired(true)
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("rename")
                .setDescription("Rename your managed private channel")
                .addStringOption((option) =>
                    option
                        .setName("name")
                        .setDescription("New channel name")
                        .setRequired(true)
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("description")
                .setDescription("Set or update your managed channel description")
                .addStringOption((option) =>
                    option
                        .setName("text")
                        .setDescription("Description text")
                        .setRequired(true)
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("list")
                .setDescription("Show created private channels")
                .addIntegerOption((option) =>
                    option
                        .setName("page")
                        .setDescription("Page number")
                        .setRequired(false)
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("setcategory")
                .setDescription("Set the default category for new private channels")
                .addStringOption((option) =>
                    option
                        .setName("category")
                        .setDescription("Category ID or mention")
                        .setRequired(true)
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("showcategory")
                .setDescription("Show the current default category")
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("setpublicchannel")
                .setDescription("Set the public broadcast channel")
                .addStringOption((option) =>
                    option
                        .setName("channel")
                        .setDescription("Channel ID or mention; leave empty to use the current channel")
                        .setRequired(false)
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("public")
                .setDescription("Forward a message from the current managed channel to the public channel")
                .addStringOption((option) =>
                    option
                        .setName("message")
                        .setDescription("Discord message link or message ID in the current channel")
                        .setRequired(true)
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("archive")
                .setDescription("Archive a managed channel")
                .addUserOption((option) =>
                    option
                        .setName("user")
                        .setDescription("Target channel owner; leave empty for yourself")
                        .setRequired(false)
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("remove")
                .setDescription("Remove a user from a managed channel")
                .addUserOption((option) =>
                    option
                        .setName("user")
                        .setDescription("User to remove from the channel")
                        .setRequired(true)
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("delete")
                .setDescription("Delete a managed channel or an explicit channel ID")
                .addStringOption((option) =>
                    option
                        .setName("target")
                        .setDescription("User ID, user mention, channel ID, or channel mention")
                        .setRequired(true)
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("lang")
                .setDescription("Set your display language")
                .addStringOption((option) =>
                    option
                        .setName("locale")
                        .setDescription("Preferred locale")
                        .addChoices(
                            { name: "Japanese", value: "ja" },
                            { name: "English", value: "en" }
                        )
                        .setRequired(true)
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("help")
                .setDescription("Show the bot help embed")
        );
}

function getSlashCommands() {
    return [buildTwicordCommand().toJSON()];
}

async function registerSlashCommands() {
    const token = process.env.DISCORD_BOT_TOKEN;
    const clientId = process.env.DISCORD_CLIENT_ID || process.env.DISCORD_APPLICATION_ID || process.env.CLIENT_ID || process.env.DISCORD_APP_ID || process.env.APPLICATION_ID;

    if (!token) {
        throw new Error("DISCORD_BOT_TOKEN not set in .env");
    }

    if (!clientId) {
        throw new Error("DISCORD_CLIENT_ID (or CLIENT_ID / DISCORD_APP_ID / APPLICATION_ID) not set in .env");
    }

    const rest = new REST({ version: "10" }).setToken(token);
    const commands = getSlashCommands();
    const data = await rest.put(Routes.applicationCommands(clientId), { body: commands });
    const count = Array.isArray(data) ? data.length : commands.length;
    console.log(`Registered ${count} slash command set(s) globally.`);
    return data;
}

module.exports = {
    buildTwicordCommand,
    getSlashCommands,
    registerSlashCommands
};

if (require.main === module) {
    registerSlashCommands().catch((e) => {
        console.error("Failed to register slash commands:", e);
        process.exit(1);
    });
}
