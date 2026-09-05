import { describe, expect, it } from 'vitest';
import { judge, judgeOne, summarize, type ProblemEntry } from '../../src/grading/judge';
import { attemptsJsonSchema } from '../../src/folder/schemas/attempts';
import { makeExam, makeProblem } from './helpers';

const entry = (overrides = {}, outOfScope = false): ProblemEntry => ({
  problem: makeProblem(overrides),
  outOfScope,
});

describe('R1 판정 — 정오', () => {
  it('mc5 정답', () => {
    const a = judgeOne(entry(), 1, 'S-2026-0001', '3');
    expect(a.is_correct).toBe(true);
    expect(a.error_source).toBeNull();
    expect(a.error_code).toBeNull();
  });

  it('무응답은 오답이고 경로가 없다', () => {
    const a = judgeOne(entry(), 1, 'S-2026-0001', '');
    expect(a.is_correct).toBe(false);
    expect(a.error_source).toBe('none');
  });

  it('short 정답은 공백·전각을 정규화해 맞춘다', () => {
    const p = entry({
      format: { type: 'short', omr_integer: true, track: 1 },
      answer: { index: null, value: '12' },
    });
    expect(judgeOne(p, 1, 'S-2026-0001', ' １２ ').is_correct).toBe(true);
  });
});

describe('R1 판정 — 판정 순서(C-037 · C-045)', () => {
  it('mc5 오답은 선지 decoys lookup 으로 4키를 복사한다', () => {
    const a = judgeOne(entry(), 1, 'S-2026-0001', '2');
    expect(a.error_source).toBe('distractor');
    expect(a.error_code).toBe('concept_confusion');
    expect(a.node).toBe('X01-1');
    expect(a.axis).toBe('misconception');
    expect(a.mc_id).toBe('MC-001');
  });

  it('단답 미끼값은 decoy_ref 로 좌석을 찾는다', () => {
    const p = entry({
      format: { type: 'short', omr_integer: true, track: 1 },
      answer: { index: null, value: '12' },
      expected_wrong_answers: [{ value: '17', decoy_ref: '2' }],
    });
    const a = judgeOne(p, 1, 'S-2026-0001', '17');
    expect(a.error_source).toBe('decoy_value');
    expect(a.mc_id).toBe('MC-001');
  });

  it('좌석에도 미끼값에도 없으면 none', () => {
    const p = entry({
      format: { type: 'short', omr_integer: true, track: 1 },
      answer: { index: null, value: '12' },
      expected_wrong_answers: [{ value: '17', decoy_ref: '2' }],
    });
    expect(judgeOne(p, 1, 'S-2026-0001', '99').error_source).toBe('none');
  });
});

describe('R1 판정 — 좌석 없음은 unmapped(C-069 1)', () => {
  it('decoys 부재', () => {
    const p: ProblemEntry = { problem: makeProblem() };
    delete (p.problem as { decoys?: unknown }).decoys;
    expect(judgeOne(p, 1, 'S-2026-0001', '2').error_source).toBe('unmapped');
  });

  it('track 2', () => {
    const p = entry({ format: { type: 'essay', omr_integer: false, track: 2 } });
    expect(judgeOne(p, 1, 'S-2026-0001', '2').error_source).toBe('unmapped');
  });

  it('index_only', () => {
    const p = entry({ processing_depth: 'index_only' });
    expect(judgeOne(p, 1, 'S-2026-0001', '2').error_source).toBe('unmapped');
  });

  it('노드 밖 보관 문항', () => {
    expect(judgeOne(entry({}, true), 1, 'S-2026-0001', '2').error_source).toBe('unmapped');
  });
});

describe('R1 판정 — 킬러는 태그만(순서 불변)', () => {
  it('킬러 오답도 선지 lookup 이 먼저다', () => {
    const p = entry({
      killer: { is_killer: true, trap_type: '숨은 경우', time_strategy_note: null },
    });
    const a = judgeOne(p, 1, 'S-2026-0001', '2');
    expect(a.killer_tag).toBe(true);
    expect(a.error_source).toBe('distractor');
    // trap_missed 폴백을 쓰지 않는다.
    expect(a.error_code).toBe('concept_confusion');
  });
});

describe('R1 판정 — verification_grade 전달과 출력 스키마', () => {
  it('문항의 grade 를 그대로 옮긴다', () => {
    const p = entry({
      verification: {
        cas: { status: 'fail', checks: [], engine: 'sympy', at: null, report_ref: null },
        teacher: { approved: true, at: null, note: '' },
        grade: 'teacher_only',
      },
    });
    expect(judgeOne(p, 1, 'S-2026-0001', '3').verification_grade).toBe('teacher_only');
  });

  it('attempts.json 스키마를 통과한다', () => {
    const problems = new Map([['Q-2026-0001', entry()]]);
    const result = judge({
      exam: makeExam(),
      responses: [
        { student_id: 'S-2026-0001', item_no: 1, answer_given: '3' },
        { student_id: 'S-2026-0002', item_no: 1, answer_given: '2' },
      ],
      problems,
    });
    expect(() => attemptsJsonSchema.parse(result)).not.toThrow();
    expect(result.spec).toBe('gc-class-attempts/0.1');
    const summary = summarize(result);
    expect(summary.students).toBe(2);
    expect(summary.correct).toBe(1);
    expect(summary.wrong).toBe(1);
  });
});
