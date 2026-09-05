import { parseCsv, toCsv, stripBom } from '../folder/csv';
import type { ExamJson } from '../folder/schemas/exam';
import { RESPONSES_CSV_HEADER, type ResponseRow } from '../folder/schemas/responses';

/**
 * R0 응답 정규화(리포트 기획 §2 · 규격 §4-2 · C-044).
 * 어느 경로로 들어와도 3열로 정규화한다. 점수 칸은 만들지 않는다.
 */

export interface NormalizedRow extends ResponseRow {
  /** 붙여넣은 원본에서의 행 번호(1-base, 헤더 제외) */
  line: number;
}

export interface RowIssue {
  line: number;
  level: 'error' | 'warning';
  code: string;
  message: string;
}

export interface NormalizeResult {
  rows: NormalizedRow[];
  issues: RowIssue[];
  /** 와이드형(OMR)에서 펼쳤는가 */
  widened: boolean;
}

const SID = 'student_id';
const ITEM = 'item_no';
const ANSWER = 'answer_given';

function looksLikeStudentId(value: string): boolean {
  return /^S-\d{4}-\d{4}$/.test(value.trim());
}

/**
 * 헤더 자동 인식.
 * - 3열형: student_id, item_no, answer_given
 * - 와이드형: student_id, 1, 2, ... N  → 3열로 펼친다
 * - 헤더 없음: 첫 행이 학생 ID 로 시작하면 3열형으로 간주하고 헤더를 붙인다
 */
export function normalizeResponses(text: string): NormalizeResult {
  const issues: RowIssue[] = [];
  const rows: NormalizedRow[] = [];
  const cleaned = stripBom(text).trim();
  if (cleaned.length === 0) return { rows, issues, widened: false };

  const parsed = parseCsv(cleaned);
  let header = parsed.header.map((h) => h.trim());
  let dataRows = parsed.rows;

  const headerless = looksLikeStudentId(header[0] ?? '');
  if (headerless) {
    dataRows = [header, ...dataRows];
    header = header.length >= 3 ? [SID, ITEM, ANSWER] : [SID];
  }

  const sidCol = header.indexOf(SID);
  const itemCol = header.indexOf(ITEM);
  const ansCol = header.indexOf(ANSWER);
  const isThreeColumn = sidCol >= 0 && itemCol >= 0 && ansCol >= 0;

  if (isThreeColumn) {
    dataRows.forEach((row, i) => {
      const line = i + 1;
      const sid = (row[sidCol] ?? '').trim();
      const rawNo = (row[itemCol] ?? '').trim();
      const itemNo = Number.parseInt(rawNo, 10);
      if (sid.length === 0 && rawNo.length === 0) return;
      if (!Number.isFinite(itemNo) || itemNo <= 0) {
        issues.push({
          line,
          level: 'error',
          code: 'item_no',
          message: `item_no 를 읽을 수 없습니다: ${rawNo}`,
        });
        return;
      }
      rows.push({ line, student_id: sid, item_no: itemNo, answer_given: (row[ansCol] ?? '').trim() });
    });
    return { rows, issues, widened: false };
  }

  // 와이드형: 첫 열이 학생 ID, 나머지 열 머리가 문항 번호
  const numericCols: { index: number; no: number }[] = [];
  header.forEach((name, index) => {
    const no = Number.parseInt(name, 10);
    if (index > 0 && Number.isFinite(no) && no > 0) numericCols.push({ index, no });
  });
  if (numericCols.length === 0) {
    issues.push({
      line: 0,
      level: 'error',
      code: 'header',
      message: '헤더를 알아볼 수 없습니다. student_id, item_no, answer_given 3열이나 OMR 와이드형을 붙여넣어 주세요.',
    });
    return { rows, issues, widened: false };
  }
  dataRows.forEach((row, i) => {
    const line = i + 1;
    const sid = (row[0] ?? '').trim();
    if (sid.length === 0) return;
    for (const col of numericCols) {
      rows.push({
        line,
        student_id: sid,
        item_no: col.no,
        answer_given: (row[col.index] ?? '').trim(),
      });
    }
  });
  return { rows, issues, widened: true };
}

export interface LintResponsesInput {
  rows: readonly NormalizedRow[];
  exam: ExamJson;
  rosterIds: ReadonlySet<string>;
  /** item_no → 문항 형식. mc5 는 1~5 만 허용한다. */
  formatByItem: ReadonlyMap<number, string>;
}

/**
 * R0 인라인 lint(L-06 + 중복 행 + mc5 선지 범위).
 * error 행이 남아 있으면 화면이 「판정」을 막는다.
 */
export function lintResponses(input: LintResponsesInput): RowIssue[] {
  const issues: RowIssue[] = [];
  const itemNos = new Set(input.exam.items.map((i) => i.no));
  const seen = new Set<string>();
  for (const row of input.rows) {
    if (!input.rosterIds.has(row.student_id)) {
      issues.push({
        line: row.line,
        level: 'error',
        code: 'L-06',
        message: `명부에 없는 student_id: ${row.student_id}`,
      });
    }
    if (!itemNos.has(row.item_no)) {
      issues.push({
        line: row.line,
        level: 'error',
        code: 'L-06',
        message: `이 시험에 없는 item_no: ${row.item_no}`,
      });
    }
    const key = `${row.student_id}#${row.item_no}`;
    if (seen.has(key)) {
      issues.push({
        line: row.line,
        level: 'error',
        code: 'duplicate',
        message: `같은 학생·문항이 두 번 있습니다: ${row.student_id} / ${row.item_no}`,
      });
    }
    seen.add(key);
    const format = input.formatByItem.get(row.item_no);
    if (
      (format === 'mc5' || format === 'combo') &&
      row.answer_given.length > 0 &&
      !/^[1-5]$/.test(row.answer_given)
    ) {
      issues.push({
        line: row.line,
        level: 'error',
        code: 'mc5_range',
        message: `선택형 문항의 답이 1~5 가 아닙니다: ${row.answer_given}`,
      });
    }
  }
  return issues;
}

/** 규격 §4-2 responses.csv (UTF-8 BOM · 3열) */
export function toResponsesCsv(rows: readonly ResponseRow[]): string {
  return toCsv(
    RESPONSES_CSV_HEADER,
    rows.map((r) => [r.student_id, String(r.item_no), r.answer_given]),
  );
}
