/**
 * 수치 보존 대조(지시서 02 §3-4 · C-066 ②).
 *
 * `fix_suggestion` 은 **문장만** 고쳐야 한다. 「적용」이 문제의 수치를 바꿔 버리면
 * 선생이 낸 문제가 다른 문제가 된다 — 그래서 적용 전후의 숫자 토큰 집합을 대조하고,
 * 다르면 적용을 거부한다.
 *
 * 집합이 아니라 **멀티셋**으로 본다. 「3 과 3」이 「3 과 5」로 바뀌는 것도,
 * 숫자 하나가 사라지는 것도 잡아야 한다.
 */

/**
 * 숫자 토큰.
 *
 * - 소수 · 정수 · 음수를 함께 잡는다: `-3`, `2.5`, `0.75`
 * - 분수는 LaTeX 든 평문이든 숫자 낱개로 잡힌다: `\frac{3}{4}` → 3, 4 / `3/4` → 3, 4
 * - 앞이 글자·숫자·점·밑줄이면 세지 않는다 — 식별자의 일부로 본다.
 *   `x-3` 의 3 은 앞이 글자라 양수 3 으로 센다(뺄셈인지 음수인지는 문맥이라 판정하지 않는다.
 *   대조는 전후 동일 규칙이면 성립한다). `x_1` · `x1` 의 1 은 **아예 세지 않는다** —
 *   변수 이름의 일부이지 문제의 수치가 아니기 때문이다.
 *
 * ★ 알려진 한계: 그래서 `x_1` → `x_2` 처럼 **첨자만 바꾸는 제안은 이 검사를 통과한다.**
 *   수치는 그대로지만 식이 달라지는 경우다. 지금은 선생이 화면에서 보고 판단한다 —
 *   첨자까지 수치로 세면 `\frac{3}{4}` 같은 정상 표기 변경이 자주 막힌다.
 */
const NUMBER = /(?<![\w.])-?\d+(?:\.\d+)?/g;

export function numericTokens(text: string): string[] {
  return text.match(NUMBER) ?? [];
}

/** 대조용 정규형 — 멀티셋이므로 정렬해서 늘어놓는다. */
function normalized(text: string): string[] {
  return numericTokens(text)
    .map((t) => {
      // -0 과 0, 2.50 과 2.5 를 같은 수로 본다. 표기가 아니라 값이 같은지가 관심사다.
      const n = Number(t);
      return Number.isFinite(n) ? String(n) : t;
    })
    .sort();
}

/** 두 문장의 숫자가 같은가 — 「적용」 버튼이 이걸 통과해야 문장을 바꾼다. */
export function numericsPreserved(before: string, after: string): boolean {
  const a = normalized(before);
  const b = normalized(after);
  if (a.length !== b.length) return false;
  return a.every((token, i) => token === b[i]);
}

/** 화면에 「무엇이 달라졌는지」 보여줄 때 쓴다. */
export function numericDiff(
  before: string,
  after: string,
): { removed: string[]; added: string[] } {
  const a = normalized(before);
  const b = normalized(after);
  const removed = [...a];
  const added: string[] = [];
  for (const token of b) {
    const at = removed.indexOf(token);
    if (at >= 0) removed.splice(at, 1);
    else added.push(token);
  }
  return { removed, added };
}
