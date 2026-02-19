import { readFileSync, writeFileSync, renameSync, unlinkSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const DEFAULT_STATE_PATH = ".state/session.json";

interface SessionState {
  sessionId: string;
  createdAt: string;
}

export class SessionManager {
  private current?: SessionState;
  private readonly path: string;

  constructor(path?: string) {
    this.path = path || process.env.SESSION_STATE_PATH || DEFAULT_STATE_PATH;
  }

  load(): void {
    this.current = undefined;
    let raw: string;
    try {
      raw = readFileSync(this.path, "utf-8");
    } catch (err: unknown) {
      if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
        return;
      }
      throw err;
    }

    try {
      const parsed = JSON.parse(raw) as SessionState;
      if (typeof parsed.sessionId === "string" && typeof parsed.createdAt === "string") {
        this.current = parsed;
      }
    } catch {
      // パース失敗: 退避して新規扱い
      console.warn(`[session] Invalid JSON in ${this.path}, backing up and resetting`);
      try {
        renameSync(this.path, `${this.path}.bak`);
      } catch {
        // 退避失敗は無視
      }
    }
  }

  get(): string | undefined {
    return this.current?.sessionId;
  }

  set(sessionId: string): void {
    this.current = { sessionId, createdAt: new Date().toISOString() };
    this.save();
  }

  delete(): void {
    this.current = undefined;
    try {
      unlinkSync(this.path);
    } catch (err: unknown) {
      if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
        return;
      }
      throw err;
    }
  }

  clear(): void {
    this.delete();
  }

  private save(): void {
    const dir = dirname(this.path);
    mkdirSync(dir, { recursive: true });

    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.current, null, 2) + "\n", "utf-8");
    renameSync(tmp, this.path);
  }
}
