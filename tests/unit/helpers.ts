import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { MemoryFolderAdapter } from '../../src/folder/memoryAdapter';
import type { ProblemJson } from '../../src/folder/schemas/problem';
import type { ExamJson } from '../../src/folder/schemas/exam';

const FIXTURES = join(process.cwd(), 'tests', 'fixtures');

function collect(dir: string, base: string, out: Record<string, string>): void {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) collect(full, base, out);
    else out[relative(base, full).split(sep).join('/')] = readFileSync(full, 'utf8');
  }
}

/** 디스크의 픽스처 폴더를 메모리 어댑터로 올린다. */
export function fixtureAdapter(name: string): MemoryFolderAdapter {
  const base = join(FIXTURES, name);
  const files: Record<string, string> = {};
  collect(base, base, files);
  return new MemoryFolderAdapter(name, files);
}

export function fixtureText(relPath: string): string {
  return readFileSync(join(FIXTURES, relPath), 'utf8');
}

/** 최소 유효 문항 — 각 테스트가 필요한 부분만 덮어쓴다. */
export function makeProblem(overrides: Partial<ProblemJson> = {}): ProblemJson {
  const base: ProblemJson = {
    spec: 'gc-class-problem/0.1',
    problem_id: 'Q-2026-0001',
    source: {
      kind: 'converted',
      input: 'photo',
      seed_problem_id: null,
      transcription: null,
      original_choices: null,
      note: '',
    },
    course: 'high',
    nodes: { mid: 'X01', sub: ['X01-1'], nodemap_version: 'fixture' },
    difficulty: { level: 3, basis: 'teacher', band_hint: null, reason: null },
    format: { type: 'mc5', omr_integer: true, track: 1 },
    problem_text: '문항 본문',
    svg_visual: null,
    choices: ['1', '2', '3', '4', '5'],
    answer: { index: 3, value: null },
    expected_wrong_answers: [],
    solution: { text: '풀이', kernel_sentence: null },
    decoys: {
      '1': {
        path: '부호를 뒤집었다',
        error_code: 'calculation_error',
        node: 'X01-1',
        axis: 'execution',
      },
      '2': {
        path: '정의를 혼동했다',
        error_code: 'concept_confusion',
        node: 'X01-1',
        axis: 'misconception',
        misconception: { category: 'I', category_label: '픽스처대분류', mc_id: 'MC-001' },
      },
      '3': 'correct',
      '4': {
        path: '조건을 빠뜨렸다',
        error_code: 'misreading',
        node: 'X01-1',
        axis: 'execution',
      },
      '5': {
        path: '개념이 없다',
        error_code: 'concept_missing',
        node: 'X01-1',
        axis: 'misconception',
      },
    },
    killer: { is_killer: false, trap_type: null, time_strategy_note: null },
    twin: { group: null, level: 1 },
    verification: {
      cas: { status: 'pass', checks: ['answer'], engine: 'sympy', at: null, report_ref: null },
      teacher: { approved: true, at: null, note: '' },
      grade: 'cas+teacher',
    },
    processing_depth: 'full',
    usage: { exams: [], homeworks: [] },
    donation: { status: 'none', donation_id: null, sent_at: null, consent_version: null },
    created_at: '2026-09-05T10:00:00+09:00',
    updated_at: '2026-09-05T10:00:00+09:00',
    tool_version: '0.1.0',
  };
  return { ...base, ...overrides };
}

export function makeExam(overrides: Partial<ExamJson> = {}): ExamJson {
  const base: ExamJson = {
    spec: 'gc-class-exam/0.1',
    exam_id: 'E-2026-0001',
    title: '픽스처 시험',
    class_ref: '2026-2_고2A',
    date: '2026-09-01',
    time_limit_min: 50,
    items: [{ no: 1, problem_id: 'Q-2026-0001', points: 3, format: 'mc5', is_killer: false }],
    scope: { mid_nodes: ['X01'], difficulty_ladder: [3] },
    watermark: true,
    generated_at: '2026-09-01T09:00:00+09:00',
    status: 'printed',
  };
  return { ...base, ...overrides };
}
