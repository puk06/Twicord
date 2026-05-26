const { EmbedBuilder, Events, ActivityType, ChannelType, PermissionsBitField } = require("discord.js");
const { state, loadState, saveState, getGuildState } = require("./lib/state.js");
const { t, normalizeLocale, DEFAULT_LOCALE } = require("./lib/i18n.js");
const utils = require("./lib/utils.js");
const logger = require("./lib/logger.js");

// @ts-check

/**
 * Editor-only typedefs for better JS/TS language tooling.
 * Adjust imports to point at local TS files or installed types when available.
 */
/** @typedef {import('discord.js').Client} DiscordClient */
/** @typedef {import('discord.js').Message} DiscordMessage */
/** @typedef {import('discord.js').Guild} DiscordGuild */
/** @typedef {import('discord.js').User} DiscordUser */
/** @typedef {import('discord.js').MessageReaction} DiscordMessageReaction */
/** @typedef {import('discord.js').GuildChannel} GuildChannel */
/** @typedef {import('discord.js').TextChannel} TextChannel */
/** @typedef {import('./lib/statedef').GuildState} GuildState */
/** @typedef {import('./lib/statedef').ChannelEntry} ChannelEntry */
/** @typedef {import('./lib/statedef').RequestEntry} RequestEntry */
/** @typedef {import('./lib/statedef').RootState} RootState */

const PREFIX = "!twicord";
const APPROVE_EMOJI = "✅";
const REJECT_EMOJI = "❌";

function getTotalManagedChannels() {
    let total = 0;
    for (const g of Object.values(state.guilds || {})) {
        if (g && g.channels) total += Object.keys(g.channels).length;
    }
    return total;
}

/**
 * @param {string} guildId
 * @param {string} userId
 * @returns {string}
 */
function getUserLocale(guildId, userId) {
    const guildState = getGuildState(guildId);
    return guildState.userLocales?.[userId] || DEFAULT_LOCALE;
}


/**
 * @param {string} guildId
 * @param {string} userId
 * @param {string} key
 * @param {Record<string, any>} [vars]
 * @returns {string}
 */
function tUser(guildId, userId, key, vars = {}) {
    const locale = getUserLocale(guildId, userId);
    return t(locale, key, { ...vars, prefix: PREFIX });
}

/**
 * @param {DiscordClient} client
 */
async function updateActivity(client) {
    try {
        const total = getTotalManagedChannels();
        const text = total > 0 ? `Managing ${total} channels • ${PREFIX} help` : `${PREFIX} help`;
        await client.user.setActivity(text, { type: ActivityType.Watching });
    } catch (e) {
        console.error("Failed to update activity:", e);
    }
}

/**
 * Delete legacy managed roles tracked in state and clear roleId references.
 * @param {DiscordClient} client
 */
async function removeLegacyManagedRoles(client) {
    let changed = false;

    for (const [guildId, guildState] of Object.entries(state.guilds || {})) {
        const roleIds = new Set();
        for (const entry of Object.values(guildState.channels || {})) {
            if (entry?.roleId) roleIds.add(entry.roleId);
        }
        for (const entry of Object.values(guildState.archives || {})) {
            if (entry?.roleId) roleIds.add(entry.roleId);
        }

        if (!roleIds.size) continue;

        const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch((e) => { logger.error('removeLegacyManagedRoles: fetch guild', e); return null; });
        if (!guild) continue;

        for (const roleId of roleIds) {
            const role = await guild.roles.fetch(roleId).catch((e) => { logger.error('removeLegacyManagedRoles: fetch role', e); return null; });
            if (!role) continue;
            try {
                await role.delete().catch((e) => logger.error('removeLegacyManagedRoles: delete role', e));
            } catch (e) { logger.error('removeLegacyManagedRoles: delete role exception', e); }
        }

        for (const entry of Object.values(guildState.channels || {})) {
            if (entry?.roleId != null) {
                entry.roleId = null;
                changed = true;
            }
        }
        for (const entry of Object.values(guildState.archives || {})) {
            if (entry?.roleId != null) {
                entry.roleId = null;
                changed = true;
            }
        }
    }

    if (changed) {
        await saveState();
    }
}

/**
 * @param {string} locale
 * @param {DiscordUser} requester
 * @param {GuildChannel | TextChannel} channel
 */
function buildRequestEmbed(locale, requester, channel) {
    return new EmbedBuilder()
        .setTitle(t(locale, "request_embed_title"))
        .setDescription(t(locale, "request_embed_desc", { requester: `${requester}` }))
        .addFields(
            { name: t(locale, "request_embed_target"), value: `${channel}`, inline: true },
            { name: t(locale, "request_embed_applicant"), value: `${requester.tag} (${requester.id})`, inline: false }
        )
        .setColor(0x00b0f4)
        .setTimestamp();
}

/**
 * @param {string} locale
 */
function buildHelpEmbed(locale) {
    return new EmbedBuilder()
        .setTitle(t(locale, "help_title"))
        .setColor(0x00b0f4)
        .setDescription(t(locale, "help_desc"))
        .addFields(
            { name: `${PREFIX} create`, value: t(locale, "help_create", { prefix: PREFIX }), inline: false },
            { name: `${PREFIX} request <@User|UserId>`, value: t(locale, "help_request", { prefix: PREFIX }), inline: false },
            { name: `${PREFIX} rename <new-name>`, value: t(locale, "help_rename", { prefix: PREFIX }), inline: false },
            { name: `${PREFIX} description <text>`, value: t(locale, "help_description", { prefix: PREFIX }), inline: false },
            { name: `${PREFIX} list`, value: t(locale, "help_list", { prefix: PREFIX }), inline: false },
            { name: `${PREFIX} set-category <CategoryId> (Owner)`, value: t(locale, "help_set_category", { prefix: PREFIX }), inline: false },
            { name: `${PREFIX} show-category`, value: t(locale, "help_show_category"), inline: false },
            { name: `${PREFIX} setpublicchannel [#channel|ChannelId] (Owner)`, value: t(locale, "help_set_public_channel", { prefix: PREFIX }), inline: false },
            { name: `${PREFIX} public (reply)`, value: t(locale, "help_public", { prefix: PREFIX }), inline: false },
            { name: `${PREFIX} archive [@User|UserId]`, value: t(locale, "help_archive"), inline: false },
            { name: `${PREFIX} delete <#channel|ChannelId|@User|UserId>`, value: t(locale, "help_delete"), inline: false },
            { name: `${PREFIX} lang <ja|en>`, value: t(locale, "help_lang", { prefix: PREFIX }), inline: false }
        )
        .setFooter({ text: t(locale, "help_footer", { prefix: PREFIX }) })
        .setTimestamp();
}

/**
 * @param {GuildState} guildState
 * @param {string} channelId
 * @returns {ChannelEntry|null}
 */
function getManagedChannelEntryByChannelId(guildState, channelId) {
    for (const entry of Object.values(guildState.channels || {})) {
        if (entry?.channelId === channelId) return entry;
    }
    for (const entry of Object.values(guildState.archives || {})) {
        if (entry?.channelId === channelId) return entry;
    }
    return null;
}

/**
 * @param {DiscordMessage} message
 */
async function warnPermissionAbuse(message) {
    const guild = message.guild;
    if (!guild) return;
    const guildState = getGuildState(guild.id);
    const entry = getManagedChannelEntryByChannelId(guildState, message.channel.id);
    if (!entry) return;

    // Ignore channel owner and bots; everyone else should be warned
    if (message.author.id === entry.ownerId) return;
    if (message.author.bot) return;

    // i18n: reply in the author's preferred locale
    const locale = getUserLocale(guild.id, message.author.id);
    const warning = t(locale, "warn_permission_abuse", { prefix: PREFIX });
    await message.reply({ content: warning }).catch((e) => logger.error('warnPermissionAbuse: reply', e));
}

/**
 * @param {DiscordMessage} message
 * @param {string|null} arg
 */
async function handleLanguageCommand(message, arg) {
    const guildId = message.guild.id;
    const userId = message.author.id;
    const currentLocale = getUserLocale(guildId, userId);

    if (!arg) {
        const usage = t(currentLocale, "usage_lang", { prefix: PREFIX });
        await message.reply(t(currentLocale, "lang_current", { locale: currentLocale, usage }));
        return;
    }

    const nextLocale = normalizeLocale(arg);
    if (!nextLocale) {
        await message.reply(t(currentLocale, "invalid_lang"));
        return;
    }

    const guildState = getGuildState(guildId);
    guildState.userLocales[userId] = nextLocale;
    await saveState();

    await message.reply(t(nextLocale, "lang_updated", { locale: nextLocale }));
}

/**
 * @param {DiscordMessage} message
 * @param {string|null} rawDescription
 */
async function handleDescriptionCommand(message, rawDescription) {
    const guild = message.guild;
    if (!guild) return;

    const locale = getUserLocale(guild.id, message.author.id);
    const guildState = getGuildState(guild.id);
    const entry = getManagedChannelEntryByChannelId(guildState, message.channel.id);

    if (!entry) {
        await message.reply(t(locale, "description_not_in_managed_channel", { prefix: PREFIX }));
        return;
    }

    const isOwner = message.author.id === entry.ownerId || message.author.id === guild.ownerId;
    if (!isOwner) {
        await message.reply(t(locale, "no_description_permission"));
        return;
    }

    const description = rawDescription?.trim();
    if (!description) {
        await message.reply(t(locale, "usage_description", { prefix: PREFIX }));
        return;
    }

    entry.description = description;
    await saveState();

    await message.reply(t(locale, "description_updated", { description }));
}

/**
 * @param {string} input
 * @returns {{ guildId: string, channelId: string, messageId: string } | null}
 */
function parseDiscordMessageLink(input) {
    const raw = String(input || "").trim();
    const match = raw.match(/^https?:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/channels\/([0-9]{15,20}|@me)\/([0-9]{15,20})\/([0-9]{15,20})$/i);
    if (!match) return null;

    return {
        guildId: match[1],
        channelId: match[2],
        messageId: match[3]
    };
}

/**
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
function createInteractionMessage(interaction) {
    return {
        guild: interaction.guild,
        author: interaction.user,
        client: interaction.client,
        channel: interaction.channel,
        reference: null,
        async reply(payload) {
            await interaction.editReply(payload);
            return {
                edit: async (nextPayload) => interaction.editReply(nextPayload)
            };
        }
    };
}

/**
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {DiscordMessage} message
 */
async function handleSlashPublicCommand(interaction, message) {
    const guild = interaction.guild;
    if (!guild) return;

    const rawValue = interaction.options.getString("message", true).trim();
    const parsedLink = parseDiscordMessageLink(rawValue);
    let messageId = rawValue;

    if (parsedLink) {
        if (parsedLink.guildId !== guild.id || parsedLink.channelId !== message.channel.id) {
            await message.reply(t(getUserLocale(guild.id, message.author.id), "public_reply_not_found"));
            return;
        }

        messageId = parsedLink.messageId;
    }

    const referenced = await message.channel.messages.fetch(messageId).catch((e) => { logger.error('handleSlashPublicCommand: fetch message', e); return null; });
    if (!referenced || referenced.guild?.id !== guild.id) {
        await message.reply(t(getUserLocale(guild.id, message.author.id), "public_reply_not_found"));
        return;
    }

    const publicMessage = Object.assign({}, message, {
        reference: { messageId },
        fetchReference: async () => referenced
    });

    await publishReplyToPublicChannel(publicMessage);
}

/**
 * @param {DiscordClient} client
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
async function handleSlashInteraction(client, interaction) {
    if (!interaction.isChatInputCommand() || interaction.commandName !== "twicord") return;

    if (!interaction.inGuild() || !interaction.guild) {
        await interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
        return;
    }

    await interaction.deferReply();
    const message = createInteractionMessage(interaction);
    const subcommand = interaction.options.getSubcommand();

    try {
        if (subcommand === "create") {
            await createPrivateChannel(client, message);
            return;
        }

        if (subcommand === "request") {
            const targetUser = interaction.options.getUser("user", true);
            await requestToJoin(message, targetUser.id);
            return;
        }

        if (subcommand === "rename") {
            const raw = interaction.options.getString("name", true);
            const guild = message.guild;
            if (!guild) return;

            const guildState = getGuildState(guild.id);
            const entry = getManagedChannelEntryByChannelId(guildState, message.channel.id);
            if (!entry) {
                const locale = getUserLocale(guild.id, message.author.id);
                await message.reply(t(locale, "rename_not_in_managed_channel", { prefix: PREFIX }));
                return;
            }

            const isOwner = message.author.id === entry.ownerId || message.author.id === guild.ownerId;
            if (!isOwner) {
                await message.reply(tUser(guild.id, message.author.id, "no_rename_permission"));
                return;
            }

            if (!raw) {
                await message.reply(tUser(guild.id, message.author.id, "usage_rename", { prefix: PREFIX }));
                return;
            }

            const newName = utils.normalizeChannelName(raw);
            const channel = await guild.channels.fetch(entry.channelId).catch((e) => { logger.error('rename: fetch channel', e); return null; });
            if (!channel) {
                await message.reply(tUser(guild.id, message.author.id, "target_channel_not_found_admin"));
                return;
            }

            const interim = await message.reply(tUser(guild.id, message.author.id, "rename_in_progress")).catch((e) => { logger.error('rename: reply interim', e); return null; });

            let setErr = null;
            try {
                await channel.setName(newName);
            } catch (e) {
                setErr = e;
                logger.error('rename: setName', e);
            }

            const reason = setErr?.message || "unknown";

            if (interim) {
                try {
                    if (!setErr) {
                        await interim.edit(tUser(guild.id, message.author.id, "rename_success", { channel: `${channel}` }));
                    } else {
                        await interim.edit(tUser(guild.id, message.author.id, "rename_failed", { reason }));
                    }
                } catch (e) { logger.error('rename: edit interim', e); }
            } else {
                if (!setErr) {
                    await message.reply(tUser(guild.id, message.author.id, "rename_success", { channel: `${channel}` }));
                } else {
                    await message.reply(tUser(guild.id, message.author.id, "rename_failed", { reason }));
                }
            }
            return;
        }

        if (subcommand === "description") {
            const rawDescription = interaction.options.getString("text", true);
            await handleDescriptionCommand(message, rawDescription);
            return;
        }

        if (subcommand === "list") {
            const page = interaction.options.getInteger("page");
            await listPrivateChannels(message, page != null ? String(page) : null);
            return;
        }

        if (subcommand === "setcategory") {
            const categoryId = utils.parseCategoryId(interaction.options.getString("category", true));
            if (!categoryId) {
                await message.reply(tUser(message.guild.id, message.author.id, "usage_set_category"));
                return;
            }

            const category = message.guild.channels.cache.get(categoryId) || await message.guild.channels.fetch(categoryId).catch((e) => { logger.error('set-category: fetch category', e); return null; });
            if (!category || category.type !== ChannelType.GuildCategory) {
                await message.reply(tUser(message.guild.id, message.author.id, "category_not_found_owner_fix"));
                return;
            }

            const guildState = getGuildState(message.guild.id);
            guildState.defaultCategoryId = categoryId;
            await saveState();
            await updateActivity(client);
            await message.reply(tUser(message.guild.id, message.author.id, "default_category_set", { category: `${category}` }));
            return;
        }

        if (subcommand === "showcategory") {
            const guildState = getGuildState(message.guild.id);
            let categoryId = guildState.defaultCategoryId;
            if (!categoryId) {
                const fallback = message.guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory);
                if (fallback) categoryId = fallback.id;
            }

            const category = categoryId
                ? message.guild.channels.cache.get(categoryId) || await message.guild.channels.fetch(categoryId).catch((e) => { logger.error('show-category: fetch category', e); return null; })
                : null;

            if (category) {
                await message.reply(tUser(message.guild.id, message.author.id, "default_category_now", { category: `${category}` }));
            } else if (categoryId) {
                await message.reply(tUser(message.guild.id, message.author.id, "default_category_not_found", { categoryId }));
            } else {
                await message.reply(tUser(message.guild.id, message.author.id, "default_category_unset"));
            }
            return;
        }

        if (subcommand === "setpublicchannel") {
            const rawArg = interaction.options.getString("channel");
            const channelId = utils.parseChannelId(rawArg);
            const targetChannel = channelId
                ? message.guild.channels.cache.get(channelId) || await message.guild.channels.fetch(channelId).catch((e) => { logger.error('setpublicchannel: fetch channel', e); return null; })
                : message.channel;

            if (!targetChannel || !targetChannel.isTextBased() || typeof targetChannel.send !== "function") {
                await message.reply(tUser(message.guild.id, message.author.id, "usage_set_public_channel"));
                return;
            }

            const guildState = getGuildState(message.guild.id);
            guildState.publicChannelId = targetChannel.id;
            await saveState();

            await message.reply(tUser(message.guild.id, message.author.id, "public_channel_set", { channel: `${targetChannel.name || targetChannel.id}` }));
            return;
        }

        if (subcommand === "public") {
            await handleSlashPublicCommand(interaction, message);
            return;
        }

        if (subcommand === "archive") {
            const targetUser = interaction.options.getUser("user");
            await archivePrivateChannel(message, targetUser?.id || null);
            return;
        }

        if (subcommand === "delete") {
            const raw = interaction.options.getString("target", true);
            const channelIdArg = utils.parseChannelId(raw);
            const targetUserId = utils.parseUserId(raw);

            if (channelIdArg) {
                await deleteByChannelId(message, channelIdArg);
                return;
            }

            if (targetUserId && message.author.id !== message.guild.ownerId) {
                await message.reply(tUser(message.guild.id, message.author.id, "no_delete_permission"));
                return;
            }

            await deletePrivateChannel(message, targetUserId || null);
            return;
        }

        if (subcommand === "lang") {
            const locale = interaction.options.getString("locale", true).toLowerCase();
            await handleLanguageCommand(message, locale);
            return;
        }

        if (subcommand === "help") {
            const locale = getUserLocale(message.guild.id, message.author.id);
            await message.reply({ embeds: [buildHelpEmbed(locale)] });
        }
    } catch (e) {
        logger.error('handleSlashInteraction', e);
        await interaction.editReply("Failed to execute the slash command.").catch(() => null);
    }
}

/**
 * @param {DiscordClient} client
 */
function attachHandlers(client) {
    client.on(Events.ClientReady, async () => {
        await loadState();
        console.log(`Logged in as ${client.user.tag}`);
        // migrate away from legacy role-based access control
        try {
            await removeLegacyManagedRoles(client);
        } catch (e) { logger.error('removeLegacyManagedRoles', e); }
        // synchronize managed channels' permission overwrites at startup
        try {
            await updateManagedChannelsPermissions(client);
        } catch (e) { logger.error('updateManagedChannelsPermissions', e); }
        await updateActivity(client);
        setInterval(() => updateActivity(client).catch((e) => logger.error('updateActivity interval', e)), 60 * 1000);
    });

    client.on(Events.InteractionCreate, async (interaction) => {
        await handleSlashInteraction(client, interaction).catch((e) => logger.error('handleSlashInteraction', e));
    });

    client.on(Events.MessageCreate, async (message) => {
        if (!message.guild || message.author.bot) return;

        // Warn on permission abuse when someone posts in a managed channel
        await warnPermissionAbuse(message).catch((e) => logger.error('warnPermissionAbuse', e));

        if (!message.content.startsWith(PREFIX)) return;

        const parts = message.content.trim().split(/\s+/);
        const sub = (parts[1] || "").toLowerCase();
        const arg = parts[2];
        const isOwner = message.author.id === message.guild.ownerId;

        if (["lang", "language", "locale"].includes(sub)) {
            await handleLanguageCommand(message, arg ? arg.toLowerCase() : null);
            return;
        }

        // create
        if (["create", "new"].includes(sub)) {
            await createPrivateChannel(client, message);
            return;
        }

        // request / rq
        if (["rq", "request", "apply"].includes(sub)) {
            const targetUserId = utils.parseUserId(arg) || (parts.length >= 3 ? utils.parseUserId(parts.slice(2).join(" ")) : null);
            if (!targetUserId) {
                await message.reply(tUser(message.guild.id, message.author.id, "usage_request"));
                return;
            }

            await requestToJoin(message, targetUserId);
            return;
        }

        // rename channel (owner or server owner) - must be in managed channel
        if (["rename", "setname"].includes(sub)) {
            const raw = parts.slice(2).join(" ") || null;
            const guild = message.guild;
            if (!guild) return;

            const guildState = getGuildState(guild.id);
            const entry = getManagedChannelEntryByChannelId(guildState, message.channel.id);
            if (!entry) {
                const locale = getUserLocale(guild.id, message.author.id);
                await message.reply(t(locale, "rename_not_in_managed_channel", { prefix: PREFIX }));
                return;
            }

            const isOwner = message.author.id === entry.ownerId || message.author.id === guild.ownerId;
            if (!isOwner) {
                await message.reply(tUser(guild.id, message.author.id, "no_rename_permission"));
                return;
            }

            if (!raw) {
                await message.reply(tUser(guild.id, message.author.id, "usage_rename", { prefix: PREFIX }));
                return;
            }

            const newName = utils.normalizeChannelName(raw);
            const channel = await guild.channels.fetch(entry.channelId).catch((e) => { logger.error('rename: fetch channel', e); return null; });
            if (!channel) {
                await message.reply(tUser(guild.id, message.author.id, "target_channel_not_found_admin"));
                return;
            }

            const interim = await message.reply(tUser(guild.id, message.author.id, "rename_in_progress")).catch((e) => { logger.error('rename: reply interim', e); return null; });

            let setErr = null;
            try {
                await channel.setName(newName);
            } catch (e) {
                setErr = e;
                logger.error('rename: setName', e);
            }

            const reason = setErr?.message || "unknown";

            if (interim) {
                try {
                    if (!setErr) {
                        await interim.edit(tUser(guild.id, message.author.id, "rename_success", { channel: `${channel}` }));
                    } else {
                        await interim.edit(tUser(guild.id, message.author.id, "rename_failed", { reason }));
                    }
                } catch (e) { logger.error('rename: edit interim', e); }
            } else {
                if (!setErr) {
                    await message.reply(tUser(guild.id, message.author.id, "rename_success", { channel: `${channel}` }));
                } else {
                    await message.reply(tUser(guild.id, message.author.id, "rename_failed", { reason }));
                }
            }
            return;
        }

        // description
        if (["description"].includes(sub)) {
            const rawDescription = parts.slice(2).join(" ") || null;
            await handleDescriptionCommand(message, rawDescription);
            return;
        }

        // list
        if (["list", "ls"].includes(sub)) {
            await listPrivateChannels(message, arg);
            return;
        }

        // set-category (owner only)
        if (["setcategory", "set-category", "setcat"].includes(sub)) {
            if (!isOwner) {
                await message.reply(tUser(message.guild.id, message.author.id, "not_owner_only"));
                return;
            }

            const categoryId = utils.parseCategoryId(arg);
            if (!categoryId) {
                await message.reply(tUser(message.guild.id, message.author.id, "usage_set_category"));
                return;
            }

            const category = message.guild.channels.cache.get(categoryId) || await message.guild.channels.fetch(categoryId).catch((e) => { logger.error('set-category: fetch category', e); return null; });
            if (!category || category.type !== ChannelType.GuildCategory) {
                await message.reply(tUser(message.guild.id, message.author.id, "category_not_found_owner_fix"));
                return;
            }

            const guildState = getGuildState(message.guild.id);
            guildState.defaultCategoryId = categoryId;
            await saveState();
            await updateActivity(client);
            await message.reply(tUser(message.guild.id, message.author.id, "default_category_set", { category: `${category}` }));
            return;
        }

        // show-category
        if (["showcategory", "show-category", "showcat"].includes(sub)) {
            const guildState = getGuildState(message.guild.id);
            let categoryId = guildState.defaultCategoryId;
            if (!categoryId) {
                const fallback = message.guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory);
                if (fallback) categoryId = fallback.id;
            }
            const category = categoryId
                ? message.guild.channels.cache.get(categoryId) || await message.guild.channels.fetch(categoryId).catch((e) => { logger.error('show-category: fetch category', e); return null; })
                : null;

            if (category) {
                await message.reply(tUser(message.guild.id, message.author.id, "default_category_now", { category: `${category}` }));
            } else if (categoryId) {
                await message.reply(tUser(message.guild.id, message.author.id, "default_category_not_found", { categoryId }));
            } else {
                await message.reply(tUser(message.guild.id, message.author.id, "default_category_unset"));
            }
            return;
        }

        // setpublicchannel (owner only)
        if (["setpublicchannel", "set-public-channel", "setpublic", "set-public"].includes(sub)) {
            if (!isOwner) {
                await message.reply(tUser(message.guild.id, message.author.id, "not_owner_only"));
                return;
            }

            const rawArg = parts.length >= 3 ? parts.slice(2).join(" ") : null;
            const channelId = utils.parseChannelId(rawArg);
                const targetChannel = channelId
                ? message.guild.channels.cache.get(channelId) || await message.guild.channels.fetch(channelId).catch((e) => { logger.error('setpublicchannel: fetch channel', e); return null; })
                : message.channel;

            if (!targetChannel || !targetChannel.isTextBased() || typeof targetChannel.send !== "function") {
                await message.reply(tUser(message.guild.id, message.author.id, "usage_set_public_channel"));
                return;
            }

            const guildState = getGuildState(message.guild.id);
            guildState.publicChannelId = targetChannel.id;
            await saveState();

            await message.reply(tUser(message.guild.id, message.author.id, "public_channel_set", { channel: `${targetChannel.name || targetChannel.id}` }));
            return;
        }

        // public (reply required)
        if (["public", "publish", "share"].includes(sub)) {
            await publishReplyToPublicChannel(message);
            return;
        }

        // archive
        if (["archive", "arch"].includes(sub)) {
            const targetUserId = utils.parseUserId(arg) || (parts.length >= 3 ? utils.parseUserId(parts.slice(2).join(" ")) : null);
            if (targetUserId && message.author.id !== message.guild.ownerId) {
                await message.reply(tUser(message.guild.id, message.author.id, "no_archive_permission"));
                return;
            }

            await archivePrivateChannel(message, targetUserId || null);
            return;
        }

        // delete / remove
        if (["delete", "del", "remove", "rm"].includes(sub)) {
            const channelIdArg = utils.parseChannelId(arg) || (parts.length >= 3 ? utils.parseChannelId(parts.slice(2).join(" ")) : null);
            const targetUserId = utils.parseUserId(arg) || (parts.length >= 3 ? utils.parseUserId(parts.slice(2).join(" ")) : null);

            if (channelIdArg) {
                await deleteByChannelId(message, channelIdArg);
                return;
            }

            if (targetUserId && message.author.id !== message.guild.ownerId) {
                await message.reply(tUser(message.guild.id, message.author.id, "no_delete_permission"));
                return;
            }

            await deletePrivateChannel(message, targetUserId || null);
            return;
        }

        // help
        if (["help", "h", "?"].includes(sub) || !sub) {
            const locale = getUserLocale(message.guild.id, message.author.id);
            await message.reply({ embeds: [buildHelpEmbed(locale)] });
            return;
        }
    });

    client.on(Events.MessageReactionAdd, async (reaction, user) => {
        await handleRequestReaction(reaction, user).catch((e) => logger.error('handleRequestReaction', e));
    });
}

/**
 * @param {DiscordClient} client
 * @param {DiscordMessage} message
 */
async function createPrivateChannel(client, message) {
    const guild = message.guild;
    if (!guild) return;

    const guildState = getGuildState(guild.id);
    const categoryId = guildState.defaultCategoryId;
    if (!categoryId) {
        await message.reply(tUser(guild.id, message.author.id, "no_default_category"));
        return;
    }

    const category = guild.channels.cache.get(categoryId) || await guild.channels.fetch(categoryId).catch((e) => { logger.error('createPrivateChannel: fetch category', e); return null; });
    if (!category || category.type !== ChannelType.GuildCategory) {
        await message.reply(tUser(guild.id, message.author.id, "category_not_found_owner_fix"));
        return;
    }

    const existing = guildState.channels[message.author.id];
    if (existing) {
        const channel = guild.channels.cache.get(existing.channelId);
        await message.reply(
            channel
                ? tUser(guild.id, message.author.id, "already_created", { channel: `${channel}` })
                : tUser(guild.id, message.author.id, "existing_info_missing_entity")
        );
        return;
    }

    const member = await guild.members.fetch(message.author.id);
    const channelNameBase = utils.normalizeChannelName(`${message.author.username}-${message.author.id.slice(-4)}`);

    let channel = null;
    try {
        channel = await guild.channels.create({
            name: `${channelNameBase}-room`,
            type: ChannelType.GuildText,
            parent: category.id,
            permissionOverwrites: [
            {
                id: guild.roles.everyone.id,
                deny: [PermissionsBitField.Flags.ViewChannel]
            },
            {
                id: member.id,
                allow: [
                    PermissionsBitField.Flags.ViewChannel,
                    PermissionsBitField.Flags.SendMessages,
                    PermissionsBitField.Flags.ReadMessageHistory,
                    PermissionsBitField.Flags.AttachFiles,
                    PermissionsBitField.Flags.EmbedLinks,
                    PermissionsBitField.Flags.AddReactions
                ],
                deny: [
                    PermissionsBitField.Flags.SendMessagesInThreads,
                    PermissionsBitField.Flags.CreatePublicThreads,
                    PermissionsBitField.Flags.CreatePrivateThreads
                ]
            },
            {
                id: client.user.id,
                allow: [
                    PermissionsBitField.Flags.ViewChannel,
                    PermissionsBitField.Flags.SendMessages,
                    PermissionsBitField.Flags.ReadMessageHistory,
                    PermissionsBitField.Flags.ManageMessages,
                    PermissionsBitField.Flags.EmbedLinks,
                    PermissionsBitField.Flags.AddReactions,
                    PermissionsBitField.Flags.PinMessages
                ],
                deny: [
                    PermissionsBitField.Flags.SendMessagesInThreads,
                    PermissionsBitField.Flags.CreatePublicThreads,
                    PermissionsBitField.Flags.CreatePrivateThreads
                ]
            }
        ]
    });
    } catch (e) {
        logger.error('createPrivateChannel: create channel', e);
        await message.reply(tUser(guild.id, message.author.id, "create_failed", { reason: e?.message || String(e) }));
        return;
    }

    guildState.channels[message.author.id] = {
        guildId: guild.id,
        ownerId: message.author.id,
        roleId: null,
        channelId: channel.id,
        categoryId: category.id,
        description: "",
        requests: {}
    };

    await saveState();
    await updateActivity(client);
    await message.reply(tUser(guild.id, message.author.id, "created_channel", { channel: `${channel}` }));
}

/**
 * @param {DiscordMessage} message
 * @param {string} targetUserId
 */
async function requestToJoin(message, targetUserId) {
    const guild = message.guild;
    if (!guild) return;

    const guildState = getGuildState(guild.id);
    const target = guildState.channels[targetUserId];
    if (!target) {
        await message.reply(tUser(guild.id, message.author.id, "target_channel_not_found"));
        return;
    }

    target.requests ??= {};

    if (message.author.id === targetUserId) {
        await message.reply(tUser(guild.id, message.author.id, "cannot_request_own"));
        return;
    }

    const channel = await guild.channels.fetch(target.channelId).catch((e) => { logger.error('requestToJoin: fetch channel', e); return null; });
    if (!channel || channel.type !== ChannelType.GuildText) {
        await message.reply(tUser(guild.id, message.author.id, "target_channel_not_found_admin"));
        return;
    }

    const existingRequest = Object.values(target.requests).find((request) => request?.requesterId === message.author.id && request.status !== "expired");
    if (existingRequest) {
        if (existingRequest.status === "approved") {
            await channel.permissionOverwrites.edit(message.author.id, {
                ViewChannel: true,
                ReadMessageHistory: true,
                SendMessages: false,
                AttachFiles: false,
                EmbedLinks: false,
                AddReactions: false,
                SendMessagesInThreads: false,
                CreatePublicThreads: false,
                CreatePrivateThreads: false
            }).catch((e) => logger.error('requestToJoin: reapply approved overwrite', e));

            await message.reply(tUser(guild.id, message.author.id, "already_approved"));
            return;
        }

        await message.reply(tUser(guild.id, message.author.id, "already_requested"));
        return;
    }

    const requester = await guild.members.fetch(message.author.id);
    const ownerLocale = getUserLocale(guild.id, targetUserId);
    const requestMessage = await channel.send({ embeds: [buildRequestEmbed(ownerLocale, requester.user, channel)] });
    await requestMessage.pin().catch((e) => logger.error('requestToJoin: pin', e));
    await requestMessage.react(APPROVE_EMOJI).catch((e) => logger.error('requestToJoin: react approve', e));
    await requestMessage.react(REJECT_EMOJI).catch((e) => logger.error('requestToJoin: react reject', e));

    target.requests[requestMessage.id] = {
        requesterId: message.author.id,
        status: "pending",
        createdAt: Date.now()
    };

    await saveState();
    await message.reply(tUser(guild.id, message.author.id, "request_sent", { channel: `${channel}` }));
}

/**
 * @param {DiscordMessage} message
 * @param {string|null} pageArg
 */
async function listPrivateChannels(message, pageArg) {
    const guild = message.guild;
    if (!guild) return;

    const locale = getUserLocale(guild.id, message.author.id);
    const guildState = getGuildState(guild.id);
    const entries = Object.values(guildState.channels || {});
    if (!entries.length) {
        await message.reply(t(locale, "no_private_channels"));
        return;
    }

    const pageSize = 10;
    const totalPages = Math.max(1, Math.ceil(entries.length / pageSize));
    const page = pageArg ? Number.parseInt(pageArg, 10) : 1;

    if (!Number.isInteger(page) || page < 1) {
        await message.reply(t(locale, "list_page_invalid", { prefix: PREFIX }));
        return;
    }

    if (page > totalPages) {
        await message.reply(t(locale, "list_page_out_of_range", { page, totalPages, prefix: PREFIX }));
        return;
    }

    const embed = new EmbedBuilder()
        .setTitle(t(locale, "created_list_title"))
        .setColor(0x00b0f4)
        .setTimestamp()
        .setFooter({ text: t(locale, "list_page_footer", { page, totalPages }) });

    const pageEntries = entries.slice((page - 1) * pageSize, page * pageSize);

    for (const entry of pageEntries) {
        const channel = guild.channels.cache.get(entry.channelId) || await guild.channels.fetch(entry.channelId).catch((e) => { logger.error('listPrivateChannels: fetch channel', e); return null; });
        const channelLabel = channel ? `${channel}` : t(locale, "channel_id_label", { channelId: entry.channelId });
        const ownerMention = `<@${entry.ownerId}>`;
        const description = (entry.description || "").trim();
        const descriptionText = description
            ? (description.length > 900 ? `${description.slice(0, 900)}...` : description)
            : t(locale, "description_unset");
        embed.addFields({
            name: channelLabel,
            value: `${t(locale, "owner_label", { owner: ownerMention })}\n${t(locale, "description_label", { description: descriptionText })}`,
            inline: false
        });
    }

    await message.reply({ embeds: [embed] });
}

/**
 * @param {DiscordMessage} message
 * @param {string|null} targetUserId
 */
async function archivePrivateChannel(message, targetUserId) {
    const guild = message.guild;
    if (!guild) return;

    const guildState = getGuildState(guild.id);
    const ownerId = targetUserId ?? message.author.id;
    const entry = guildState.channels[ownerId];

    if (!entry) {
        await message.reply(tUser(guild.id, message.author.id, "target_channel_not_found"));
        return;
    }

    const isOwner = message.author.id === message.guild.ownerId;
    if (message.author.id !== ownerId && !isOwner) {
        await message.reply(tUser(guild.id, message.author.id, "no_archive_permission"));
        return;
    }

    const channel = await guild.channels.fetch(entry.channelId).catch((e) => { logger.error('archivePrivateChannel: fetch channel', e); return null; });

    if (!channel) {
        await message.reply(tUser(guild.id, message.author.id, "target_channel_not_found_admin"));
        return;
    }

    const suffix = "-archived";
    await utils.safeRenameChannel(channel, suffix);

    try {
        await channel.permissionOverwrites.edit(entry.ownerId, { SendMessages: false, AttachFiles: false, AddReactions: false }).catch((e) => logger.error('archivePrivateChannel: edit overwrite owner', e));
    } catch (e) { logger.error('archivePrivateChannel: edit overwrite owner exception', e); }

    const approvedRequesters = Object.values(entry.requests || {}).filter((r) => r?.status === "approved").map((r) => r.requesterId);
    for (const requesterId of approvedRequesters) {
        try {
            await channel.permissionOverwrites.edit(requesterId, {
                ViewChannel: true,
                ReadMessageHistory: true,
                SendMessages: false,
                AttachFiles: false,
                EmbedLinks: false,
                AddReactions: false,
                SendMessagesInThreads: false,
                CreatePublicThreads: false,
                CreatePrivateThreads: false
            }).catch((e) => logger.error('archivePrivateChannel: edit overwrite requester', e));
        } catch (e) { logger.error('archivePrivateChannel: edit overwrite requester exception', e); }
    }

    guildState.archives[ownerId] = Object.assign({}, entry, { archivedAt: Date.now() });
    delete guildState.channels[ownerId];

    await saveState();
    await updateActivity(message.client);
    await message.reply(tUser(guild.id, message.author.id, "archived_channel", { channel: `${channel}` }));
}

/**
 * @param {DiscordMessage} message
 * @param {string|null} targetUserId
 */
async function deletePrivateChannel(message, targetUserId) {
    const guild = message.guild;
    if (!guild) return;

    const guildState = getGuildState(guild.id);
    const ownerId = targetUserId ?? message.author.id;
    const entry = guildState.channels[ownerId] ?? guildState.archives[ownerId];

    if (!entry) {
        await message.reply(tUser(guild.id, message.author.id, "target_channel_not_found"));
        return;
    }

    const isOwner = message.author.id === message.guild.ownerId;
    if (message.author.id !== entry.ownerId && !isOwner) {
        await message.reply(tUser(guild.id, message.author.id, "no_delete_permission"));
        return;
    }

    if (entry.channelId) {
        const channel = await guild.channels.fetch(entry.channelId).catch((e) => { logger.error('deletePrivateChannel: fetch channel', e); return null; });
        if (channel) {
            try {
                await channel.delete().catch((e) => logger.error('deletePrivateChannel: delete channel', e));
            } catch (e) { logger.error('deletePrivateChannel: delete channel exception', e); }
        }
    }

    if (entry.roleId) {
        const role = await guild.roles.fetch(entry.roleId).catch((e) => { logger.error('deletePrivateChannel: fetch role', e); return null; });
        if (role) {
            try {
                await role.delete().catch((e) => logger.error('deletePrivateChannel: delete role', e));
            } catch (e) { logger.error('deletePrivateChannel: delete role exception', e); }
        }
    }

    delete guildState.channels[ownerId];
    delete guildState.archives[ownerId];

    await saveState();
    await updateActivity(message.client);
    await message.reply(tUser(guild.id, message.author.id, "deleted_channel_role_state"));
}

/**
 * @param {DiscordMessage} message
 * @param {string} channelId
 */
async function deleteByChannelId(message, channelId) {
    const guild = message.guild;
    if (!guild) return;

    const guildState = getGuildState(guild.id);

    let ownerId = null;
    let collection = null;
    for (const [k, v] of Object.entries(guildState.channels || {})) {
        if (v.channelId === channelId) {
            ownerId = k;
            collection = "channels";
            break;
        }
    }
    if (!ownerId) {
        for (const [k, v] of Object.entries(guildState.archives || {})) {
            if (v.channelId === channelId) {
                ownerId = k;
                collection = "archives";
                break;
            }
        }
    }

    const entry = ownerId ? guildState[collection][ownerId] : null;

    if (!entry) {
        if (message.author.id === message.guild.ownerId) {
            const raw = await guild.channels.fetch(channelId).catch((e) => { logger.error('deleteByChannelId: fetch raw channel', e); return null; });
            if (raw) {
                try {
                    await raw.delete().catch((e) => logger.error('deleteByChannelId: delete raw channel', e));
                } catch (e) { logger.error('deleteByChannelId: delete raw channel exception', e); }
                await updateActivity(message.client);
                await message.reply(tUser(guild.id, message.author.id, "deleted_untracked_channel"));
                return;
            }
        }

        await message.reply(tUser(guild.id, message.author.id, "no_channel_tracking_found"));
        return;
    }

    const isOwner = message.author.id === message.guild.ownerId;
    if (message.author.id !== entry.ownerId && !isOwner) {
        await message.reply(tUser(guild.id, message.author.id, "no_delete_permission"));
        return;
    }

    if (entry.channelId) {
        const channel = await guild.channels.fetch(entry.channelId).catch((e) => { logger.error('deleteByChannelId: fetch channel', e); return null; });
        if (channel) {
            try {
                await channel.delete().catch((e) => logger.error('deleteByChannelId: delete channel', e));
            } catch (e) { logger.error('deleteByChannelId: delete channel exception', e); }
        }
    }

        if (entry.roleId) {
        const role = await guild.roles.fetch(entry.roleId).catch((e) => { logger.error('deleteByChannelId: fetch role', e); return null; });
        if (role) {
            try {
                await role.delete().catch((e) => logger.error('deleteByChannelId: delete role', e));
            } catch (e) { logger.error('deleteByChannelId: delete role exception', e); }
        }
    }

    delete guildState.channels[ownerId];
    delete guildState.archives[ownerId];

    await saveState();
    await message.reply(tUser(guild.id, message.author.id, "deleted_channel_role_by_id"));
}

/**
 * @param {DiscordMessageReaction} reaction
 * @param {DiscordUser} user
 */
async function handleRequestReaction(reaction, user) {
    if (user.bot) return;

    const message = reaction.message.partial ? await reaction.message.fetch().catch((e) => { logger.error('handleRequestReaction: fetch message', e); return null; }) : reaction.message;
    if (!message || !message.guild) return;

    const guildState = state.guilds[message.guild.id];
    if (!guildState) return;

    const ownerEntry = Object.values(guildState.channels).find((entry) => entry.channelId === message.channel.id);
    if (!ownerEntry) return;

    const request = ownerEntry.requests?.[message.id];
    if (!request || request.status !== "pending") return;

    const emoji = reaction.emoji.name;
    if (emoji !== APPROVE_EMOJI && emoji !== REJECT_EMOJI) return;
    if (user.id !== ownerEntry.ownerId) return;

    const locale = getUserLocale(message.guild.id, user.id);
    const requesterMember = await message.guild.members.fetch(request.requesterId).catch((e) => { logger.error('handleRequestReaction: fetch requester member', e); return null; });
    if (!requesterMember) {
        request.status = "expired";
        await saveState();
        await message
            .edit({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xff8800)
                        .setTitle(t(locale, "request_embed_title"))
                        .setDescription(t(locale, "requester_not_in_guild"))
                ]
            })
            .catch((e) => logger.error('handleRequestReaction: edit expired message', e));
        await message.unpin().catch((e) => logger.error('handleRequestReaction: unpin expired message', e));
        return;
    }

    if (emoji === APPROVE_EMOJI) {
        await message.channel.permissionOverwrites.edit(requesterMember.id, {
            ViewChannel: true,
            ReadMessageHistory: true,
            SendMessages: false,
            AttachFiles: false,
            EmbedLinks: false,
            AddReactions: false,
            SendMessagesInThreads: false,
            CreatePublicThreads: false,
            CreatePrivateThreads: false
        }).catch((e) => logger.error('handleRequestReaction: edit overwrite requester', e));
        request.status = "approved";
        await message
            .edit({
                embeds: [
                    new EmbedBuilder()
                        .setTitle(t(locale, "request_embed_title"))
                        .setDescription(t(locale, "request_approved", { user: `${requesterMember.user}` }))
                        .setColor(0x2ecc71)
                        .setTimestamp()
                ]
            })
            .catch((e) => logger.error('handleRequestReaction: edit approved message', e));
    } else {
        request.status = "denied";
        await message
            .edit({
                embeds: [
                    new EmbedBuilder()
                        .setTitle(t(locale, "request_embed_title"))
                        .setDescription(t(locale, "request_denied", { user: `${requesterMember.user}` }))
                        .setColor(0xe74c3c)
                        .setTimestamp()
                ]
            })
            .catch((e) => logger.error('handleRequestReaction: edit denied message', e));
    }

    await message.unpin().catch((e) => logger.error('handleRequestReaction: unpin final', e));
    await saveState();
}

/**
 * @param {DiscordMessage} message
 */
async function publishReplyToPublicChannel(message) {
    const guild = message.guild;
    if (!guild) return;

    const guildState = getGuildState(guild.id);
    const locale = getUserLocale(guild.id, message.author.id);
    const publicChannelId = guildState.publicChannelId;

    if (!publicChannelId) {
        await message.reply(t(locale, "no_public_channel", { prefix: PREFIX }));
        return;
    }

    const sourceEntry = getManagedChannelEntryByChannelId(guildState, message.channel.id);
    if (!sourceEntry) {
        await message.reply(t(locale, "public_not_in_managed_channel"));
        return;
    }

    const isOwner = message.author.id === guild.ownerId;
    if (message.author.id !== sourceEntry.ownerId && !isOwner) {
        await message.reply(t(locale, "no_public_permission"));
        return;
    }

    if (!message.reference?.messageId) {
        await message.reply(t(locale, "usage_public", { prefix: PREFIX }));
        return;
    }

    const referenced = await message.fetchReference().catch((e) => { logger.error('publishReplyToPublicChannel: fetchReference', e); return null; });
    if (!referenced || referenced.guild?.id !== guild.id) {
        await message.reply(t(locale, "public_reply_not_found"));
        return;
    }

    const publicChannel = guild.channels.cache.get(publicChannelId)
        || await guild.channels.fetch(publicChannelId).catch((e) => { logger.error('publishReplyToPublicChannel: fetch public channel', e); return null; });

    if (!publicChannel || !publicChannel.isTextBased() || typeof publicChannel.send !== "function") {
        await message.reply(t(locale, "public_channel_not_found"));
        return;
    }

    const files = [...(referenced.attachments?.values() ?? [])].slice(0, 10).map((a) => ({
        attachment: a.url,
        name: a.name || undefined
    }));

    const omittedFileCount = Math.max(0, (referenced.attachments?.size || 0) - files.length);

    const forwardHeader = t(locale, "public_forward_header", {
        channel: `#${message.channel.name || message.channel.id}`,
        author: `${referenced.author}`,
        url: referenced.url
    });

    let combinedContent = [
        forwardHeader,
        t(locale, "public_content_start"),
        referenced.content && referenced.content.length > 0 ? referenced.content : t(locale, "public_no_text")
    ].join("\n");

    if (omittedFileCount > 0) {
        combinedContent += `\n${t(locale, "public_files_omitted", { count: omittedFileCount })}`;
    }

    if (combinedContent.length > 2000) {
        const suffix = `\n${t(locale, "public_truncated")}`;
        const limit = Math.max(1, 2000 - suffix.length);
        combinedContent = `${combinedContent.slice(0, limit)}${suffix}`;
    }

    // Minimal embed per user request: source channel, sender mention, message content
    const sourceText = `#${message.channel.name || message.channel.id}`;
    const senderMention = referenced.author?.id ? `<@${referenced.author.id}>` : `${referenced.author}`;
    const messageText = referenced.content && referenced.content.length > 0 ? referenced.content : t(locale, "public_no_text");

    // Ensure message length fits in an embed field (Discord limit ~1024)
    let fieldMessage = messageText;
    if (fieldMessage.length > 1000) {
        fieldMessage = `${fieldMessage.slice(0, 1000)}...`;
    }

    const embed = new EmbedBuilder()
        .setColor(0x00b0f4)
        .addFields(
            { name: t(locale, "public_field_source"), value: sourceText, inline: true },
            { name: t(locale, "public_field_sender"), value: senderMention, inline: true },
            { name: t(locale, "public_field_message"), value: fieldMessage, inline: false }
        );

    const sent = await publicChannel.send({ embeds: [embed], files }).catch((e) => { logger.error('publishReplyToPublicChannel: send to public channel', e); return null; });

    const postedLink = sent ? (sent.url || `https://discord.com/channels/${guild.id}/${publicChannel.id}/${sent.id}`) : null;
    await message.reply(t(locale, "public_sent", { url: postedLink }));
}

/**
 * Update permission overwrites for all managed channels to match createPrivateChannel defaults.
 * @param {DiscordClient} client
 */
async function updateManagedChannelsPermissions(client) {
    for (const [guildId, guildState] of Object.entries(state.guilds || {})) {
        try {
            const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
            if (!guild) continue;

            for (const [ownerId, entry] of Object.entries(guildState.channels || {})) {
                try {
                    const channel = guild.channels.cache.get(entry.channelId) || await guild.channels.fetch(entry.channelId).catch(() => null);
                    if (!channel || channel.type !== ChannelType.GuildText) continue;

                    const ownerMember = entry.ownerId ? await guild.members.fetch(entry.ownerId).catch(() => null) : null;
                    const approvedRequesters = Object.values(entry.requests || {}).filter((r) => r?.status === "approved").map((r) => r.requesterId);

                    // everyone: deny view
                    try {
                        await channel.permissionOverwrites.edit(guild.roles.everyone.id, { ViewChannel: false }).catch(() => null);
                    } catch (e) { /* ignore */ }

                    // owner: allow send/read/etc
                    if (ownerMember) {
                        try {
                            await channel.permissionOverwrites.edit(entry.ownerId, {
                                ViewChannel: true,
                                SendMessages: true,
                                ReadMessageHistory: true,
                                AttachFiles: true,
                                EmbedLinks: true,
                                AddReactions: true,
                                SendMessagesInThreads: false,
                                CreatePublicThreads: false,
                                CreatePrivateThreads: false
                            }).catch(() => null);
                        } catch (e) { /* ignore */ }
                    }

                    // approved requester members: allow read only
                    for (const requesterId of approvedRequesters) {
                        try {
                            await channel.permissionOverwrites.edit(requesterId, {
                                ViewChannel: true,
                                ReadMessageHistory: true,
                                SendMessages: false,
                                AttachFiles: false,
                                EmbedLinks: false,
                                AddReactions: false,
                                SendMessagesInThreads: false,
                                CreatePublicThreads: false,
                                CreatePrivateThreads: false
                            }).catch(() => null);
                        } catch (e) { /* ignore */ }
                    }

                    // bot: allow manage/send/read
                    try {
                        await channel.permissionOverwrites.edit(client.user.id, {
                            ViewChannel: true,
                            SendMessages: true,
                            ReadMessageHistory: true,
                            ManageMessages: true,
                            PinMessages: true,
                            EmbedLinks: true,
                            AddReactions: true,
                            SendMessagesInThreads: false,
                            CreatePublicThreads: false,
                            CreatePrivateThreads: false
                        }).catch(() => null);
                    } catch (e) { /* ignore */ }

                    // cleanup stale legacy role overwrite if the role is already removed
                    if (entry.roleId) {
                        try {
                            await channel.permissionOverwrites.delete(entry.roleId).catch(() => null);
                        } catch (e) { /* ignore */ }
                        entry.roleId = null;
                    }

                } catch (e) {
                    logger.error('updateManagedChannelsPermissions: per-channel', e);
                }
            }
        } catch (e) {
            logger.error('updateManagedChannelsPermissions: per-guild', e);
        }
    }

    await saveState().catch((e) => logger.error('updateManagedChannelsPermissions: saveState', e));
}

module.exports = { attachHandlers };
