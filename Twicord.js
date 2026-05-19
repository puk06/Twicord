const {
	Client,
	EmbedBuilder,
	Events,
	GatewayIntentBits,
	ActivityType,
	ChannelType,
	PermissionsBitField,
	Partials
} = require("discord.js");
const fs = require("fs-extra");
const path = require("node:path");
require("dotenv").config();

const DATA_FOLDER = path.join(__dirname, ".data");
const DATA_FILE = path.join(DATA_FOLDER, "channels.json");

const PREFIX = "!twicord";
const APPROVE_EMOJI = "✅";
const REJECT_EMOJI = "❌";

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

const state = {
	guilds: {}
};

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

	// ensure older saved data gets a consistent shape
	if (!state.guilds[guildId].channels) state.guilds[guildId].channels = {};
	if (!state.guilds[guildId].archives) state.guilds[guildId].archives = {};

	return state.guilds[guildId];
}

function normalizeChannelName(input) {
	const cleaned = input
		.toLowerCase()
		.replace(/[^a-z0-9\-]/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-+|-+$/g, "");

	return cleaned.length > 0 ? cleaned.slice(0, 90) : "private-channel";
}

function safeRenameChannel(channel, suffix) {
	if (!channel || !suffix) return Promise.resolve(null);
	const max = 90;
	const base = String(channel.name || "").replace(/-archived(-\d+)?$/i, "");
	const trimmed = base.slice(0, Math.max(0, max - suffix.length));
	try {
		return channel.setName(`${trimmed}${suffix}`).catch(() => null);
	} catch (e) {
		return Promise.resolve(null);
	}
}

function safeRenameRole(role, suffix) {
	if (!role || !suffix) return Promise.resolve(null);
	const max = 90;
	const base = String(role.name || "").replace(/-archived(-\d+)?$/i, "");
	const trimmed = base.slice(0, Math.max(0, max - suffix.length));
	try {
		return role.setName(`${trimmed}${suffix}`).catch(() => null);
	} catch (e) {
		return Promise.resolve(null);
	}
}

function getTotalManagedChannels() {
	let total = 0;
	for (const g of Object.values(state.guilds || {})) {
		if (g && g.channels) total += Object.keys(g.channels).length;
	}
	return total;
}

async function updateActivity() {
	try {
		const total = getTotalManagedChannels();
		const text = total > 0 ? `Managing ${total} channels • ${PREFIX} help` : `${PREFIX} help`;
		await client.user.setActivity(text, { type: ActivityType.Watching });
	} catch (e) {
		console.error('Failed to update activity:', e);
	}
}

function parseUserId(value) {
	if (!value) return null;
	const mentionMatch = value.match(/^<@!?([0-9]{15,20})>$/);
	if (mentionMatch) return mentionMatch[1];
	const plain = value.match(/^[0-9]{15,20}$/);
	return plain ? plain[0] : null;
}

function parseCategoryId(value) {
	if (!value) return null;
	const mentionMatch = value.match(/^<#?([0-9]{15,20})>$/);
	if (mentionMatch) return mentionMatch[1];
	const plain = value.match(/^[0-9]{15,20}$/);
	return plain ? plain[0] : null;
}

function parseChannelId(value) {
	// channel mentions look like <#123...> or plain numeric IDs
	return parseCategoryId(value);
}

function parseChannelRqArgs(content) {
	const parts = content.trim().split(/\s+/);
	if (parts.length < 3) return null;
	return { targetUserId: parseUserId(parts[2]) };
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

async function createPrivateChannel(message) {
	const guild = message.guild;
	if (!guild) return;

	const guildState = getGuildState(guild.id);
	// require server owner to configure default category before creating channels
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
	const channelNameBase = normalizeChannelName(`${message.author.username}-${message.author.id.slice(-4)}`);

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
	await updateActivity();
	await message.reply(`チャンネルを作成しました: ${channel}`);
}

async function requestToJoin(message, targetUserId) {
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

	// Rename channel and role to indicate archived state (use safe renames)
	const suffix = `-archived`;
	await safeRenameChannel(channel, suffix);
	if (role) await safeRenameRole(role, `${suffix}-${Date.now().toString().slice(-4)}`);

	console.log(`Archiving channel ${entry.channelId} for owner ${ownerId} in guild ${guild.id}`);

	if (role) {
		try {
			await channel.permissionOverwrites.edit(role.id, { SendMessages: false, ViewChannel: true }).catch(() => null);
		} catch (e) { /* ignore */ }
	}

	// Ensure the owner member also loses send permission (overrides member-specific allows)
	try {
		await channel.permissionOverwrites.edit(entry.ownerId, { SendMessages: false, AttachFiles: false, AddReactions: false }).catch(() => null);
	} catch (e) { /* ignore */ }

	// move entry to archives so owner can create a new channel later
	guildState.archives[ownerId] = Object.assign({}, entry, { archivedAt: Date.now() });
	delete guildState.channels[ownerId];

	await saveState();

	await updateActivity();

	await message.reply(`チャンネルをアーカイブしました: ${channel}`);
}

async function deletePrivateChannel(message, targetUserId) {
	const guild = message.guild;
	if (!guild) return;

	const guildState = getGuildState(guild.id);
	const ownerId = targetUserId ?? message.author.id;

	// prefer active channels, fall back to archived
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

	// Attempt to delete channel
	if (entry.channelId) {
		const channel = await guild.channels.fetch(entry.channelId).catch(() => null);
		if (channel) {
			try {
				await channel.delete().catch(() => null);
			} catch (e) { /* ignore */ }
		}
	}

	// Attempt to delete role
	if (entry.roleId) {
		const role = await guild.roles.fetch(entry.roleId).catch(() => null);
		if (role) {
			try {
				await role.delete().catch(() => null);
			} catch (e) { /* ignore */ }
		}
	}

	// remove any stored state
	delete guildState.channels[ownerId];
	delete guildState.archives[ownerId];

	await saveState();

	await updateActivity();

	console.log(`Deleted channel/role for owner ${ownerId} in guild ${guild.id}`);
	await message.reply("チャンネルと関連ロールを削除しました。状態も消去しました。");
}

async function deleteByChannelId(message, channelId) {
	const guild = message.guild;
	if (!guild) return;

	const guildState = getGuildState(guild.id);

	// find entry by channelId in active or archived lists
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
		// fallback: if server owner wants, allow deleting a raw channel id even if not tracked
		if (message.author.id === message.guild.ownerId) {
			const raw = await guild.channels.fetch(channelId).catch(() => null);
			if (raw) {
				try { await raw.delete().catch(() => null); } catch (e) { /* ignore */ }
				await updateActivity();
				console.log(`Server owner ${message.author.id} deleted raw channel ${channelId} in guild ${guild.id}`);
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

	// delete channel if exists
	if (entry.channelId) {
		const channel = await guild.channels.fetch(entry.channelId).catch(() => null);
		if (channel) {
			try { await channel.delete().catch(() => null); } catch (e) { /* ignore */ }
		}
	}

	// delete role if exists
	if (entry.roleId) {
		const role = await guild.roles.fetch(entry.roleId).catch(() => null);
		if (role) {
			try { await role.delete().catch(() => null); } catch (e) { /* ignore */ }
		}
	}

	// remove stored state from both places to be safe
	delete guildState.channels[ownerId];
	delete guildState.archives[ownerId];

	await saveState();
	console.log(`Deleted channel/role (by id) for owner ${ownerId} in guild ${guild.id}`);
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

client.on(Events.ClientReady, async () => {
	await loadState();
	console.log(`Logged in as ${client.user.tag}`);
	
	// set dynamic activity and refresh periodically
	await updateActivity();
	setInterval(() => updateActivity().catch(() => null), 60 * 1000);
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
		await createPrivateChannel(message);
		return;
	}

	// request / rq
	if (["rq", "request", "apply"].includes(sub)) {
		const targetUserId = parseUserId(arg) || (parts.length >= 3 ? parseUserId(parts.slice(2).join(" ")) : null);
		if (!targetUserId) {
			await message.reply(`使い方: ${PREFIX} request <@User|UserId>`);
			return;
		}

		await requestToJoin(message, targetUserId);
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

		const categoryId = parseCategoryId(arg);
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
		await updateActivity();
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
		const targetUserId = parseUserId(arg) || (parts.length >= 3 ? parseUserId(parts.slice(2).join(" ")) : null);
		// if server owner provided a target, use it; otherwise archive caller's own channel
		if (targetUserId && message.author.id !== message.guild.ownerId) {
			await message.reply("他のユーザーのチャンネルをアーカイブするにはサーバー所有者である必要があります。");
			return;
		}

		await archivePrivateChannel(message, targetUserId || null);
		return;
	}

	// delete / remove
	if (["delete", "del", "remove", "rm"].includes(sub)) {
		const channelIdArg = parseChannelId(arg) || (parts.length >= 3 ? parseChannelId(parts.slice(2).join(" ")) : null);
		const targetUserId = parseUserId(arg) || (parts.length >= 3 ? parseUserId(parts.slice(2).join(" ")) : null);

		if (channelIdArg) {
			// allow owner of that channel or server owner to delete by ID
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

const token = process.env.DISCORD_BOT_TOKEN;
client.login(token);
