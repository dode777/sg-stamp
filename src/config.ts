// 숫자는 여기 한 곳에만 둔다.
export const CONFIG = {
  /** 카드 한 장의 칸 수(소유자 2026-11-19 "30회 도장") */
  goal: 30,
  /** 로그인 유지 기간. 카운터 태블릿에서 매일 PIN 을 넣지 않게 길게 둔다 */
  sessionDays: 30,
  /** PIN 을 이만큼 틀리면 그 IP 를 잠깐 막는다 */
  maxFails: 5,
  /** 틀린 횟수를 세는 창이자 막는 시간(분) */
  lockMinutes: 15,
  /** 검색 결과·최근 회원 목록의 최대 개수 */
  listLimit: 50,
  /** 이름·메모 길이 상한 */
  nameMax: 30,
  memoMax: 200,
} as const;
