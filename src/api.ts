// `/api/*`. 매장 PIN 4자리로 들어온다(`auth.ts`). `/api/login` 밖의 모든 경로는 로그인 쿠키가 있어야 한다.
// 다른 사이트가 이 주소로 요청을 보내 도장을 찍지 못하게, 상태를 바꾸는 요청은 같은 주소에서 온 것만 받는다(브라우저가 붙이는 origin).

import { CLEAR_COOKIE, login, validSession } from './auth.js';
import { CONFIG } from './config.js';
import {
  addStamps, createMember, deleteMember, DuplicatePhone, getMember, InputError, removeStamps, reward, searchMembers, updateMember,
  type Db,
} from './store.js';

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });

export async function api(req: Request, url: URL, db: Db, now: number): Promise<Response> {
  try {
    return await route(req, url, db, now);
  } catch (e) {
    if (e instanceof InputError) return json({ error: e.message, field: e.field }, 400);
    if (e instanceof DuplicatePhone) return json({ error: e.message, field: 'phone', memberId: e.memberId }, 409);
    console.error('API 오류', (e as Error)?.name, String((e as Error)?.message ?? e).slice(0, 200));
    return json({ error: '잠시 후 다시 시도해 주세요' }, 500);
  }
}

async function route(req: Request, url: URL, db: Db, now: number): Promise<Response> {
  const path = url.pathname;
  const method = req.method;
  if (method !== 'GET' && req.headers.get('origin') !== url.origin) return json({ error: '같은 주소에서만 쓸 수 있어요' }, 403);

  if (path === '/api/login' && method === 'POST') {
    const body = await readJson(req);
    const pin = typeof body.pin === 'string' ? body.pin : '';
    const r = await login(db, pin, req.headers.get('cf-connecting-ip') ?? 'unknown', now);
    if (r.ok) return json({ ok: true, goal: CONFIG.goal }, 200, { 'set-cookie': r.cookie });
    if (r.status === 429) return json({ error: `너무 많이 틀렸어요. ${Math.ceil(r.retryAfterSec / 60)}분 뒤에 다시 해 주세요` }, 429, { 'retry-after': String(r.retryAfterSec) });
    return json({ error: 'PIN이 맞지 않아요', left: r.left }, 401);
  }
  if (path === '/api/logout' && method === 'POST') return json({ ok: true }, 200, { 'set-cookie': CLEAR_COOKIE });
  if (!(await validSession(db, req, now))) return json({ error: 'PIN을 입력해 주세요' }, 401);

  if (path === '/api/config' && method === 'GET') return json({ goal: CONFIG.goal, pinLength: CONFIG.pinLength });

  if (path === '/api/members') {
    if (method === 'GET') return json({ items: await searchMembers(db, url.searchParams.get('q') ?? '') });
    if (method === 'POST') return json({ id: await createMember(db, await readJson(req), now) }, 201);
  }

  const m = /^\/api\/members\/(\d+)(?:\/(stamp|unstamp|reward))?$/.exec(path);
  if (!m) return json({ error: '없는 경로예요' }, 404);
  const id = Number(m[1]);
  const action = m[2];
  const detail = async () => { const d = await getMember(db, id); return d ? json(d) : gone(); };
  const gone = () => json({ error: '없는 회원이에요' }, 404);

  if (!action) {
    if (method === 'GET') return detail();
    if (method === 'PUT') return (await updateMember(db, id, await readJson(req), now)) ? detail() : gone();
    if (method === 'DELETE') return (await deleteMember(db, id)) ? json({ ok: true }) : gone();
  }
  if (method !== 'POST') return json({ error: '없는 경로예요' }, 404);

  if (action === 'stamp') {
    const body = await readJson(req);
    const n = body.count === undefined ? 1 : Number(body.count);
    if (await addStamps(db, id, n, now)) return detail();
    const cur = await getMember(db, id);
    if (!cur) return gone();
    const left = cur.goal - cur.count;
    return json({ error: left === 0 ? `${cur.goal}칸을 다 채웠어요. 보상을 먼저 처리해 주세요` : `${left}칸 남았어요. ${left}개까지 찍을 수 있어요` }, 409);
  }
  if (action === 'unstamp') {
    const body = await readJson(req);
    if (await removeStamps(db, id, body.count === undefined ? 1 : Number(body.count))) return detail();
    return (await getMember(db, id)) ? json({ error: '지울 도장이 없어요' }, 409) : gone();
  }
  if (await reward(db, id, now)) return detail();
  return (await getMember(db, id)) ? json({ error: `${CONFIG.goal}칸을 다 채워야 보상할 수 있어요` }, 409) : gone();
}

async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const v = await req.json();
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
