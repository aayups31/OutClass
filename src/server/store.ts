import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import { randomBytes } from "node:crypto";
import type { AppState, Preview, ResumeAnchor } from "../shared.js";

export class Store {
  private transactionDepth = 0;
  readonly db: DatabaseSync;
  constructor(public directory: string) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path.join(directory, "learning.sqlite"));
    this.db.exec(
      `PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, received_at TEXT NOT NULL);`,
    );
    if (!this.get("state"))
      this.put("state", {
        settings: {
          configured: false,
          repoPath: path.join(homedir(), "GitLearn", "learning"),
          aiEnabled: false,
          remote: "",
        },
        courses: [],
        session: null,
        checkpoints: [],
      } satisfies AppState);
    if (!this.get("localToken"))
      this.put("localToken", randomBytes(32).toString("hex"));
    // Existing lesson folders and Git history stay in place. Only known session context migrates.
    if (!this.get("learningSchemaVersion")) {
      this.transaction(() => {
        const session = this.state().session;
        if (session && !this.get(`resume:${session.courseId}`))
          this.put(`resume:${session.courseId}`, {
            courseId: session.courseId,
            lessonId: session.lessonId,
            workspace: session.workspace,
            note: session.note,
            updatedAt: session.startedAt,
            lastAction: session.status === "paused" ? "paused" : "started",
          } satisfies ResumeAnchor);
        this.put("learningSchemaVersion", 1);
      });
    }
    // Preview candidates are already filtered/scanned, expire automatically, and survive a restart.
    this.db
      .prepare(
        "DELETE FROM kv WHERE key LIKE 'preview:%' AND json_extract(value, '$.createdAt') < ?",
      )
      .run(new Date(Date.now() - 86400000).toISOString());
  }
  get<T>(key: string): T | undefined {
    const row = this.db
      .prepare("SELECT value FROM kv WHERE key = ?")
      .get(key) as { value: string } | undefined;
    return row ? (JSON.parse(row.value) as T) : undefined;
  }
  put(key: string, value: unknown) {
    this.db
      .prepare(
        "INSERT INTO kv(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run(key, JSON.stringify(value));
  }
  remove(key: string) {
    this.db.prepare("DELETE FROM kv WHERE key = ?").run(key);
  }
  state() {
    return this.get<AppState>("state")!;
  }
  save(state: AppState) {
    this.put("state", state);
  }
  transaction<T>(fn: () => T): T {
    const nested = this.transactionDepth > 0;
    const savepoint = `outclass_nested_${this.transactionDepth}`;
    this.db.exec(nested ? `SAVEPOINT ${savepoint}` : "BEGIN IMMEDIATE");
    this.transactionDepth++;
    try {
      const result = fn();
      this.db.exec(nested ? `RELEASE SAVEPOINT ${savepoint}` : "COMMIT");
      return result;
    } catch (error) {
      this.db.exec(
        nested
          ? `ROLLBACK TO SAVEPOINT ${savepoint}; RELEASE SAVEPOINT ${savepoint}`
          : "ROLLBACK",
      );
      throw error;
    } finally {
      this.transactionDepth--;
    }
  }
  seen(id: string) {
    return !!this.db.prepare("SELECT 1 FROM events WHERE id = ?").get(id);
  }
  record(id: string) {
    this.db
      .prepare("INSERT OR IGNORE INTO events VALUES (?,?)")
      .run(id, new Date().toISOString());
    this.db
      .prepare("DELETE FROM events WHERE received_at < ?")
      .run(new Date(Date.now() - 30 * 86400000).toISOString());
  }
  preview(id: string) {
    return this.get<Preview>(`preview:${id}`);
  }
  close() {
    this.db.close();
  }
}
