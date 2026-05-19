 # Twicord

> シンプルな Discord プライベートチャンネル管理ボット（Node.js / discord.js）

このリポジトリは、サーバー内でユーザーごとに専用テキストチャンネルを作成・管理できる Discord ボット `Twicord` の実装です。主な機能はユーザー専用チャンネルの作成、参加申請の管理、アーカイブと削除、デフォルトカテゴリの設定などです。

**主な機能**
- 自分専用のプライベートチャンネルを作成（`!twicord create`）
- 他ユーザーのチャンネルへ参加申請を送信・承認・却下（リアクションで操作）
- 作成済みチャンネル一覧表示（`!twicord list`）
- 管理対象チャンネル内で返信したメッセージを全体公開チャンネルへ転送（`!twicord public`）
- チャンネルのアーカイブ（書き込み禁止）と削除
- サーバーオーナー向けにデフォルトカテゴリを設定（`!twicord set-category`）
- サーバーオーナー向けに全体公開チャンネルを設定（`!twicord setpublicchannel`）
- ユーザーごとの言語設定（日本語/英語、`!twicord lang <ja|en>`）

## 対応コマンド（プレフィックス: `!twicord`）

- `!twicord create` — 自分専用チャンネルを作成します。
- `!twicord request <@User|UserId>` — 指定ユーザーのチャンネルに参加申請を送信します。
- `!twicord list` — 作成済みのプライベートチャンネル一覧を表示します。
- `!twicord set-category <CategoryId>` — サーバーオーナーのみ。デフォルトカテゴリを設定します。
- `!twicord show-category` — 現在のデフォルトカテゴリを表示します。
- `!twicord setpublicchannel [#channel|ChannelId]` — サーバーオーナーのみ。全体公開チャンネルを設定します（省略時は現在のチャンネル）。
- `!twicord public` — 管理対象チャンネル内で、公開したいメッセージに返信して実行すると全体公開チャンネルへ転送します。
- `!twicord archive [@User|UserId]` — 自分（またはオーナーによる指定）のチャンネルをアーカイブします。
- `!twicord delete <#channel|ChannelId|@User|UserId>` — チャンネルと関連ロールを削除します。
- `!twicord lang <ja|en>` — 自分の表示言語を設定します。

## インストールと実行

1. Node.js をインストールします（推奨: Node 16+）。
2. このリポジトリをクローンします。
3. 依存をインストールします:

```
npm install
```

4. ルートに `.env` を作成し、Bot トークンを設定します:

```
DISCORD_BOT_TOKEN=your_bot_token_here
```

4. ボットを起動します（開発: `npm start`）:

```
npm start
```

## 設定とデータ

- デフォルトカテゴリはサーバーオーナーが `!twicord set-category <CategoryId>` で設定します。
- 永続データはワークスペース内の `.data/channels.json` に保存されます。

## 開発者向け

- エントリポイント: [src/index.js](src/index.js)
- 主なモジュール: [src/bot.js](src/bot.js), [src/lib/state.js](src/lib/state.js), [src/lib/utils.js](src/lib/utils.js)
- 依存: `discord.js`, `fs-extra`, `dotenv`

## コントリビュート

貢献方法については [CONTRIBUTING.md](CONTRIBUTING.md) を参照してください。

## ライセンス

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

Copyright (c) 2025 Pukorufu
