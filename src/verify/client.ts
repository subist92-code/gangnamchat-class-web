import { currentAccessToken } from '../auth/supabase';
import { verdictSchema, type Verdict } from './verdict';
import type { UnitSlot } from '../folder/schemas/transcript';
import type { Course } from '../folder/schemas/common';

/**
 * S4 검증 호출 — 브라우저 → `vault-proxy`(R-verify · 지시서 02 §3-2).
 *
 * 금고 블록은 서버 메모리에서만 조립된다. 브라우저는 조립 프롬프트를 보지 못하고
 * 보낼 필요도 없다(H-3) — 문항 입력과 단원 · 과정만 넘긴다.
 * 키는 헤더로 지나갈 뿐 저장되지 않는다(H-2).
 *
 * ★ 헤더 값은 반드시 ASCII 다. 비ASCII 헤더 값은 fetch 가 요청 자체를 거부한다.
 */

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;

function functionName(): string {
  return (import.meta.env.VITE_VAULT_FUNCTION as string | undefined) ?? 'vault-proxy';
}

/** 검증 입력 — 전사 확인본에서 만든다. */
export interface VerifyInput {
  problem_text: string;
  choices?: string[] | null;
  answer_raw?: string | null;
  solution_raw?: string | null;
  format_guess: string;
  mid: string;
  teacher_note?: string | null;
}

export interface VerifyReceipt {
  lane: string;
  purpose: string;
  recipe: string;
  blocks: Record<string, string>;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  key_last4: string;
  request_hash: string;
}

export interface VerifyResult {
  verdict: Verdict;
  receipt: VerifyReceipt;
}

/** 화면이 갈래별로 다르게 말해야 하는 실패들(§3-2). */
export type VerifyFailure =
  | 'login_required'
  | 'vault_unavailable'
  | 'verdict_unparsable'
  | 'bad_request'
  | 'upstream_error';

export class VerifyError extends Error {
  constructor(
    readonly kind: VerifyFailure,
    message: string,
  ) {
    super(message);
    this.name = 'VerifyError';
  }
}

function failureFor(status: number, body: { error?: unknown }): VerifyError {
  const code = typeof body.error === 'string' ? body.error : '';
  if (status === 401) return new VerifyError('login_required', '로그인이 필요합니다.');
  if (status === 503 || code === 'vault_unavailable') {
    return new VerifyError('vault_unavailable', '서버 금고 미탑재 — 묶음을 중단했습니다.');
  }
  if (status === 422 || code === 'verdict_unparsable') {
    return new VerifyError('verdict_unparsable', '검증 불능 — 판정을 읽지 못했습니다.');
  }
  if (status === 400) return new VerifyError('bad_request', code || '요청이 올바르지 않습니다.');
  return new VerifyError('upstream_error', code || `검증 실패(HTTP ${String(status)})`);
}

export async function callVerify(params: {
  apiKey: string;
  unit: UnitSlot;
  course: Course;
  input: VerifyInput;
}): Promise<VerifyResult> {
  const token = await currentAccessToken();
  if (token === null) throw new VerifyError('login_required', '검증은 로그인이 필요합니다.');
  if (url === undefined) throw new VerifyError('bad_request', 'Supabase 설정이 없습니다.');

  const response = await fetch(`${url}/functions/v1/${functionName()}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      'x-byok-key': params.apiKey,
    },
    body: JSON.stringify({
      recipe: 'R-verify',
      unit: params.unit,
      course: params.course,
      input: params.input,
    }),
  });

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new VerifyError('upstream_error', `검증 실패(HTTP ${String(response.status)})`);
  }

  if (!response.ok) throw failureFor(response.status, body as { error?: unknown });

  const payload = body as { verdict?: unknown; receipt?: unknown };
  const parsed = verdictSchema.safeParse(payload.verdict);
  if (!parsed.success) {
    // 서버는 도구 호출을 강제하지만, 계약이 어긋나면 화면에서도 「검증 불능」으로 다룬다.
    throw new VerifyError('verdict_unparsable', '검증 불능 — 판정 형식이 계약과 다릅니다.');
  }

  return { verdict: parsed.data, receipt: payload.receipt as VerifyReceipt };
}

/**
 * 단원별로 모아 순차 호출하면 캐시가 산다(규격 §5).
 * 같은 단원의 두 번째 문항부터 `cache_read_tokens` 가 커져야 정상이다.
 */
export function orderByUnit<T extends { unit: UnitSlot }>(items: readonly T[]): T[] {
  const order: UnitSlot[] = ['B10', 'B20', 'B30', 'B40', 'B-D'];
  return [...items].sort((a, b) => order.indexOf(a.unit) - order.indexOf(b.unit));
}
