function normalizeChannelName(input) {
    // Option A: pass the user's input to Discord as-is (trim and limit length).
    // Discord will accept or reject names according to its own rules; callers
    // must handle rejections. We intentionally do not perform character
    // replacement here so symbols like fullwidth '！' are preserved.
    const raw = String(input || "").trim();
    return raw.length > 0 ? raw.slice(0, 90) : "private-channel";
}

function safeRenameChannel(channel, suffix) {
    if (!channel || !suffix) return Promise.resolve(null);
    const max = 90;
    const base = String(channel.name || "").replace(/-archived(-\d+)?$/i, "");
    const trimmed = base.slice(0, Math.max(0, max - suffix.length));
    try {
        return channel.setName(`${trimmed}${suffix}`).catch((e) => { require("./logger").error('safeRenameChannel: setName', e); return null; });
    } catch (e) {
        require("./logger").error('safeRenameChannel: exception', e);
        return Promise.resolve(null);
    }
}

function safeRenameRole(role, suffix) {
    if (!role || !suffix) return Promise.resolve(null);
    const max = 90;
    const base = String(role.name || "").replace(/-archived(-\d+)?$/i, "");
    const trimmed = base.slice(0, Math.max(0, max - suffix.length));
    try {
        return role.setName(`${trimmed}${suffix}`).catch((e) => { require("./logger").error('safeRenameRole: setName', e); return null; });
    } catch (e) {
        require("./logger").error('safeRenameRole: exception', e);
        return Promise.resolve(null);
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
    return parseCategoryId(value);
}

function parseChannelRqArgs(content) {
    const parts = content.trim().split(/\s+/);
    if (parts.length < 3) return null;
    return { targetUserId: parseUserId(parts[2]) };
}

module.exports = {
    normalizeChannelName,
    safeRenameChannel,
    safeRenameRole,
    parseUserId,
    parseCategoryId,
    parseChannelId,
    parseChannelRqArgs
};
