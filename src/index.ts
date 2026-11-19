// 라우터. 화면 파일(public/)은 Cloudflare 가 바로 내주고(데이터가 없다), `/api/*` 만 이 Worker 를 지난다.
// `/api/login` 밖의 모든 API 는 PIN 로그인 쿠키가 있어야 한다.

import { CLEAR_COOKIE, login, validSession } from './auth.js';
import { CONFIG } from './config.js';
import {
  addStamp, createMember, deleteMember, DuplicatePhone, getMember, InputError, removeStamp, reward, searchMembers, updateMember,
  type Db,
} from './store.js';

export interface Env {
  DB: D1Database;
  ASSETS?: Fetcher;
  /** 매장 PIN. **비밀값으로만 넣는다**(Cloudflare 대시보드 → Workers → sg-stamp → 설정 → 변수 및 비밀) */
  STORE_PIN?: string;
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS ? env.ASSETS.fetch(req) : new Response('not found', { status: 404 });
    try {
      return await api(req, url, env, Date.now());
    } catch (e) {
      console.error('API 오류', (e as Error)?.name, String((e as Error)?.message ?? e).slice(0, 200));
      return json({ error: '잠시 후 다시 시도해 주세요' }, 500);
    }
  },
};

export async function api(req: Request, url: URL, env: Env, now: number): Promise<Response> {
  const db = env.DB as unknown as Db;
  const path = url.pathname;
  const method = req.method;

  // 상태를 바꾸는 요청은 같은 주소에서 온 것만(다른 사이트가 로그인 쿠키를 빌려 도장을 찍지 못하게)
  if (method !== 'GET' && req.headers.get('origin') !== url.origin) return json({ error: '같은 주소에서만 부를 수 있어요' }, 403);

  if (path === '/api/login' && method === 'POST') {
    if (!env.STORE_PIN) return json({ error: 'PIN 이 아직 설정되지 않았어요' }, 503);
    const body = await readJson(req);
    const pin = typeof body.pin === 'string' ? body.pin : '';
    const ip = req.headers.get('cf-connecting-ip') ?? 'unknown';
    const r = await login(db, env.STORE_PIN, pin, ip, now);
    if (r.ok) return json({ ok: true }, 200, { 'set-cookie': r.cookie });
    if (r.status === 429) return json({ error: `잠시 막혔어요. ${Math.ceil(r.retryAfterSec / 60)}분 뒤에 다시 해 주세요` }, 429, { 'retry-after': String(r.retryAfterSec) });
    return json({ error: `PIN 이 맞지 않아요. ${r.left}번 더 틀리면 잠시 막혀요` }, 401);
  }
  if (path === '/api/logout' && method === 'POST') return json({ ok: true }, 200, { 'set-cookie': CLEAR_COOKIE });

  if (!(await validSession(db, env.STORE_PIN, req, now))) return json({ error: '로그인이 필요해요' }, 401);

  if (path === '/api/me' && method === 'GET') return json({ ok: true, goal: CONFIG.goal });

  if (path === '/api/members') {
    if (method === 'GET') return json({ items: await searchMembers(db, url.searchParams.get('q') ?? '') });
    if (method === 'POST') return write(async () => json({ id: await createMember(db, await readJson(req), now) }, 201));
  }

  const m = /^\/api\/members\/(\d+)(?:\/(stamp|unstamp|reward))?$/.exec(path);
  if (m) {
    const id = Number(m[1]);
    const action = m[2];
    if (!action) {
      if (method === 'GET') {
        const d = await getMember(db, id);
        return d ? json(d) : json({ error: '없는 회원이에요' }, 404);
      }
      if (method === 'PUT') return write(async () => (await updateMember(db, id, await readJson(req), now)) ? detail(db, id) : json({ error: '없는 회원이에요' }, 404));
      if (method === 'DELETE') return (await deleteMember(db, id)) ? json({ ok: true }) : json({ error: '없는 회원이에요' }, 404);
    }
    if (method === 'POST' && action === 'stamp') {
      if (await addStamp(db, id, now)) return detail(db, id);
      return (await getMember(db, id)) ? json({ error: `${CONFIG.goal}칸을 다 채웠어요. 보상을 먼저 처리해 주세요` }, 409) : json({ error: '없는 회원이에요' }, 404);
    }
    if (method === 'POST' && action === 'unstamp') {
      if (await removeStamp(db, id)) return detail(db, id);
      return (await getMember(db, id)) ? json({ error: '지울 도장이 없어요' }, 409) : json({ error: '없는 회원이에요' }, 404);
    }
    if (method === 'POST' && action === 'reward') {
      if (await reward(db, id, now)) return detail(db, id);
      return (await getMember(db, id)) ? json({ error: `${CONFIG.goal}칸을 다 채워야 보상할 수 있어요` }, 409) : json({ error: '없는 회원이에요' }, 404);
    }
  }
  return json({ error: '없는 경로예요' }, 404);
}

async function detail(db: Db, id: number): Promise<Response> {
  const d = await getMember(db, id);
  return d ? json(d) : json({ error: '없는 회원이에요' }, 404);
}

async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const v = await req.json();
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** 입력이 틀렸거나 번호가 겹치면 그 까닭을 돌려준다 */
async function write(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof InputError) return json({ error: e.message, field: e.field }, 400);
    if (e instanceof DuplicatePhone) return json({ error: e.message, field: 'phone', memberId: e.memberId }, 409);
    throw e;
  }
}
