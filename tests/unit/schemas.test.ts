import { describe, expect, it } from 'vitest';
import { classJsonSchema } from '../../src/folder/schemas/classJson';
import { examJsonSchema } from '../../src/folder/schemas/exam';
import { attemptsJsonSchema } from '../../src/folder/schemas/attempts';
import {
  hasExactlyOneCorrectSeat,
  problemJsonSchema,
} from '../../src/folder/schemas/problem';
import { transcriptTmpSchema } from '../../src/folder/schemas/transcript';
import { nodemapBundleSchema } from '../../src/nodemap/types';
import highBundle from '../../src/nodemap/nodemap.bundle.high.json';
import middleBundle from '../../src/nodemap/nodemap.bundle.middle.json';
import fixtureBundle from '../../src/nodemap/fixtures/nodemap.bundle.fixture.json';
import { fixtureAdapter, makeExam, makeProblem } from './helpers';

describe('규격 §2-1 class.json', () => {
  it('픽스처가 통과한다', async () => {
    const adapter = fixtureAdapter('class-folder');
    expect(() => classJsonSchema.parse(JSON.parse(adapter.snapshot()['class.json'] as string))).not.toThrow();
  });

  it('필드를 하나 빼면 실패한다', () => {
    const adapter = fixtureAdapter('class-folder');
    const obj = JSON.parse(adapter.snapshot()['class.json'] as string) as Record<string, unknown>;
    delete obj.id_counters;
    expect(() => classJsonSchema.parse(obj)).toThrow();
  });
});

describe('규격 §4-1 exam.json', () => {
  it('픽스처가 통과한다', () => {
    expect(() => examJsonSchema.parse(makeExam())).not.toThrow();
  });

  it('날짜 형식이 어긋나면 실패한다', () => {
    expect(() => examJsonSchema.parse(makeExam({ date: '2026/09/01' }))).toThrow();
  });
});

describe('규격 §3-1 문항 JSON', () => {
  it('B 5키 문항이 통과한다', () => {
    expect(() => problemJsonSchema.parse(makeProblem())).not.toThrow();
  });

  it('정답 자리가 정확히 1개다', () => {
    expect(hasExactlyOneCorrectSeat(makeProblem().decoys)).toBe(true);
  });

  it('오답 좌석에서 4키 중 하나가 빠지면 실패한다', () => {
    const bad = makeProblem();
    const decoys = { ...(bad.decoys as Record<string, unknown>) };
    decoys['1'] = { path: '경로만 있다', error_code: 'misreading', node: 'X01-1' };
    expect(() => problemJsonSchema.parse({ ...bad, decoys })).toThrow();
  });

  it('difficulty.reason 250자 상한', () => {
    const long = 'ㄱ'.repeat(251);
    expect(() =>
      problemJsonSchema.parse(
        makeProblem({ difficulty: { level: 3, basis: 'llm', band_hint: null, reason: long } }),
      ),
    ).toThrow();
  });
});

describe('규격 §4-3 attempts.json', () => {
  it('error_source 에 unmapped 가 있다', () => {
    const doc = {
      spec: 'gc-class-attempts/0.1',
      exam_id: 'E-2026-0001',
      judged_at: '2026-09-05T10:00:00+09:00',
      tool_version: '0.1.0',
      attempts: [
        {
          student_id: 'S-2026-0001',
          item_no: 1,
          problem_id: 'Q-2026-0001',
          answer_given: '2',
          is_correct: false,
          error_code: null,
          error_source: 'unmapped',
          node: null,
          axis: null,
          mc_id: null,
          killer_tag: false,
          verification_grade: 'teacher_only',
        },
      ],
    };
    expect(() => attemptsJsonSchema.parse(doc)).not.toThrow();
  });
});

describe('자리 B — _임시/전사 파일 형식 제안(지시서 §5-3)', () => {
  it('예시가 통과하고 items 를 빼면 실패한다', () => {
    const doc = {
      spec: 'gc-class-transcript-tmp/0.1',
      batch_id: 'T-20260905T1030',
      class_ref: '2026-2_고2A',
      course: 'high',
      mid_default: 'X01',
      source: { input: 'photo', files: ['p1.jpg'], note: '', rights_confirmed: true },
      items: [],
      receipts_ref: '문제함/receipts.json',
      created_at: '2026-09-05T10:30:00+09:00',
      updated_at: '2026-09-05T10:30:00+09:00',
      tool_version: '0.1.0',
    };
    expect(() => transcriptTmpSchema.parse(doc)).not.toThrow();
    const { items: _items, ...withoutItems } = doc;
    expect(() => transcriptTmpSchema.parse(withoutItems)).toThrow();
  });
});

describe('노드맵 번들 — 정본 SNAP 사본(H-4)', () => {
  it('고등·중등 번들이 스키마를 통과한다', () => {
    expect(() => nodemapBundleSchema.parse(highBundle)).not.toThrow();
    expect(() => nodemapBundleSchema.parse(middleBundle)).not.toThrow();
  });

  it('픽스처 번들은 version 이 fixture 이고 ID 접두가 X 다', () => {
    const parsed = nodemapBundleSchema.parse(fixtureBundle);
    expect(parsed.version).toBe('fixture');
    expect(parsed.mids.every((m) => m.id.startsWith('X'))).toBe(true);
  });

  it('중등 번들은 중위 단원이 없다 — 준비 중으로 연다', () => {
    expect(nodemapBundleSchema.parse(middleBundle).mids).toHaveLength(0);
  });
});
