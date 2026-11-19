// 저장소: Durable Object 하나(SQLite). 매장 하나라 인스턴스도 하나다(`idFromName('store')`).
// 배포하면 Cloudflare 가 스스로 만든다. 데이터베이스를 따로 만들거나 비밀값을 넣을 일이 없다(소유자 2026-11-19 "내가 작업할 게 없도록").

import { api } from './api.js';
import { MIGRATIONS, MIGRATIONS_TABLE } from './schema.js';
import type { Db, Stmt } from './store.js';

class SqlStmt implements Stmt {
  private args: unknown[] = [];
  constructor(private sql: SqlStorage, private query: string) {}
  bind(...args: unknown[]): Stmt { this.args = args; return this; }
  /** 바로 실행한다(SQLite 는 동기다). 묶음(트랜잭션) 안에서도 이것을 쓴다 */
  execNow() {
    const c = this.sql.exec(this.query, ...this.args);
    const results = c.toArray();
    return { results, meta: { changes: c.rowsWritten } };
  }
  async first<T>(): Promise<T | null> { return (this.execNow().results[0] as T) ?? null; }
  async all<T>(): Promise<{ results: T[] }> { return { results: this.execNow().results as T[] }; }
  async run() { return { meta: this.execNow().meta }; }
}

class SqlDb implements Db {
  constructor(private storage: DurableObjectStorage) {}
  prepare(query: string): Stmt { return new SqlStmt(this.storage.sql, query); }
  /** 한 트랜잭션: 하나가 실패하면 모두 되돌린다 */
  async batch(stmts: Stmt[]) {
    return this.storage.transactionSync(() => stmts.map((s) => (s as SqlStmt).execNow()));
  }
}

export function migrate(storage: DurableObjectStorage, now: number): void {
  storage.transactionSync(() => {
    storage.sql.exec(MIGRATIONS_TABLE);
    const done = new Set(storage.sql.exec<{ id: number }>('SELECT id FROM _migrations').toArray().map((r) => Number(r.id)));
    MIGRATIONS.forEach((stmts, i) => {
      if (done.has(i + 1)) return;
      for (const s of stmts) storage.sql.exec(s);
      storage.sql.exec('INSERT INTO _migrations (id, at) VALUES (?, ?)', i + 1, now);
    });
  });
}

export class Store {
  private db: SqlDb;
  constructor(state: DurableObjectState) {
    this.db = new SqlDb(state.storage);
    migrate(state.storage, Date.now());
  }
  async fetch(req: Request): Promise<Response> {
    return api(req, new URL(req.url), this.db, Date.now());
  }
}
