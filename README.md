# sg-stamp

SG스크린골프 카운터에서 쓰는 방문 도장 관리(임시 기능). 주소는 `https://sg.isocompany.co.kr`.

- 회원을 이름이나 전화번호로 찾고 도장을 찍는다. 서비스로 여러 개를 한 번에 찍을 수도 있다.
- 카드 한 장은 30칸이다. 다 채우면 보상을 드리고 새 카드를 시작한다. 지난 카드는 기록으로 남는다.
- Cloudflare Workers + Durable Object(SQLite). 처음 설정은 [docs/DEPLOY.md](docs/DEPLOY.md)(저장소 연결 하나).

```bash
npm install
npm run verify   # 타입 검사 + 테스트(네트워크 없이 돈다)
npm run dev      # http://localhost:8787
```
