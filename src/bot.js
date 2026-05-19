const { EmbedBuilder, Events, ActivityType, ChannelType, PermissionsBitField } = require("discord.js");
const { state, loadState, saveState, getGuildState } = require("./lib/state");
const utils = require("./lib/utils");

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

async function updateActivity(client) {
    try {
        const total = getTotalManagedChannels();
        const text = total > 0 ? `Managing ${total} channels • ${PREFIX} help` : `${PREFIX} help`;
        await client.user.setActivity(text, { type: ActivityType.Watching });
    } catch (e) {
        console.error('Failed to update activity:', e);
    }
}

function buildRequestEmbed(requester, channel) {
    return new EmbedBuilder()
        .setTitle("チャンネル参加リクエスト")
        .setDescription(`${requester} さんが入りたがっています。許可しますか？`)
        .addFields(
            { name: "対象チャンネル", value: `${channel}`, inline: true },
            { name: "申請者", value: `${requester.tag} (${requester.id})`, inline: false }
        )
        .setColor(0x00b0f4)
        .setTimestamp();
}

function attachHandlers(client) {
    client.on(Events.ClientReady, async () => {
        await loadState();
        console.log(`Logged in as ${client.user.tag}`);
        await updateActivity(client);
        setInterval(() => updateActivity(client).catch(() => null), 60 * 1000);
    });

    client.on(Events.MessageCreate, async (message) => {
        if (!message.guild || message.author.bot) return;
        if (!message.content.startsWith(PREFIX)) return;

        const parts = message.content.trim().split(/\s+/);
        const sub = (parts[1] || "").toLowerCase();
        const arg = parts[2];
        const isOwner = message.author.id === message.guild.ownerId;

        // create
        if (["create", "new"].includes(sub)) {
            await createPrivateChannel(client, message);
            return;
        }

        // request / rq
        if (["rq", "request", "apply"].includes(sub)) {
            const targetUserId = utils.parseUserId(arg) || (parts.length >= 3 ? utils.parseUserId(parts.slice(2).join(" ")) : null);
            if (!targetUserId) {
                await message.reply(`使い方: ${PREFIX} request <@User|UserId>`);
                return;
            }

            await requestToJoin(client, message, targetUserId);
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
                await message.reply("このコマンドはサーバーオーナー専用です。");
                return;
            }

            const categoryId = utils.parseCategoryId(arg);
            if (!categoryId) {
                await message.reply(`使い方: ${PREFIX} set-category <CategoryId> (例: <#123456789012345678>)`);
                return;
            }

            const category = message.guild.channels.cache.get(categoryId) || await message.guild.channels.fetch(categoryId).catch(() => null);
            if (!category || category.type !== ChannelType.GuildCategory) {
                await message.reply("指定されたカテゴリが見つかりませんでした。正しいカテゴリIDを指定してください。");
                return;
            }

            const guildState = getGuildState(message.guild.id);
            guildState.defaultCategoryId = categoryId;
            await saveState();
            await updateActivity(client);
            await message.reply(`デフォルトカテゴリを設定しました: ${category}`);
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
            const category = message.guild.channels.cache.get(categoryId) || await message.guild.channels.fetch(categoryId).catch(() => null);
            await message.reply(category ? `現在のデフォルトカテゴリ: ${category}` : `現在のデフォルトカテゴリ: ${categoryId || '未設定'} (見つかりませんでした)`);
            return;
        }

        // archive
        if (["archive", "arch"].includes(sub)) {
            const targetUserId = utils.parseUserId(arg) || (parts.length >= 3 ? utils.parseUserId(parts.slice(2).join(" ")) : null);
            if (targetUserId && message.author.id !== message.guild.ownerId) {
                await message.reply("他のユーザーのチャンネルをアーカイブするにはサーバー所有者である必要があります。");
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
                await message.reply("他のユーザーのチャンネルを削除するにはサーバー所有者である必要があります。");
                return;
            }

            await deletePrivateChannel(message, targetUserId || null);
            return;
        }

        // help
        if (["help", "h", "?"].includes(sub) || !sub) {
            const help = new EmbedBuilder()
                .setTitle('Twicord — コマンドヘルプ')
                .setColor(0x00b0f4)
                .setDescription('主要コマンドの使い方と例です。サーバーオーナー向けコマンドは権限が必要です。')
                .addFields(
                    { name: `${PREFIX} create`, value: '自分専用のプライベートチャンネルを作成します。例: `!twicord create`', inline: false },
                    { name: `${PREFIX} request <@User|UserId>`, value: '指定ユーザーのチャンネルへ参加申請を送信します。例: `!twicord request @Alice`', inline: false },
                    { name: `${PREFIX} list`, value: '作成済みプライベートチャンネルの一覧を表示します。', inline: false },
                    { name: `${PREFIX} set-category <CategoryId> (Owner)`, value: 'サーバーオーナーのみ。デフォルト作成カテゴリを設定します。例: `!twicord set-category <#123...>`', inline: false },
                    { name: `${PREFIX} show-category`, value: '現在設定されているデフォルトカテゴリを表示します。', inline: false },
                    { name: `${PREFIX} archive [@User|UserId]`, value: '自分のチャンネルをアーカイブします（オーナーは他ユーザーを指定可）。アーカイブ後は書き込み不可になります。', inline: false },
                    { name: `${PREFIX} delete <#channel|ChannelId|@User|UserId>`, value: '自分のチャンネルを削除します。サーバーオーナーは他ユーザーやチャンネルID指定で削除可能。', inline: false }
                )
                .setFooter({ text: `コマンドプレフィックス: ${PREFIX}` })
                .setTimestamp();

            await message.reply({ embeds: [help] });
            return;
        }
    });

    client.on(Events.MessageReactionAdd, async (reaction, user) => {
        await handleRequestReaction(reaction, user).catch(() => null);
    });
}

async function createPrivateChannel(client, message) {
    const guild = message.guild;
    if (!guild) return;

    const guildState = getGuildState(guild.id);
    const categoryId = guildState.defaultCategoryId;
    if (!categoryId) {
        await message.reply("デフォルトカテゴリが設定されていません。サーバーオーナーは `!twicord set-category <CategoryId>` で設定してください。");
        return;
    }

    const category = guild.channels.cache.get(categoryId) || await guild.channels.fetch(categoryId).catch(() => null);
    if (!category || category.type !== ChannelType.GuildCategory) {
        await message.reply("指定されたカテゴリが見つかりませんでした。サーバーオーナーは正しいカテゴリIDを設定してください。");
        return;
    }

    const existing = guildState.channels[message.author.id];
    if (existing) {
        const channel = guild.channels.cache.get(existing.channelId);
        await message.reply(channel ? `すでに作成済みです: ${channel}` : "すでにチャンネル情報はありますが、実体が見つかりませんでした。管理者に確認してください。");
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
                deny: [PermissionsBitField.Flags.SendMessages]
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

    await member.roles.add(role.id).catch(() => null);

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
    await message.reply(`チャンネルを作成しました: ${channel}`);
}

async function requestToJoin(client, message, targetUserId) {
    const guild = message.guild;
    if (!guild) return;

    const guildState = getGuildState(guild.id);
    const target = guildState.channels[targetUserId];
    if (!target) {
        await message.reply("そのユーザーのチャンネルは見つかりませんでした。");
        return;
    }

    if (message.author.id === targetUserId) {
        await message.reply("自分のチャンネルには申請できません。");
        return;
    }

    const channel = await guild.channels.fetch(target.channelId).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildText) {
        await message.reply("対象チャンネルが見つかりませんでした。管理者に確認してください。");
        return;
    }

    const pending = Object.entries(target.requests ?? {}).find(([, request]) => request.requesterId === message.author.id && request.status === "pending");
    if (pending) {
        await message.reply("すでに申請済みです。返信を待ってください。");
        return;
    }

    const requester = await guild.members.fetch(message.author.id);
    const requestMessage = await channel.send({ embeds: [buildRequestEmbed(requester.user, channel)] });
    await requestMessage.pin().catch(() => null);
    await requestMessage.react(APPROVE_EMOJI).catch(() => null);
    await requestMessage.react(REJECT_EMOJI).catch(() => null);

    target.requests[requestMessage.id] = {
        requesterId: message.author.id,
        status: "pending",
        createdAt: Date.now()
    };

    await saveState();
    await message.reply(`申請を送信しました: ${channel}`);
}

async function listPrivateChannels(message) {
    const guild = message.guild;
    if (!guild) return;

    const guildState = getGuildState(guild.id);
    const entries = Object.values(guildState.channels || {});
    if (!entries.length) {
        await message.reply("作成されているプライベートチャンネルはありません。");
        return;
    }

    const embed = new EmbedBuilder()
        .setTitle("作成済みチャンネル一覧")
        .setColor(0x00b0f4)
        .setTimestamp();

    for (const entry of entries) {
        const channel = guild.channels.cache.get(entry.channelId) || await guild.channels.fetch(entry.channelId).catch(() => null);
        const channelLabel = channel ? `${channel}` : `チャンネルID: ${entry.channelId}`;
        const ownerMention = `<@${entry.ownerId}>`;
        embed.addFields({ name: channelLabel, value: `オーナー: ${ownerMention}`, inline: false });
    }

    await message.reply({ embeds: [embed] });
}

async function archivePrivateChannel(message, targetUserId) {
    const guild = message.guild;
    if (!guild) return;

    const guildState = getGuildState(guild.id);
    const ownerId = targetUserId ?? message.author.id;
    const entry = guildState.channels[ownerId];

    if (!entry) {
        await message.reply("指定されたユーザーのチャンネルが見つかりませんでした。");
        return;
    }

    const isOwner = message.author.id === message.guild.ownerId;
    if (message.author.id !== ownerId && !isOwner) {
        await message.reply("そのチャンネルをアーカイブする権限がありません。オーナーかサーバー所有者のみ実行できます。");
        return;
    }

    const channel = await guild.channels.fetch(entry.channelId).catch(() => null);
    const role = await guild.roles.fetch(entry.roleId).catch(() => null);

    if (!channel) {
        await message.reply("対象チャンネルが見つかりませんでした。管理者に確認してください。");
        return;
    }

    const suffix = `-archived`;
    await utils.safeRenameChannel(channel, suffix);
    if (role) await utils.safeRenameRole(role, `${suffix}-${Date.now().toString().slice(-4)}`);

    if (role) {
        try {
            await channel.permissionOverwrites.edit(role.id, { SendMessages: false, ViewChannel: true }).catch(() => null);
        } catch (e) { /* ignore */ }
    }

    try {
        await channel.permissionOverwrites.edit(entry.ownerId, { SendMessages: false, AttachFiles: false, AddReactions: false }).catch(() => null);
    } catch (e) { /* ignore */ }

    guildState.archives[ownerId] = Object.assign({}, entry, { archivedAt: Date.now() });
    delete guildState.channels[ownerId];

    await saveState();

    await updateActivity(message.client);

    await message.reply(`チャンネルをアーカイブしました: ${channel}`);
}

async function deletePrivateChannel(message, targetUserId) {
    const guild = message.guild;
    if (!guild) return;

    const guildState = getGuildState(guild.id);
    const ownerId = targetUserId ?? message.author.id;

    const entry = guildState.channels[ownerId] ?? guildState.archives[ownerId];

    if (!entry) {
        await message.reply("指定されたユーザーのチャンネルが見つかりませんでした。");
        return;
    }

    const isOwner = message.author.id === message.guild.ownerId;
    if (message.author.id !== entry.ownerId && !isOwner) {
        await message.reply("そのチャンネルを削除する権限がありません。オーナーかサーバー所有者のみ実行できます。");
        return;
    }

    if (entry.channelId) {
        const channel = await guild.channels.fetch(entry.channelId).catch(() => null);
        if (channel) {
            try {
                await channel.delete().catch(() => null);
            } catch (e) { /* ignore */ }
        }
    }

    if (entry.roleId) {
        const role = await guild.roles.fetch(entry.roleId).catch(() => null);
        if (role) {
            try {
                await role.delete().catch(() => null);
            } catch (e) { /* ignore */ }
        }
    }

    delete guildState.channels[ownerId];
    delete guildState.archives[ownerId];

    await saveState();

    await updateActivity(message.client);

    await message.reply("チャンネルと関連ロールを削除しました。状態も消去しました。");
}

async function deleteByChannelId(message, channelId) {
    const guild = message.guild;
    if (!guild) return;

    const guildState = getGuildState(guild.id);

    let ownerId = null;
    let collection = null;
    for (const [k, v] of Object.entries(guildState.channels || {})) {
        if (v.channelId === channelId) { ownerId = k; collection = 'channels'; break; }
    }
    if (!ownerId) {
        for (const [k, v] of Object.entries(guildState.archives || {})) {
            if (v.channelId === channelId) { ownerId = k; collection = 'archives'; break; }
        }
    }

    const entry = ownerId ? (guildState[collection][ownerId]) : null;

    if (!entry) {
        if (message.author.id === message.guild.ownerId) {
            const raw = await guild.channels.fetch(channelId).catch(() => null);
            if (raw) {
                try { await raw.delete().catch(() => null); } catch (e) { /* ignore */ }
                await updateActivity(message.client);
                await message.reply("指定されたチャンネルを削除しました（記録はありませんでした）。");
                return;
            }
        }

        await message.reply("指定されたチャンネルIDに紐づく管理情報が見つかりませんでした。");
        return;
    }

    const isOwner = message.author.id === message.guild.ownerId;
    if (message.author.id !== entry.ownerId && !isOwner) {
        await message.reply("そのチャンネルを削除する権限がありません。オーナーかサーバー所有者のみ実行できます。");
        return;
    }

    if (entry.channelId) {
        const channel = await guild.channels.fetch(entry.channelId).catch(() => null);
        if (channel) {
            try { await channel.delete().catch(() => null); } catch (e) { /* ignore */ }
        }
    }

    if (entry.roleId) {
        const role = await guild.roles.fetch(entry.roleId).catch(() => null);
        if (role) {
            try { await role.delete().catch(() => null); } catch (e) { /* ignore */ }
        }
    }

    delete guildState.channels[ownerId];
    delete guildState.archives[ownerId];

    await saveState();
    await message.reply("チャンネルと関連ロールを削除しました（チャンネルID指定）。");
}

async function handleRequestReaction(reaction, user) {
    if (user.bot) return;

    const message = reaction.message.partial ? await reaction.message.fetch().catch(() => null) : reaction.message;
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

    const requesterMember = await message.guild.members.fetch(request.requesterId).catch(() => null);
    if (!requesterMember) {
        request.status = "expired";
        await saveState();
        await message.edit({ embeds: [new EmbedBuilder().setColor(0xff8800).setTitle("チャンネル参加リクエスト").setDescription("申請者がサーバー内にいません。")] }).catch(() => null);
        await message.unpin().catch(() => null);
        return;
    }

    const role = await message.guild.roles.fetch(ownerEntry.roleId).catch(() => null);
    if (!role) {
        await message.channel.send("対象ロールが見つかりませんでした。管理者に確認してください。").catch(() => null);
        return;
    }

    if (emoji === APPROVE_EMOJI) {
        await requesterMember.roles.add(role.id).catch(() => null);
        request.status = "approved";
        await message.edit({
            embeds: [
                new EmbedBuilder()
                    .setTitle("チャンネル参加リクエスト")
                    .setDescription(`${requesterMember.user} の参加を許可しました。`)
                    .setColor(0x2ecc71)
                    .setTimestamp()
            ]
        }).catch(() => null);
    } else {
        request.status = "denied";
        await message.edit({
            embeds: [
                new EmbedBuilder()
                    .setTitle("チャンネル参加リクエスト")
                    .setDescription(`${requesterMember.user} の参加を拒否しました。`)
                    .setColor(0xe74c3c)
                    .setTimestamp()
            ]
        }).catch(() => null);
    }

    await message.unpin().catch(() => null);
    await saveState();
}

module.exports = { attachHandlers, loadState };
