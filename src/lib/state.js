const fs = require("fs-extra");
const path = require("node:path");

const DATA_FOLDER = path.join(__dirname, "..", "..", ".data");
const DATA_FILE = path.join(DATA_FOLDER, "channels.json");

const state = { guilds: {} };

async function loadState() {
    await fs.ensureDir(DATA_FOLDER);
    if (!(await fs.pathExists(DATA_FILE))) {
        await fs.writeJson(DATA_FILE, state, { spaces: 2 });
        return;
    }

    const loaded = await fs.readJson(DATA_FILE).catch(() => null);
    if (loaded && typeof loaded === "object") {
        state.guilds = loaded.guilds ?? {};
    }
}

async function saveState() {
    await fs.ensureDir(DATA_FOLDER);
    await fs.writeJson(DATA_FILE, state, { spaces: 2 });
}

function getGuildState(guildId) {
    if (!state.guilds[guildId]) {
        state.guilds[guildId] = { channels: {}, archives: {} };
    }

    if (!state.guilds[guildId].channels) state.guilds[guildId].channels = {};
    if (!state.guilds[guildId].archives) state.guilds[guildId].archives = {};

    return state.guilds[guildId];
}

module.exports = { state, loadState, saveState, getGuildState };
