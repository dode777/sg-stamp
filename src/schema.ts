// 데이터 모양. 저장소는 Durable Object 안의 SQLite 다(따로 만들 데이터베이스가 없다 → 배포만 하면 된다).
// 처음 켜질 때 아래 순서대로 적용하고 적용한 번호를 `_migrations` 에 남긴다. 이미 적용한 묶음은 고치지 않고 새 묶음을 뒤에 더한다.

export const MIGRATIONS: string[][] = [
  [
    // 회원. 전화번호는 숫자만 저장한다(01012345678). 같은 번호는 한 명뿐이다
    `CREATE TABLE members (
       id         INTEGER PRIMARY KEY,
       name       TEXT    NOT NULL,
       phone      TEXT    NOT NULL UNIQUE,
       memo       TEXT    NOT NULL DEFAULT '',
       created_at INTEGER NOT NULL,
       updated_at INTEGER NOT NULL
     )`,
    'CREATE INDEX members_name ON members(name)',
    // 도장 카드. 보상을 주기 전(rewarded_at IS NULL)인 카드가 회원마다 하나 있다
    `CREATE TABLE cards (
       id          INTEGER PRIMARY KEY,
       member_id   INTEGER NOT NULL REFERENCES members(id),
       started_at  INTEGER NOT NULL,
       rewarded_at INTEGER
     )`,
    'CREATE UNIQUE INDEX cards_open ON cards(member_id) WHERE rewarded_at IS NULL',
    'CREATE INDEX cards_member ON cards(member_id)',
    // 도장 하나 = 한 줄(언제 찍었는지 남는다). 한 번에 여러 개를 찍으면 같은 시각으로 여러 줄
    `CREATE TABLE stamps (
       id        INTEGER PRIMARY KEY,
       card_id   INTEGER NOT NULL REFERENCES cards(id),
       member_id INTEGER NOT NULL REFERENCES members(id),
       at        INTEGER NOT NULL
     )`,
    'CREATE INDEX stamps_card ON stamps(card_id)',
    'CREATE INDEX stamps_member_at ON stamps(member_id, at)',
  ],
];

export const MIGRATIONS_TABLE = 'CREATE TABLE IF NOT EXISTS _migrations (id INTEGER PRIMARY KEY, at INTEGER NOT NULL)';
