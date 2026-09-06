import { describe, expect, it } from 'vitest';
import {
  numericDiff,
  numericTokens,
  numericsPreserved,
} from '../../src/verify/numericTokens';

/**
 * 수치 보존 대조(지시서 02 §6 · numericTokens.test.ts).
 * 「적용」 버튼이 이 검사를 통과해야 문장을 바꾼다 — 수치가 바뀌면 다른 문제가 된다.
 */
describe('numericsPreserved', () => {
  it('문장만 바뀌면 같다', () => {
    const before = '한 변의 길이가 3인 정삼각형의 넓이를 구하시오.';
    const after = '한 변의 길이가 3인 정삼각형의 넓이는 얼마인가?';
    expect(numericsPreserved(before, after)).toBe(true);
  });

  it('숫자 하나가 바뀌면 다르다', () => {
    expect(numericsPreserved('길이가 3인 변', '길이가 5인 변')).toBe(false);
  });

  it('숫자가 사라져도 다르다 — 집합이 아니라 멀티셋으로 본다', () => {
    expect(numericsPreserved('3 과 3 을 더한다', '3 을 더한다')).toBe(false);
    expect(numericsPreserved('3 과 3', '3 과 3')).toBe(true);
    // 같은 숫자가 두 번 나오는 것과 한 번 나오는 것은 다르다.
    expect(numericsPreserved('3 3', '3')).toBe(false);
  });

  it('소수 · 음수', () => {
    expect(numericsPreserved('값은 2.5 이다', '값은 2.50 이다')).toBe(true);
    expect(numericsPreserved('값은 2.5 이다', '값은 2.6 이다')).toBe(false);
    expect(numericTokens('온도는 -3 도')).toContain('-3');
    expect(numericsPreserved('온도는 -3 도', '온도는 3 도')).toBe(false);
  });

  it('분수 — 평문과 LaTeX 모두 숫자 낱개로 잡힌다', () => {
    expect(numericTokens('3/4')).toEqual(['3', '4']);
    expect(numericTokens('\\frac{3}{4}')).toEqual(['3', '4']);
    // 표기만 바뀌고 수치는 그대로면 통과한다.
    expect(numericsPreserved('3/4 를 구하라', '\\frac{3}{4} 를 구하라')).toBe(true);
    // 분자가 바뀌면 막힌다.
    expect(numericsPreserved('\\frac{3}{4}', '\\frac{5}{4}')).toBe(false);
  });

  it('LaTeX 명령과 식별자 첨자의 숫자는 세지 않는다', () => {
    expect(numericTokens('\\alpha + \\beta')).toEqual([]);
    // x_1 의 1 은 변수 이름의 일부다 — 문제의 수치가 아니라서 세지 않는다.
    expect(numericTokens('x_1 + x_2')).toEqual([]);
  });

  it('알려진 한계 — 첨자만 바꾸는 제안은 이 검사를 통과한다', () => {
    // 수치는 그대로지만 식이 달라지는 경우다. 검사가 막지 못하니 화면에서 선생이 본다.
    // 이 시험은 「막힌다」가 아니라 「지금은 통과한다」를 못 박아, 나중에 규칙을 바꿀 때
    // 이 자리가 눈에 띄게 한다.
    expect(numericsPreserved('x_1 을 구하라', 'x_2 를 구하라')).toBe(true);
  });

  it('뺄셈의 3 과 음수 -3 을 같은 규칙으로 센다 — 전후 동일 규칙이면 대조가 성립한다', () => {
    // x-3 의 3 은 앞이 글자라 양수 3 으로 센다.
    expect(numericTokens('x-3')).toEqual(['3']);
    expect(numericsPreserved('x-3 을 풀어라', 'x-3 의 해를 구하라')).toBe(true);
  });

  it('numericDiff — 무엇이 사라지고 생겼는지 알려 준다', () => {
    const diff = numericDiff('3 과 4', '3 과 5');
    expect(diff.removed).toEqual(['4']);
    expect(diff.added).toEqual(['5']);

    const same = numericDiff('3 과 4', '4 와 3');
    expect(same.removed).toEqual([]);
    expect(same.added).toEqual([]);
  });
});
