const { EmbedBuilder, Events, ActivityType, ChannelType, PermissionsBitField } = require("discord.js");
const { state, loadState, saveState, getGuildState } = require("./lib/state");
const { t, normalizeLocale, DEFAULT_LOCALE } = require("./lib/i18n");
const utils = require("./lib/utils");
const logger = require("./lib/logger");

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
/** @typedef {import('./lib/state.ts').GuildState} GuildState */

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
 * @param {string} locale
 * @param {DiscordUser} requester
 * @param {import('discord.js').GuildChannel | import('discord.js').TextChannel} channel
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
            { name: `${PREFIX} list`, value: t(locale, "help_list"), inline: false },
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
 * @returns {any|null}
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
 * @param {DiscordClient} client
 */
function attachHandlers(client) {
    client.on(Events.ClientReady, async () => {
        await loadState();
        console.log(`Logged in as ${client.user.tag}`);
        // synchronize managed channels' permission overwrites at startup
        try {
            await updateManagedChannelsPermissions(client);
        } catch (e) { logger.error('updateManagedChannelsPermissions', e); }
        await updateActivity(client);
        setInterval(() => updateActivity(client).catch((e) => logger.error('updateActivity interval', e)), 60 * 1000);
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

        // list
        if (["list", "ls"].includes(sub)) {
            await listPrivateChannels(message);
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

    const role = await guild.roles.create({
        name: `${message.author.username} channel`,
        hoist: false,
        mentionable: false,
        permissions: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.ReadMessageHistory
        ]
    });

    const channel = await guild.channels.create({
        name: `${channelNameBase}-room`,
        type: ChannelType.GuildText,
        parent: category.id,
        permissionOverwrites: [
            {
                id: guild.roles.everyone.id,
                deny: [PermissionsBitField.Flags.ViewChannel]
            },
            {
                id: role.id,
                allow: [
                    PermissionsBitField.Flags.ViewChannel,
                    PermissionsBitField.Flags.ReadMessageHistory
                ],
                deny: [
                    PermissionsBitField.Flags.SendMessages,
                    PermissionsBitField.Flags.AttachFiles,
                    PermissionsBitField.Flags.EmbedLinks,
                    PermissionsBitField.Flags.AddReactions
                ]
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
                    PermissionsBitField.Flags.AddReactions
                ]
            }
        ]
    });

    await member.roles.add(role.id).catch((e) => logger.error('createPrivateChannel: add role', e));

    guildState.channels[message.author.id] = {
        guildId: guild.id,
        ownerId: message.author.id,
        roleId: role.id,
        channelId: channel.id,
        categoryId: category.id,
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

    if (message.author.id === targetUserId) {
        await message.reply(tUser(guild.id, message.author.id, "cannot_request_own"));
        return;
    }

    const channel = await guild.channels.fetch(target.channelId).catch((e) => { logger.error('requestToJoin: fetch channel', e); return null; });
    if (!channel || channel.type !== ChannelType.GuildText) {
        await message.reply(tUser(guild.id, message.author.id, "target_channel_not_found_admin"));
        return;
    }

    const pending = Object.entries(target.requests ?? {}).find(([, request]) => request.requesterId === message.author.id && request.status === "pending");
    if (pending) {
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
 */
async function listPrivateChannels(message) {
    const guild = message.guild;
    if (!guild) return;

    const locale = getUserLocale(guild.id, message.author.id);
    const guildState = getGuildState(guild.id);
    const entries = Object.values(guildState.channels || {});
    if (!entries.length) {
        await message.reply(t(locale, "no_private_channels"));
        return;
    }

    const embed = new EmbedBuilder()
        .setTitle(t(locale, "created_list_title"))
        .setColor(0x00b0f4)
        .setTimestamp();

    for (const entry of entries) {
        const channel = guild.channels.cache.get(entry.channelId) || await guild.channels.fetch(entry.channelId).catch((e) => { logger.error('listPrivateChannels: fetch channel', e); return null; });
        const channelLabel = channel ? `${channel}` : t(locale, "channel_id_label", { channelId: entry.channelId });
        const ownerMention = `<@${entry.ownerId}>`;
        embed.addFields({ name: channelLabel, value: t(locale, "owner_label", { owner: ownerMention }), inline: false });
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
    const role = await guild.roles.fetch(entry.roleId).catch((e) => { logger.error('archivePrivateChannel: fetch role', e); return null; });

    if (!channel) {
        await message.reply(tUser(guild.id, message.author.id, "target_channel_not_found_admin"));
        return;
    }

    const suffix = "-archived";
    await utils.safeRenameChannel(channel, suffix);
    if (role) await utils.safeRenameRole(role, `${suffix}-${Date.now().toString().slice(-4)}`);

    if (role) {
        try {
            await channel.permissionOverwrites.edit(role.id, { SendMessages: false, ViewChannel: true }).catch((e) => logger.error('archivePrivateChannel: edit overwrite role', e));
        } catch (e) { logger.error('archivePrivateChannel: edit overwrite role exception', e); }
    }

    try {
        await channel.permissionOverwrites.edit(entry.ownerId, { SendMessages: false, AttachFiles: false, AddReactions: false }).catch((e) => logger.error('archivePrivateChannel: edit overwrite owner', e));
    } catch (e) { logger.error('archivePrivateChannel: edit overwrite owner exception', e); }

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

    const role = await message.guild.roles.fetch(ownerEntry.roleId).catch((e) => { logger.error('handleRequestReaction: fetch role', e); return null; });
    if (!role) {
        await message.channel.send(t(locale, "role_not_found")).catch((e) => logger.error('handleRequestReaction: send role_not_found', e));
        return;
    }

    if (emoji === APPROVE_EMOJI) {
        await requesterMember.roles.add(role.id).catch((e) => logger.error('handleRequestReaction: add role to requester', e));
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

                    // fetch role and member references where possible
                    const role = entry.roleId ? await guild.roles.fetch(entry.roleId).catch(() => null) : null;
                    const ownerMember = entry.ownerId ? await guild.members.fetch(entry.ownerId).catch(() => null) : null;

                    // everyone: deny view
                    try {
                        await channel.permissionOverwrites.edit(guild.roles.everyone.id, { ViewChannel: false }).catch(() => null);
                    } catch (e) { /* ignore */ }

                    // role: allow view/read, deny send/attach/embed/reactions
                    if (role) {
                        try {
                            await channel.permissionOverwrites.edit(role.id, {
                                ViewChannel: true,
                                ReadMessageHistory: true,
                                SendMessages: false,
                                AttachFiles: false,
                                EmbedLinks: false,
                                AddReactions: false
                            }).catch(() => null);
                        } catch (e) { /* ignore */ }
                    }

                    // owner: allow send/read/etc
                    if (ownerMember) {
                        try {
                            await channel.permissionOverwrites.edit(entry.ownerId, {
                                ViewChannel: true,
                                SendMessages: true,
                                ReadMessageHistory: true,
                                AttachFiles: true,
                                EmbedLinks: true,
                                AddReactions: true
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
                            EmbedLinks: true,
                            AddReactions: true
                        }).catch(() => null);
                    } catch (e) { /* ignore */ }

                } catch (e) {
                    logger.error('updateManagedChannelsPermissions: per-channel', e);
                }
            }
        } catch (e) {
            logger.error('updateManagedChannelsPermissions: per-guild', e);
        }
    }
}

module.exports = { attachHandlers };
