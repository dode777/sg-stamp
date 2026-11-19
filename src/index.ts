// 화면 파일(public/)은 Cloudflare 가 바로 내주고, `/api/*` 만 이 Worker 가 받아 저장소(Durable Object)로 넘긴다.
// 화면 판: 2026-11-19 PC·태블릿 반응형 · 찍은 날짜 표시(public/ 만 바뀐 머지가 자동 배포되지 않아 이 줄로 배포를 함께 태운다)

export { Store } from './do.js';

export interface Env {
  STORE: DurableObjectNamespace;
  ASSETS?: Fetcher;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/')) return env.STORE.get(env.STORE.idFromName('store')).fetch(req);
    return env.ASSETS ? env.ASSETS.fetch(req) : new Response('not found', { status: 404 });
  },
};
