// 매장 PIN 4자리(소유자 2026-11-19 "핀은 7779, 4자리로"). 소유자가 따로 넣을 비밀값은 없다.
//
// - PIN 은 해시로만 코드에 있다(`CONFIG.pinHash`).
// - 맞으면 서명한 쿠키를 준다(`sg_session`, HttpOnly · Secure · SameSite=Strict, `CONFIG.sessionDays` 일).
//   서명 키는 저장소(Durable Object)가 처음 한 번 만드는 무작위 값 + PIN 해시. 그래서 PIN 을 바꾸면 모든 기기가 다시 PIN 을 넣는다.
// - 틀린 횟수는 IP 마다 센다. `CONFIG.maxFails` 번 틀리면 `CONFIG.lockMinutes` 분 막는다.

import { CONFIG } from './config.js';
import type { Db } from './store.js';

const te = new TextEncoder();
export const COOKIE = 'sg_session';

function b64url(buf: ArrayBuffer | Uint8Array): string {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of u8) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function pinHashOf(pin: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', te.encode(`sg-stamp:${pin}`)));
}

/** 길이가 같으면 끝까지 다 견준다(어디서 달라졌는지 시간으로 새지 않게) */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** 저장소가 처음 한 번 만드는 무작위 값. 두 요청이 동시에 만들어도 먼저 들어간 하나만 남는다 */
async function serverSecret(db: Db): Promise<string> {
  const fresh = b64url(crypto.getRandomValues(new Uint8Array(32)));
  await db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('session_secret', ?)").bind(fresh).run();
  const row = await db.prepare("SELECT value FROM settings WHERE key = 'session_secret'").first<{ value: string }>();
  return row!.value;
}

async function sign(db: Db, exp: number): Promise<string> {
  const material = await crypto.subtle.digest('SHA-256', te.encode(`${await serverSecret(db)}:${CONFIG.pinHash}`));
  const key = await crypto.subtle.importKey('raw', material, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, te.encode(`v1.${exp}`)));
}

function cookieOf(req: Request): string | null {
  for (const part of (req.headers.get('cookie') ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE) return v.join('=');
  }
  return null;
}

export async function makeSession(db: Db, now: number): Promise<string> {
  const exp = now + CONFIG.sessionDays * 86_400_000;
  return `${COOKIE}=${exp}.${await sign(db, exp)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${CONFIG.sessionDays * 86_400}`;
}

export const CLEAR_COOKIE = `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;

/** 쿠키가 지금 PIN 으로 서명됐고 아직 유효한가 */
export async function validSession(db: Db, req: Request, now: number): Promise<boolean> {
  const c = cookieOf(req);
  if (!c) return false;
  const [expText, sig] = c.split('.');
  const exp = Number(expText);
  if (!sig || !Number.isFinite(exp) || exp <= now) return false;
  return same(await sign(db, exp), sig);
}

export type LoginResult =
  | { ok: true; cookie: string }
  | { ok: false; status: 401; left: number }
  | { ok: false; status: 429; retryAfterSec: number };

/** PIN 확인. 틀리면 그 IP 의 틀린 횟수를 올리고, 너무 많으면 막는다 */
export async function login(db: Db, given: string, ip: string, now: number): Promise<LoginResult> {
  const lockMs = CONFIG.lockMinutes * 60_000;
  const row = await db.prepare('SELECT fails, first_at, locked_until FROM login_fails WHERE ip = ?').bind(ip)
    .first<{ fails: number; first_at: number; locked_until: number | null }>();
  if (row?.locked_until && row.locked_until > now) {
    return { ok: false, status: 429, retryAfterSec: Math.ceil((row.locked_until - now) / 1000) };
  }
  if (same(await pinHashOf(given), CONFIG.pinHash)) {
    if (row) await db.prepare('DELETE FROM login_fails WHERE ip = ?').bind(ip).run();
    return { ok: true, cookie: await makeSession(db, now) };
  }
  // 창이 지났거나 잠금이 풀린 뒤면 처음부터 센다
  const fresh = !row || Number(row.first_at) + lockMs <= now || (row.locked_until !== null && row.locked_until <= now);
  const fails = fresh ? 1 : Number(row.fails) + 1;
  const locked = fails >= CONFIG.maxFails ? now + lockMs : null;
  await db.prepare('INSERT OR REPLACE INTO login_fails (ip, fails, first_at, locked_until) VALUES (?, ?, ?, ?)')
    .bind(ip, fails, fresh ? now : Number(row.first_at), locked).run();
  if (locked) return { ok: false, status: 429, retryAfterSec: CONFIG.lockMinutes * 60 };
  return { ok: false, status: 401, left: CONFIG.maxFails - fails };
}
