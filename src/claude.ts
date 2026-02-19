import { spawn, type ChildProcess } from "node:child_process";
import type { ClaudeResponse } from "./types.js";

export interface ClaudeResult {
  text: string;
  sessionId: string;
}

// 実行中の子プロセスを追跡
const activeChildren = new Set<ChildProcess>();

export function killAll(): void {
  for (const child of activeChildren) {
    child.kill();
  }
  activeChildren.clear();
}

function getTimeoutMs(): number {
  return Number(process.env.CLAUDE_TIMEOUT_MS) || 90_000;
}
function getMaxTurns(): string {
  return process.env.CLAUDE_MAX_TURNS ?? "25";
}
const ALLOWED_TOOLS =
  'Read,Glob,Grep,Write,Bash(pnpm tsx scripts/calc-tax.ts *),Bash(mkdir -p *)';

export interface CallClaudeOptions {
  maxTurns?: number;
}

function buildArgs(message: string, sessionId?: string, options?: CallClaudeOptions): string[] {
  const args = [
    "-p", message,
    "--output-format", "json",
    "--append-system-prompt-file", "CLAUDE.md",
    "--allowedTools", ALLOWED_TOOLS,
    "--max-turns", String(options?.maxTurns ?? Number(getMaxTurns())),
  ];
  if (sessionId) {
    args.push("--resume", sessionId);
  }
  return args;
}

function exec(args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("claude", args, { stdio: ["ignore", "pipe", "pipe"] });
    activeChildren.add(child);

    console.log(`[claude] spawned pid=${child.pid}`);

    const stdoutChunks: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => {
      process.stderr.write(`[claude:stderr] ${chunk.toString()}`);
    });

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`claude process timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.on("error", (err) => {
      clearTimeout(timer);
      activeChildren.delete(child);
      reject(new Error(`claude spawn error: ${err.message}`));
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      activeChildren.delete(child);
      const stdout = Buffer.concat(stdoutChunks).toString("utf-8");
      if (code !== 0) {
        reject(new Error(`claude exited with code ${code}\n${stdout}`));
        return;
      }
      resolve(stdout);
    });
  });
}

function parseResponse(stdout: string): ClaudeResult {
  // Claude CLI は NDJSON（1行1JSONオブジェクト）を出力することがある
  // 最後の result 行を探す
  const lines = stdout.trim().split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const json = JSON.parse(lines[i]) as Record<string, unknown>;
      if (json.type === "result" || json.result !== undefined) {
        const text = json.result
          ? String(json.result)
          : json.subtype === "error_max_turns"
            ? "処理のステップ数が上限に達しました。「続けて」と送信してください。"
            : "";
        return {
          text,
          sessionId: String(json.session_id ?? ""),
        };
      }
    } catch {
      // この行はJSONではない、次を試す
    }
  }

  // 単一JSON（NDJSON でない場合）
  try {
    const json = JSON.parse(stdout) as ClaudeResponse;
    return { text: String(json.result ?? ""), sessionId: String(json.session_id ?? "") };
  } catch {
    return { text: stdout.trim() || "(応答なし)", sessionId: "" };
  }
}

export async function callClaude(
  message: string,
  sessionId?: string,
  options?: CallClaudeOptions,
): Promise<ClaudeResult> {
  const args = buildArgs(message, sessionId, options);
  const preview = message.length > 80 ? message.slice(0, 80) + "…" : message;
  const timeoutMs = getTimeoutMs();
  console.log(`[claude] >>> ${preview}${sessionId ? ` (session: ${sessionId.slice(0, 8)}…)` : ""}`);
  console.log(`[claude] timeout=${timeoutMs}ms, max-turns=${getMaxTurns()}, args=${JSON.stringify(args)}`);
  const start = Date.now();

  const stdout = await exec(args, getTimeoutMs());

  const elapsed = Date.now() - start;
  console.log(`[claude:raw] ${stdout.length} bytes, first 500: ${stdout.slice(0, 500)}`);
  const result = parseResponse(stdout);
  const text = result.text ?? "";
  const resPreview = text.length > 100 ? text.slice(0, 100) + "…" : text;
  console.log(`[claude] <<< ${elapsed}ms | ${text.length} chars | ${resPreview}`);

  return result;
}
