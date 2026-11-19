# 배포 (처음 한 번)

할 일은 하나다. 데이터베이스·비밀값은 없다(데이터는 배포할 때 Cloudflare 가 스스로 만드는 Durable Object 안에 있다).

## 저장소 연결

Cloudflare 대시보드 → **Workers & Pages → Create → Import a repository** → `dode777/sg-stamp` 고르기 → 나머지는 그대로 두고 **Deploy**.

- 이름은 `sg-stamp`, 배포 명령은 기본값(`npx wrangler deploy`) 그대로다.
- 주소 `sg.isocompany.co.kr` 은 `wrangler.jsonc` 의 `routes` 가 만든다(DNS·인증서 자동).
- 그다음부터는 main 에 머지할 때마다 저절로 배포된다.

## 확인

`https://sg.isocompany.co.kr` → 새 회원 등록 → 도장 찍기.
카운터 태블릿에서 사파리·크롬의 "홈 화면에 추가"를 하면 앱처럼 열린다.
