export type RequestStatus = "pending" | "approved" | "denied" | "expired";

export interface RequestEntry {
    requesterId: string;
    status: RequestStatus;
    createdAt: number;
}

export interface ChannelEntry {
    guildId: string;
    ownerId: string;
    roleId?: string | null;
    channelId?: string | null;
    categoryId?: string | null;
    description?: string | null;
    requests?: Record<string, RequestEntry>;
    archivedAt?: number | null;
}

export interface GuildState {
    channels: Record<string, ChannelEntry>;
    archives: Record<string, ChannelEntry>;
    userLocales: Record<string, string>;
    publicChannelId: string | null;
    defaultCategoryId?: string | null;
}

export interface RootState {
    guilds: Record<string, GuildState>;
}
