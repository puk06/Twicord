require("dotenv").config();

const { registerSlashCommands } = require("./commands");

registerSlashCommands().catch((e) => {
    console.error("Failed to register slash commands:", e);
    process.exit(1);
});
