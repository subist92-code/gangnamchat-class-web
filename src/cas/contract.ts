import { z } from 'zod';

/**
 * cas_script 계약 · 정적 검사(지시서 02 §3-3 · 【자리 E · 제안】).
 *
 * 모델이 스크립트를 쓰고 실행은 도구가 한다(H-5). 실행 주체가 선생 브라우저일 뿐이다.
 * 이 파일은 런타임에 기대지 않는 순수 로직이라 Worker 와 테스트가 같은 코드를 쓴다.
 */

/** B04 규격이 허용하는 import. 그 외가 보이면 실행하지 않는다. */
export const ALLOWED_IMPORTS = ['sympy', 'math', 'fractions', 'itertools', 'json'] as const;

/**
 * 【자리 E · 제안】 결과 계약.
 * 스크립트는 마지막에 `print(json.dumps(RESULT))` 를 찍는다.
 * 라벨 3 개는 금고 규격 §3-1 의 `checks` 와 같다.
 */
export const casResultContractSchema = z
  .object({
    answer: z.object({ ok: z.boolean(), value: z.string() }),
    uniqueness: z.object({ ok: z.boolean(), count: z.number().int() }),
    curriculum: z.object({ ok: z.boolean(), note: z.string() }),
  })
  .strict();

export type CasResultContract = z.infer<typeof casResultContractSchema>;

export const CAS_CHECK_LABELS = ['answer', 'uniqueness', 'curriculum'] as const;

/** 주석을 걷어낸다 — `# import os` 를 위반으로 잡지 않기 위해서다. */
function stripComments(source: string): string {
  return source
    .split(/\r?\n/)
    .map((line) => {
      const at = line.indexOf('#');
      return at < 0 ? line : line.slice(0, at);
    })
    .join('\n');
}

/**
 * import 문에서 최상위 모듈 이름만 뽑는다.
 * `import sympy as sp` → sympy · `from sympy.abc import x` → sympy
 * `import os, sys` → os, sys
 */
export function importedModules(source: string): string[] {
  const out: string[] = [];
  for (const line of stripComments(source).split(/\r?\n/)) {
    const from = /^\s*from\s+([\w.]+)\s+import\s/.exec(line);
    if (from !== null) {
      out.push((from[1] as string).split('.')[0] as string);
      continue;
    }
    const plain = /^\s*import\s+(.+)$/.exec(line);
    if (plain !== null) {
      for (const part of (plain[1] as string).split(',')) {
        const name = part.trim().split(/\s+as\s+/)[0]?.trim() ?? '';
        if (name.length > 0) out.push(name.split('.')[0] as string);
      }
    }
  }
  return out;
}

export interface ScriptCheck {
  ok: boolean;
  /** 허용 목록 밖의 모듈들 — 화면에 그대로 보여 준다. */
  disallowed: string[];
}

/** 실행 전에 부른다. 허용 밖 import 가 하나라도 있으면 실행하지 않는다. */
export function checkScript(source: string): ScriptCheck {
  const allowed = new Set<string>(ALLOWED_IMPORTS);
  const disallowed = [...new Set(importedModules(source).filter((m) => !allowed.has(m)))];
  return { ok: disallowed.length === 0, disallowed };
}

export type CasParse =
  | { ok: true; result: CasResultContract; allPassed: boolean }
  | { ok: false; reason: string };

/**
 * stdout 에서 RESULT 를 읽는다.
 * 마지막 비어 있지 않은 줄이 `json.dumps(RESULT)` 다 — 그 앞의 출력은 무시한다.
 */
export function parseCasStdout(stdout: string): CasParse {
  const lines = stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const last = lines[lines.length - 1];
  if (last === undefined) return { ok: false, reason: 'CAS 출력이 비었습니다' };

  let raw: unknown;
  try {
    raw = JSON.parse(last);
  } catch {
    return { ok: false, reason: 'CAS 출력 형식 불일치' };
  }

  const parsed = casResultContractSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: 'CAS 출력 형식 불일치' };

  const result = parsed.data;
  return {
    ok: true,
    result,
    allPassed: result.answer.ok && result.uniqueness.ok && result.curriculum.ok,
  };
}
