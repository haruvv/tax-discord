import {
  Client,
  Events,
  type Message,
  type ChatInputCommandInteraction,
} from "discord.js";
import { SessionManager } from "./session.js";
import { JobQueue } from "./queue.js";
import { callClaude } from "./claude.js";
import { splitMessage } from "./splitter.js";
import { handleStart } from "./commands/start.js";

function getChannelId(): string {
  return process.env.DISCORD_CHANNEL_ID ?? "";
}
function getOwnerId(): string {
  return process.env.DISCORD_OWNER_USER_ID ?? "";
}

export function setupMessageHandler(
  client: Client,
  sessionManager: SessionManager,
  jobQueue: JobQueue,
): void {
  client.on(Events.MessageCreate, (message: Message) => {
    void handleMessage(message, sessionManager, jobQueue);
  });
}

async function handleMessage(
  message: Message,
  sessionManager: SessionManager,
  jobQueue: JobQueue,
): Promise<void> {
  // フィルタ
  if (message.channelId !== getChannelId()) return;
  if (message.author.id !== getOwnerId()) return;
  if (message.author.bot) return;

  const channel = message.channel;
  if (!channel.isSendable()) return;

  try {
    await channel.sendTyping();
    await jobQueue.enqueue(async () => {
      const sessionId = sessionManager.get();
      const result = await callClaude(message.content, sessionId);

      if (result.sessionId) {
        sessionManager.set(result.sessionId);
      }

      const chunks = splitMessage(result.text);
      for (const chunk of chunks) {
        await channel.send(chunk);
      }
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
  sessionManager: SessionManager,
  jobQueue: JobQueue,
): void {
  client.on(Events.InteractionCreate, (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    void handleInteraction(
      interaction as ChatInputCommandInteraction,
      sessionManager,
      jobQueue,
    );
  });
}

async function handleInteraction(
  interaction: ChatInputCommandInteraction,
  sessionManager: SessionManager,
  jobQueue: JobQueue,
): Promise<void> {
  if (interaction.user.id !== getOwnerId() || interaction.channelId !== getChannelId()) {
    await interaction.reply({
      content: "このコマンドは使用できません。",
      ephemeral: true,
    });
    return;
  }

  switch (interaction.commandName) {
    case "start":
      await handleStart(interaction, sessionManager, jobQueue);
      break;
    default:
      await interaction.reply({
        content: `不明なコマンド: /${interaction.commandName}`,
        ephemeral: true,
      });
  }
}
