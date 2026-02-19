# 確定申告サマリ生成 Discord Bot — 詳細設計書

本設計は単一ユーザー（`DISCORD_OWNER_USER_ID`）専用運用を前提とする。

## 1. プロジェクト構成

```
etax-discord/
├── src/
│   ├── index.ts              # エントリポイント（起動・初期化）
│   ├── bot.ts                # Discord Bot 本体（イベントハンドラ）
│   ├── claude.ts             # Claude Code CLI 呼び出し
│   ├── session.ts            # セッション管理（単一ユーザー・永続化）
│   ├── queue.ts              # ジョブキュー（直列実行制御）
│   ├── splitter.ts           # Discord 2000文字分割ユーティリティ
│   ├── status.ts             # /status 用チェックリスト生成（決定論）
│   ├── commands/
│   │   ├── register.ts       # スラッシュコマンド一括登録
│   │   ├── start.ts          # /start
│   │   └── status.ts         # /status
│   └── types.ts              # 共通型定義
├── scripts/
│   ├── calc-tax.ts           # 税額計算（純関数・stdin JSON → stdout JSON）
│   └── tax-rules/
│       ├── 2025.ts           # 2025年分税率・控除テーブル
│       └── types.ts          # TaxRules 型定義
├── .state/
│   └── session.json          # セッションID永続化（単一ユーザー）
├── CLAUDE.md                 # Claude Code 用システムプロンプト
├── .env.example              # 環境変数テンプレート
├── package.json
├── tsconfig.json
└── docs/
    ├── MVP_REQUIREMENTS.md
    └── DESIGN.md             ← 本ドキュメント
```

---

## 2. モジュール設計

### 2.1 index.ts — エントリポイント

**責務:** アプリケーション起動・初期化

**処理フロー:**
1. `dotenv.config()` で .env をロード
2. `ensureTaxDocsDir()` で `~/tax-docs/<year>/` と各サブディレクトリを作成
3. `ensureStateDir()` で `.state/` を作成
4. `generateClaudeMd()` で CLAUDE.md の `${TAX_YEAR}` 等を置換して書き出し
5. `sessionManager.load()` で `.state/session.json` から前回セッションを復元
6. `new Client({ intents })` で Discord クライアント生成
7. `registerCommands(client)` で /start, /status を登録
8. `setupMessageHandler(client, sessionManager, jobQueue)` でメッセージリスナー設定
9. `setupInteractionHandler(client, sessionManager, jobQueue)` でインタラクションリスナー設定
10. `client.login(DISCORD_TOKEN)` でログイン

**依存:** bot.ts, session.ts, queue.ts, commands/register.ts

```
index.ts
  │
  ├─ dotenv.config()
    ├─ ensureTaxDocsDir()
    ├─ ensureStateDir()
    ├─ generateClaudeMd()
    ├─ sessionManager.load()
    ├─ new Client({ intents })
    ├─ registerCommands(client)
    ├─ setupMessageHandler(client, sessionManager, jobQueue)
  ├─ setupInteractionHandler(client, sessionManager, jobQueue)
  └─ client.login(DISCORD_TOKEN)
```

### 2.2 bot.ts — Discord Bot 本体

**責務:** Discord イベントハンドリング・応答送信

**公開インターフェース:**
```typescript
function setupMessageHandler(
  client: Client,
  sessionManager: SessionManager,
  jobQueue: JobQueue
): void

function setupInteractionHandler(
  client: Client,
  sessionManager: SessionManager,
  jobQueue: JobQueue
): void
```

**messageCreate の処理フロー:**
1. チャンネル ID フィルタ（`DISCORD_CHANNEL_ID` 以外は無視）
2. ユーザー ID フィルタ（`DISCORD_OWNER_USER_ID` 以外は無視）
3. Bot 自身のメッセージは無視
4. `channel.sendTyping()` で一次応答（入力中表示）
5. キューに投入 → claude.ts 呼び出し
6. 応答を splitter.ts で分割して送信

**interactionCreate の処理フロー:**
1. ユーザー ID フィルタ（`DISCORD_OWNER_USER_ID` 以外は無視）
2. コマンド名で commands/ にルーティング

**依存:** claude.ts, session.ts, queue.ts, splitter.ts, commands/*

### 2.3 claude.ts — Claude Code CLI 呼び出し

**責務:** `claude` CLI のサブプロセス実行・JSON レスポンスのパース

**公開インターフェース:**
```typescript
interface ClaudeResult {
  text: string;
  sessionId: string;
}

function callClaude(message: string, sessionId?: string): Promise<ClaudeResult>
```

**実装詳細:**
- `child_process.execFile` で `claude` CLI を呼び出し
- CLI フラグ:
  - `-p` — プロンプトを直接渡す
  - `--output-format json` — JSON 形式で出力
  - `--resume <sessionId>` — セッション継続（sessionId がある場合）
  - `--append-system-prompt-file CLAUDE.md` — システムプロンプト追加
  - `--allowedTools "Read,Glob,Grep,Write,Bash(npx tsx scripts/calc-tax.ts *)"` — 許可ツール（Bash は calc-tax.ts のみ）
  - `--max-turns 10` — 無限ループ防止
- タイムアウト: `CLAUDE_TIMEOUT_MS`（デフォルト 90秒）
- リトライ: タイムアウト時に 1回リトライ → 再度失敗時は Error throw
- stdout を JSON パース → `{ result, session_id }` から `ClaudeResult` を返却
- JSON パース失敗時は stdout をそのままテキストとして返す（フォールバック）

**依存:** なし（child_process のみ）

### 2.4 session.ts — セッション管理

**責務:** 単一ユーザー用の sessionId 管理（メモリ + ファイル永続化）

**公開インターフェース:**
```typescript
class SessionManager {
  load(): void
  get(): string | undefined
  set(sessionId: string): void
  delete(): void
  clear(): void
}
```

**内部構造:**
- `currentSession?: { sessionId: string; createdAt: string }`
- 保存先: `.state/session.json`
- 起動時に `load()` でファイルを読み込み、更新時に即時保存
- 保存は一時ファイル経由で原子的に置換（`session.json.tmp` → rename）
- `/start` 時に既存セッション削除 → 新規作成

**依存:** なし

### 2.5 queue.ts — ジョブキュー

**責務:** Claude CLI 呼び出しの直列実行制御

**公開インターフェース:**
```typescript
class JobQueue {
  enqueue(job: () => Promise<void>): Promise<void>
  get pending(): number
}
```

**実装詳細:**
- mutex パターン（同時実行 1）
- キュー上限: `QUEUE_MAX_SIZE`（デフォルト 5）
- 上限超過時は reject → Bot が「現在処理中です。しばらくお待ちください」と返す

**依存:** なし

### 2.6 splitter.ts — メッセージ分割ユーティリティ

**責務:** Discord の 2000 文字制限に対応する分割処理

**公開インターフェース:**
```typescript
function splitMessage(text: string, limit?: number): string[]
```

**実装詳細:**
- デフォルト 2000 文字
- コードブロック（` ``` `）の途中で切れないよう考慮
- 分割点の優先順位: 空行 > 改行 > スペース > 強制分割

**依存:** なし

### 2.7 commands/register.ts — コマンド登録

**責務:** スラッシュコマンドの一括登録

**公開インターフェース:**
```typescript
function registerCommands(client: Client): Promise<void>
```

**依存:** discord.js

### 2.8 commands/start.ts — /start コマンド

**責務:** セッション初期化・オンボーディング

**依存:** session.ts

### 2.9 commands/status.ts — /status コマンド

**責務:** `tax_data.json` から登録状況チェックリストを生成して返す

**依存:** status.ts

---

## 3. calc-tax.ts 詳細設計

stdin から JSON を受け取り、stdout に計算結果 JSON を出力する純関数スクリプト。

`tax_year` ごとの税制差分に対応するため、ルールは `scripts/tax-rules/<year>.ts` に分離する。
`calc-tax.ts` は「入力検証」「ルール選択」「計算実行」のオーケストレーションのみを担当する。

**実行方法:**
```bash
echo '{"tax_year":2025,...}' | npx tsx scripts/calc-tax.ts
```

**プロセス終了コード:**
- `0` — 成功
- `1` — 入力バリデーションエラー（stderr にエラーメッセージ）
- `2` — 対応外年度（例: tax_year=2026 でルール未実装）

### 3.1 入力型

```typescript
interface CalcTaxInput {
  tax_year: number;
  income: {
    type: "給与所得" | "雑所得" | "一時所得";
    amount: number;
    withholding_tax?: number;
    social_insurance?: number;
    expenses?: number;
  }[];
  deductions: {
    type: string;
    amount: number;
  }[];
}
```

### 3.2 出力型

```typescript
interface CalcTaxOutput {
  income_details: {
    type: string;
    revenue: number;
    deduction_amount: number;
    deduction_label: string;   // 例: "給与所得控除" / "必要経費"
    income_amount: number;
  }[];
  total_income: number;
  deduction_details: {
    type: string;
    amount: number;
  }[];
  basic_deduction: number;     // 基礎控除（自動計算）
  total_deductions: number;
  taxable_income: number;
  income_tax: number;
  reconstruction_tax: number;
  total_tax: number;
  total_withholding: number;
  tax_due: number;             // 正=納付, 負=還付
  breakdown: {
    salary_deduction: string;  // "5,000,000 × 20% + 440,000 = 1,440,000"
    basic_deduction: string;   // "合計所得 4,760,000 ≤ 24,000,000 → 480,000"
    tax_bracket: string;       // "3,340,000 × 10% - 97,500 = 236,500"
    reconstruction: string;    // "236,500 × 2.1% = 4,966"
  };
}
```

### 3.3 計算ロジック

#### 年度ルールレジストリ

```typescript
interface TaxRules {
  year: number;
  calcSalaryDeduction: (revenue: number) => number;
  calcBasicDeduction: (totalIncome: number) => number;
  calcIncomeTax: (taxableIncome: number) => number;
  rounding: {
    taxableIncome: (x: number) => number;
    incomeTax: (x: number) => number;
    reconstructionTax: (x: number) => number;
  };
}

const RULES_BY_YEAR: Record<number, TaxRules> = {
  2025: rules2025
};
```

`tax_year` でルールを選択し、未登録年度は exit code 2 で終了する。

#### 2025年分ルール（初期実装）

#### calcSalaryDeduction(revenue: number): number — 給与所得控除

| 給与収入 | 計算式 |
|----------|--------|
| ～1,625,000 | 550,000（固定） |
| ～1,800,000 | revenue × 40% - 100,000 |
| ～3,600,000 | revenue × 30% + 80,000 |
| ～6,600,000 | revenue × 20% + 440,000 |
| ～8,500,000 | revenue × 10% + 1,100,000 |
| 8,500,000超 | 1,950,000（上限） |

#### calcBasicDeduction(totalIncome: number): number — 基礎控除

| 合計所得金額 | 基礎控除額 |
|-------------|-----------|
| ～24,000,000 | 480,000 |
| ～24,500,000 | 320,000 |
| ～25,000,000 | 160,000 |
| 25,000,000超 | 0 |

#### calcIncomeTax(taxableIncome: number): number — 所得税

| 課税所得金額 | 税率 | 控除額 |
|-------------|------|--------|
| ～1,950,000 | 5% | 0 |
| ～3,300,000 | 10% | 97,500 |
| ～6,950,000 | 20% | 427,500 |
| ～9,000,000 | 23% | 636,000 |
| ～18,000,000 | 33% | 1,536,000 |
| ～40,000,000 | 40% | 2,796,000 |
| 40,000,000超 | 45% | 4,796,000 |

#### 端数処理

| 項目 | ルール | コード |
|------|--------|--------|
| 課税所得金額 | 1,000円未満切捨て | `Math.floor(x / 1000) * 1000` |
| 所得税額 | 100円未満切捨て | `Math.floor(x / 100) * 100` |
| 復興特別所得税 | 1円未満切捨て | `Math.floor(x)` |

---

## 4. CLAUDE.md（システムプロンプト）

プロジェクトルートに配置。`--append-system-prompt-file` で Claude Code のデフォルトに追加。
`${TAX_YEAR}` と `${TAX_DOCS_ROOT}` は Bot 起動時に `generateClaudeMd()` で動的に埋め込む。

```markdown
# 確定申告サポートアシスタント

## 役割
ユーザーの確定申告に必要な情報を収集・整理し、e-Tax に転記可能なサマリを生成する。

## 実行時パラメータ
- 対象年度: ${TAX_YEAR}（.env で設定）
- 入力フォルダ: ${TAX_DOCS_ROOT}/${TAX_YEAR}/

## 入力フォルダ構成
income/     — 源泉徴収票、報酬明細
expenses/   — 経費一覧 CSV、レシート画像
deductions/ — 控除証明書

## ワークフロー
1. ユーザーの指示でフォルダをスキャン（Glob → Read）
2. 読み取り結果を報告し、各金額をユーザーに確認
3. 確認済みデータを data/tax_data.json に Write で保存
4. 不足情報があればユーザーに質問
5. 「サマリ作って」等の指示で:
   a. tax_data.json から CalcTaxInput を構成
   b. Bash で `npx tsx scripts/calc-tax.ts` を実行（stdin に JSON を渡す）
   c. 計算結果を使ってサマリ文章を生成
   d. output/summary.txt と output/summary.json を Write で出力

## ルール
- 金額は必ずユーザーに確認してから tax_data.json に書き込む
- 不明な点は推測せず質問する
- 税額計算は自分で行わず、必ず calc-tax.ts の結果を使う
- 税額の表示時は breakdown（計算根拠）を併記する
- 「参考値です。正確な税額は e-Tax でご確認ください」を必ず付記する
- マイナンバーは絶対に保存しない
- 応答は Discord 向けに簡潔に（1800文字以内を目安）
- 確認が必要な場合は「〜で合っていますか？」で終えること
```

---

## 5. 型定義（types.ts）

```typescript
// ──────────────────────────────────
// Claude CLI JSON 出力
// ──────────────────────────────────

interface ClaudeResponse {
  result: string;
  session_id: string;
  duration_ms: number;
  usage: { input_tokens: number; output_tokens: number };
}

// ──────────────────────────────────
// セッション情報
// ──────────────────────────────────

interface SessionInfo {
  sessionId: string;
  createdAt: Date;
}

// ──────────────────────────────────
// tax_data.json
// ──────────────────────────────────

interface TaxData {
  tax_year: number;
  profile?: {
    name: string;
    name_kana: string;
    birth_date: string;
    address: string;
    phone?: string;
    occupation?: string;
  };
  income: IncomeEntry[];
  expenses: ExpenseEntry[];
  deductions: DeductionEntry[];
  scan_log: ScanLogEntry[];
}

interface IncomeEntry {
  type: "給与所得" | "雑所得" | "一時所得";
  payer?: string;
  amount: number;
  withholding_tax?: number;
  social_insurance?: number;
  expenses?: number;
  source_file?: string;
}

interface ExpenseEntry {
  date?: string;
  category: string;
  description: string;
  amount: number;
  source_file?: string;
}

interface DeductionEntry {
  type: string;
  amount: number;
  description?: string;
  source_file?: string;
}

interface ScanLogEntry {
  file: string;
  scanned_at: string;
  status: "scanned" | "confirmed" | "rejected";
}
```

---

## 6. スラッシュコマンド設計

### /start

**目的:** セッション初期化・オンボーディング

**処理:**
1. 既存セッションをクリア（`sessionManager.delete()`）
2. Claude を呼び出して新規セッション ID を取得
3. `sessionManager.set(newSessionId)`
4. オンボーディングメッセージを返す

**応答メッセージ:**
```
📋 確定申告サポートを開始します（${TAX_YEAR}年分・白色申告）

📁 入力フォルダ: ${TAX_DOCS_ROOT}/${TAX_YEAR}/
   income/     ← 源泉徴収票など
   expenses/   ← 経費一覧CSVなど
   deductions/ ← 控除証明書など

⚠️ 機微情報（マイナンバー等）はこのチャンネルに送信しないでください。

ファイルを配置したら「読み取って」と話しかけてください。
```

### /status

**目的:** 現在の登録状況の確認

**処理:**
1. Bot が `${TAX_DOCS_ROOT}/${TAX_YEAR}/data/tax_data.json` を直接読み込む
2. 必須項目（氏名/住所/主な収入/主要控除/確認未了件数）を決定論で評価
3. チェックリスト形式でレスポンス生成して返す

**備考:**
- `/status` は Claude を呼ばない（出力揺れ防止・高速化）
- 不足項目の列挙順は固定（profile → income → deductions → expenses）

---

## 7. エラーハンドリング

| シナリオ | Bot の対応 |
|----------|-----------|
| Claude CLI タイムアウト (90s) | 1回リトライ。再度失敗時「処理がタイムアウトしました。もう一度お試しください」 |
| Claude CLI 非0終了 | stderr をログ記録。「エラーが発生しました。もう一度お試しください」 |
| JSON パース失敗 | stdout をそのままテキスト応答として返す（フォールバック） |
| 応答 2000文字超 | splitter.ts で自動分割送信 |
| キュー上限 (5件) 超過 | 「現在処理中です。しばらくお待ちください」 |
| calc-tax.ts バリデーションエラー | exit code 1 + stderr にエラー内容。Claude が解釈してユーザーに伝える |
| calc-tax.ts 対応外年度 | exit code 2 + stderr に「tax_year 未対応」。Bot が「対象年度は未対応です」を返す |
| tax_data.json 未作成 | `/status` は空データとして扱い「未登録」としてチェックリストを返す |
| session.json 破損 | ファイルを退避して新規セッションとして起動、警告ログを出力 |
| tax-docs フォルダ未存在 | Bot 起動時に作成 + ログ出力 |

---

## 8. 環境変数（.env）

```env
DISCORD_TOKEN=
DISCORD_CHANNEL_ID=
DISCORD_OWNER_USER_ID=
TAX_YEAR=2025
TAX_DOCS_ROOT=~/tax-docs
LOG_LEVEL=info          # debug | info | warn | error
CLAUDE_TIMEOUT_MS=90000
CLAUDE_MAX_TURNS=10
QUEUE_MAX_SIZE=5
SESSION_STATE_PATH=.state/session.json
```

---

## 9. 依存パッケージ（package.json）

```json
{
  "dependencies": {
    "discord.js": "^14",
    "dotenv": "^16"
  },
  "devDependencies": {
    "typescript": "^5",
    "tsx": "^4",
    "@types/node": "^20"
  }
}
```

---

## 10. 起動シーケンス図

```
[Bot 起動]
    │
    ├─ dotenv.config()
    │    └─ .env から DISCORD_TOKEN, DISCORD_CHANNEL_ID, DISCORD_OWNER_USER_ID, TAX_YEAR 等を読み込み
    │
    ├─ ensureTaxDocsDir()
    │    └─ ~/tax-docs/<TAX_YEAR>/ 配下に income/, expenses/, deductions/, data/, output/ を作成
    │
    ├─ ensureStateDir()
    │    └─ .state/ 配下に session.json（未存在時）を作成
    │
    ├─ generateClaudeMd()
    │    └─ CLAUDE.md テンプレートの ${TAX_YEAR}, ${TAX_DOCS_ROOT} を置換して書き出し
    │
    ├─ sessionManager.load()
    │    └─ session.json から前回セッションIDを復元（存在時）
    │
    ├─ new Client({ intents: [Guilds, GuildMessages, MessageContent] })
    │
    ├─ registerCommands(client)
    │    └─ /start, /status を Discord API に登録
    │
    ├─ setupMessageHandler(client, sessionManager, jobQueue)
    │    └─ messageCreate イベントリスナー設定
    │
    ├─ setupInteractionHandler(client, sessionManager, jobQueue)
    │    └─ interactionCreate イベントリスナー設定
    │
    └─ client.login(DISCORD_TOKEN)
         └─ Bot オンライン
```

---

## 11. メッセージ処理フロー

```
[Discord messageCreate]
    │
    ├─ チャンネル ID チェック → 不一致なら無視
    ├─ ユーザー ID チェック（owner以外）→ 無視
    ├─ Bot 自身のメッセージ → 無視
    │
    ├─ channel.sendTyping()  // 「入力中...」表示
    │
    ├─ jobQueue.enqueue(async () => {
    │      │
    │      ├─ sessionId = sessionManager.get()
    │      │
    │      ├─ result = await callClaude(message, sessionId)
    │      │    │
    │      │    ├─ execFile("claude", [...flags])
    │      │    ├─ JSON.parse(stdout) → { result, session_id }
    │      │    └─ タイムアウト時: 1回リトライ → 失敗時 throw
    │      │
    │      ├─ sessionManager.set(result.sessionId)
    │      │
    │      ├─ chunks = splitMessage(result.text)
    │      │
    │      └─ for (chunk of chunks) → channel.send(chunk)
    │  })
    │
    └─ キュー上限超過時 → 「現在処理中です。しばらくお待ちください」
```

---

## 12. MVP スコープの変更（要件定義からの差分）

要件 US-8（確認ボタン）と US-9（/undo）は MVP では実装しない。

**理由:**
- US-8（ボタン）: 自然言語での確認・修正で十分機能する。ボタン UI は UX 改善として将来対応
- US-9（/undo）: Claude のセッション内で「戻して」と言えば対応可能。専用コマンドは将来対応

→ `docs/MVP_REQUIREMENTS.md` のセクション13「MVP対象外」に移動済み

---

## 13. 検証方法

| # | 検証内容 | 手順 |
|---|---------|------|
| 1 | Bot 起動・基本応答 | `pnpm dev` → Bot 起動 → Discord で「こんにちは」→ Claude 応答が返る |
| 2 | ファイル読み取り | `${TAX_DOCS_ROOT}/${TAX_YEAR}/income/` にテスト PDF → 「読み取って」→ 読み取り結果表示 |
| 3 | 税額計算スクリプト | `echo '{"tax_year":2025,...}' \| pnpm tsx scripts/calc-tax.ts` → 正しい計算結果 |
| 4 | /start コマンド | /start → オンボーディングメッセージ表示 |
| 5 | /status コマンド | /status → チェックリスト表示 |
| 6 | サマリ生成 | 「サマリ作って」→ calc-tax.ts 実行 → サマリ + ファイル出力 |
| 7 | メッセージ分割 | 長文応答 → 2000文字以下に自動分割して送信 |
| 8 | キュー制御 | 処理中に追加メッセージ → キューに積まれて順次実行 |
