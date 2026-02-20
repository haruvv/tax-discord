import { config } from "dotenv";
import { Client, GatewayIntentBits } from "discord.js";
import { UserContext } from "./user-context.js";
import { JobQueue } from "./queue.js";
import { registerCommands } from "./commands/register.js";
import { setupMessageHandler, setupInteractionHandler } from "./bot.js";
import { killAll as killAllClaude } from "./claude.js";

// 1. .env をロード
config();

console.log("etax-discord bot starting...");

// 2. UserContext（.state/ 作成もコンストラクタ内で実行）
const userContext = new UserContext();

// 3. JobQueue
const jobQueue = new JobQueue();

// 4. Discord クライアント
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// 5. ハンドラ登録
setupMessageHandler(client, userContext, jobQueue);
setupInteractionHandler(client, userContext, jobQueue);

// 6. スラッシュコマンド登録 + ログイン
const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error("[init] DISCORD_TOKEN is not set");
  process.exit(1);
}

// 7. シャットダウン処理
function shutdown(): void {
  console.log("\n[init] Shutting down...");
  killAllClaude();
  client.destroy();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// 8. スラッシュコマンド登録 + ログイン
client.login(token).then(async () => {
  console.log("[init] Discord client logged in");
  await registerCommands(client);
  console.log("[init] Bot is ready");
}).catch((err: unknown) => {
  console.error("[init] Failed to start:", err);
  process.exit(1);
});
