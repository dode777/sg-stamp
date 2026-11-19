// 숫자는 여기 한 곳에만 둔다.
export const CONFIG = {
  /** 카드 한 장의 칸 수(소유자 2026-11-19 "30회 도장") */
  goal: 30,
  /**
   * 매장 PIN(4자리, 소유자 2026-11-19)의 SHA-256(`sg-stamp:` + PIN). 저장소에 PIN 글자를 두지 않으려고 해시만 둔다.
   * 4자리라 해시에서 PIN 을 되찾기는 쉽다. 그래서 저장소는 비공개가 맞다(docs/DEPLOY.md).
   * PIN 을 바꾸려면 `node -e "console.log(require('crypto').createHash('sha256').update('sg-stamp:새PIN').digest('hex'))"` 값으로 바꾼다.
   * 바꾸면 모든 기기가 다시 PIN 을 넣는다.
   */
  pinHash: '5ee08582e96ed5381a04a748565b0341079e55a6409342acfc9e8debe018bbc8',
  pinLength: 4,
  /** 한 번 들어오면 이만큼 다시 묻지 않는다(소유자 2026-11-19 "일주일 유지") */
  sessionDays: 7,
  /** PIN 을 이만큼 틀리면 그 IP 를 잠깐 막는다(4자리를 차례로 넣어 보는 것을 막는다) */
  maxFails: 10,
  lockMinutes: 10,
  /** 검색 결과·최근 회원 목록의 최대 개수 */
  listLimit: 50,
  /** 이름·메모 길이 상한 */
  nameMax: 30,
  memoMax: 200,
} as const;
