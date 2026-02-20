import type { ChatInputCommandInteraction, ButtonInteraction } from "discord.js";
import type { UserContext } from "../user-context.js";
import type { JobQueue } from "../queue.js";
import { callClaude } from "../claude.js";
import { buildPromptRow, buildUserSelectRow } from "../buttons.js";

function buildOnboardingMessage(username: string): string {
  const taxYear = process.env.TAX_YEAR ?? "2025";
  const taxDocsRoot = process.env.TAX_DOCS_ROOT ?? "~/tax-docs";
  const userBase = `${taxDocsRoot}/${taxYear}/${username}`;

  return [
    `📋 確定申告サポートを開始します（${taxYear}年分・白色申告）`,
    `👤 ユーザー: ${username}`,
    "",
    `📁 入力フォルダ: ${userBase}/`,
    "   income/     ← 源泉徴収票など",
    "   expenses/   ← 経費一覧CSVなど",
    "   deductions/ ← 控除証明書など",
    "",
    "⚠️ 機微情報（マイナンバー等）はこのチャンネルに送信しないでください。",
    "",
    "ファイルを配置済みであれば、読み取りを開始しますか？",
  ].join("\n");
}

export async function handleStart(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const usersEnv = process.env.USERS;
  if (!usersEnv) {
    await interaction.reply({
      content: "環境変数 `USERS` が設定されていません。",
      ephemeral: true,
    });
    return;
  }

  const users = usersEnv.split(",").map((u) => u.trim()).filter(Boolean);
  if (users.length === 0) {
    await interaction.reply({
      content: "環境変数 `USERS` にユーザーが定義されていません。",
      ephemeral: true,
    });
    return;
  }

  const row = buildUserSelectRow(users);
  await interaction.reply({
    content: "ユーザーを選択してください:",
    components: [row],
  });
}

export async function handleUserSelect(
  interaction: ButtonInteraction,
  userContext: UserContext,
  jobQueue: JobQueue,
  username: string,
): Promise<void> {
  await interaction.deferUpdate();
  await interaction.editReply({ content: `${username} で開始しています…`, components: [] });

  try {
    await jobQueue.enqueue(async () => {
      userContext.switchUser(username);
      const sessionManager = userContext.getSessionManager();

      sessionManager.delete();

      const result = await callClaude(
        "確定申告サポートセッションを開始します。準備完了を確認してください。",
        undefined,
        { maxTurns: 1 },
      );

      if (result.sessionId) {
        sessionManager.set(result.sessionId);
      }

      const row = buildPromptRow("読み取って");
      await interaction.editReply({
        content: buildOnboardingMessage(username),
        components: row ? [row] : [],
      });
    });
  } catch (err: unknown) {
    const isQueueFull =
      err instanceof Error && err.message.includes("Queue is full");
    const text = isQueueFull
      ? "現在処理中です。しばらくお待ちください。"
      : "エラーが発生しました。もう一度お試しください。";
    await interaction.editReply({ content: text, components: [] });

    if (!isQueueFull) {
      console.error("[start] Error:", err);
    }
  }
}
