# sg-stamp

SG스크린골프 카운터에서 쓰는 방문 도장 관리(임시 기능). 주소는 `https://sg.isocompany.co.kr`.

- 직원이 매장 PIN 으로 들어와 회원을 이름이나 전화번호로 찾고 도장을 찍는다.
- 카드 한 장은 30칸이다. 다 채우면 보상을 주고 새 카드를 시작한다. 지난 카드는 기록으로 남는다.
- Cloudflare Workers + D1. 처음 설정은 [docs/DEPLOY.md](docs/DEPLOY.md).

```bash
npm install
npm run verify          # 타입 검사 + 테스트(토큰·네트워크 없이 돈다)
echo 'STORE_PIN=1234' > .dev.vars && npm run dev   # http://localhost:8787
```
