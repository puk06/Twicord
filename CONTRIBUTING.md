# Contributing to Twicord

Thank you for your interest in contributing to Twicord! 以下は参加・貢献するための簡単なガイドです。

## 開発環境のセットアップ

1. リポジトリをクローンします。
2. 依存をインストールします:

```
npm install
```

3. ローカルでボットを動かす場合は `.env` に `DISCORD_BOT_TOKEN` を設定してください。

## コードスタイル

- JavaScript (Node.js) で記述されています。既存のスタイルに合わせて変更してください。

## Pull Request の流れ

1. 新機能や修正はトピックブランチを作成してください（例: `feat/private-channel-rename`）。
2. 変更を小さく分けてコミットしてください。
3. リモートブランチを push して Pull Request を作成してください。
4. PR の説明には何をしたか、なぜ必要かを明確に書いてください。

## Commit メッセージ（必須）

コミットメッセージは「Conventional Commits」形式で、英語で書いてください。主要なルールと例を以下に示します。

- フォーマット: `<type>(<scope>): <short summary>`（`scope` は任意）
- 代表的な `type`:
  - `feat`: 新機能
  - `fix`: バグ修正
  - `docs`: ドキュメントのみの変更
  - `style`: フォーマットやセミコロンの追加など（機能に影響しない変更）
  - `refactor`: リファクタリング
  - `perf`: パフォーマンス改善
  - `test`: テスト追加/修正
  - `chore`: ビルドプロセスや補助ツールの変更

例:

```
feat(channel): add archive suffix when archiving channels

fix(role): handle missing role gracefully

docs: update README with setup instructions
```

コミットヘッダーは英語で簡潔に書き、必要なら本文に変更の理由や詳細を追加してください。

## Issue の作成

- バグや機能提案は Issue を作成してください。再現手順や期待される挙動、ログやスクリーンショットを添えると助かります。

## 連絡・コードレビュー

- PR を作成するとレビュワーがコメントします。指摘にはできるだけ応答し、必要に応じて修正してください。

ありがとうございます — 貢献をお待ちしています！
