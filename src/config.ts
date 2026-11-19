// 숫자는 여기 한 곳에만 둔다.
export const CONFIG = {
  /** 카드 한 장의 칸 수(소유자 2026-11-19 "30회 도장") */
  goal: 30,
  /** 검색 결과·최근 회원 목록의 최대 개수 */
  listLimit: 50,
  /** 이름·메모 길이 상한 */
  nameMax: 30,
  memoMax: 200,
} as const;
