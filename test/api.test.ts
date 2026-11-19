import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { fakeD1, type FakeD1 } from './support/d1.js';
import { api } from '../src/api.js';
import type { Db } from '../src/store.js';
import { CONFIG } from '../src/config.js';
import { formatPhone } from '../src/phone.js';

const ORIGIN = 'https://sg.isocompany.co.kr';
let db: FakeD1;
let now: number;
let cookie = '';
const PIN = '7779';

async function call(method: string, path: string, body?: unknown, opts: { origin?: string; cookie?: string; ip?: string } = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json', 'cf-connecting-ip': opts.ip ?? '1.2.3.4' };
  if (method !== 'GET') headers.origin = opts.origin ?? ORIGIN;
  const c = opts.cookie ?? cookie;
  if (c) headers.cookie = c;
  const req = new Request(`${ORIGIN}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const res = await api(req, new URL(req.url), db as unknown as Db, now);
  return { status: res.status, body: await res.json() as Record<string, any>, setCookie: res.headers.get('set-cookie') };
}

async function signIn() {
  const r = await call('POST', '/api/login', { pin: PIN }, { cookie: '' });
  cookie = r.setCookie!.split(';')[0]!;
}

beforeEach(async () => { db = fakeD1(); now = Date.UTC(2026, 10, 19, 1, 0, 0); cookie = ''; await signIn(); });

describe('매장 PIN', () => {
  it('PIN 은 7779 이고 코드에는 해시만 있다', async () => {
    const { pinHashOf } = await import('../src/auth.js');
    expect(await pinHashOf(PIN)).toBe(CONFIG.pinHash);
    expect(JSON.stringify(CONFIG)).not.toContain(PIN);
  });

  it('로그인 없이는 회원을 볼 수 없고, 맞는 PIN 은 1년짜리 쿠키를 준다', async () => {
    expect((await call('GET', '/api/members', undefined, { cookie: '' })).status).toBe(401);
    const r = await call('POST', '/api/login', { pin: PIN }, { cookie: '' });
    expect(r.setCookie).toMatch(/HttpOnly; Secure; SameSite=Strict; Max-Age=31536000/);
    expect((await call('GET', '/api/members')).status).toBe(200);
    now += CONFIG.sessionDays * 86_400_000 + 1;
    expect((await call('GET', '/api/members')).status).toBe(401);
  });

  it('위조한 쿠키는 통과하지 못한다', async () => {
    const [exp, sig] = cookie.split('=')[1]!.split('.');
    expect((await call('GET', '/api/members', undefined, { cookie: `sg_session=${Number(exp) + 1}.${sig}` })).status).toBe(401);
  });

  it(`${CONFIG.maxFails}번 틀리면 그 IP 는 ${CONFIG.lockMinutes}분 막힌다`, async () => {
    for (let i = 1; i < CONFIG.maxFails; i++) {
      const r = await call('POST', '/api/login', { pin: '0000' }, { cookie: '' });
      expect(r.status).toBe(401);
      expect(r.body.left).toBe(CONFIG.maxFails - i);
    }
    expect((await call('POST', '/api/login', { pin: '0000' }, { cookie: '' })).status).toBe(429);
    expect((await call('POST', '/api/login', { pin: PIN }, { cookie: '' })).status).toBe(429);
    expect((await call('POST', '/api/login', { pin: PIN }, { cookie: '', ip: '5.6.7.8' })).status).toBe(200);
    now += CONFIG.lockMinutes * 60_000;
    expect((await call('POST', '/api/login', { pin: PIN }, { cookie: '' })).status).toBe(200);
  });
});
afterEach(() => db.close());

describe('바깥 요청', () => {
  it('다른 사이트에서 보낸 쓰기 요청은 거절한다(읽기는 된다)', async () => {
    expect((await call('POST', '/api/members', { name: '김', phone: '01012345678' }, { origin: 'https://evil.example' })).status).toBe(403);
    expect((await call('GET', '/api/members')).status).toBe(200);
  });
});

describe('회원', () => {

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

  it('한 번에 여러 개를 찍을 수 있다(서비스). 남은 칸보다 많으면 하나도 찍지 않고 남은 칸을 알려 준다', async () => {
    const id = await make();
    expect((await call('POST', `/api/members/${id}/stamp`, { count: 3 })).body).toMatchObject({ count: 3, stamps: [now, now, now] });
    expect((await call('POST', `/api/members/${id}/stamp`, { count: 25 })).body.count).toBe(28);
    const over = await call('POST', `/api/members/${id}/stamp`, { count: 3 });
    expect(over.status).toBe(409);
    expect(over.body.error).toBe('2칸 남았어요. 2개까지 찍을 수 있어요');
    expect((await call('GET', `/api/members/${id}`)).body.count).toBe(28);
    expect((await call('POST', `/api/members/${id}/stamp`, { count: 2 })).body.count).toBe(CONFIG.goal);
  });

  it('방금 찍은 여러 개를 한 번에 되돌린다', async () => {
    const id = await make();
    await call('POST', `/api/members/${id}/stamp`, { count: 2 });
    now += 1000;
    await call('POST', `/api/members/${id}/stamp`, { count: 3 });
    expect((await call('POST', `/api/members/${id}/unstamp`, { count: 3 })).body).toMatchObject({ count: 2, stamps: [now - 1000, now - 1000] });
  });

  it('찍는 개수는 1 이상의 정수만', async () => {
    const id = await make();
    for (const count of [0, -1, 1.5, 'x', CONFIG.goal + 1]) expect((await call('POST', `/api/members/${id}/stamp`, { count })).status).toBe(400);
    expect(db.raw('SELECT COUNT(*) AS n FROM stamps')[0]!.n).toBe(0);
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
