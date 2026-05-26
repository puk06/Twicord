 # Twicord

> シンプルな Discord プライベートチャンネル管理ボット（Node.js / discord.js）

このリポジトリは、サーバー内でユーザーごとに専用テキストチャンネルを作成・管理できる Discord ボット `Twicord` の実装です。主な機能はユーザー専用チャンネルの作成、参加申請の管理、アーカイブと削除、デフォルトカテゴリの設定などです。

**主な機能**
- 自分専用のプライベートチャンネルを作成（`!twicord create`）
- 他ユーザーのチャンネルへ参加申請を送信・承認・却下（リアクションで操作）
- 作成済みチャンネル一覧表示（`!twicord list [page]`）
- 管理対象チャンネル内で返信したメッセージを全体公開チャンネルへ転送（`!twicord public`）
- チャンネルのアーカイブ（書き込み禁止）と削除
- サーバーオーナー向けにデフォルトカテゴリを設定（`!twicord set-category`）
- サーバーオーナー向けに全体公開チャンネルを設定（`!twicord setpublicchannel`）
- ユーザーごとの言語設定（日本語/英語、`!twicord lang <ja|en>`）

## 対応コマンド（プレフィックス: `!twicord`）

- `!twicord create` または `new` — 自分専用チャンネルを作成します。
- `!twicord request <@User|UserId>` または `rq` / `apply` — 指定ユーザーのチャンネルに参加申請を送信します。
- `!twicord rename <new-name>` または `setname` — 管理対象の自分のチャンネル名を変更します。
- `!twicord description <text>` — 管理対象チャンネルの説明文を設定・更新します（オーナー権限）。
- `!twicord list [page]` または `ls [page]` — 作成済みのプライベートチャンネル一覧を 10 件ずつ表示します。
- `!twicord set-category <CategoryId>` または `setcategory` / `set-category` / `setcat` — サーバーオーナーのみ。デフォルトカテゴリを設定します。
- `!twicord show-category` または `showcategory` / `show-category` / `showcat` — 現在のデフォルトカテゴリを表示します。
- `!twicord setpublicchannel [#channel|ChannelId]` または `set-public-channel` / `setpublic` / `set-public` — サーバーオーナーのみ。全体公開チャンネルを設定します（省略時は現在のチャンネル）。
- `!twicord public` または `publish` / `share` — 管理対象チャンネル内で、公開したいメッセージに返信して実行すると全体公開チャンネルへ転送します。
- `!twicord archive [@User|UserId]` または `arch` — 自分（またはオーナーによる指定）のチャンネルをアーカイブします。
- `!twicord delete <#channel|ChannelId|@User|UserId>` または `del` / `remove` / `rm` — チャンネルと関連ロールを削除します。
- `!twicord lang <ja|en>` または `language` / `locale` — 自分の表示言語を設定します。
- `!twicord help` または `h` / `?` — 利用可能なコマンドと使い方を表示します（ヘルプ）。

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

## 言語設定

- 対応言語は日本語（`ja`）と英語（`en`）です。
- 既定の言語は日本語（`ja`）です。
- ユーザーごとの表示言語は `!twicord lang <ja|en>` で変更できます。

## コントリビュート

貢献方法については [CONTRIBUTING.md](CONTRIBUTING.md) を参照してください。

## ライセンス

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

Copyright (c) 2025 Pukorufu
