# 배포 (처음 한 번)

Cloudflare 대시보드에서 소유자가 한다. 비밀값은 여기에만 넣는다.

## 1. D1 데이터베이스 만들기

**Storage & Databases → D1 → Create database**, 이름 `sg-stamp`.
만든 뒤 Database ID 를 `wrangler.jsonc` 의 `database_id` 에 넣는다(비밀값이 아니다. 알려 주면 에이전트가 넣는다).

## 2. 저장소 연결 (Workers Builds)

**Workers & Pages → Create → Import a repository** 에서 `dode777/sg-stamp` 를 고른다.

| 칸 | 값 |
|---|---|
| Production branch | `main` |
| Build command | 비움 |
| Deploy command | `npm run deploy` |

`npm run deploy` 가 D1 마이그레이션을 적용한 뒤 배포한다. 주소 `sg.isocompany.co.kr` 은 `wrangler.jsonc` 의 `routes` 가 만든다(DNS·인증서 자동).

## 3. 매장 PIN 넣기

**Workers & Pages → sg-stamp → Settings → Variables and Secrets → Add**, 종류 **Secret**.

| 이름 | 값 |
|---|---|
| `STORE_PIN` | 매장 PIN(숫자 6자리 이상 권장) |

- PIN 을 바꾸면 모든 기기가 다시 PIN 을 넣어야 한다.
- 5번 틀리면 그 기기(IP)는 15분 막힌다.

## 4. 확인

`https://sg.isocompany.co.kr` → PIN 화면 → 들어가서 회원 등록 → 도장 찍기.
카운터 태블릿은 사파리·크롬에서 "홈 화면에 추가"를 하면 앱처럼 열린다.
