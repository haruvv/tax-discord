import { readFileSync } from "node:fs";
import type { ChatInputCommandInteraction } from "discord.js";
import type { TaxData } from "../types.js";
import type { UserContext } from "../user-context.js";
import { generateChecklist } from "../status.js";

function loadTaxData(docsPath: string): TaxData | null {
  const path = `${docsPath}/data/tax_data.json`;

  try {
    const raw = readFileSync(path, "utf-8");
    return JSON.parse(raw) as TaxData;
  } catch {
    return null;
  }
}

export async function handleStatus(
  interaction: ChatInputCommandInteraction,
  userContext: UserContext,
): Promise<void> {
  await interaction.deferReply();

  const activeUser = userContext.getActiveUser();
  if (!activeUser) {
    await interaction.editReply(
      "アクティブなユーザーがいません。`/start <username>` で開始してください。",
    );
    return;
  }

  const docsPath = userContext.getUserDocsPath();
  const data = loadTaxData(docsPath);
  const checklist = generateChecklist(data);

  await interaction.editReply(`👤 ユーザー: ${activeUser}\n${checklist}`);
}
