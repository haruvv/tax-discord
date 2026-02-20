import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";

export const BUTTON_YES = "confirm_yes";
export const BUTTON_NO = "confirm_no";
export const BUTTON_OTHER = "confirm_other";
export const BUTTON_DISMISS = "dismiss";
export const MODAL_ID = "free_input_modal";
export const MODAL_FIELD = "free_input_field";
export const ACTION_PREFIX = "action:";

const CONFIRM_PATTERN = /[？?]\s*$/;
const PROMPT_PATTERN = /「(.+?)」と(?:送(?:って|信して)|入力して|話しかけて)/;

export function isConfirmation(text: string): boolean {
  return CONFIRM_PATTERN.test(text);
}

/** Claude の応答から「〜」と送ってください 等のパターンを検出し、アクションテキストを返す */
export function extractPromptedAction(text: string): string | null {
  const m = text.match(PROMPT_PATTERN);
  return m ? m[1] : null;
}

export function buildConfirmRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(BUTTON_YES)
      .setLabel("はい")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(BUTTON_NO)
      .setLabel("いいえ")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(BUTTON_OTHER)
      .setLabel("その他（自由入力）")
      .setStyle(ButtonStyle.Secondary),
  );
}

// Discord customId は最大 100 文字
const MAX_CUSTOM_ID_LEN = 100;

/** はい(→action送信) / いいえ(→無視) / その他(→モーダル) のボタン行
 *  action が customId 上限を超える場合は null を返す（呼び出し側でプレーンテキスト送信） */
export function buildPromptRow(action: string): ActionRowBuilder<ButtonBuilder> | null {
  const customId = `${ACTION_PREFIX}${action}`;
  if (customId.length > MAX_CUSTOM_ID_LEN) {
    return null;
  }
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(customId)
      .setLabel("はい")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(BUTTON_DISMISS)
      .setLabel("いいえ")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(BUTTON_OTHER)
      .setLabel("その他（自由入力）")
      .setStyle(ButtonStyle.Secondary),
  );
}

export function buildFreeInputModal(): ModalBuilder {
  const input = new TextInputBuilder()
    .setCustomId(MODAL_FIELD)
    .setLabel("回答を入力してください")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true);

  return new ModalBuilder()
    .setCustomId(MODAL_ID)
    .setTitle("自由入力")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(input),
    );
}
