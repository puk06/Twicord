# Twicord

Simple Discord private-channel management bot (Node.js / discord.js)

Twicord allows server members to create and manage per-user private text channels. Key features include channel creation, join request workflow, archiving, deletion, and a server-owner configurable default category.

Features
- Create your private channel: `!twicord create`
- Request to join another user's channel (approve/deny via reactions)
- List created private channels: `!twicord list`
- Publish a replied message from a managed channel to a server-wide public channel: `!twicord public`
- Archive or delete channels
- Server owner can set the default category: `!twicord set-category`
- Server owner can set the public broadcast channel: `!twicord setpublicchannel`
- Per-user language setting: `!twicord lang <ja|en>`

Commands (prefix: `!twicord`)

- `!twicord create` — Create your private channel.
- `!twicord request <@User|UserId>` — Send a join request to the specified user's channel.
- `!twicord list` — Show all created private channels.
- `!twicord set-category <CategoryId>` — (Owner) Set the default category used when creating channels.
- `!twicord show-category` — Show current default category.
- `!twicord setpublicchannel [#channel|ChannelId]` — (Owner) Set the channel used for public posts. If omitted, current channel is used.
- `!twicord public` — Reply to a message inside a managed channel, then run this to forward it to the configured public channel.
- `!twicord archive [@User|UserId]` — Archive your channel (owner may archive another user's channel).
- `!twicord delete <#channel|ChannelId|@User|UserId>` — Delete a channel and its role.
- `!twicord lang <ja|en>` — Set your display language (per-user).

Installation & Run

1. Install Node.js (recommended: Node 16+).
2. Clone the repository.
3. Install dependencies:

```
npm install
```

4. Create a `.env` file in the project root with your bot token:

```
DISCORD_BOT_TOKEN=your_bot_token_here
```

5. Start the bot:

```
npm start
```

Data and persistence

- Persistent state (channels, archives, per-user locales) is stored in `.data/channels.json` in the repository root.

Developer notes

- Entry point: `src/index.js`
- Main modules: `src/bot.js`, `src/lib/state.js`, `src/lib/utils.js`, `src/lib/i18n.js`
- Dependencies: `discord.js`, `fs-extra`, `dotenv`

Internationalization

- Supports Japanese (`ja`) and English (`en`).
- Users can set their preferred language with `!twicord lang <ja|en>`; messages and embeds will be localized where supported.
 - Default language is English (`en`).

License

This project is licensed under the MIT License — see the `LICENSE` file for details.
