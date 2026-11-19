// 전화번호는 숫자만 저장하고 화면에서만 하이픈을 넣는다.

export function digits(s: string): string {
  return s.replace(/\D/g, '');
}

/** 휴대폰·일반 전화번호로 받을 만한가(숫자 9~11자리, 0 으로 시작) */
export function validPhone(d: string): boolean {
  return /^0\d{8,10}$/.test(d);
}

export function formatPhone(d: string): string {
  if (/^02\d{7,8}$/.test(d)) return d.length === 9 ? `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}` : `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6)}`;
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return d;
}
