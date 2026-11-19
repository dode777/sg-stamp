# sg-stamp: 세션 작업 지침

SG스크린골프 카운터 직원이 쓰는 **방문 도장 관리**(소유자 2026-11-19, 임시 기능). Cloudflare Workers + D1, 주소 `sg.isocompany.co.kr`.

## 소유자가 정한 것 (2026-11-19)

- 쓰는 사람은 **카운터 직원뿐**이다. 손님이 보는 화면은 없다.
- 로그인은 **매장 PIN** 하나다. 값은 Cloudflare 비밀값 `STORE_PIN` 에만 둔다(저장소·D1·화면에 없다).
- 카드는 **30칸**(`src/config.ts` 의 `goal`). 다 채우면 **보상 처리 후 새 카드**. 지난 카드는 기록으로 남긴다.
- 사용자에게 보이는 글은 모두 한국어(해요체 짧은 문장). 화면은 토스식(회색 바탕 · 흰 카드 · 파랑 하나로 행동).

## 불변식

- **숫자는 `src/config.ts` 한 곳.** 칸 수·로그인 유지 기간·PIN 잠금·목록 개수.
- **도장 수는 따로 세어 두지 않는다.** `stamps` 줄을 센다(두 값이 어긋날 일이 없게). 칸을 넘지 않게 하는 것은 SQL 한 문장이다(`addStamp`: 두 기기가 동시에 눌러도 30을 넘지 않는다).
- **보상은 한 묶음이다**(`reward`): 지금 카드를 보상 완료로 닫는 것과 새 카드를 여는 것이 같은 트랜잭션. 회원마다 열린 카드는 하나(`cards_open` 부분 유일 색인).
- **전화번호는 숫자만 저장하고 하이픈은 화면에서만 넣는다.** 같은 번호는 한 명뿐(`members.phone UNIQUE`).
- **회원 지우기는 진짜로 지운다**(도장·카드까지). 개인정보를 남기지 않는다.
- **PIN 을 바꾸면 모든 기기의 로그인이 풀린다**(세션 서명 키 = 서버가 처음 만든 무작위 값 + PIN). PIN 을 `maxFails` 번 틀리면 그 IP 는 `lockMinutes` 분 막힌다.
- **상태를 바꾸는 API 는 같은 주소에서 온 요청만 받는다**(`origin` 확인) + 쿠키 `SameSite=Strict`.
- **화면은 받은 글자를 글자 노드로만 넣는다**(`innerHTML` 을 쓰지 않는다). CSP 가 바깥 스크립트·인라인 스타일을 막는다(`public/_headers`). 모양 값은 `el.style`(CSSOM)으로만 넣는다.
- **색은 `public/app.css` 의 `:root` 토큰 한 곳**(밝은·어두운 화면).
- **화면 파일은 로그인 없이 나간다**(데이터가 없다). `/api/*` 만 Worker 를 지나 PIN 쿠키를 확인한다(`wrangler.jsonc` 의 `run_worker_first`).
- **적용된 마이그레이션은 고치지 않는다.** `migrations/` 에 새 번호 파일을 더한다.

## 구조

| 경로 | 역할 |
|---|---|
| `src/index.ts` | 라우터(`/api/*`) |
| `src/auth.ts` | PIN 확인 · 잠금 · 세션 쿠키 |
| `src/store.ts` | D1 읽기·쓰기(회원·카드·도장·보상) |
| `src/config.ts` · `phone.ts` | 숫자 한 곳 / 전화번호 정리 |
| `public/` | 화면(`index.html` · `app.js` · `app.css`, 빌드 없음) |
| `migrations/` | D1 스키마 |
| `test/` | 실제 SQLite(`node:sqlite`) 위에서 API 를 끝까지 돌린다 |

검증: `npm run verify` (타입 검사 + 테스트). 화면은 `npm run dev` 로 띄워 확인한다.
