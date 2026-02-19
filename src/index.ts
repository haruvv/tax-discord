import { mkdirSync } from "node:fs";
import { config } from "dotenv";
import { Client, GatewayIntentBits } from "discord.js";
import { generateClaudeMd } from "./claude-md.js";
import { SessionManager } from "./session.js";
import { JobQueue } from "./queue.js";
import { registerCommands } from "./commands/register.js";
import { setupMessageHandler, setupInteractionHandler } from "./bot.js";
import { killAll as killAllClaude } from "./claude.js";

// 1. .env をロード
config();

console.log("etax-discord bot starting...");

// 2. tax-docs ディレクトリを確保
function ensureTaxDocsDir(): void {
  const taxYear = process.env.TAX_YEAR ?? "2025";
  const taxDocsRoot = process.env.TAX_DOCS_ROOT ?? "~/tax-docs";
  const resolved = taxDocsRoot.replace(/^~/, process.env.HOME ?? "~");
  const base = `${resolved}/${taxYear}`;

  for (const sub of ["income", "expenses", "deductions", "data", "output"]) {
    const dir = `${base}/${sub}`;
    mkdirSync(dir, { recursive: true });
  }
  console.log(`[init] Tax docs directory ready: ${base}/`);
}

// 3. .state ディレクトリを確保
function ensureStateDir(): void {
  mkdirSync(".state", { recursive: true });
}

// 起動シーケンス
ensureTaxDocsDir();
ensureStateDir();

// 4. CLAUDE.md を生成
generateClaudeMd();

// 5. セッション復元
const sessionManager = new SessionManager();
sessionManager.load();

// 6. JobQueue
const jobQueue = new JobQueue();

// 7. Discord クライアント
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// 8. ハンドラ登録
setupMessageHandler(client, sessionManager, jobQueue);
setupInteractionHandler(client, sessionManager, jobQueue);

// 9. スラッシュコマンド登録 + ログイン
const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error("[init] DISCORD_TOKEN is not set");
  process.exit(1);
}

// 10. シャットダウン処理
function shutdown(): void {
  console.log("\n[init] Shutting down...");
  killAllClaude();
  client.destroy();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// 11. スラッシュコマンド登録 + ログイン
client.login(token).then(async () => {
  console.log("[init] Discord client logged in");
  await registerCommands(client);
  console.log("[init] Bot is ready");
}).catch((err: unknown) => {
  console.error("[init] Failed to start:", err);
  process.exit(1);
});
