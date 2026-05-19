require('dotenv').config();
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { attachHandlers } = require('./bot');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.MessageContent
    ],
    partials: [
        Partials.Message,
        Partials.Channel,
        Partials.Reaction,
        Partials.User
    ]
});

attachHandlers(client);

const token = process.env.DISCORD_BOT_TOKEN;
if (!token) {
    console.error('DISCORD_BOT_TOKEN not set in .env');
    process.exit(1);
}

client.login(token).catch((e) => {
    console.error('Failed to login:', e);
    process.exit(1);
});
