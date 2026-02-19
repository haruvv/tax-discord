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
  return process.env.CLAUDE_MAX_TURNS ?? "10";
}
const ALLOWED_TOOLS =
  'Read,Glob,Grep,Write,Bash(npx tsx scripts/calc-tax.ts *)';

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
    const child = spawn("claude", args, { stdio: ["ignore", "pipe", "pipe"], shell: true });
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
  try {
    const json = JSON.parse(stdout) as ClaudeResponse;
    return { text: json.result ?? "", sessionId: json.session_id ?? "" };
  } catch {
    // JSON パース失敗: stdout をそのままテキストとして返す
    return { text: stdout.trim(), sessionId: "" };
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
  const result = parseResponse(stdout);
  const resPreview = result.text.length > 100 ? result.text.slice(0, 100) + "…" : result.text;
  console.log(`[claude] <<< ${elapsed}ms | ${result.text.length} chars | ${resPreview}`);

  return result;
}
