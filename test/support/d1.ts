// 테스트용 저장소: 실제 SQLite(node:sqlite) 위에 store.ts 가 쓰는 표면만 얹는다. 스키마는 운영과 같은 src/schema.ts.
// batch 는 운영처럼 한 트랜잭션이다(하나가 실패하면 모두 되돌린다). 외래 키도 켠다.
import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS, MIGRATIONS_TABLE } from '../../src/schema.js';

type Row = Record<string, unknown>;
type Meta = { changes: number; rows_written: number };

export interface FakeStmt {
  bind(...args: unknown[]): FakeStmt;
  first<T = Row>(): Promise<T | null>;
  all<T = Row>(): Promise<{ results: T[]; meta: Meta }>;
  run(): Promise<{ meta: Meta }>;
}
export interface FakeD1 {
  prepare(sql: string): FakeStmt;
  batch(stmts: FakeStmt[]): Promise<{ results: Row[]; meta: Meta }[]>;
  raw(sql: string, ...args: unknown[]): Row[];
  close(): void;
}

export function fakeD1(): FakeD1 {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(MIGRATIONS_TABLE);
  MIGRATIONS.forEach((stmts, i) => { for (const s of stmts) db.exec(s); db.prepare('INSERT INTO _migrations (id, at) VALUES (?, 0)').run(i + 1); });

  const make = (sql: string): FakeStmt => {
    let args: unknown[] = [];
    const exec = () => {
      const st = db.prepare(sql);
      if (/^\s*(insert|update|delete|replace)/i.test(sql)) {
        const n = Number(st.run(...(args as never[])).changes ?? 0);
        return { results: [] as Row[], meta: { changes: n, rows_written: n } };
      }
      return { results: st.all(...(args as never[])) as Row[], meta: { changes: 0, rows_written: 0 } };
    };
    const stmt: FakeStmt = {
      bind(...a) { args = a; return stmt; },
      async first<T>() { return (exec().results[0] as T) ?? null; },
      async all<T>() { const r = exec(); return { results: r.results as T[], meta: r.meta }; },
      async run() { return { meta: exec().meta }; },
    };
    return stmt;
  };

  return {
    prepare: make,
    async batch(stmts) {
      db.exec('BEGIN');
      try {
        const out = [];
        for (const s of stmts) out.push(await s.all());
        db.exec('COMMIT');
        return out;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    raw: (sql, ...a) => db.prepare(sql).all(...(a as never[])) as Row[],
    close: () => db.close(),
  };
}
