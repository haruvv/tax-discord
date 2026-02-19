import { Client, Events, REST, Routes, SlashCommandBuilder } from "discord.js";

const commands = [
  new SlashCommandBuilder()
    .setName("start")
    .setDescription("確定申告サポートを開始（セッション初期化）"),
  new SlashCommandBuilder()
    .setName("status")
    .setDescription("現在の登録状況を確認"),
];

export async function registerCommands(client: Client): Promise<void> {
  const token = process.env.DISCORD_TOKEN;
  if (!token) throw new Error("DISCORD_TOKEN is not set");

  const rest = new REST({ version: "10" }).setToken(token);

  await new Promise<void>((resolve) => {
    if (client.isReady()) {
      resolve();
      return;
    }
    client.once(Events.ClientReady, () => resolve());
  });

  const appId = client.application?.id;
  if (!appId) throw new Error("Application ID not available");

  await rest.put(Routes.applicationCommands(appId), {
    body: commands.map((c) => c.toJSON()),
  });

  console.log("[commands] Registered /start, /status");
}
