const fs = require("fs-extra");
const path = require("node:path");
const logger = require("./logger");

const DATA_FOLDER = path.join(__dirname, "..", "..", ".data");
const DATA_FILE = path.join(DATA_FOLDER, "channels.json");

/** @typedef {import('./statedef').GuildState} GuildState */
/** @typedef {import('./statedef').ChannelEntry} ChannelEntry */
/** @typedef {import('./statedef').RequestEntry} RequestEntry */
/** @typedef {import('./statedef').RootState} RootState */

const state = { guilds: {} };

/**
 * @returns {Promise<void>}
 */
async function loadState() {
    await fs.ensureDir(DATA_FOLDER);
    if (!(await fs.pathExists(DATA_FILE))) {
        await fs.writeJson(DATA_FILE, state, { spaces: 2 });
        return;
    }

    const loaded = await fs.readJson(DATA_FILE).catch((e) => { logger.error('loadState: readJson', e); return null; });
    if (loaded && typeof loaded === "object") {
        state.guilds = loaded.guilds ?? {};
    }
}

/**
 * @returns {Promise<void>}
 */
async function saveState() {
    await fs.ensureDir(DATA_FOLDER);
    await fs.writeJson(DATA_FILE, state, { spaces: 2 });
}

/**
 * @param {string} guildId
 * @returns {GuildState}
 */
function getGuildState(guildId) {
    if (!state.guilds[guildId]) {
        state.guilds[guildId] = { channels: {}, archives: {}, userLocales: {}, publicChannelId: null };
    }

    if (!state.guilds[guildId].channels) state.guilds[guildId].channels = {};
    if (!state.guilds[guildId].archives) state.guilds[guildId].archives = {};
    if (!state.guilds[guildId].userLocales) state.guilds[guildId].userLocales = {};
    if (state.guilds[guildId].publicChannelId == null) state.guilds[guildId].publicChannelId = null;

    return state.guilds[guildId];
}

module.exports = { state, loadState, saveState, getGuildState };
