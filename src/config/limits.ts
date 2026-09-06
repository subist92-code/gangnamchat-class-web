/**
 * ★ 상한·캡·컷값·고정 URL 이 사는 유일한 파일(C-017 · C-051 · 지시서 §2-6).
 * 코드 다른 곳에 매직 넘버가 있으면 리뷰 반려.
 */

export const limits = {
  /** S1 전사 동시 호출 수(코너 가 §6 · 단원별 순차 원칙을 깨지 않는 범위) */
  transcribeConcurrency: 2,
  /** 한 묶음(batch)에 받는 최대 페이지 수 */
  intakeMaxPages: 60,
  /** 한 묶음에 받는 최대 파일 수 */
  intakeMaxFiles: 40,
  /** 도구 파싱 실패 시 재요청 캡(코너 가 S4/S7 원칙의 전사판) */
  retryCap: 1,
  /** 전사 응답 max_tokens */
  transcribeMaxTokens: 8000,

  /** S4 검증 동시 호출 수(지시서 02 §3-2 · 단원별 순차 = 캐시 적중) */
  verifyConcurrency: 1,
  /** 검증 응답 max_tokens — 함수 쪽 상한과 짝이다 */
  verifyMaxTokens: 4096,
  /** cas_script 1건 실행 제한 시간(ms). 넘으면 Worker 를 terminate 한다 */
  casTimeoutMs: 20000,
  /** 키 기억하기 — PBKDF2 반복 수(지시서 02 §4) */
  keyKdfIterations: 310000,
  /** 잠금 해제 연속 실패 허용 횟수. 넘으면 암호문을 지운다 */
  keyUnlockMaxAttempts: 5,

  /** 홈 하부 타일 최대 개수(대시보드 §3 · 관찰 조정 대상) */
  homeTileMax: 4,

  /** PDF 래스터화 배율(pdf.js) */
  pdfRasterScale: 2,

  /** Pyodide — CDN 고정 판본(스모크 ③ · 판본을 떠돌게 두지 않는다) */
  pyodideVersion: '0.26.4',
  pyodideIndexUrl: 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/',

  /** 도구 판본 — 폴더 파일의 tool_version 에 박힌다 */
  toolVersion: '0.1.0',
  /** 도구가 읽고 쓰는 폴더 규격 판본(class.json.spec) */
  classSpec: 'gc-class/0.1',
} as const;

export type Limits = typeof limits;
