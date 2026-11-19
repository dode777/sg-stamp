// 읽기·쓰기 한 곳(Durable Object 안의 SQLite, 테스트는 node:sqlite). 도장 수는 따로 세어 두지 않고 `stamps` 줄을 센다(두 값이 어긋날 일이 없게).

import { CONFIG } from './config.js';
import { digits, validPhone } from './phone.js';

type Meta = { meta?: { changes?: number; rows_written?: number } | null };

/** 이 파일이 쓰는 표면만(D1 과 같은 모양이라 저장소를 바꿔도 이 파일은 그대로다) */
export interface Db {
  prepare(sql: string): Stmt;
  batch(stmts: Stmt[]): Promise<Meta[]>;
}
export interface Stmt {
  bind(...args: unknown[]): Stmt;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<{ results: T[] }>;
  run(): Promise<Meta>;
}

const changed = (r: Meta) => Number(r.meta?.changes ?? r.meta?.rows_written ?? 0);

export class InputError extends Error {
  constructor(message: string, readonly field?: string) { super(message); }
}
export class DuplicatePhone extends Error {
  constructor(readonly memberId: number) { super('이미 등록된 번호예요'); }
}

export interface MemberInput { name: string; phone: string; memo?: string }

/** 받은 값을 고르게 맞춘다. 틀리면 무엇이 틀렸는지 던진다 */
export function cleanInput(raw: unknown): { name: string; phone: string; memo: string } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const name = typeof r.name === 'string' ? r.name.trim().replace(/\s+/g, ' ') : '';
  const phone = typeof r.phone === 'string' ? digits(r.phone) : '';
  const memo = typeof r.memo === 'string' ? r.memo.trim() : '';
  if (!name) throw new InputError('이름을 넣어 주세요', 'name');
  if (name.length > CONFIG.nameMax) throw new InputError(`이름은 ${CONFIG.nameMax}자까지예요`, 'name');
  if (!validPhone(phone)) throw new InputError('전화번호를 확인해 주세요', 'phone');
  if (memo.length > CONFIG.memoMax) throw new InputError(`메모는 ${CONFIG.memoMax}자까지예요`, 'memo');
  return { name, phone, memo };
}

export interface MemberSummary {
  id: number; name: string; phone: string; memo: string;
  /** 지금 카드의 도장 수 */
  count: number;
  /** 보상까지 받은 카드 수 */
  rewards: number;
  /** 마지막 도장(없으면 등록한 때) */
  lastAt: number;
}

const SUMMARY = `
  SELECT m.id, m.name, m.phone, m.memo,
         (SELECT COUNT(*) FROM stamps s WHERE s.card_id = c.id) AS count,
         (SELECT COUNT(*) FROM cards d WHERE d.member_id = m.id AND d.rewarded_at IS NOT NULL) AS rewards,
         COALESCE((SELECT MAX(at) FROM stamps t WHERE t.member_id = m.id), m.created_at) AS lastAt
    FROM members m JOIN cards c ON c.member_id = m.id AND c.rewarded_at IS NULL`;

const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * 이름 일부 또는 전화번호 일부(뒤 네 자리 등)로 찾는다. 빈 검색은 최근에 온 회원부터.
 * 숫자만 넣으면 전화번호로만 찾는다(이름에 숫자가 섞여 잘못 걸리지 않게).
 */
export async function searchMembers(db: Db, q: string, limit: number = CONFIG.listLimit): Promise<MemberSummary[]> {
  const text = q.trim();
  const num = digits(text);
  const onlyDigits = text !== '' && /^[\d\s-]+$/.test(text);
  let where = '';
  const args: unknown[] = [];
  if (onlyDigits) { where = "WHERE m.phone LIKE ? ESCAPE '\\'"; args.push(`%${num}%`); }
  else if (text) { where = "WHERE m.name LIKE ? ESCAPE '\\'"; args.push(`%${likeEscape(text)}%`); }
  const r = await db.prepare(`${SUMMARY} ${where} ORDER BY lastAt DESC, m.id DESC LIMIT ?`).bind(...args, limit).all<MemberSummary>();
  return r.results.map(num2);
}

function num2(x: MemberSummary): MemberSummary {
  return { ...x, id: Number(x.id), count: Number(x.count), rewards: Number(x.rewards), lastAt: Number(x.lastAt) };
}

async function idByPhone(db: Db, phone: string): Promise<number | null> {
  const r = await db.prepare('SELECT id FROM members WHERE phone = ?').bind(phone).first<{ id: number }>();
  return r ? Number(r.id) : null;
}

/** 회원 등록 + 첫 카드. 같은 번호가 있으면 그 회원을 알려 준다 */
export async function createMember(db: Db, raw: unknown, now: number): Promise<number> {
  const m = cleanInput(raw);
  const dup = await idByPhone(db, m.phone);
  if (dup !== null) throw new DuplicatePhone(dup);
  try {
    await db.batch([
      db.prepare('INSERT INTO members (name, phone, memo, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').bind(m.name, m.phone, m.memo, now, now),
      db.prepare('INSERT INTO cards (member_id, started_at) SELECT id, ? FROM members WHERE phone = ?').bind(now, m.phone),
    ]);
  } catch (e) {
    // 같은 순간 다른 기기가 같은 번호로 등록했다
    const again = await idByPhone(db, m.phone);
    if (again !== null) throw new DuplicatePhone(again);
    throw e;
  }
  return (await idByPhone(db, m.phone))!;
}

export async function updateMember(db: Db, id: number, raw: unknown, now: number): Promise<boolean> {
  const m = cleanInput(raw);
  const dup = await idByPhone(db, m.phone);
  if (dup !== null && dup !== id) throw new DuplicatePhone(dup);
  const r = await db.prepare('UPDATE members SET name = ?, phone = ?, memo = ?, updated_at = ? WHERE id = ?')
    .bind(m.name, m.phone, m.memo, now, id).run();
  return changed(r) > 0;
}

/** 회원과 그 도장 기록을 모두 지운다(개인정보를 남기지 않는다) */
export async function deleteMember(db: Db, id: number): Promise<boolean> {
  const r = await db.batch([
    db.prepare('DELETE FROM stamps WHERE member_id = ?').bind(id),
    db.prepare('DELETE FROM cards WHERE member_id = ?').bind(id),
    db.prepare('DELETE FROM members WHERE id = ?').bind(id),
  ]);
  return changed(r[2]!) > 0;
}

export interface MemberDetail extends MemberSummary {
  createdAt: number;
  /** 지금 카드에 찍은 시각들(오래된 것이 앞) */
  stamps: number[];
  /** 지난 카드(최근이 앞) */
  history: { startedAt: number; rewardedAt: number; count: number }[];
  goal: number;
}

export async function getMember(db: Db, id: number): Promise<MemberDetail | null> {
  const head = await db.prepare(`${SUMMARY} WHERE m.id = ?`).bind(id).first<MemberSummary>();
  if (!head) return null;
  const [created, stamps, history] = await Promise.all([
    db.prepare('SELECT created_at AS createdAt FROM members WHERE id = ?').bind(id).first<{ createdAt: number }>(),
    db.prepare(`SELECT s.at FROM stamps s JOIN cards c ON c.id = s.card_id
                 WHERE c.member_id = ? AND c.rewarded_at IS NULL ORDER BY s.at, s.id`).bind(id).all<{ at: number }>(),
    db.prepare(`SELECT c.started_at AS startedAt, c.rewarded_at AS rewardedAt,
                       (SELECT COUNT(*) FROM stamps s WHERE s.card_id = c.id) AS count
                  FROM cards c WHERE c.member_id = ? AND c.rewarded_at IS NOT NULL ORDER BY c.rewarded_at DESC`).bind(id)
      .all<{ startedAt: number; rewardedAt: number; count: number }>(),
  ]);
  return {
    ...num2(head),
    createdAt: Number(created?.createdAt ?? 0),
    stamps: stamps.results.map((x) => Number(x.at)),
    history: history.results.map((h) => ({ startedAt: Number(h.startedAt), rewardedAt: Number(h.rewardedAt), count: Number(h.count) })),
    goal: CONFIG.goal,
  };
}

/**
 * 도장 n개를 한 번에(서비스로 더 줄 때, 소유자 2026-11-19). 칸이 모자라면 하나도 찍지 않는다(false).
 * 한 문장이라 두 기기가 동시에 눌러도 칸 수를 넘지 않는다.
 */
export async function addStamps(db: Db, id: number, n: number, now: number): Promise<boolean> {
  if (!Number.isInteger(n) || n < 1 || n > CONFIG.goal) throw new InputError(`도장은 한 번에 1~${CONFIG.goal}개예요`, 'count');
  const r = await db.prepare(`
    INSERT INTO stamps (card_id, member_id, at)
    WITH RECURSIVE seq(k) AS (SELECT 1 UNION ALL SELECT k + 1 FROM seq WHERE k < ?)
    SELECT c.id, c.member_id, ? FROM cards c, seq
     WHERE c.member_id = ? AND c.rewarded_at IS NULL
       AND (SELECT COUNT(*) FROM stamps s WHERE s.card_id = c.id) + ? <= ?`).bind(n, now, id, n, CONFIG.goal).run();
  return changed(r) > 0;
}

/** 지금 카드의 마지막 도장 n개를 지운다(잘못 눌렀을 때 · 방금 찍은 것 되돌리기). 지울 것이 없으면 false */
export async function removeStamps(db: Db, id: number, n = 1): Promise<boolean> {
  if (!Number.isInteger(n) || n < 1 || n > CONFIG.goal) throw new InputError(`도장은 한 번에 1~${CONFIG.goal}개예요`, 'count');
  const r = await db.prepare(`
    DELETE FROM stamps WHERE id IN (
      SELECT s.id FROM stamps s JOIN cards c ON c.id = s.card_id
       WHERE c.member_id = ? AND c.rewarded_at IS NULL ORDER BY s.at DESC, s.id DESC LIMIT ?)`).bind(id, n).run();
  return changed(r) > 0;
}

/**
 * 보상을 주고 새 카드를 시작한다. 카드가 다 찼을 때만(false 면 아직 덜 찼다).
 * 한 묶음(트랜잭션)이라 보상만 되고 새 카드가 없는 상태가 생기지 않는다.
 */
export async function reward(db: Db, id: number, now: number): Promise<boolean> {
  const r = await db.batch([
    db.prepare(`UPDATE cards SET rewarded_at = ?
                 WHERE member_id = ? AND rewarded_at IS NULL
                   AND (SELECT COUNT(*) FROM stamps s WHERE s.card_id = cards.id) >= ?`).bind(now, id, CONFIG.goal),
    db.prepare(`INSERT INTO cards (member_id, started_at)
                SELECT ?, ? WHERE EXISTS (SELECT 1 FROM members WHERE id = ?)
                  AND NOT EXISTS (SELECT 1 FROM cards WHERE member_id = ? AND rewarded_at IS NULL)`).bind(id, now, id, id),
  ]);
  return changed(r[0]!) > 0;
}
