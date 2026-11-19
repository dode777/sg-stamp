// 매장 PIN 로그인(소유자 2026-11-19 "매장 PIN").
//
// - PIN 은 Cloudflare 비밀값 `STORE_PIN` 에만 있다. 저장소·D1·화면 어디에도 없다.
// - 맞으면 서명한 쿠키를 준다(`sg_session`, HttpOnly · Secure · SameSite=Strict). 서명 키는 서버가 처음 한 번 만들어
//   D1 에 두는 무작위 값과 PIN 을 섞어 만든다. 그래서 **PIN 을 바꾸면 모든 기기가 다시 PIN 을 넣어야 한다.**
// - 틀린 횟수는 IP 마다 센다. `CONFIG.maxFails` 번 틀리면 `CONFIG.lockMinutes` 분 막는다(숫자 PIN 을 차례로 넣어 보는 것을 막는다).

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

async function sha256(s: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode(s)));
}

/** 길이가 같으면 끝까지 다 견준다(어디서 달라졌는지 시간으로 새지 않게) */
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i]! ^ b[i]!;
  return d === 0;
}

/** 서버가 처음 한 번 만드는 무작위 값. 두 요청이 동시에 만들어도 먼저 들어간 하나만 남는다 */
async function serverSecret(db: Db): Promise<string> {
  const fresh = b64url(crypto.getRandomValues(new Uint8Array(32)));
  await db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('session_secret', ?)").bind(fresh).run();
  const row = await db.prepare("SELECT value FROM settings WHERE key = 'session_secret'").first<{ value: string }>();
  return row!.value;
}

async function signer(db: Db, pin: string): Promise<CryptoKey> {
  const material = await sha256(`${await serverSecret(db)}:${b64url(await sha256(pin))}`);
  return crypto.subtle.importKey('raw', material, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

async function sign(db: Db, pin: string, exp: number): Promise<string> {
  return b64url(await crypto.subtle.sign('HMAC', await signer(db, pin), te.encode(`v1.${exp}`)));
}

export function cookieOf(req: Request, name = COOKIE): string | null {
  const raw = req.headers.get('cookie') ?? '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

export async function makeSession(db: Db, pin: string, now: number): Promise<string> {
  const exp = now + CONFIG.sessionDays * 86_400_000;
  const value = `${exp}.${await sign(db, pin, exp)}`;
  return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${CONFIG.sessionDays * 86_400}`;
}

export const CLEAR_COOKIE = `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;

/** 쿠키가 이 PIN 으로 서명됐고 아직 유효한가 */
export async function validSession(db: Db, pin: string | undefined, req: Request, now: number): Promise<boolean> {
  if (!pin) return false;
  const c = cookieOf(req);
  if (!c) return false;
  const [expText, sig] = c.split('.');
  const exp = Number(expText);
  if (!sig || !Number.isFinite(exp) || exp <= now) return false;
  const want = await sign(db, pin, exp);
  return sameBytes(te.encode(want), te.encode(sig));
}

export type LoginResult =
  | { ok: true; cookie: string }
  | { ok: false; status: 401; left: number }
  | { ok: false; status: 429; retryAfterSec: number };

/** PIN 확인. 틀리면 그 IP 의 틀린 횟수를 올리고, 너무 많으면 막는다 */
export async function login(db: Db, pin: string, given: string, ip: string, now: number): Promise<LoginResult> {
  const lockMs = CONFIG.lockMinutes * 60_000;
  const row = await db.prepare('SELECT fails, first_at, locked_until FROM login_fails WHERE ip = ?').bind(ip)
    .first<{ fails: number; first_at: number; locked_until: number | null }>();
  if (row?.locked_until && row.locked_until > now) {
    return { ok: false, status: 429, retryAfterSec: Math.ceil((row.locked_until - now) / 1000) };
  }
  if (sameBytes(await sha256(given), await sha256(pin))) {
    if (row) await db.prepare('DELETE FROM login_fails WHERE ip = ?').bind(ip).run();
    return { ok: true, cookie: await makeSession(db, pin, now) };
  }
  // 창이 지났거나 잠금이 풀린 뒤면 처음부터 센다
  const fresh = !row || row.first_at + lockMs <= now || (row.locked_until !== null && row.locked_until <= now);
  const fails = fresh ? 1 : row.fails + 1;
  const locked = fails >= CONFIG.maxFails ? now + lockMs : null;
  await db.prepare('INSERT OR REPLACE INTO login_fails (ip, fails, first_at, locked_until) VALUES (?, ?, ?, ?)')
    .bind(ip, fails, fresh ? now : row.first_at, locked).run();
  if (locked) return { ok: false, status: 429, retryAfterSec: CONFIG.lockMinutes * 60 };
  return { ok: false, status: 401, left: CONFIG.maxFails - fails };
}
