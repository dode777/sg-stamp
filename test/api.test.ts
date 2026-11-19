import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { fakeD1, type FakeD1 } from './support/d1.js';
import { api, type Env } from '../src/index.js';
import { CONFIG } from '../src/config.js';
import { formatPhone } from '../src/phone.js';

const ORIGIN = 'https://sg.isocompany.co.kr';
const PIN = '482915';
let db: FakeD1;
let now: number;
let cookie = '';
const env = (pin: string | undefined = PIN) => ({ DB: db, STORE_PIN: pin }) as unknown as Env;

async function call(method: string, path: string, body?: unknown, opts: { cookie?: string; origin?: string; ip?: string; pin?: string } = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json', 'cf-connecting-ip': opts.ip ?? '1.2.3.4' };
  if (method !== 'GET') headers.origin = opts.origin ?? ORIGIN;
  const c = opts.cookie ?? cookie;
  if (c) headers.cookie = c;
  const req = new Request(`${ORIGIN}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const res = await api(req, new URL(req.url), env(opts.pin ?? PIN), now);
  return { status: res.status, body: await res.json() as Record<string, any>, setCookie: res.headers.get('set-cookie') };
}

async function signIn() {
  const r = await call('POST', '/api/login', { pin: PIN }, { cookie: '' });
  cookie = r.setCookie!.split(';')[0]!;
}

beforeEach(async () => { db = fakeD1(); now = Date.UTC(2026, 10, 19, 1, 0, 0); cookie = ''; });
afterEach(() => db.close());

describe('PIN 로그인', () => {
  it('맞는 PIN 은 30일짜리 쿠키를 주고, 그 쿠키로 API 가 열린다', async () => {
    expect((await call('GET', '/api/members')).status).toBe(401);
    const r = await call('POST', '/api/login', { pin: PIN });
    expect(r.status).toBe(200);
    expect(r.setCookie).toMatch(/HttpOnly; Secure; SameSite=Strict; Max-Age=2592000/);
    cookie = r.setCookie!.split(';')[0]!;
    expect((await call('GET', '/api/members')).status).toBe(200);
    now += CONFIG.sessionDays * 86_400_000 + 1;
    expect((await call('GET', '/api/members')).status).toBe(401);
  });

  it('PIN 을 바꾸면 전에 받은 쿠키는 쓸 수 없다', async () => {
    await signIn();
    expect((await call('GET', '/api/members', undefined, { pin: '000111' })).status).toBe(401);
  });

  it('위조한 쿠키는 통과하지 못한다', async () => {
    await signIn();
    const [exp, sig] = cookie.split('=')[1]!.split('.');
    const longer = `sg_session=${Number(exp) + 86_400_000}.${sig}`;
    expect((await call('GET', '/api/members', undefined, { cookie: longer })).status).toBe(401);
  });

  it(`${CONFIG.maxFails}번 틀리면 그 IP 는 ${CONFIG.lockMinutes}분 막히고, 맞는 PIN 도 그동안은 막힌다`, async () => {
    for (let i = 1; i < CONFIG.maxFails; i++) {
      const r = await call('POST', '/api/login', { pin: '1111' });
      expect(r.status).toBe(401);
      expect(r.body.error).toContain(`${CONFIG.maxFails - i}번 더`);
    }
    expect((await call('POST', '/api/login', { pin: '1111' })).status).toBe(429);
    expect((await call('POST', '/api/login', { pin: PIN })).status).toBe(429);
    expect((await call('POST', '/api/login', { pin: PIN }, { ip: '5.6.7.8' })).status).toBe(200);
    now += CONFIG.lockMinutes * 60_000;
    expect((await call('POST', '/api/login', { pin: PIN })).status).toBe(200);
  });

  it('다른 사이트에서 온 요청과 PIN 이 없는 설정은 거절한다', async () => {
    expect((await call('POST', '/api/login', { pin: PIN }, { origin: 'https://evil.example' })).status).toBe(403);
    const req = new Request(`${ORIGIN}/api/login`, { method: 'POST', headers: { origin: ORIGIN }, body: JSON.stringify({ pin: PIN }) });
    expect((await api(req, new URL(req.url), { DB: db } as unknown as Env, now)).status).toBe(503);
  });
});

describe('회원', () => {
  beforeEach(signIn);

  it('등록하면 빈 카드가 생기고, 번호는 숫자만 저장한다', async () => {
    const r = await call('POST', '/api/members', { name: ' 김  민수 ', phone: '010-1234-5678', memo: '주말' });
    expect(r.status).toBe(201);
    const d = await call('GET', `/api/members/${r.body.id}`);
    expect(d.body).toMatchObject({ name: '김 민수', phone: '01012345678', memo: '주말', count: 0, rewards: 0, stamps: [], history: [], goal: CONFIG.goal });
  });

  it('같은 번호는 두 번 등록할 수 없고, 이미 있는 회원을 알려 준다', async () => {
    const a = await call('POST', '/api/members', { name: '김민수', phone: '01012345678' });
    const b = await call('POST', '/api/members', { name: '김민수2', phone: '010 1234 5678' });
    expect(b.status).toBe(409);
    expect(b.body).toMatchObject({ field: 'phone', memberId: a.body.id });
  });

  it('이름이 없거나 번호가 이상하면 어느 칸인지 알려 준다', async () => {
    expect((await call('POST', '/api/members', { name: '', phone: '01012345678' })).body.field).toBe('name');
    expect((await call('POST', '/api/members', { name: '김', phone: '1234' })).body.field).toBe('phone');
  });

  it('이름 일부나 번호 뒤 네 자리로 찾고, 숫자만 넣으면 번호로만 찾는다', async () => {
    await call('POST', '/api/members', { name: '김민수', phone: '01012345678' });
    await call('POST', '/api/members', { name: '이영희', phone: '01098765432' });
    await call('POST', '/api/members', { name: '박5678', phone: '01011112222' });
    const names = async (q: string) => (await call('GET', `/api/members?q=${encodeURIComponent(q)}`)).body.items.map((x: any) => x.name);
    expect(await names('민수')).toEqual(['김민수']);
    expect(await names('5678')).toEqual(['김민수']);
    expect(await names('010-9876')).toEqual(['이영희']);
    expect(await names('%')).toEqual([]);
    expect((await names('')).length).toBe(3);
  });

  it('최근에 도장을 받은 회원이 먼저 나온다', async () => {
    const a = await call('POST', '/api/members', { name: '가', phone: '01000000001' });
    now += 1000;
    await call('POST', '/api/members', { name: '나', phone: '01000000002' });
    now += 1000;
    await call('POST', `/api/members/${a.body.id}/stamp`);
    expect((await call('GET', '/api/members')).body.items.map((x: any) => x.name)).toEqual(['가', '나']);
  });

  it('고치기·지우기. 지우면 도장 기록까지 없어진다', async () => {
    const a = await call('POST', '/api/members', { name: '김민수', phone: '01012345678' });
    const b = await call('POST', '/api/members', { name: '이영희', phone: '01098765432' });
    expect((await call('PUT', `/api/members/${a.body.id}`, { name: '김민수', phone: '01098765432' })).status).toBe(409);
    expect((await call('PUT', `/api/members/${a.body.id}`, { name: '김민준', phone: '01055556666', memo: '' })).body.name).toBe('김민준');
    await call('POST', `/api/members/${b.body.id}/stamp`);
    expect((await call('DELETE', `/api/members/${b.body.id}`)).status).toBe(200);
    expect(db.raw('SELECT COUNT(*) AS n FROM stamps')[0]!.n).toBe(0);
    expect((await call('GET', `/api/members/${b.body.id}`)).status).toBe(404);
  });
});

describe('도장과 보상', () => {
  beforeEach(signIn);
  const make = async () => (await call('POST', '/api/members', { name: '김민수', phone: '01012345678' })).body.id as number;

  it(`${CONFIG.goal}칸을 넘겨 찍을 수 없고, 다 차야 보상할 수 있다`, async () => {
    const id = await make();
    expect((await call('POST', `/api/members/${id}/reward`)).status).toBe(409);
    for (let i = 0; i < CONFIG.goal; i++) { now += 60_000; expect((await call('POST', `/api/members/${id}/stamp`)).status).toBe(200); }
    const full = await call('POST', `/api/members/${id}/stamp`);
    expect(full.status).toBe(409);
    expect((await call('GET', `/api/members/${id}`)).body.count).toBe(CONFIG.goal);

    const r = await call('POST', `/api/members/${id}/reward`);
    expect(r.body).toMatchObject({ count: 0, rewards: 1, stamps: [] });
    expect(r.body.history).toEqual([{ startedAt: expect.any(Number), rewardedAt: now, count: CONFIG.goal }]);
    // 보상을 두 번 누르면 두 번째는 거절(새 카드는 비어 있다)
    expect((await call('POST', `/api/members/${id}/reward`)).status).toBe(409);
    expect(db.raw('SELECT COUNT(*) AS n FROM cards WHERE rewarded_at IS NULL')[0]!.n).toBe(1);
  });

  it('잘못 찍은 도장은 마지막 것부터 지운다. 보상한 카드의 도장은 지우지 않는다', async () => {
    const id = await make();
    expect((await call('POST', `/api/members/${id}/unstamp`)).status).toBe(409);
    await call('POST', `/api/members/${id}/stamp`); now += 1000;
    await call('POST', `/api/members/${id}/stamp`);
    const r = await call('POST', `/api/members/${id}/unstamp`);
    expect(r.body.stamps).toEqual([now - 1000]);
  });

  it('없는 회원에는 찍지도 보상하지도 않는다', async () => {
    expect((await call('POST', '/api/members/999/stamp')).status).toBe(404);
    expect((await call('POST', '/api/members/999/reward')).status).toBe(404);
    expect(db.raw('SELECT COUNT(*) AS n FROM cards')[0]!.n).toBe(0);
  });
});

describe('전화번호 모양', () => {
  it('휴대폰·서울·지역 번호', () => {
    expect(formatPhone('01012345678')).toBe('010-1234-5678');
    expect(formatPhone('0212345678')).toBe('02-1234-5678');
    expect(formatPhone('021234567')).toBe('02-123-4567');
    expect(formatPhone('0311234567')).toBe('031-123-4567');
  });
});
