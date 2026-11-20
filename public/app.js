// SG스크린골프 도장 화면(카운터 직원용, 토스식). 받은 글자는 늘 글자 노드로 넣는다(HTML 로 해석하지 않는다).
// 화면은 셋이다: 회원 찾기(#/) · 회원(#/m/번호) · 등록·수정(#/new, #/m/번호/edit). 로그인이 없으면 매장 PIN 화면.
// 768px 이상은 왼쪽에 목록을 두고 오른쪽에 회원·등록을 연다(소유자 2026-11-19 PC 시안). 그보다 좁으면 한 화면씩.

const app = document.getElementById('app');
const layer = document.getElementById('layer');
let GOAL = 30;

/** 768px 이상은 왼쪽 목록 + 오른쪽 회원(소유자 2026-11-19 PC 시안). 그보다 좁으면 한 화면씩 */
const WIDE = matchMedia('(min-width: 768px)');
const isWide = () => WIDE.matches;
const finePointer = matchMedia('(pointer: fine)');
const kbd = (t) => (finePointer.matches ? h('span', { class: 'kbd' }, t) : null);

// ───────── 앱처럼(소유자 2026-11-19 "더블탭 확대 등 웹 요소는 막아 주세요") ─────────
// 두 번 눌러 확대·끌어 고르기·튕김은 CSS(app.css) 가 막고, 여기서는 그 밖의 웹 동작을 막는다. 입력 칸은 그대로 둔다
{
  const editable = (t) => t instanceof Element && !!t.closest('input, textarea');
  // 길게 누르기·오른쪽 클릭 메뉴
  document.addEventListener('contextmenu', (e) => { if (!editable(e.target)) e.preventDefault(); });
  // 끌어서 옮기기(그림·글자)
  document.addEventListener('dragstart', (e) => { if (!editable(e.target)) e.preventDefault(); });
  // 아이폰 사파리의 두 손가락 확대(viewport 설정을 무시한다)
  for (const g of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(g, (e) => e.preventDefault());
  // 두 번 눌러 확대는 CSS 의 touch-action: manipulation 이 막는다. 여기서 두 번째 터치를 막으면
  // "+"를 빠르게 두 번 누를 때 두 번째가 사라지므로 JS 로는 막지 않는다
  // PC: Ctrl+휠(노트북 터치패드 확대)과 Ctrl + / − / 0
  document.addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && ['+', '=', '-', '_', '0'].includes(e.key)) e.preventDefault();
  });
}

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
const show = (...nodes) => app.replaceChildren(...nodes.filter(Boolean));

const ICON = {
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm9 16-3.5-3.5',
  x: 'M17 7 7 17M7 7l10 10',
  back: 'm15 18-6-6 6-6',
  chevron: 'm9 6 6 6-6 6',
  check: 'M20 6 9 17l-5-5',
  minus: 'M5 12h14',
  plus: 'M12 5v14M5 12h14',
  erase: 'M21 5H9l-7 7 7 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1zM17 9l-6 6M11 9l6 6',
};
function icon(name, size = 20, width = 2.2) {
  const ns = 'http://www.w3.org/2000/svg';
  const s = document.createElementNS(ns, 'svg');
  for (const [k, v] of Object.entries({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) s.setAttribute(k, String(v));
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
const validPhone = (s) => /^0\d{8,10}$/.test(onlyDigits(s));
const looksLikePhone = (s) => /^[\d\s-]+$/.test(s);
const pad = (n) => String(n).padStart(2, '0');
const fmtDate = (ms) => { const d = new Date(ms); return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`; };
/** withTime: 오늘·어제가 아니어도 시각까지(칸에 마우스를 올렸을 때) */
function fmtWhen(ms, withTime = false) {
  const d = new Date(ms), now = new Date();
  const t = `${d.getHours() < 12 ? '오전' : '오후'} ${d.getHours() % 12 || 12}:${pad(d.getMinutes())}`;
  if (d.toDateString() === now.toDateString()) return `오늘 ${t}`;
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `어제 ${t}`;
  const day = `${d.getFullYear() === now.getFullYear() ? '' : `${d.getFullYear()}년 `}${d.getMonth() + 1}월 ${d.getDate()}일`;
  return withTime ? `${day} ${t}` : day;
}
/** 도장 칸에 적는 날짜: 11.19 */
const fmtMD = (ms) => { const d = new Date(ms); return `${d.getMonth() + 1}.${d.getDate()}`; };

class ApiError extends Error { constructor(status, body) { super(body?.error ?? '잠시 후 다시 시도해 주세요'); this.status = status; this.body = body ?? {}; } }
async function api(method, path, body) {
  let res;
  try {
    res = await fetch(path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
  } catch {
    throw new ApiError(0, { error: '인터넷 연결을 확인해 주세요' });
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/api/login') { showPin(); throw new ApiError(401, data); }
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

let toastTimer;
/** 아래 토스트. 할 일 단추(되돌리기)를 하나 달 수 있다 */
function toast(text, action) {
  if (offKeys) return;   // PIN 화면에서는 띄우지 않는다
  document.querySelector('.toast')?.remove();
  clearTimeout(toastTimer);
  const t = h('div', { class: 'toast', role: 'status', 'data-at': Date.now() }, h('span', null, text),
    action ? h('button', { onclick: () => { t.remove(); action.run(); } }, action.label) : null);
  // 아래 고정 버튼이 있으면 그 위에 띄운다
  const bar = document.querySelector('.cta');
  if (bar && !isWide()) t.style.setProperty('--toast-bottom', `${bar.offsetHeight - 8}px`);
  document.body.append(t);
  toastTimer = setTimeout(() => t.remove(), action ? 4000 : 2400);
}

/** 아래에서 올라오는 확인 창. 고르면 true */
function confirmSheet({ title, body, ok, tone = 'primary' }) {
  document.querySelector('.toast')?.remove();
  return new Promise((resolve) => {
    const close = (v) => { layer.replaceChildren(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') close(false); };
    document.addEventListener('keydown', onKey);
    const okBtn = h('button', { class: `btn ${tone}`, onclick: () => close(true) }, ok, isWide() ? kbd('Enter') : null);
    layer.replaceChildren(
      h('div', { class: 'scrim', onclick: () => close(false) }),
      h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
        h('h3', null, title), body ? h('p', null, body) : null,
        h('div', { class: 'btn-row' }, h('button', { class: 'btn secondary', onclick: () => close(false) }, '닫기', isWide() ? kbd('Esc') : null), okBtn)),
    );
    okBtn.focus();
  });
}

const cta = (...kids) => h('div', { class: 'cta' }, h('div', { class: 'cta-inner' }, ...kids));
const backBtn = (onclick) => h('button', { class: 'icon-btn', 'aria-label': '뒤로', onclick }, icon('back', 24));

// ───────── 매장 PIN ─────────

let PIN_LEN = 4;
let offKeys = null;

/** 토스식 PIN 입력: 점 네 개 + 숫자 판. 네 자리가 차면 바로 확인한다 */
function showPin() {
  layer.replaceChildren();
  document.querySelector('.toast')?.remove();
  offKeys?.();
  let digits = '';
  let busy = false;
  const dots = h('div', { class: 'pin-dots', 'aria-hidden': 'true' }, ...Array.from({ length: PIN_LEN }, () => h('span')));
  const msg = h('p', { class: 'pin-msg', role: 'alert' });
  const paint = () => [...dots.children].forEach((d, i) => d.classList.toggle('on', i < digits.length));

  async function submit() {
    busy = true;
    try {
      const r = await api('POST', '/api/login', { pin: digits });
      GOAL = r.goal ?? GOAL;
      offKeys?.(); offKeys = null;
      route();
    } catch (x) {
      msg.textContent = x.status === 401 ? `PIN이 맞지 않아요${x.body.left <= 3 ? ` · ${x.body.left}번 더 틀리면 잠시 막혀요` : ''}` : x.message;
      dots.classList.remove('shake'); void dots.offsetWidth; dots.classList.add('shake');
      digits = ''; paint();
    } finally { busy = false; }
  }
  function press(k) {
    if (busy) return;
    if (k === 'del') { digits = digits.slice(0, -1); paint(); return; }
    if (digits.length >= PIN_LEN) return;
    msg.textContent = '';
    digits += k; paint();
    if (digits.length === PIN_LEN) submit();
  }
  const key = (k, label) => h('button', { class: 'key num', 'aria-label': k === 'del' ? '지우기' : k, onclick: () => press(k) }, label ?? k);
  const pad = h('div', { class: 'keypad' },
    ...['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((k) => key(k)), h('span'), key('0'), key('del', icon('erase', 26, 2)));

  const onKey = (e) => { if (/^\d$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') press('del'); };
  document.addEventListener('keydown', onKey);
  offKeys = () => document.removeEventListener('keydown', onKey);

  shell = null;
  if (isWide()) {
    show(h('div', { class: 'pin-wide' }, h('div', { class: 'pin-card' },
      h('div', { class: 'brand' }, h('img', { src: '/favicon.svg', alt: '' }), 'SG스크린골프'),
      h('h1', { class: 'title' }, '매장 PIN을 입력해 주세요'), dots, msg,
      finePointer.matches ? h('p', { class: 'pin-hint' }, '키보드 숫자로도 입력할 수 있어요') : null,
      pad)));
    return;
  }
  show(h('div', { class: 'pin-page' },
    h('div', { class: 'nav' }, h('div', { class: 'brand' }, h('img', { src: '/favicon.svg', alt: '' }), 'SG스크린골프')),
    h('div', { class: 'pin-top' }, h('h1', { class: 'title' }, '매장 PIN을 입력해 주세요'), dots, msg),
    pad));
}

// ───────── 회원 찾기 ─────────

let lastQuery = '';
/** 넓은 화면에서 지금 오른쪽에 열린 회원 */
let activeId = null;

function memberRow(m) {
  const ready = m.count >= GOAL;
  const active = isWide() && m.id === activeId;
  return h('button', { class: `row${active ? ' active' : ''}`, 'data-id': m.id, 'aria-current': active ? 'true' : null, onclick: () => go(`#/m/${m.id}`) },
    h('span', { class: `avatar${ready ? ' ready' : ''}`, 'aria-hidden': 'true' }, m.name.slice(0, 1)),
    h('span', { class: 'who' }, h('b', null, m.name), h('span', { class: 'num' }, fmtPhone(m.phone))),
    h('span', { class: 'right num' },
      ready ? h('span', { class: 'pill' }, '보상 가능') : [String(m.count), h('span', { class: 'of' }, `/${GOAL}`)],
      isWide() ? null : icon('chevron', 18)));
}

/** 찾기 칸 + 회원 목록 + 새 회원 버튼. 휴대폰의 첫 화면과 넓은 화면의 왼쪽 목록이 함께 쓴다 */
function memberSearch() {
  const input = h('input', { type: 'search', inputmode: 'search', placeholder: '이름이나 전화번호 뒷자리', 'aria-label': '회원 찾기', value: lastQuery, enterkeyhint: 'search', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off', autocorrect: 'off' });
  const clear = h('button', { class: 'clear', 'aria-label': '지우기', onclick: () => { input.value = ''; load(); input.focus(); } }, icon('x', 14, 3));
  const label = h('div', { class: 'label' });
  const list = h('div', { class: 'list' }, h('div', { class: 'skeleton' }), h('div', { class: 'skeleton' }), h('div', { class: 'skeleton' }));
  const newBtn = h('button', { class: 'btn primary' }, '새 회원 등록');
  newBtn.addEventListener('click', () => {
    const q = input.value.trim();
    go(`#/new${looksLikePhone(q) && onlyDigits(q).length >= 4 ? `?phone=${onlyDigits(q)}` : ''}`);
  });
  const lock = h('button', { class: 'nav-text', onclick: async () => { await api('POST', '/api/logout').catch(() => {}); showPin(); } }, '잠그기');
  const box = h('label', { class: 'search' }, icon('search', 20), input, clear, isWide() ? kbd('/') : null);

  let seq = 0, timer;
  async function load() {
    const q = input.value.trim();
    lastQuery = q;
    clear.style.visibility = q ? 'visible' : 'hidden';
    const mine = ++seq;
    try {
      const r = await api('GET', `/api/members?q=${encodeURIComponent(q)}`);
      if (mine !== seq) return;
      label.textContent = q ? `찾은 회원 ${r.items.length}명` : r.items.length ? '최근 방문한 회원' : '';
      const asPhone = looksLikePhone(q) && validPhone(q);
      newBtn.textContent = !r.items.length && asPhone ? `${fmtPhone(q)} 등록하기` : '새 회원 등록';
      if (r.items.length) { list.replaceChildren(...r.items.map(memberRow)); return; }
      list.replaceChildren(h('div', { class: 'empty' },
        h('b', null, q ? '찾는 회원이 없어요' : '아직 등록한 회원이 없어요'),
        h('span', null, asPhone ? '이 번호로 새 회원을 등록할 수 있어요' : q ? '이름이나 번호를 다시 확인해 주세요' : '아래 버튼으로 첫 회원을 등록해 보세요')));
    } catch (x) {
      if (mine === seq) list.replaceChildren(h('div', { class: 'empty' }, h('b', null, '목록을 불러오지 못했어요'), h('span', null, x.message)));
    }
  }
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 180); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      clearTimeout(timer); load();
      // 넓은 화면: 찾은 첫 회원을 바로 연다
      if (isWide()) { const first = list.querySelector('.row'); if (first) { e.preventDefault(); first.click(); return; } }
      input.blur();
    }
    if (e.key === 'ArrowDown' && isWide()) { e.preventDefault(); list.querySelector('.row')?.focus(); }
  });
  /** 오른쪽에 연 회원을 목록에서 표시한다(목록을 다시 받지 않는다) */
  const markActive = () => {
    for (const r of list.querySelectorAll('.row')) {
      const on = Number(r.dataset.id) === activeId;
      r.classList.toggle('active', on);
      if (on) r.setAttribute('aria-current', 'true'); else r.removeAttribute('aria-current');
    }
  };
  return { input, box, label, list, newBtn, lock, load, markActive };
}

function showHome() {
  const s = memberSearch();
  show(h('div', { class: 'page' },
    h('div', { class: 'nav' }, h('div', { class: 'brand' }, h('img', { src: '/favicon.svg', alt: '' }), 'SG스크린골프'), s.lock),
    h('h1', { class: 'title' }, '누구에게 도장을', h('br'), '찍어 드릴까요?'),
    s.box, s.label, s.list), cta(s.newBtn));
  s.load();
  if (finePointer.matches) s.input.focus();
}

// ───────── 넓은 화면: 왼쪽 목록 + 오른쪽 ─────────

/** { root, side, pane }. 왼쪽 목록은 오른쪽이 바뀌어도 그대로 둔다(찾던 글자가 남게) */
let shell = null;

function ensureShell() {
  if (shell && app.contains(shell.root)) return shell;
  const side = memberSearch();
  const pane = h('main', { class: 'pane', 'aria-live': 'polite' });
  const root = h('div', { class: 'split' },
    h('aside', { class: 'side' },
      h('div', { class: 'nav' }, h('div', { class: 'brand' }, h('img', { src: '/favicon.svg', alt: '' }), 'SG스크린골프'), side.lock),
      h('h1', { class: 'side-title' }, '누구에게 도장을 찍어 드릴까요?'),
      side.box, side.label, side.list, h('div', { class: 'side-cta' }, side.newBtn)),
    pane);
  show(root);
  shell = { root, side, pane };
  side.load();
  if (finePointer.matches) side.input.focus();
  return shell;
}

/** 오른쪽 칸을 바꾼다 */
function showPane(...nodes) {
  const s = ensureShell();
  s.pane.replaceChildren(h('div', { class: 'pane-inner' }, ...nodes.filter(Boolean)));
  s.pane.scrollTo(0, 0);
}

function showPaneEmpty() {
  activeId = null;
  ensureShell().side.markActive();
  showPane(h('div', { class: 'pane-empty' },
    h('b', null, '왼쪽에서 회원을 골라 주세요'),
    h('span', null, '이름이나 전화번호 뒷자리로 찾을 수 있어요'),
    finePointer.matches ? h('div', { class: 'keys' },
      h('span', null, kbd('/'), ' 찾기'), h('span', null, kbd('↑'), kbd('↓'), ' 고르기'), h('span', null, kbd('Space'), ' 도장 찍기')) : null));
}

/** 도장·보상·수정 뒤 왼쪽 목록의 숫자도 바꾼다 */
const refreshSide = () => { if (isWide() && shell) shell.side.load(); };

// ───────── 회원 ─────────

async function showMember(id) {
  if (isWide()) { activeId = id; ensureShell().side.markActive(); }
  let m;
  try { m = await api('GET', `/api/members/${id}`); } catch (x) {
    if (x.status === 401) return;
    const empty = h('div', { class: 'empty' }, h('b', null, x.status === 404 ? '없는 회원이에요' : '불러오지 못했어요'), h('span', null, x.status === 404 ? '삭제됐을 수 있어요' : x.message));
    if (isWide()) showPane(empty);
    else show(h('div', { class: 'page no-cta' }, h('div', { class: 'nav' }, backBtn(() => go('#/'))), empty));
    return;
  }
  renderMember(m);
}

/** fresh: 방금 찍은 개수(그 칸만 톡 튀어나온다) */
function renderMember(m, fresh = 0) {
  const wide = isWide();
  const left = m.goal - m.count;
  const full = left <= 0;
  const last = m.stamps[m.stamps.length - 1];
  const after = (r, n = 0) => { renderMember(r, n); refreshSide(); };

  // 찍은 칸에는 찍은 날짜(월.일)를 적는다(소유자 2026-11-19). 칸에 마우스를 올리면 시각까지
  const grid = h('div', { class: 'grid', role: 'list', 'aria-label': `도장 ${m.count}개, ${m.goal}칸` },
    ...Array.from({ length: m.goal }, (_, i) => {
      const at = m.stamps[i];
      if (at === undefined) return h('span', { class: 'stamp num', role: 'listitem', 'aria-label': `${i + 1}번째 칸 비어 있음` }, String(i + 1));
      const when = fmtWhen(at, true);
      return h('span', { class: `stamp on num${i >= m.count - fresh ? ' new' : ''}`, role: 'listitem', title: when, 'aria-label': `${i + 1}번째 도장 ${when}` },
        h('span', { class: 'stamp-date' }, fmtMD(at)));
    }));

  const undoOne = h('button', { class: 'small-btn' }, '하나 빼기');
  undoOne.addEventListener('click', async () => {
    if (!(await confirmSheet({ title: '도장 하나를 뺄까요?', body: last ? `${fmtWhen(last)}에 찍은 마지막 도장을 지워요.` : '', ok: '빼기', tone: 'danger' }))) return;
    try { after(await api('POST', `/api/members/${m.id}/unstamp`, { count: 1 })); toast('도장 하나를 뺐어요'); } catch (x) { toast(x.message); }
  });

  const box = h('section', { class: 'stamp-box' },
    h('div', { class: 'stamp-head' },
      h('h2', null, full ? [h('em', null, `${m.goal}개`), '를 다 모았어요'] : [h('em', { class: 'num' }, `${m.count}개`), ' 모았어요']),
      h('span', { class: 'num', style: { fontSize: '15px', color: 'var(--grey500)', whiteSpace: 'nowrap' } }, `${m.count} / ${m.goal}`)),
    h('p', { class: 'stamp-sub' }, full ? '보상을 드리고 새 카드를 시작해 주세요' : `보상까지 ${left}개 남았어요`),
    grid,
    h('div', { class: 'stamp-foot' }, h('span', null, last ? `마지막 도장 ${fmtWhen(last)}` : '아직 찍은 도장이 없어요'), m.count > 0 ? undoOne : null));

  const hist = m.history.length ? [
    h('div', { class: 'label' }, `받은 보상 ${m.history.length}번`),
    h('div', { class: 'hist' }, ...m.history.map((c, i) => h('div', null,
      h('span', null, `${m.history.length - i}번째 카드`), h('span', { class: 'num' }, `${fmtDate(c.rewardedAt)} 보상`)))),
  ] : [];

  // 찍기(또는 보상) 버튼
  let actions;
  if (full) {
    const rewardBtn = h('button', { class: 'btn primary', 'data-main': '' }, '보상 드리고 새 카드 시작');
    rewardBtn.addEventListener('click', async () => {
      if (!(await confirmSheet({ title: '보상을 드렸나요?', body: `${m.name}님의 카드를 보상 완료로 남기고 빈 카드를 새로 시작해요.`, ok: '네, 드렸어요' }))) return;
      rewardBtn.disabled = true;
      try { after(await api('POST', `/api/members/${m.id}/reward`)); toast('새 카드를 시작했어요'); } catch (x) { rewardBtn.disabled = false; toast(x.message); }
    });
    actions = [rewardBtn];
  } else {
    let qty = 1;
    const out = h('output', { class: 'num', 'aria-live': 'polite' }, '1개');
    const minus = h('button', { 'aria-label': '하나 적게', disabled: true }, icon('minus', 20, 2.6));
    const plus = h('button', { 'aria-label': '하나 더', disabled: left <= 1 }, icon('plus', 20, 2.6));
    const label = h('span', null, '도장 1개 찍기');
    const stampBtn = h('button', { class: 'btn primary', 'data-main': '' }, label, wide ? kbd('Space') : null);
    const setQty = (n) => { qty = n; out.textContent = `${n}개`; minus.disabled = n <= 1; plus.disabled = n >= left; label.textContent = `도장 ${n}개 찍기`; };
    minus.addEventListener('click', () => setQty(Math.max(1, qty - 1)));
    plus.addEventListener('click', () => setQty(Math.min(left, qty + 1)));
    stampBtn.addEventListener('click', async () => {
      stampBtn.disabled = true;
      const n = qty;
      try {
        const r = await api('POST', `/api/members/${m.id}/stamp`, { count: n });
        after(r, n);
        toast(r.count >= r.goal ? `${r.goal}개를 다 모았어요` : `도장 ${n}개를 찍었어요`, {
          label: '되돌리기',
          run: async () => { try { after(await api('POST', `/api/members/${m.id}/unstamp`, { count: n })); toast('되돌렸어요'); } catch (x) { toast(x.message); } },
        });
      } catch (x) { stampBtn.disabled = false; toast(x.message); }
    });
    const stepper = h('div', { class: 'stepper' }, minus, out, plus);
    actions = wide ? [stepper, stampBtn] : [h('div', { class: 'qty' }, h('span', null, '찍을 개수'), stepper), stampBtn];
  }

  if (wide) {
    showPane(
      h('div', { class: 'pane-head' },
        h('div', null, h('h1', { class: 'pane-name' }, m.name), h('p', { class: 'phone-line num' }, fmtPhone(m.phone))),
        h('button', { class: 'small-btn big', onclick: () => go(`#/m/${m.id}/edit`) }, '정보 수정')),
      m.memo ? h('p', { class: 'memo' }, m.memo) : null,
      box, h('div', { class: 'pane-actions' }, ...actions), ...hist);
    return;
  }
  show(h('div', { class: 'page' },
    h('div', { class: 'nav' }, backBtn(() => go('#/')), h('button', { class: 'nav-text', onclick: () => go(`#/m/${m.id}/edit`) }, '수정')),
    h('h1', { class: 'title', style: { marginBottom: '2px' } }, m.name),
    h('p', { class: 'phone-line num' }, fmtPhone(m.phone)),
    m.memo ? h('p', { class: 'memo' }, m.memo) : null,
    box, ...hist), cta(...actions));
}

// ───────── 등록·수정 ─────────

async function showForm(id) {
  const wide = isWide();
  let m = null;
  if (wide) { activeId = id; ensureShell().side.markActive(); }
  if (id) {
    try { m = await api('GET', `/api/members/${id}`); } catch (x) { toast(x.message); go('#/', true); return; }
  }
  const preset = new URLSearchParams(location.hash.split('?')[1] ?? '').get('phone') ?? '';
  const fields = {};
  let check = () => {};
  const field = (key, label, input) => {
    const err = h('p', { class: 'err', role: 'alert' });
    const f = h('div', { class: 'field' }, h('label', { for: `f-${key}` }, label), input, err);
    input.id = `f-${key}`;
    input.addEventListener('input', () => { f.classList.remove('bad'); err.replaceChildren(); check(); });
    fields[key] = { f, err, input };
    return f;
  };
  const name = h('input', { autocomplete: 'off', maxlength: 30, value: m?.name ?? '', placeholder: '이름', enterkeyhint: 'next', spellcheck: 'false', autocapitalize: 'off', autocorrect: 'off' });
  const phone = h('input', { type: 'tel', inputmode: 'numeric', autocomplete: 'off', value: fmtPhone(m?.phone ?? preset), placeholder: '010-0000-0000', enterkeyhint: 'done' });
  phone.addEventListener('input', () => { phone.value = fmtPhone(phone.value); });
  const memo = h('textarea', { maxlength: 200, placeholder: '예: 주말 오전에 자주 와요', spellcheck: 'false' });
  memo.value = m?.memo ?? '';
  const save = h('button', { class: 'btn primary' }, m ? '저장하기' : '등록하기');
  check = () => { save.disabled = !name.value.trim() || !validPhone(phone.value); };
  check();

  const submit = async () => {
    if (save.disabled) return;
    save.disabled = true;
    try {
      const body = { name: name.value, phone: phone.value, memo: memo.value };
      const r = m ? await api('PUT', `/api/members/${m.id}`, body) : await api('POST', '/api/members', body);
      toast(m ? '저장했어요' : `${name.value.trim().replace(/\s+/g, ' ')}님을 등록했어요`);
      refreshSide();
      go(`#/m/${m ? m.id : r.id}`, true);
    } catch (x) {
      check();
      const t = fields[x.body.field];
      if (!t) { toast(x.message); return; }
      t.f.classList.add('bad');
      t.err.replaceChildren(x.message);
      if (x.body.memberId) t.err.append(h('button', { class: 'link-btn', onclick: () => go(`#/m/${x.body.memberId}`) }, '그 회원 보기'));
      t.input.focus();
    }
  };
  save.addEventListener('click', submit);
  // 넓은 화면: 이름·전화번호 칸에서 Enter 로 저장
  for (const i of [name, phone]) i.addEventListener('keydown', (e) => { if (e.key === 'Enter' && wide) { e.preventDefault(); submit(); } });

  const del = m ? h('button', { class: 'danger-link', onclick: async () => {
    if (!(await confirmSheet({ title: `${m.name}님을 삭제할까요?`, body: '회원 정보와 도장 기록이 모두 지워지고 되돌릴 수 없어요.', ok: '삭제하기', tone: 'danger' }))) return;
    try { await api('DELETE', `/api/members/${m.id}`); toast('회원을 삭제했어요'); refreshSide(); go('#/', true); } catch (x) { toast(x.message); }
  } }, '회원 삭제') : null;

  const title = h('h1', { class: wide ? 'pane-name' : 'title' }, m ? '회원 정보를 고칠게요' : '새 회원을 등록할게요');
  if (wide) {
    const cancel = h('button', { class: 'btn secondary', onclick: () => go(m ? `#/m/${m.id}` : '#/') }, '취소');
    showPane(title, field('name', '이름', name), field('phone', '전화번호', phone), field('memo', '메모 (선택)', memo),
      h('div', { class: 'pane-actions' }, cancel, save), del);
  } else {
    show(h('div', { class: 'page' },
      h('div', { class: 'nav' }, backBtn(() => history.back())),
      title, field('name', '이름', name), field('phone', '전화번호', phone), field('memo', '메모 (선택)', memo), del), cta(save));
  }
  if (!m) name.focus();
}

// ───────── 키보드(넓은 화면) ─────────
// "/" 찾기 · ↑↓ 목록에서 고르기 · Space 도장 찍기(또는 보상). 글자를 넣는 중이거나 확인 창이 떠 있으면 쉰다

document.addEventListener('keydown', (e) => {
  if (!isWide() || offKeys || layer.firstChild || e.ctrlKey || e.metaKey || e.altKey) return;
  const el = document.activeElement;
  const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
  // "/" 는 찾기 칸으로 간다. 찾기 칸에 이미 있으면 글자로 넣지 않고 칸을 비울 준비만 한다(이름·번호에 "/" 는 없다)
  if (e.key === '/' && (!typing || el === shell?.side.input)) { e.preventDefault(); shell?.side.input.focus(); shell?.side.input.select(); return; }
  if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && el?.classList.contains('row')) {
    e.preventDefault();
    const rows = [...(shell?.side.list.querySelectorAll('.row') ?? [])];
    const i = rows.indexOf(el);
    if (e.key === 'ArrowUp' && i === 0) { shell.side.input.focus(); return; }
    rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus();
    return;
  }
  // 목록에서 회원을 누른 뒤 포커스가 그 줄에 남아 있어도 Space 는 도장이다(그 줄을 다시 누르지 않는다)
  if (e.key === ' ' && !typing && (el?.tagName !== 'BUTTON' || el.classList.contains('row'))) {
    const main = shell?.pane.querySelector('[data-main]');
    if (main && !main.disabled) { e.preventDefault(); main.click(); }
  }
});

// ───────── 길 찾기 ─────────

function go(hash, replace = false) {
  if (replace) { location.replace(hash); return; }
  if (location.hash === hash) route(); else location.hash = hash;
}

function route() {
  layer.replaceChildren();
  // 화면을 옮기면 앞 화면의 토스트는 지운다("되돌리기"가 다른 회원의 도장을 되돌리지 않게).
  // 옮기기 직전에 띄운 것("등록했어요")은 새 화면에서 보여야 하니 남긴다
  for (const t of document.querySelectorAll('.toast')) if (t.querySelector('button') || Date.now() - Number(t.dataset.at) > 800) t.remove();
  if (!isWide()) { shell = null; window.scrollTo(0, 0); }
  const hash = location.hash.split('?')[0] || '#/';
  const mm = /^#\/m\/(\d+)(\/edit)?$/.exec(hash);
  if (hash === '#/new') return showForm(null);
  if (mm) return mm[2] ? showForm(Number(mm[1])) : showMember(Number(mm[1]));
  return isWide() ? showPaneEmpty() : showHome();
}

// 창 크기가 경계를 넘으면 그 배치로 다시 그린다
WIDE.addEventListener('change', () => { shell = null; if (offKeys) showPin(); else route(); });
window.addEventListener('hashchange', () => { if (!offKeys) route(); });
api('GET', '/api/config').then((c) => { GOAL = c.goal ?? GOAL; PIN_LEN = c.pinLength ?? PIN_LEN; route(); })
  .catch((x) => { if (x.status !== 401) route(); });
