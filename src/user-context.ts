import { mkdirSync } from "node:fs";
import { SessionManager } from "./session.js";
import { generateClaudeMd } from "./claude-md.js";

const USERNAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

export class UserContext {
  private activeUsername: string | undefined;
  private readonly sessions = new Map<string, SessionManager>();

  constructor() {
    mkdirSync(".state", { recursive: true });
  }

  switchUser(username: string): void {
    if (!USERNAME_PATTERN.test(username)) {
      throw new Error(
        `Invalid username "${username}": only [a-zA-Z0-9_-] allowed`,
      );
    }

    // ユーザー別 tax-docs ディレクトリを作成
    const docsPath = this.resolveDocsPath(username);
    for (const sub of ["income", "expenses", "deductions", "data", "output"]) {
      mkdirSync(`${docsPath}/${sub}`, { recursive: true });
    }

    // セッション読み込み（未作成なら新規）
    if (!this.sessions.has(username)) {
      const sm = new SessionManager(`.state/${username}_session.json`);
      sm.load();
      this.sessions.set(username, sm);
    }

    this.activeUsername = username;

    // CLAUDE.md を再生成（ユーザー専用パスで）
    generateClaudeMd("CLAUDE.md", username);

    console.log(`[user-context] Switched to user: ${username}`);
  }

  getActiveUser(): string | undefined {
    return this.activeUsername;
  }

  getSessionManager(): SessionManager {
    if (!this.activeUsername) {
      throw new Error("No active user. Use /start first.");
    }
    const sm = this.sessions.get(this.activeUsername);
    if (!sm) {
      throw new Error(`Session not found for user: ${this.activeUsername}`);
    }
    return sm;
  }

  getUserDocsPath(): string {
    if (!this.activeUsername) {
      throw new Error("No active user. Use /start first.");
    }
    return this.resolveDocsPath(this.activeUsername);
  }

  private resolveDocsPath(username: string): string {
    const taxYear = process.env.TAX_YEAR ?? "2025";
    const taxDocsRoot = process.env.TAX_DOCS_ROOT ?? "~/tax-docs";
    const resolved = taxDocsRoot.replace(/^~/, process.env.HOME ?? "~");
    return `${resolved}/${taxYear}/${username}`;
  }
}
