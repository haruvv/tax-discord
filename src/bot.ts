import {
  Client,
  Events,
  type Message,
  type ChatInputCommandInteraction,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type SendableChannels,
} from "discord.js";
import { UserContext } from "./user-context.js";
import type { SessionManager } from "./session.js";
import { JobQueue } from "./queue.js";
import { callClaude } from "./claude.js";
import { generateClaudeMd } from "./claude-md.js";
import { splitMessage } from "./splitter.js";
import { handleStart, handleUserSelect } from "./commands/start.js";
import { handleStatus } from "./commands/status.js";
import {
  extractPromptedAction,
  buildPromptRow,
  buildFreeInputModal,
  BUTTON_OTHER,
  BUTTON_DISMISS,
  MODAL_ID,
  MODAL_FIELD,
  ACTION_PREFIX,
  USER_PREFIX,
} from "./buttons.js";

function getChannelId(): string {
  return process.env.DISCORD_CHANNEL_ID ?? "";
}
function getOwnerId(): string {
  return process.env.DISCORD_OWNER_USER_ID ?? "";
}

const NO_USER_MSG =
  "アクティブなユーザーがいません。`/start` で開始してください。";

/** Claude を呼んで応答チャンクを送信する共通処理 */
async function sendClaudeResponse(
  userText: string,
  channel: SendableChannels,
  sessionManager: SessionManager,
  username: string,
): Promise<void> {
  // キュー実行時に CLAUDE.md を再生成し、セッションとプロンプトの整合性を保証する
  generateClaudeMd("CLAUDE.md", username);
  const sessionId = sessionManager.get();
  const result = await callClaude(userText, sessionId);

  if (result.sessionId) {
    sessionManager.set(result.sessionId);
  }

  const text = result.text || "(Claude からの応答が空でした)";
  const chunks = splitMessage(text);
  for (let i = 0; i < chunks.length; i++) {
    const isLast = i === chunks.length - 1;
    if (!isLast) {
      await channel.send(chunks[i]);
      continue;
    }
    // 「〜」と送ってください → はい(=アクション)/いいえ/その他
    const action = extractPromptedAction(chunks[i]);
    if (action) {
      const row = buildPromptRow(action);
      if (row) {
        await channel.send({
          content: chunks[i],
          components: [row],
        });
        continue;
      }
    }
    await channel.send(chunks[i]);
  }
}

export function setupMessageHandler(
  client: Client,
  userContext: UserContext,
  jobQueue: JobQueue,
): void {
  client.on(Events.MessageCreate, (message: Message) => {
    void handleMessage(message, userContext, jobQueue);
  });
}

async function handleMessage(
  message: Message,
  userContext: UserContext,
  jobQueue: JobQueue,
): Promise<void> {
  // フィルタ
  if (message.channelId !== getChannelId()) return;
  if (message.author.id !== getOwnerId()) return;
  if (message.author.bot) return;

  const channel = message.channel;
  if (!channel.isSendable()) return;

  // アクティブユーザー未設定ガード
  if (!userContext.getActiveUser()) {
    await channel.send(NO_USER_MSG);
    return;
  }

  try {
    console.log(`[bot] message from ${message.author.username}: ${message.content.slice(0, 100)}`);
    const activeUser = userContext.getActiveUser()!;
    const sm = userContext.getSessionManager();
    await channel.sendTyping();
    await jobQueue.enqueue(async () => {
      await sendClaudeResponse(message.content, channel, sm, activeUser);
    });
  } catch (err: unknown) {
    const isQueueFull =
      err instanceof Error && err.message.includes("Queue is full");
    const text = isQueueFull
      ? "現在処理中です。しばらくお待ちください。"
      : "エラーが発生しました。もう一度お試しください。";
    await channel.send(text);

    if (!isQueueFull) {
      console.error("[bot] Claude error:", err);
    }
  }
}

export function setupInteractionHandler(
  client: Client,
  userContext: UserContext,
  jobQueue: JobQueue,
): void {
  client.on(Events.InteractionCreate, (interaction) => {
    if (interaction.isChatInputCommand()) {
      void handleInteraction(
        interaction as ChatInputCommandInteraction,
        userContext,
        jobQueue,
      );
    } else if (interaction.isButton()) {
      void handleButton(
        interaction as ButtonInteraction,
        userContext,
        jobQueue,
      );
    } else if (interaction.isModalSubmit()) {
      void handleModalSubmit(
        interaction as ModalSubmitInteraction,
        userContext,
        jobQueue,
      );
    }
  });
}

async function handleInteraction(
  interaction: ChatInputCommandInteraction,
  userContext: UserContext,
  jobQueue: JobQueue,
): Promise<void> {
  if (interaction.user.id !== getOwnerId() || interaction.channelId !== getChannelId()) {
    await interaction.reply({
      content: "このコマンドは使用できません。",
      ephemeral: true,
    });
    return;
  }

  console.log(`[bot] command /${interaction.commandName} from ${interaction.user.username}`);
  switch (interaction.commandName) {
    case "start":
      await handleStart(interaction);
      break;
    case "status":
      await handleStatus(interaction, userContext);
      break;
    default:
      await interaction.reply({
        content: `不明なコマンド: /${interaction.commandName}`,
        ephemeral: true,
      });
  }
}

async function handleButton(
  interaction: ButtonInteraction,
  userContext: UserContext,
  jobQueue: JobQueue,
): Promise<void> {
  if (interaction.user.id !== getOwnerId() || interaction.channelId !== getChannelId()) {
    await interaction.reply({ content: "操作権限がありません。", ephemeral: true });
    return;
  }

  const channel = interaction.channel;
  if (!channel?.isSendable()) return;

  // ユーザー選択ボタン（アクティブユーザー設定前なのでガードより先に処理）
  if (interaction.customId.startsWith(USER_PREFIX)) {
    const username = interaction.customId.slice(USER_PREFIX.length);
    await handleUserSelect(interaction, userContext, jobQueue, username);
    return;
  }

  // アクティブユーザー未設定ガード
  if (!userContext.getActiveUser()) {
    await interaction.reply({ content: NO_USER_MSG, ephemeral: true });
    return;
  }

  if (interaction.customId === BUTTON_OTHER) {
    await interaction.showModal(buildFreeInputModal());
    return;
  }

  // dismiss → ボタンを消すだけ（buildPromptRow の「いいえ」）
  if (interaction.customId === BUTTON_DISMISS) {
    await interaction.update({ components: [] });
    return;
  }

  // レガシー確認ボタン（デプロイ前の残存メッセージ）は無視してボタンを除去
  if (!interaction.customId.startsWith(ACTION_PREFIX)) {
    await interaction.update({ components: [] });
    return;
  }
  const label = interaction.customId.slice(ACTION_PREFIX.length);

  try {
    const activeUser = userContext.getActiveUser()!;
    const sm = userContext.getSessionManager();
    // deferUpdate → 即座にボタンを除去（二重押し防止）
    await interaction.deferUpdate();
    await interaction.editReply({ components: [] });
    await channel.sendTyping();
    await jobQueue.enqueue(async () => {
      await sendClaudeResponse(label, channel, sm, activeUser);
    });
  } catch (err: unknown) {
    const isQueueFull =
      err instanceof Error && err.message.includes("Queue is full");
    if (isQueueFull) {
      // キュー満杯: 元のボタンを復元して再試行可能にする
      const restoreRow = buildPromptRow(label);
      if (restoreRow) {
        await interaction.editReply({ components: [restoreRow] });
      }
    }
    const text = isQueueFull
      ? "現在処理中です。しばらくお待ちください。"
      : "エラーが発生しました。もう一度お試しください。";
    await channel.send(text);
    if (!isQueueFull) {
      console.error("[bot] Claude error (button):", err);
    }
  }
}

async function handleModalSubmit(
  interaction: ModalSubmitInteraction,
  userContext: UserContext,
  jobQueue: JobQueue,
): Promise<void> {
  if (interaction.customId !== MODAL_ID) return;
  if (interaction.user.id !== getOwnerId() || interaction.channelId !== getChannelId()) {
    await interaction.reply({ content: "操作権限がありません。", ephemeral: true });
    return;
  }

  const channel = interaction.channel;
  if (!channel?.isSendable()) return;

  // アクティブユーザー未設定ガード
  if (!userContext.getActiveUser()) {
    await interaction.reply({ content: NO_USER_MSG, ephemeral: true });
    return;
  }

  const activeUser = userContext.getActiveUser()!;
  const sm = userContext.getSessionManager();
  const userInput = interaction.fields.getTextInputValue(MODAL_FIELD);

  // 元メッセージのボタン行を記憶（キュー満杯時の復元用）
  const originalComponents = interaction.message?.components ?? [];

  // モーダル応答 → 即座にボタンを除去（二重操作防止）
  await interaction.deferUpdate();
  try {
    if (interaction.message) {
      await interaction.message.edit({ components: [] });
    }
  } catch {
    // 元メッセージが削除済みなどの場合は無視して続行
  }

  try {
    await channel.sendTyping();
    await jobQueue.enqueue(async () => {
      await sendClaudeResponse(userInput, channel, sm, activeUser);
    });
  } catch (err: unknown) {
    const isQueueFull =
      err instanceof Error && err.message.includes("Queue is full");
    if (isQueueFull && interaction.message) {
      // キュー満杯: 元のボタンを復元して再試行可能にする
      await interaction.message.edit({ components: originalComponents });
    }
    const text = isQueueFull
      ? "現在処理中です。しばらくお待ちください。"
      : "エラーが発生しました。もう一度お試しください。";
    await channel.send(text);
    if (!isQueueFull) {
      console.error("[bot] Claude error (modal):", err);
    }
  }
}
