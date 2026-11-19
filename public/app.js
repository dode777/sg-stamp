// SG스크린골프 도장 화면(카운터 직원용). 받은 글자는 늘 글자 노드로 넣는다(HTML 로 해석하지 않는다).
// 화면은 셋이다: 회원 찾기(#/) · 회원(#/m/번호) · 등록·수정(#/new, #/m/번호/edit). 로그인이 없으면 PIN 화면.

const app = document.getElementById('app');
const layer = document.getElementById('layer');
let GOAL = 30;

// ───────── 도구 ─────────

function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style') Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}

const ICON = {
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm9 16-3.5-3.5',
  x: 'M18 6 6 18M6 6l12 12',
  back: 'm15 18-6-6 6-6',
  plus: 'M12 5v14M5 12h14',
  check: 'M20 6 9 17l-5-5',
  gift: 'M20 12v9H4v-9M2 7h20v5H2zM12 21V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zm0 0h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z',
  info: 'M12 16v-4M12 8h.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
};
function icon(name, size = 20) {
  const ns = 'http://www.w3.org/2000/svg';
  const s = document.createElementNS(ns, 'svg');
  for (const [k, v] of Object.entries({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) s.setAttribute(k, String(v));
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', ICON[name]);
  s.append(p);
  return s;
}

const onlyDigits = (s) => s.replace(/\D/g, '');
function fmtPhone(d) {
  d = onlyDigits(d);
  if (d.startsWith('02')) return d.length <= 2 ? d : d.length <= 5 ? `${d.slice(0, 2)}-${d.slice(2)}` : d.length <= 9 ? `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}` : `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6, 10)}`;
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}-${d.slice(3)}`;
  if (d.length <= 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7, 11)}`;
}
const pad = (n) => String(n).padStart(2, '0');
function fmtDate(ms) { const d = new Date(ms); return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`; }
function fmtWhen(ms) {
  const d = new Date(ms), now = new Date();
  const t = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (d.toDateString() === now.toDateString()) return `오늘 ${t}`;
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `어제 ${t}`;
  return `${fmtDate(ms)} ${t}`;
}
const isToday = (ms) => new Date(ms).toDateString() === new Date().toDateString();

class ApiError extends Error { constructor(status, body) { super(body?.error ?? '잠시 후 다시 시도해 주세요'); this.status = status; this.body = body ?? {}; } }
async function api(method, path, body) {
  let res;
  try {
    res = await fetch(path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
  } catch {
    throw new ApiError(0, { error: '인터넷 연결을 확인해 주세요' });
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/api/login') { showLogin(); throw new ApiError(401, data); }
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

let toastTimer;
function toast(text) {
  document.querySelector('.toast')?.remove();
  const t = h('div', { class: 'toast', role: 'status' }, text);
  document.body.append(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 2200);
}

/** 아래에서 올라오는 확인 창. 고르면 true */
function confirmSheet({ title, body, ok, tone = 'primary' }) {
  document.querySelector('.toast')?.remove();
  return new Promise((resolve) => {
    const close = (v) => { layer.replaceChildren(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') close(false); };
    document.addEventListener('keydown', onKey);
    const okBtn = h('button', { class: `btn ${tone}`, onclick: () => close(true) }, ok);
    layer.replaceChildren(
      h('div', { class: 'scrim', onclick: () => close(false) }),
      h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
        h('span', { class: 'grab' }), h('h3', null, title), body ? h('p', null, body) : null,
        h('div', { class: 'row-btns' }, h('button', { class: 'btn gray', onclick: () => close(false) }, '닫기'), okBtn)),
    );
    okBtn.focus();
  });
}

// ───────── 로그인 ─────────

function showLogin() {
  layer.replaceChildren();
  const input = h('input', { type: 'password', inputmode: 'numeric', autocomplete: 'current-password', maxlength: 12, 'aria-label': '매장 PIN', placeholder: '••••' });
  const err = h('p', { class: 'err', role: 'alert' });
  const btn = h('button', { class: 'btn primary big', type: 'submit' }, '들어가기');
  const form = h('form', { class: 'card', onsubmit: async (e) => {
    e.preventDefault();
    if (!input.value) { input.focus(); return; }
    btn.disabled = true;
    try {
      await api('POST', '/api/login', { pin: input.value });
      route();
    } catch (x) {
      err.textContent = x.message;
      field.classList.add('bad');
      input.value = '';
      input.focus();
    } finally { btn.disabled = false; }
  } });
  const field = h('div', { class: 'field pin' }, h('label', null, '매장 PIN'), input, err);
  form.append(h('div', { style: { display: 'flex', flexDirection: 'column', gap: '20px' } }, field, btn));
  app.replaceChildren(h('section', { class: 'login' },
    h('div', { class: 'brand' }, h('img', { src: '/favicon.svg', alt: '' }), h('h1', null, 'SG스크린골프'), h('p', null, '방문 도장 관리')),
    form));
  input.focus();
}

// ───────── 회원 찾기 ─────────

let lastQuery = '';
function header() {
  return h('header', { class: 'top' },
    h('div', { class: 'brand' }, h('img', { src: '/favicon.svg', alt: '' }), h('h1', null, 'SG 도장')),
    h('button', { class: 'ghost', onclick: async () => {
      if (!(await confirmSheet({ title: '로그아웃할까요?', body: '다시 들어오려면 매장 PIN 이 필요해요.', ok: '로그아웃' }))) return;
      await api('POST', '/api/logout').catch(() => {});
      showLogin();
    } }, '로그아웃'));
}

function memberItem(m) {
  const full = m.count >= GOAL;
  const fill = h('span');
  fill.style.width = `${Math.min(100, (m.count / GOAL) * 100)}%`;
  return h('button', { class: 'item', onclick: () => go(`#/m/${m.id}`) },
    h('span', { class: `avatar${full ? ' full' : ''}`, 'aria-hidden': 'true' }, m.name.slice(0, 1)),
    h('span', { class: 'who' }, h('span', { class: 'name' }, m.name), h('span', { class: 'phone num' }, fmtPhone(m.phone))),
    h('span', { class: 'prog' },
      full ? h('span', { class: 'badge' }, '보상 대기') : h('span', { class: 'count num' }, String(m.count), h('small', null, ` / ${GOAL}`)),
      h('span', { class: 'bar', 'aria-hidden': 'true' }, fill)));
}

function showHome() {
  const input = h('input', { type: 'search', inputmode: 'search', placeholder: '이름 또는 전화번호 뒷자리', 'aria-label': '회원 찾기', value: lastQuery, enterkeyhint: 'search' });
  const clear = h('button', { class: 'clear', 'aria-label': '지우기', onclick: () => { input.value = ''; lastQuery = ''; load(); input.focus(); } }, icon('x', 18));
  const list = h('div', { class: 'list' });
  const title = h('h2', null, '최근 방문');
  const sub = h('span', { class: 'sub num' });
  const body = h('section', { class: 'card tight' },
    h('div', { class: 'section-title' }, h('div', null, title, ' ', sub),
      h('button', { class: 'btn soft small', onclick: () => go(`#/new${/\d{3,}/.test(input.value) ? `?phone=${onlyDigits(input.value)}` : ''}`) }, icon('plus', 18), '새 회원')),
    list);
  app.replaceChildren(header(), h('label', { class: 'search' }, icon('search'), input, clear), body);

  let seq = 0, timer;
  async function load() {
    const q = input.value.trim();
    lastQuery = q;
    clear.style.visibility = q ? 'visible' : 'hidden';
    title.textContent = q ? '찾은 회원' : '최근 방문';
    const mine = ++seq;
    try {
      const r = await api('GET', `/api/members?q=${encodeURIComponent(q)}`);
      if (mine !== seq) return;
      sub.textContent = r.items.length ? `${r.items.length}명` : '';
      if (r.items.length) { list.replaceChildren(...r.items.map(memberItem)); return; }
      const asPhone = onlyDigits(q).length >= 10;
      list.replaceChildren(h('div', { class: 'empty' },
        h('p', null, q ? '찾는 회원이 없어요' : '아직 등록한 회원이 없어요'),
        h('button', { class: 'btn primary small', onclick: () => go(`#/new${asPhone ? `?phone=${onlyDigits(q)}` : ''}`) },
          asPhone ? `${fmtPhone(q)} 등록하기` : '새 회원 등록하기')));
    } catch (x) {
      if (x.status !== 401 && mine === seq) list.replaceChildren(h('div', { class: 'empty' }, h('p', null, x.message)));
    }
  }
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 200); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { clearTimeout(timer); load(); input.blur(); } });
  load();
  if (matchMedia('(pointer: fine)').matches) input.focus();
}

// ───────── 회원 ─────────

let lastStamped = 0;
async function showMember(id) {
  let m;
  try { m = await api('GET', `/api/members/${id}`); } catch (x) {
    if (x.status === 401) return;
    app.replaceChildren(backBar(), h('section', { class: 'card empty' }, h('p', null, x.status === 404 ? '없는 회원이에요' : x.message)));
    return;
  }
  renderMember(m);
}

function backBar(extra) {
  return h('header', { class: 'top' }, h('button', { class: 'back', onclick: () => go('#/') }, icon('back', 22), '회원 찾기'), extra ?? null);
}

function renderMember(m, popLast = false) {
  const full = m.count >= m.goal;
  const today = m.stamps.filter(isToday).length;
  const grid = h('div', { class: 'grid', role: 'img', 'aria-label': `도장 ${m.count}개 / ${m.goal}칸` },
    ...Array.from({ length: m.goal }, (_, i) => {
      const on = i < m.count;
      return h('span', { class: `dot num${on ? ' on' : ''}${on && full ? ' full' : ''}${popLast && i === m.count - 1 ? ' last' : ''}` }, on ? icon('check', 18) : String(i + 1));
    }));

  const busy = (btn, fn) => async () => {
    btn.disabled = true;
    try { await fn(); } catch (x) { if (x.status !== 401) toast(x.message); btn.disabled = false; }
  };

  const stampBtn = h('button', { class: 'btn primary big' }, '도장 찍기');
  stampBtn.addEventListener('click', busy(stampBtn, async () => {
    // 손이 미끄러져 두 번 눌리지 않게 잠깐 쉰다
    if (Date.now() - lastStamped < 1500) { stampBtn.disabled = false; return; }
    lastStamped = Date.now();
    const r = await api('POST', `/api/members/${m.id}/stamp`);
    renderMember(r, true);
    toast(r.count >= r.goal ? `${r.goal}칸을 다 채웠어요` : `도장을 찍었어요 · ${r.count}/${r.goal}`);
  }));
  const rewardBtn = h('button', { class: 'btn reward big' }, icon('gift', 22), '보상 주고 새 카드 시작');
  rewardBtn.addEventListener('click', busy(rewardBtn, async () => {
    if (!(await confirmSheet({ title: '보상을 줬나요?', body: `${m.name}님의 카드를 보상 완료로 남기고 빈 카드를 시작해요.`, ok: '보상 완료', tone: 'reward' }))) { rewardBtn.disabled = false; return; }
    const r = await api('POST', `/api/members/${m.id}/reward`);
    renderMember(r);
    toast('보상 완료. 새 카드를 시작했어요');
  }));
  const undoBtn = h('button', { class: 'text-btn' }, '마지막 도장 취소');
  undoBtn.addEventListener('click', busy(undoBtn, async () => {
    const last = m.stamps[m.stamps.length - 1];
    if (!(await confirmSheet({ title: '마지막 도장을 취소할까요?', body: last ? `${fmtWhen(last)}에 찍은 도장 하나를 지워요.` : '', ok: '취소하기', tone: 'danger' }))) { undoBtn.disabled = false; return; }
    const r = await api('POST', `/api/members/${m.id}/unstamp`);
    renderMember(r);
    toast(`도장 하나를 지웠어요 · ${r.count}/${r.goal}`);
  }));

  const last = m.stamps[m.stamps.length - 1];
  const card = h('section', { class: 'card' },
    h('div', { class: 'stamp-top' },
      h('div', { class: 'big num' }, String(m.count), h('small', null, ` / ${m.goal}`)),
      h('div', { class: 'meta' }, last ? `마지막 도장 ${fmtWhen(last)}` : '아직 도장이 없어요', m.rewards ? h('div', null, `보상 ${m.rewards}번 받음`) : null)),
    grid,
    full ? h('div', { class: 'notice warn' }, icon('gift'), `${m.goal}칸을 다 채웠어요. 보상을 주고 새 카드를 시작해 주세요`)
      : today ? h('div', { class: 'notice info' }, icon('info'), `오늘 이미 ${today}번 찍었어요`) : null,
    full ? rewardBtn : stampBtn,
    m.count > 0 ? h('div', { class: 'actions-under' }, undoBtn) : null);

  const head = h('section', { class: 'card member-head' },
    h('h2', null, m.name), h('span', { class: 'phone num' }, fmtPhone(m.phone)),
    m.memo ? h('p', { class: 'memo' }, m.memo) : null);

  const hist = m.history.length ? h('section', { class: 'card' },
    h('h3', { style: { fontSize: '17px', fontWeight: '700', marginBottom: '6px' } }, '지난 카드'),
    h('div', { class: 'hist' }, ...m.history.map((c, i) => h('div', { class: 'h' },
      h('span', null, `${m.history.length - i}번째 카드`), h('span', { class: 'num' }, `${fmtDate(c.startedAt)} – ${fmtDate(c.rewardedAt)} 보상`))))) : null;

  const manage = h('div', { class: 'danger-zone' },
    h('button', { class: 'text-btn', onclick: () => go(`#/m/${m.id}/edit`) }, '정보 고치기'),
    h('button', { class: 'text-btn red', onclick: async () => {
      if (!(await confirmSheet({ title: `${m.name}님을 지울까요?`, body: '회원 정보와 도장 기록이 모두 지워지고 되돌릴 수 없어요.', ok: '지우기', tone: 'danger' }))) return;
      try { await api('DELETE', `/api/members/${m.id}`); toast('회원을 지웠어요'); go('#/'); } catch (x) { if (x.status !== 401) toast(x.message); }
    } }, '회원 지우기'));

  app.replaceChildren(...[backBar(), head, card, hist, manage].filter(Boolean));
}

// ───────── 등록·수정 ─────────

async function showForm(id) {
  let m = null;
  if (id) {
    try { m = await api('GET', `/api/members/${id}`); } catch (x) { if (x.status !== 401) toast(x.message); return; }
  }
  const preset = new URLSearchParams(location.hash.split('?')[1] ?? '').get('phone') ?? '';
  const fields = {};
  const mk = (key, label, input, hint) => {
    const err = h('p', { class: 'err', role: 'alert' });
    const f = h('div', { class: 'field' }, h('label', { for: `f-${key}` }, label), input, hint ? h('p', { class: 'hint' }, hint) : null, err);
    input.id = `f-${key}`;
    input.addEventListener('input', () => { f.classList.remove('bad'); err.replaceChildren(); });
    fields[key] = { f, err, input };
    return f;
  };
  const name = h('input', { autocomplete: 'off', maxlength: 30, value: m?.name ?? '', placeholder: '홍길동', enterkeyhint: 'next' });
  const phone = h('input', { type: 'tel', inputmode: 'numeric', autocomplete: 'off', value: fmtPhone(m?.phone ?? preset), placeholder: '010-0000-0000', enterkeyhint: 'next' });
  phone.addEventListener('input', () => { phone.value = fmtPhone(phone.value); });
  const memo = h('textarea', { maxlength: 200, placeholder: '예: 주말 오전 / 왼손잡이' });
  memo.value = m?.memo ?? '';
  const save = h('button', { class: 'btn primary big', type: 'submit' }, m ? '저장하기' : '등록하기');

  const form = h('form', { class: 'card', onsubmit: async (e) => {
    e.preventDefault();
    save.disabled = true;
    try {
      const body = { name: name.value, phone: phone.value, memo: memo.value };
      const r = m ? await api('PUT', `/api/members/${m.id}`, body) : await api('POST', '/api/members', body);
      toast(m ? '저장했어요' : '등록했어요');
      go(`#/m/${m ? m.id : r.id}`, true);
    } catch (x) {
      if (x.status === 401) return;
      const t = fields[x.body.field];
      if (!t) { toast(x.message); return; }
      t.f.classList.add('bad');
      t.err.replaceChildren(x.message);
      if (x.body.memberId) t.err.append(' ', h('button', { class: 'text-btn', type: 'button', onclick: () => go(`#/m/${x.body.memberId}`) }, '그 회원 보기'));
      t.input.focus();
    } finally { save.disabled = false; }
  } },
  h('div', { style: { display: 'flex', flexDirection: 'column', gap: '20px' } },
    h('h2', { style: { fontSize: '22px', fontWeight: '700' } }, m ? '회원 정보 고치기' : '새 회원'),
    mk('name', '이름', name),
    mk('phone', '전화번호', phone, '같은 번호는 한 명만 등록할 수 있어요'),
    mk('memo', '메모 (선택)', memo),
    save));

  app.replaceChildren(h('header', { class: 'top' }, h('button', { class: 'back', onclick: () => history.back() }, icon('back', 22), m ? m.name : '회원 찾기')), form);
  name.focus();
}

// ───────── 길 찾기 ─────────

function go(hash, replace = false) {
  if (replace) location.replace(hash); else location.hash = hash;
}

async function route() {
  layer.replaceChildren();
  document.querySelector('.toast')?.remove();
  window.scrollTo(0, 0);
  const hash = location.hash.split('?')[0] || '#/';
  const mm = /^#\/m\/(\d+)(\/edit)?$/.exec(hash);
  if (hash === '#/new') return showForm(null);
  if (mm) return mm[2] ? showForm(Number(mm[1])) : showMember(Number(mm[1]));
  return showHome();
}

window.addEventListener('hashchange', route);
(async () => {
  try {
    const me = await api('GET', '/api/me');
    GOAL = me.goal ?? GOAL;
    route();
  } catch (x) {
    if (x.status !== 401) app.replaceChildren(h('section', { class: 'card empty' }, h('p', null, x.message)));
  }
})();
