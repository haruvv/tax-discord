import { execFile } from "node:child_process";
import type { ClaudeResponse } from "./types.js";

export interface ClaudeResult {
  text: string;
  sessionId: string;
}

function getTimeoutMs(): number {
  return Number(process.env.CLAUDE_TIMEOUT_MS) || 90_000;
}
function getMaxTurns(): string {
  return process.env.CLAUDE_MAX_TURNS ?? "10";
}
const ALLOWED_TOOLS =
  'Read,Glob,Grep,Write,Bash(npx tsx scripts/calc-tax.ts *)';

function buildArgs(message: string, sessionId?: string): string[] {
  const args = [
    "-p", message,
    "--output-format", "json",
    "--append-system-prompt-file", "CLAUDE.md",
    "--allowedTools", ALLOWED_TOOLS,
    "--max-turns", getMaxTurns(),
  ];
  if (sessionId) {
    args.push("--resume", sessionId);
  }
  return args;
}

function exec(args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("claude", args, { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(stdout);
    });
  });
}

function parseResponse(stdout: string): ClaudeResult {
  try {
    const json = JSON.parse(stdout) as ClaudeResponse;
    return { text: json.result, sessionId: json.session_id };
  } catch {
    // JSON パース失敗: stdout をそのままテキストとして返す
    return { text: stdout.trim(), sessionId: "" };
  }
}

export async function callClaude(
  message: string,
  sessionId?: string,
): Promise<ClaudeResult> {
  const args = buildArgs(message, sessionId);

  let stdout: string;
  try {
    stdout = await exec(args, getTimeoutMs());
  } catch (firstErr: unknown) {
    // タイムアウト時のみ 1 回リトライ
    const isTimeout =
      firstErr instanceof Error && "killed" in firstErr && (firstErr as { killed: boolean }).killed;
    if (!isTimeout) throw firstErr;

    stdout = await exec(args, getTimeoutMs());
  }

  return parseResponse(stdout);
}
