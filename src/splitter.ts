/**
 * Discord の 2000 文字制限に対応してメッセージを分割する
 */
export function splitMessage(text: string, limit = 2000): string[] {
  if (limit <= 0) limit = 2000;
  if (text.length <= limit) return [text];

  const CLOSE_FENCE = "\n```";
  const chunks: string[] = [];
  let remaining = text;
  let pendingLang: string | null = null;

  while (remaining.length > 0) {
    const prefix = pendingLang !== null ? `\`\`\`${pendingLang}\n` : "";

    if (prefix.length + remaining.length <= limit) {
      chunks.push(prefix + remaining);
      break;
    }

    // prefix だけで limit を超える場合はコードブロック追跡を諦めて強制分割
    if (prefix.length >= limit) {
      pendingLang = null;
      continue;
    }

    const maxLen = limit - prefix.length;
    let splitAt = findSplitPoint(remaining, maxLen);
    let chunk = remaining.slice(0, splitAt);
    const state = getCodeBlockState(prefix + chunk);

    if (state.inCodeBlock) {
      const reducedMax = maxLen - CLOSE_FENCE.length;
      if (reducedMax > 0) {
        splitAt = findSplitPoint(remaining, reducedMax);
        chunk = remaining.slice(0, splitAt);
        const recheck = getCodeBlockState(prefix + chunk);
        if (recheck.inCodeBlock) {
          chunks.push(prefix + chunk + CLOSE_FENCE);
          pendingLang = recheck.lang;
        } else {
          chunks.push(prefix + chunk);
          pendingLang = null;
        }
      } else {
        // 閉じフェンスを入れる余裕がない — コードブロック追跡を諦める
        chunks.push(prefix + chunk);
        pendingLang = null;
      }
    } else {
      chunks.push(prefix + chunk);
      pendingLang = null;
    }

    remaining = remaining.slice(splitAt);
  }

  return chunks;
}

function findSplitPoint(text: string, maxLen: number): number {
  if (maxLen <= 0) return 1;
  if (text.length <= maxLen) return text.length;

  const region = text.slice(0, maxLen);
  // チャンクが極端に小さくならないよう、最大長の 1/4 を最小分割位置とする
  const minPos = Math.max(1, Math.floor(maxLen / 4));

  // 優先1: 空行
  const emptyLine = region.lastIndexOf("\n\n");
  if (emptyLine >= minPos) return emptyLine + 2;

  // 優先2: 改行
  const newline = region.lastIndexOf("\n");
  if (newline >= minPos) return newline + 1;

  // 優先3: スペース
  const space = region.lastIndexOf(" ");
  if (space >= minPos) return space + 1;

  // 優先4: 強制分割
  return maxLen;
}

function getCodeBlockState(
  text: string,
): { inCodeBlock: boolean; lang: string } {
  let inCodeBlock = false;
  let lang = "";
  // 行頭（またはテキスト先頭）の ``` のみをフェンスとして認識
  // 開きフェンス: ```lang（lang は任意）、閉じフェンス: ``` のみ（後続テキストなし）
  const regex = /(?:^|\n)```([^\n]*)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const info = match[1].replace(/\r$/, "");
    if (!inCodeBlock) {
      inCodeBlock = true;
      lang = info;
    } else if (info.trim() === "") {
      // 閉じフェンスは ``` のみ（後続に空白のみ許容）
      inCodeBlock = false;
      lang = "";
    }
    // コードブロック内の ```something は無視（閉じフェンスではない）
  }
  return { inCodeBlock, lang };
}
