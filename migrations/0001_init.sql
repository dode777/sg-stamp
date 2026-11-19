-- SG스크린골프 방문 도장. 회원 한 명에게 카드가 이어서 생긴다(30칸을 채우고 보상을 주면 다음 카드).

-- 회원. 전화번호는 숫자만 저장한다(01012345678). 같은 번호는 한 명뿐이다
CREATE TABLE members (
  id         INTEGER PRIMARY KEY,
  name       TEXT    NOT NULL,
  phone      TEXT    NOT NULL UNIQUE,
  memo       TEXT    NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX members_name ON members(name);

-- 도장 카드. 보상을 주기 전(rewarded_at IS NULL)인 카드가 회원마다 하나 있다
CREATE TABLE cards (
  id          INTEGER PRIMARY KEY,
  member_id   INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  started_at  INTEGER NOT NULL,
  rewarded_at INTEGER
);
CREATE UNIQUE INDEX cards_open ON cards(member_id) WHERE rewarded_at IS NULL;
CREATE INDEX cards_member ON cards(member_id);

-- 도장 한 번 = 한 줄(언제 찍었는지 남는다)
CREATE TABLE stamps (
  id        INTEGER PRIMARY KEY,
  card_id   INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  at        INTEGER NOT NULL
);
CREATE INDEX stamps_card ON stamps(card_id);
CREATE INDEX stamps_member_at ON stamps(member_id, at);

-- 서버가 스스로 만드는 값(세션 서명 키). 사람이 넣지 않는다
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
) WITHOUT ROWID;

-- PIN 을 틀린 횟수(IP 마다). 너무 많이 틀리면 잠깐 막는다
CREATE TABLE login_fails (
  ip           TEXT PRIMARY KEY,
  fails        INTEGER NOT NULL,
  first_at     INTEGER NOT NULL,
  locked_until INTEGER
) WITHOUT ROWID;
