# 배포 (처음 한 번)

할 일은 하나다. 데이터베이스·비밀값은 없다(데이터는 배포할 때 Cloudflare 가 스스로 만드는 Durable Object 안에 있다).

## 저장소 연결

Cloudflare 대시보드 → **Workers & Pages → Create → Import a repository** → `dode777/sg-stamp` 고르기 → 나머지는 그대로 두고 **Deploy**.

- 이름은 `sg-stamp`, 배포 명령은 기본값(`npx wrangler deploy`) 그대로다.
- 주소 `sg.isocompany.co.kr` 은 `wrangler.jsonc` 의 `routes` 가 만든다(DNS·인증서 자동).
- 그다음부터는 main 에 머지할 때마다 저절로 배포된다.

## 확인

`https://sg.isocompany.co.kr` → 매장 PIN 4자리 → 새 회원 등록 → 도장 찍기.
한 번 들어온 기기는 일주일 동안 다시 묻지 않는다. 화면 위 "잠그기"로 바로 잠근다.

## 권하는 것: 저장소를 비공개로

PIN 은 코드에 해시로만 있지만 4자리라 해시에서 되찾기 쉽다. GitHub → `dode777/sg-stamp` → Settings → 맨 아래 **Change visibility → Private**.
비공개로 바꿔도 배포는 그대로 된다.

## PIN 바꾸기

에이전트에게 새 PIN 을 알려 주면 `src/config.ts` 의 `pinHash` 를 바꿔 배포한다. 바꾸면 모든 기기가 다시 PIN 을 넣는다.
카운터 태블릿에서 사파리·크롬의 "홈 화면에 추가"를 하면 앱처럼 열린다.
