import { describe, expect, it } from 'vitest';
import {
  ALLOWED_IMPORTS,
  checkScript,
  importedModules,
  parseCasStdout,
} from '../../src/cas/contract';

/**
 * cas_script 계약 · 정적 검사(지시서 02 §6 · casContract.test.ts).
 *
 * ※ Worker 타임아웃 · terminate 는 여기서 시험하지 않는다 — jsdom 에 Worker 가 없다.
 *   그 갈래는 브라우저 실호출로 확인한다(§8 실측 항목).
 */

const GOOD_RESULT = JSON.stringify({
  answer: { ok: true, value: '2' },
  uniqueness: { ok: true, count: 1 },
  curriculum: { ok: true, note: '범위 안' },
});

describe('checkScript — 허용 import', () => {
  it('허용 목록 안이면 통과한다', () => {
    const script = ALLOWED_IMPORTS.map((m) => `import ${m}`).join('\n');
    expect(checkScript(script).ok).toBe(true);
  });

  it('from 형태도 최상위 모듈로 본다', () => {
    expect(importedModules('from sympy.abc import x')).toEqual(['sympy']);
    expect(checkScript('from sympy import symbols, solve').ok).toBe(true);
  });

  it('as 별칭 · 쉼표 여러 개', () => {
    expect(importedModules('import sympy as sp')).toEqual(['sympy']);
    expect(importedModules('import math, json')).toEqual(['math', 'json']);
  });

  it('허용 밖 import 는 거부하고 이름을 알려 준다 — 양성 픽스처 import os', () => {
    const check = checkScript('import os\nprint(1)');
    expect(check.ok).toBe(false);
    expect(check.disallowed).toContain('os');

    const mixed = checkScript('import sympy\nimport subprocess\nfrom pathlib import Path');
    expect(mixed.ok).toBe(false);
    expect(mixed.disallowed).toEqual(expect.arrayContaining(['subprocess', 'pathlib']));
    expect(mixed.disallowed).not.toContain('sympy');
  });

  it('주석 속 import 는 위반이 아니다', () => {
    expect(checkScript('# import os\nimport sympy').ok).toBe(true);
  });

  it('import 가 없으면 통과한다', () => {
    expect(checkScript('print(1 + 1)').ok).toBe(true);
  });
});

describe('parseCasStdout — RESULT 계약', () => {
  it('마지막 줄의 RESULT 를 읽는다 — 앞의 출력은 무시한다', () => {
    const parsed = parseCasStdout(`중간 출력\n또 다른 줄\n${GOOD_RESULT}`);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.result.answer.value).toBe('2');
      expect(parsed.allPassed).toBe(true);
    }
  });

  it('세 라벨 중 하나라도 false 면 allPassed 가 아니다', () => {
    const partial = JSON.stringify({
      answer: { ok: true, value: '2' },
      uniqueness: { ok: false, count: 2 },
      curriculum: { ok: true, note: '' },
    });
    const parsed = parseCasStdout(partial);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.allPassed).toBe(false);
  });

  it('JSON 이 아니면 형식 불일치', () => {
    const parsed = parseCasStdout('답은 2 입니다');
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reason).toBe('CAS 출력 형식 불일치');
  });

  it('라벨이 빠지면 형식 불일치', () => {
    const missing = JSON.stringify({ answer: { ok: true, value: '2' } });
    const parsed = parseCasStdout(missing);
    expect(parsed.ok).toBe(false);
  });

  it('계약에 없는 필드가 붙어도 형식 불일치 — strict 계약이다', () => {
    const extra = JSON.stringify({
      answer: { ok: true, value: '2' },
      uniqueness: { ok: true, count: 1 },
      curriculum: { ok: true, note: '' },
      extra: 1,
    });
    expect(parseCasStdout(extra).ok).toBe(false);
  });

  it('타입이 다르면 형식 불일치 — count 는 정수여야 한다', () => {
    const wrong = JSON.stringify({
      answer: { ok: true, value: 2 },
      uniqueness: { ok: true, count: 1 },
      curriculum: { ok: true, note: '' },
    });
    expect(parseCasStdout(wrong).ok).toBe(false);
  });

  it('빈 출력', () => {
    const parsed = parseCasStdout('   \n  \n');
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reason).toBe('CAS 출력이 비었습니다');
  });
});
