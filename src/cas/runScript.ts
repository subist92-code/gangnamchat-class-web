import { limits } from '../config/limits';
import { CAS_CHECK_LABELS, checkScript, parseCasStdout } from './contract';
import type { CasWorkerRequest, CasWorkerResponse } from './casWorker';
import type { CasResult } from '../folder/schemas/transcript';

/**
 * cas_script 1 건 실행(지시서 02 §3-3).
 *
 * 순서가 규칙이다:
 *   ① 빈 스크립트 · 트랙2 → 실행하지 않고 `na`
 *   ② 정적 검사 — 허용 밖 import 가 보이면 **실행하지 않는다**
 *   ③ Worker 1 회 실행 · 타임아웃이면 terminate
 *   ④ RESULT 파싱 — 형식이 다르면 `fail`
 *
 * CAS 는 verdict 를 덮지 않는다. 판정과 검산을 나란히 두는 것이 요점이다(C-053 · C-034).
 */

const ENGINE = 'sympy(pyodide)';

function now(): string {
  return new Date().toISOString();
}

function na(note: string, elapsedMs = 0): CasResult {
  return {
    status: 'na',
    checks: [...CAS_CHECK_LABELS],
    engine: ENGINE,
    at: now(),
    elapsed_ms: elapsedMs,
    note,
  };
}

function fail(note: string, elapsedMs: number): CasResult {
  return {
    status: 'fail',
    checks: [...CAS_CHECK_LABELS],
    engine: ENGINE,
    at: now(),
    elapsed_ms: elapsedMs,
    note,
  };
}

/** Worker 를 띄워 한 건 돌리고 반드시 종료한다. */
function runInWorker(script: string, timeoutMs: number): Promise<CasWorkerResponse> {
  return new Promise((resolve) => {
    const worker = new Worker(new URL('./casWorker.ts', import.meta.url));
    const started = performance.now();

    const finish = (response: CasWorkerResponse) => {
      clearTimeout(timer);
      worker.terminate();
      resolve(response);
    };

    const timer = setTimeout(() => {
      finish({ ok: false, error: 'timeout', elapsedMs: performance.now() - started });
    }, timeoutMs);

    worker.onmessage = (event: MessageEvent<CasWorkerResponse>) => finish(event.data);
    worker.onerror = () =>
      finish({ ok: false, error: 'worker_error', elapsedMs: performance.now() - started });

    const request: CasWorkerRequest = { script, indexUrl: limits.pyodideIndexUrl };
    worker.postMessage(request);
  });
}

export async function runCasScript(
  script: string,
  options: { track?: 1 | 2 } = {},
): Promise<CasResult> {
  // ① 트랙2 · 빈 스크립트는 검산 대상이 아니다.
  if (options.track === 2) return na('트랙2 — 검산 없음');
  if (script.trim().length === 0) return na('cas_script 없음');

  // ② 정적 검사. 위반이면 실행 자체를 하지 않는다.
  const check = checkScript(script);
  if (!check.ok) {
    return fail(`스크립트 규격 위반 — 허용되지 않은 import: ${check.disallowed.join(', ')}`, 0);
  }

  // ③ 실행.
  const run = await runInWorker(script, limits.casTimeoutMs);
  if (!run.ok) {
    const note = run.error === 'timeout' ? 'CAS 시간 초과 — 중단했습니다' : `CAS 실행 실패: ${run.error}`;
    return fail(note, run.elapsedMs);
  }

  // ④ 결과 계약.
  const parsed = parseCasStdout(run.stdout);
  if (!parsed.ok) return fail(parsed.reason, run.elapsedMs);

  return {
    status: parsed.allPassed ? 'pass' : 'fail',
    checks: [...CAS_CHECK_LABELS],
    engine: ENGINE,
    at: now(),
    elapsed_ms: run.elapsedMs,
    note: parsed.allPassed ? null : '검산에서 어긋난 항목이 있습니다',
  };
}

/**
 * 모델 판정과 도구 검산이 엇갈렸는가 — 「검산 불일치」 칩(C-034).
 * CAS 가 verdict 를 덮지 않으므로, 엇갈림은 지우지 않고 선생에게 보인다.
 */
export function casDisagrees(
  verdictStatus: 'pass' | 'fail' | 'ambiguous',
  cas: CasResult | null | undefined,
): boolean {
  if (cas === null || cas === undefined || cas.status === 'na') return false;
  return verdictStatus === 'pass' && cas.status === 'fail';
}
