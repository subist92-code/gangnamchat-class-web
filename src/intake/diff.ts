/**
 * diff_from_llm — 전사 원문 대비 선생이 고친 문자 수(Levenshtein).
 * 전사 품질 지표다(코너 가 §5 S2 · 규격 §3-1 source.transcription).
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = new Array<number>(b.length + 1);
  let cur = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) prev[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(
        (cur[j - 1] as number) + 1,
        (prev[j] as number) + 1,
        (prev[j - 1] as number) + cost,
      );
    }
    const swap = prev;
    prev = cur;
    cur = swap;
  }
  return prev[b.length] as number;
}

/** 발문 + 선지 + 원문 정답을 이어붙여 한 번에 잰다. */
export function transcriptDiff(
  llm: { problem_text: string; choices: string[] | null; answer_raw: string | null },
  edited: { problem_text: string; choices: string[] | null; answer_raw: string | null },
): number {
  const join = (v: { problem_text: string; choices: string[] | null; answer_raw: string | null }) =>
    [v.problem_text, ...(v.choices ?? []), v.answer_raw ?? ''].join('\u0000');
  return levenshtein(join(llm), join(edited));
}
