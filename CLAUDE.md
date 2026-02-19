# 確定申告サマリ生成 Discord Bot

確定申告書類を Claude Code が読み取り、Discord 上の対話で情報を補完し、e-Tax 転記用サマリを生成する Bot。

## 技術スタック

- TypeScript 5+ / Node.js 20+
- discord.js v14
- Claude Code CLI（Max プラン・サブプロセス呼び出し）
- tsx（スクリプト実行）

## プロジェクト構成

```
src/
  index.ts           # エントリポイント
  bot.ts             # Discord イベントハンドラ
  claude.ts          # Claude CLI 呼び出し
  session.ts         # セッション管理
  queue.ts           # ジョブキュー（直列実行）
  splitter.ts        # 2000文字分割
  status.ts          # /status チェックリスト生成
  commands/
    register.ts      # スラッシュコマンド登録
    start.ts         # /start
    status.ts        # /status
  types.ts           # 共通型定義
scripts/
  calc-tax.ts        # 税額計算（stdin JSON → stdout JSON）
  tax-rules/
    2025.ts          # 2025年分税率テーブル
    types.ts         # TaxRules 型
```

## アーキテクチャ

Bot は薄い中継層。Discord メッセージを受け取り `claude` CLI をサブプロセスで呼び出す。
ファイル読取・対話・サマリ生成は Claude Code が自律的に実行。税額計算は `calc-tax.ts` で決定論的に行う。

## 開発コマンド

```bash
npm install
npm run dev          # Bot 起動（tsx watch）
npm run build        # tsc コンパイル
npm start            # 本番起動
```

## 環境変数（.env）

```
DISCORD_TOKEN=
DISCORD_CHANNEL_ID=
DISCORD_OWNER_USER_ID=
TAX_YEAR=2025
TAX_DOCS_ROOT=~/tax-docs
```

## 設計ドキュメント

- `docs/MVP_REQUIREMENTS.md` — 要件定義
- `docs/DESIGN.md` — 詳細設計（モジュール設計・型定義・計算ロジック）
