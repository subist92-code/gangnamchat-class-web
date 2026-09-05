import { limits } from '../config/limits';
import type { Attempt, AttemptsJson } from '../folder/schemas/attempts';
import type { ExamJson } from '../folder/schemas/exam';
import type { DecoySeat, ProblemJson } from '../folder/schemas/problem';
import type { ResponseRow } from '../folder/schemas/responses';

/**
 * R1 판정 — 순수 함수(리포트 기획 §2 · 규격 §4-3 · C-037 · C-045 · C-069 ①).
 * 판정은 전부 코드가 한다. 모델 호출 0.
 */

export interface ProblemEntry {
  problem: ProblemJson;
  /** 문제함/_노드밖/ 에 있는 문항인가(C-066 ⑤) */
  outOfScope?: boolean;
}

export interface JudgeInput {
  exam: ExamJson;
  responses: readonly ResponseRow[];
  problems: ReadonlyMap<string, ProblemEntry>;
}

/** 단답 정규화 — 공백·전각 제거 */
export function normalizeShortAnswer(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .trim();
}

/**
 * 미끼 좌석이 있는 문항인가.
 * 좌석이 없으면 오답은 none 이 아니라 unmapped 다 — 신호 분모에서 빠진다(C-069 ①).
 */
export function hasDecoySeats(entry: ProblemEntry): boolean {
  const { problem } = entry;
  if (entry.outOfScope === true) return false;
  if (problem.format.track === 2) return false;
  if (problem.processing_depth === 'index_only') return false;
  if (problem.decoys === undefined) return false;
  return Object.keys(problem.decoys).length > 0;
}

function seatAt(problem: ProblemJson, key: string): DecoySeat | null {
  const seat = problem.decoys?.[key];
  if (seat === undefined || seat === 'correct') return null;
  return seat;
}

function isCorrect(problem: ProblemJson, answerGiven: string): boolean {
  if (answerGiven.length === 0) return false;
  if (problem.format.type === 'short' || problem.format.type === 'essay') {
    if (problem.answer.value === null) return false;
    return normalizeShortAnswer(answerGiven) === normalizeShortAnswer(problem.answer.value);
  }
  if (problem.answer.index === null) return false;
  return answerGiven.trim() === String(problem.answer.index);
}

/** 단답 미끼값 대조 → decoy_ref 로 decoys lookup(판정 순서 ②) */
function decoyValueSeat(problem: ProblemJson, answerGiven: string): DecoySeat | null {
  const given = normalizeShortAnswer(answerGiven);
  for (const expected of problem.expected_wrong_answers) {
    if (normalizeShortAnswer(expected.value) === given) {
      return seatAt(problem, expected.decoy_ref);
    }
  }
  return null;
}

function fromSeat(seat: DecoySeat): Pick<Attempt, 'error_code' | 'node' | 'axis' | 'mc_id'> {
  return {
    error_code: seat.error_code,
    node: seat.node,
    axis: seat.axis,
    mc_id: seat.misconception?.mc_id ?? null,
  };
}

const EMPTY_SIGNAL: Pick<Attempt, 'error_code' | 'node' | 'axis' | 'mc_id'> = {
  error_code: null,
  node: null,
  axis: null,
  mc_id: null,
};

export function judgeOne(
  entry: ProblemEntry,
  itemNo: number,
  studentId: string,
  answerGiven: string,
): Attempt {
  const { problem } = entry;
  const correct = isCorrect(problem, answerGiven);
  // 킬러는 보조 태그로만 병기한다 — 판정 순서를 바꾸지 않는다(C-037).
  const base = {
    student_id: studentId,
    item_no: itemNo,
    problem_id: problem.problem_id,
    answer_given: answerGiven,
    is_correct: correct,
    killer_tag: problem.killer.is_killer,
    verification_grade: problem.verification.grade,
  };

  if (correct) {
    return { ...base, ...EMPTY_SIGNAL, error_source: null };
  }
  if (!hasDecoySeats(entry)) {
    return { ...base, ...EMPTY_SIGNAL, error_source: 'unmapped' };
  }

  const distractor = seatAt(problem, answerGiven.trim());
  if (distractor !== null) {
    return { ...base, ...fromSeat(distractor), error_source: 'distractor' };
  }
  const byValue = decoyValueSeat(problem, answerGiven);
  if (byValue !== null) {
    return { ...base, ...fromSeat(byValue), error_source: 'decoy_value' };
  }
  return { ...base, ...EMPTY_SIGNAL, error_source: 'none' };
}

export function judge(input: JudgeInput, judgedAt = new Date()): AttemptsJson {
  const itemByNo = new Map(input.exam.items.map((item) => [item.no, item]));
  const attempts: Attempt[] = [];
  for (const row of input.responses) {
    const item = itemByNo.get(row.item_no);
    if (item === undefined) continue;
    const entry = input.problems.get(item.problem_id);
    if (entry === undefined) continue;
    attempts.push(judgeOne(entry, row.item_no, row.student_id, row.answer_given));
  }
  return {
    spec: 'gc-class-attempts/0.1',
    exam_id: input.exam.exam_id,
    judged_at: judgedAt.toISOString(),
    tool_version: limits.toolVersion,
    attempts,
  };
}

export interface JudgeSummary {
  students: number;
  items: number;
  correct: number;
  wrong: number;
  unmapped: number;
  teacherOnly: number;
}

/** 화면 요약 — unmapped·teacher_only 건수를 숨기지 않는다(§5-2). */
export function summarize(result: AttemptsJson): JudgeSummary {
  const students = new Set(result.attempts.map((a) => a.student_id));
  const items = new Set(result.attempts.map((a) => a.item_no));
  return {
    students: students.size,
    items: items.size,
    correct: result.attempts.filter((a) => a.is_correct).length,
    wrong: result.attempts.filter((a) => !a.is_correct).length,
    unmapped: result.attempts.filter((a) => a.error_source === 'unmapped').length,
    teacherOnly: result.attempts.filter((a) => a.verification_grade === 'teacher_only').length,
  };
}
