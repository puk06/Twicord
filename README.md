# Twicord

Simple Discord private-channel management bot (Node.js / discord.js)

Twicord allows server members to create and manage per-user private text channels. Key features include channel creation, join request workflow, member removal, archiving, deletion, and a server-owner configurable default category.

Features
- Create your private channel: `!twicord create`
- Request to join another user's channel (approve/deny via reactions)
- Slash command support: `/twicord`
- List created private channels: `!twicord list [page]`
- Publish a replied message from a managed channel to a server-wide public channel: `!twicord public`
- Archive or delete channels
- Server owner can set the default category: `!twicord set-category`
- Server owner can set the public broadcast channel: `!twicord setpublicchannel`
- Per-user language setting: `!twicord lang <ja|en>`

Commands (prefix: `!twicord`)

- `!twicord create` or `new` — Create your private channel.
- `!twicord request <@User|UserId>` or `rq` / `apply` — Send a join request to the specified user's channel.
- `!twicord rename <new-name>` or `setname` — Rename the managed private channel you own.
- `!twicord description <text>` — Set or update the description for your managed private channel (owner only).
- `!twicord list [page]` or `ls [page]` — Show created private channels, 10 per page.
- `!twicord set-category <CategoryId>` or `setcategory` / `set-category` / `setcat` — (Owner) Set the default category used when creating channels.
- `!twicord show-category` or `showcategory` / `show-category` / `showcat` — Show current default category.
- `!twicord setpublicchannel [#channel|ChannelId]` or `set-public-channel` / `setpublic` / `set-public` — (Owner) Set the channel used for public posts. If omitted, current channel is used.
- `!twicord public` or `publish` / `share` — Reply to a message inside a managed channel, then run this to forward it to the configured public channel.
- `!twicord remove <@User|UserId>` or `kick` / `rm` / `revoke` — Remove a user from the channel, revoke their active access, and make the channel hidden to them again.
- `!twicord archive [@User|UserId]` or `arch` — Archive your channel (owner may archive another user's channel).
- `!twicord delete <#channel|ChannelId|@User|UserId>` or `del` — Delete a channel and its role. This is separate from `remove`.
- `!twicord lang <ja|en>` or `language` / `locale` — Set your display language (per-user).
- `!twicord help` or `h` / `?` — Show the bot help embed with available commands and usage.

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

5. Add your application ID:

```
DISCORD_APPLICATION_ID=your_application_id
```

6. Register slash commands:

```
npm run register:commands
```

	Global slash commands can take a little while to appear in Discord.

7. Start the bot:

```
npm start
```

Data and persistence

- Persistent state (channels, archives, per-user locales) is stored in `.data/channels.json` in the repository root.

Developer notes

- Entry point: `src/index.js`
- Main modules: `src/bot.js`, `src/lib/state.js`, `src/lib/utils.js`, `src/lib/i18n.js`
- Slash command registration: `src/commands.js`, `src/register-commands.js`
- Dependencies: `discord.js`, `fs-extra`, `dotenv`

Internationalization

- Supports Japanese (`ja`) and English (`en`).
- Users can set their preferred language with `!twicord lang <ja|en>`; messages and embeds will be localized where supported.
- Default language is Japanese (`ja`).

License

This project is licensed under the MIT License — see the `LICENSE` file for details.
