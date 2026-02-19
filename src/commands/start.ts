import type { ChatInputCommandInteraction } from "discord.js";
import type { SessionManager } from "../session.js";
import type { JobQueue } from "../queue.js";
import { callClaude } from "../claude.js";

async function safeEditReply(
  interaction: ChatInputCommandInteraction,
  content: string,
): Promise<void> {
  try {
    await interaction.editReply(content);
  } catch {
    console.warn("[start] Interaction token expired, could not reply");
  }
}

function buildOnboardingMessage(): string {
  const taxYear = process.env.TAX_YEAR ?? "2025";
  const taxDocsRoot = process.env.TAX_DOCS_ROOT ?? "~/tax-docs";

  return [
    `📋 確定申告サポートを開始します（${taxYear}年分・白色申告）`,
    "",
    `📁 入力フォルダ: ${taxDocsRoot}/${taxYear}/`,
    "   income/     ← 源泉徴収票など",
    "   expenses/   ← 経費一覧CSVなど",
    "   deductions/ ← 控除証明書など",
    "",
    "⚠️ 機微情報（マイナンバー等）はこのチャンネルに送信しないでください。",
    "",
    "ファイルを配置したら「読み取って」と話しかけてください。",
  ].join("\n");
}

export async function handleStart(
  interaction: ChatInputCommandInteraction,
  sessionManager: SessionManager,
  jobQueue: JobQueue,
): Promise<void> {
  await interaction.deferReply();

  try {
    await jobQueue.enqueue(async () => {
      // 既存セッションをクリア
      sessionManager.delete();

      // Claude を呼び出して新規セッション ID を取得
      const result = await callClaude(
        "確定申告サポートセッションを開始します。準備完了を確認してください。",
      );

      if (result.sessionId) {
        sessionManager.set(result.sessionId);
      }

      await safeEditReply(interaction, buildOnboardingMessage());
    });
  } catch (err: unknown) {
    const isQueueFull =
      err instanceof Error && err.message.includes("Queue is full");
    const text = isQueueFull
      ? "現在処理中です。しばらくお待ちください。"
      : "エラーが発生しました。もう一度お試しください。";
    await safeEditReply(interaction, text);

    if (!isQueueFull) {
      console.error("[start] Error:", err);
    }
  }
}
