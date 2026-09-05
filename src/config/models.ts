/**
 * ★ 모델 ID가 사는 유일한 파일(C-051 · C-017 · 지시서 §2-6).
 * 다른 어떤 src/·supabase/ 파일에도 모델 ID 문자열이 있으면 안 된다.
 * 검사식: npm run config-layer
 *
 * 값의 출처는 환경변수(.env.local). 아래 상수는 환경변수가 없을 때의 기본값이다.
 */

function env(key: string, fallback: string): string {
  const v = (import.meta.env as Record<string, string | undefined>)[key];
  return v && v.length > 0 ? v : fallback;
}

/** 기본값 — 환경변수 미설정 시에만 쓰인다. 값 변경은 .env.local 로. */
const DEFAULTS = {
  transcribe: 'claude-opus-5',
  narrative: 'claude-sonnet-5',
  chat: 'claude-haiku-4-5',
} as const;

export const models = {
  /** S1 전사(P82 · direct 차선 · 비전 입력) */
  transcribe: env('VITE_MODEL_TRANSCRIBE', DEFAULTS.transcribe),
  /** R3 서사(P81) — 이번 국면 미사용(자리) */
  narrative: env('VITE_MODEL_NARRATIVE', DEFAULTS.narrative),
  /** 대화층(U-022) — 이번 국면 모델 호출 0(자리 C) */
  chat: env('VITE_MODEL_CHAT', DEFAULTS.chat),
} as const;

export type ModelPurpose = keyof typeof models;
