/**
 * 디자인 토큰 — 정본(C-024 · 기획서 §4-4).
 * tailwind.config.ts 가 이 파일을 읽는다. 다른 색을 새로 만들지 않는다.
 * 회색 계열은 Tailwind 기본 `stone` 을 그대로 쓴다.
 *
 * ⚠ 이 파일은 Node(tailwind.config.ts)에서도 읽힌다 — 브라우저 전용 API를 쓰지 않는다.
 */
export const colors = {
  /** 배경(크림) */
  canvas: '#FAF9F5',
  /** 주색(소프트 블루) */
  primary: '#3E6FA8',
  /** 주색 호버 */
  primaryHover: '#335C8D',
  /** 주색 틴트 */
  primaryTint: '#EDF2F8',
  /** 차트 — 실측 */
  chartActual: '#C05F3F',
  /** 차트 — 목표·이전 */
  chartTarget: '#3E6FA8',
} as const;

export const fontFamily = {
  /** 제목 */
  title: ['Gowun Batang', 'serif'],
  /** 본문 */
  body: ['Noto Sans KR', 'sans-serif'],
} as const;

export const tokens = { colors, fontFamily } as const;
export default tokens;
