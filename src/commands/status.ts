import { readFileSync } from "node:fs";
import type { ChatInputCommandInteraction } from "discord.js";
import type { TaxData } from "../types.js";
import { generateChecklist } from "../status.js";

function loadTaxData(): TaxData | null {
  const taxYear = process.env.TAX_YEAR ?? "2025";
  const taxDocsRoot = process.env.TAX_DOCS_ROOT ?? "~/tax-docs";
  const resolved = taxDocsRoot.replace(/^~/, process.env.HOME ?? "~");
  const path = `${resolved}/${taxYear}/data/tax_data.json`;

  try {
    const raw = readFileSync(path, "utf-8");
    return JSON.parse(raw) as TaxData;
  } catch {
    return null;
  }
}

export async function handleStatus(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  await interaction.deferReply();

  const data = loadTaxData();
  const checklist = generateChecklist(data);

  await interaction.editReply(checklist);
}
