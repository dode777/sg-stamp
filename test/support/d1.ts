// 테스트용 D1: 실제 SQLite(node:sqlite) 위에 D1 이 쓰는 표면만 얹는다. 마이그레이션을 번호 순서로 모두 적용한다.
// batch 는 D1 처럼 한 트랜잭션이다(하나가 실패하면 모두 되돌린다). 외래 키도 D1 처럼 켠다.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';

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
  const dir = new URL('../../migrations/', import.meta.url);
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(f, dir), 'utf8'));

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
