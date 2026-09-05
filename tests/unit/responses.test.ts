import { describe, expect, it } from 'vitest';
import {
  lintResponses,
  normalizeResponses,
  toResponsesCsv,
} from '../../src/grading/responses';
import { BOM, parseCsv } from '../../src/folder/csv';
import { makeExam } from './helpers';

describe('R0 정규화', () => {
  it('3열형', () => {
    const r = normalizeResponses('student_id,item_no,answer_given\nS-2026-0001,1,3\n');
    expect(r.widened).toBe(false);
    expect(r.rows).toEqual([{ line: 1, student_id: 'S-2026-0001', item_no: 1, answer_given: '3' }]);
  });

  it('OMR 와이드형을 3열로 펼친다', () => {
    const r = normalizeResponses('student_id,1,2,3\nS-2026-0001,3,,5\n');
    expect(r.widened).toBe(true);
    expect(r.rows).toHaveLength(3);
    expect(r.rows[1]).toEqual({
      line: 1,
      student_id: 'S-2026-0001',
      item_no: 2,
      answer_given: '',
    });
  });

  it('헤더가 없어도 학생 ID 로 시작하면 3열로 읽는다', () => {
    const r = normalizeResponses('S-2026-0001,1,3\nS-2026-0002,1,4\n');
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]?.student_id).toBe('S-2026-0001');
  });

  it('탭 구분(엑셀 붙여넣기)도 읽는다', () => {
    const r = normalizeResponses('student_id\titem_no\tanswer_given\nS-2026-0001\t1\t3\n');
    expect(r.rows).toHaveLength(1);
  });

  it('BOM 이 붙어 있어도 읽는다', () => {
    const r = normalizeResponses(`${BOM}student_id,item_no,answer_given\nS-2026-0001,1,3\n`);
    expect(r.rows).toHaveLength(1);
  });

  it('알아볼 수 없는 헤더는 error 로 말한다', () => {
    const r = normalizeResponses('가,나,다\n1,2,3\n');
    expect(r.issues.some((i) => i.code === 'header')).toBe(true);
  });
});

describe('R0 인라인 lint', () => {
  const exam = makeExam();
  const roster = new Set(['S-2026-0001']);
  const formats = new Map([[1, 'mc5']]);

  it('중복 행을 잡는다', () => {
    const rows = normalizeResponses(
      'student_id,item_no,answer_given\nS-2026-0001,1,3\nS-2026-0001,1,4\n',
    ).rows;
    const issues = lintResponses({ rows, exam, rosterIds: roster, formatByItem: formats });
    expect(issues.some((i) => i.code === 'duplicate')).toBe(true);
  });

  it('mc5 답이 1~5 밖이면 error', () => {
    const rows = normalizeResponses('student_id,item_no,answer_given\nS-2026-0001,1,9\n').rows;
    const issues = lintResponses({ rows, exam, rosterIds: roster, formatByItem: formats });
    expect(issues.some((i) => i.code === 'mc5_range')).toBe(true);
  });

  it('빈 답(무응답)은 정상이다', () => {
    const rows = normalizeResponses('student_id,item_no,answer_given\nS-2026-0001,1,\n').rows;
    const issues = lintResponses({ rows, exam, rosterIds: roster, formatByItem: formats });
    expect(issues).toHaveLength(0);
  });
});

describe('responses.csv 쓰기', () => {
  it('BOM 과 3열 헤더로 쓴다', () => {
    const csv = toResponsesCsv([{ student_id: 'S-2026-0001', item_no: 1, answer_given: '3' }]);
    expect(csv.startsWith(BOM)).toBe(true);
    expect(parseCsv(csv).header).toEqual(['student_id', 'item_no', 'answer_given']);
  });
});
