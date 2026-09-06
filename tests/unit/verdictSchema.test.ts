import { describe, expect, it } from 'vitest';
import {
  answerMismatchIssues,
  isOutOfScope,
  isTrack2,
  verdictSchema,
} from '../../src/verify/verdict';

/**
 * emit_verdict 계약(지시서 02 §6 · verdictSchema.test.ts).
 * REF 사본이 원본과 같은 모양인지 지킨다 — 원본은 금고 tools/emit_verdict.schema.json
 * (md5 6150825bf2cf049bb28ea9423e1d6775).
 */

const base = {
  status: 'pass',
  issues: [],
  track: 1,
  nodes_suggested: { mid: 'M01', sub: ['M01-1'] },
  difficulty_suggested: 3,
  cas_script: 'print(1)',
};

describe('verdictSchema', () => {
  it('pass · fail · ambiguous 예시가 통과한다', () => {
    for (const status of ['pass', 'fail', 'ambiguous']) {
      expect(verdictSchema.safeParse({ ...base, status }).success).toBe(true);
    }
  });

  it('status enum 밖은 실패한다', () => {
    expect(verdictSchema.safeParse({ ...base, status: 'maybe' }).success).toBe(false);
  });

  it('issue kind enum 밖은 실패한다', () => {
    const bad = {
      ...base,
      issues: [{ kind: 'typo', where: 'x', detail: 'y', fix_suggestion: null }],
    };
    expect(verdictSchema.safeParse(bad).success).toBe(false);
  });

  it('알려진 issue kind 7종은 통과한다', () => {
    const kinds = [
      'no_unique_answer',
      'contradiction',
      'answer_mismatch',
      'ambiguous_wording',
      'out_of_scope',
      'missing_condition',
      'figure_dependent',
    ];
    for (const kind of kinds) {
      const one = {
        ...base,
        issues: [{ kind, where: '본문', detail: '설명', fix_suggestion: null }],
      };
      expect(verdictSchema.safeParse(one).success, kind).toBe(true);
    }
  });

  it('additionalProperties 거부 — 계약에 없는 필드가 오면 실패한다', () => {
    expect(verdictSchema.safeParse({ ...base, extra: 1 }).success).toBe(false);
  });

  it('track 은 1 또는 2 만', () => {
    expect(verdictSchema.safeParse({ ...base, track: 2 }).success).toBe(true);
    expect(verdictSchema.safeParse({ ...base, track: 3 }).success).toBe(false);
  });

  it('difficulty_suggested 는 1~5 정수', () => {
    expect(verdictSchema.safeParse({ ...base, difficulty_suggested: 1 }).success).toBe(true);
    expect(verdictSchema.safeParse({ ...base, difficulty_suggested: 5 }).success).toBe(true);
    expect(verdictSchema.safeParse({ ...base, difficulty_suggested: 0 }).success).toBe(false);
    expect(verdictSchema.safeParse({ ...base, difficulty_suggested: 6 }).success).toBe(false);
    expect(verdictSchema.safeParse({ ...base, difficulty_suggested: 2.5 }).success).toBe(false);
  });

  it('필수 필드가 빠지면 실패한다', () => {
    for (const key of Object.keys(base)) {
      const partial = { ...base } as Record<string, unknown>;
      delete partial[key];
      expect(verdictSchema.safeParse(partial).success, key).toBe(false);
    }
  });

  it('nodes_suggested.mid 는 null 을 허용한다', () => {
    const parsed = verdictSchema.safeParse({
      ...base,
      nodes_suggested: { mid: null, sub: [] },
    });
    expect(parsed.success).toBe(true);
  });

  it('갈래 판정 — 노드 밖 · 트랙2 · 정답표 확인', () => {
    const parsed = verdictSchema.parse({
      ...base,
      status: 'fail',
      track: 2,
      issues: [
        { kind: 'out_of_scope', where: 'a', detail: 'b', fix_suggestion: null },
        { kind: 'answer_mismatch', where: 'c', detail: 'd', fix_suggestion: null },
      ],
    });
    expect(isOutOfScope(parsed)).toBe(true);
    expect(isTrack2(parsed)).toBe(true);
    expect(answerMismatchIssues(parsed)).toHaveLength(1);

    const clean = verdictSchema.parse(base);
    expect(isOutOfScope(clean)).toBe(false);
    expect(isTrack2(clean)).toBe(false);
    expect(answerMismatchIssues(clean)).toHaveLength(0);
  });
});
