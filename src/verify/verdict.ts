import { z } from 'zod';

/**
 * emit_verdict 계약 — REF(지시서 02 §0 이관표).
 *
 * 원본 = 금고 `tools/emit_verdict.schema.json` (md5 6150825bf2cf049bb28ea9423e1d6775).
 * 원본은 버킷에만 있고 함수가 도구 정의로 그대로 쓴다. 이 파일은 **브라우저가 응답을
 * 읽기 위한 사본**이며 원본을 수정하지 않는다 — 원본이 바뀌면 md5 와 함께 여기도 고친다.
 *
 * 블록 본문이 아니라 도구의 구조 정의다 — 필드 이름과 값의 범위뿐이고,
 * 금고가 지키는 규칙 문장은 한 줄도 여기 없다.
 */

export const verdictStatusSchema = z.enum(['pass', 'fail', 'ambiguous']);
export type VerdictStatus = z.infer<typeof verdictStatusSchema>;

export const issueKindSchema = z.enum([
  'no_unique_answer',
  'contradiction',
  'answer_mismatch',
  'ambiguous_wording',
  'out_of_scope',
  'missing_condition',
  'figure_dependent',
]);
export type IssueKind = z.infer<typeof issueKindSchema>;

export const verdictIssueSchema = z.object({
  kind: issueKindSchema,
  where: z.string(),
  detail: z.string(),
  fix_suggestion: z.string().nullable(),
});
export type VerdictIssue = z.infer<typeof verdictIssueSchema>;

export const verdictSchema = z
  .object({
    status: verdictStatusSchema,
    issues: z.array(verdictIssueSchema),
    track: z.union([z.literal(1), z.literal(2)]),
    nodes_suggested: z.object({
      mid: z.string().nullable(),
      sub: z.array(z.string()),
    }),
    difficulty_suggested: z.number().int().min(1).max(5),
    cas_script: z.string(),
  })
  .strict(); // 원본의 additionalProperties: false

export type Verdict = z.infer<typeof verdictSchema>;

/** 「노드 밖」 — out_of_scope issue 가 하나라도 있으면(기획 §5 S4 · S5 칩). */
export function isOutOfScope(verdict: Verdict): boolean {
  return verdict.issues.some((i) => i.kind === 'out_of_scope');
}

/** 「정답표 확인」 — 결함이 아니라 선생 판정 대상이다(기획 §7-4 · D11 ②). */
export function answerMismatchIssues(verdict: Verdict): VerdictIssue[] {
  return verdict.issues.filter((i) => i.kind === 'answer_mismatch');
}

/** 트랙2 = 검증만 · 미끼 없음(S9 대기). */
export function isTrack2(verdict: Verdict): boolean {
  return verdict.track === 2;
}
