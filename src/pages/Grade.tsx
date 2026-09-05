import { useEffect, useMemo, useState } from 'react';
import { findExams, loadProblems, readRosterIds, type FoundExam } from '../folder/bank';
import { attemptsStamp, examAttemptsPath, examResponsesPath } from '../folder/paths';
import {
  lintResponses,
  normalizeResponses,
  toResponsesCsv,
  type NormalizedRow,
  type RowIssue,
} from '../grading/responses';
import { judge, summarize } from '../grading/judge';
import type { AttemptsJson } from '../folder/schemas/attempts';
import { useSession } from '../store/session';
import { Button, Card, Notice } from '../ui/parts';

/**
 * 리-1 채점 입력 — R0 정규화 + R1 판정.
 * 점수 입력 칸은 만들지 않는다(C-044). 판정은 전부 코드가 한다(모델 호출 0).
 */
export function GradePage() {
  const { adapter } = useSession();
  const [exams, setExams] = useState<FoundExam[]>([]);
  const [selected, setSelected] = useState('');
  const [pasted, setPasted] = useState('');
  const [rows, setRows] = useState<NormalizedRow[]>([]);
  const [parseIssues, setParseIssues] = useState<RowIssue[]>([]);
  const [rosterIds, setRosterIds] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<AttemptsJson | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedTo, setSavedTo] = useState<string[]>([]);
  const [missingProblems, setMissingProblems] = useState<string[]>([]);

  useEffect(() => {
    if (adapter === null) return;
    void findExams(adapter).then(setExams);
    void readRosterIds(adapter).then(setRosterIds);
  }, [adapter]);

  const exam = useMemo(() => exams.find((e) => e.dir === selected) ?? null, [exams, selected]);

  const issues = useMemo(() => {
    if (exam === null) return parseIssues;
    const formatByItem = new Map(exam.exam.items.map((i) => [i.no, i.format as string]));
    return [...parseIssues, ...lintResponses({ rows, exam: exam.exam, rosterIds, formatByItem })];
  }, [parseIssues, rows, exam, rosterIds]);

  const errorCount = issues.filter((i) => i.level === 'error').length;

  const parse = () => {
    setError(null);
    setResult(null);
    setSavedTo([]);
    if (exam === null) {
      setError('시험을 먼저 고르세요.');
      return;
    }
    const normalized = normalizeResponses(pasted);
    setRows(normalized.rows);
    setParseIssues(normalized.issues);
  };

  const editRow = (line: number, patch: Partial<NormalizedRow>) => {
    setRows((prev) => prev.map((r) => (r.line === line ? { ...r, ...patch } : r)));
  };

  const runJudge = async () => {
    if (adapter === null || exam === null) return;
    setError(null);
    try {
      const problems = await loadProblems(
        adapter,
        exam.exam.items.map((i) => i.problem_id),
      );
      setMissingProblems(
        exam.exam.items.map((i) => i.problem_id).filter((id) => !problems.has(id)),
      );
      const judged = judge({ exam: exam.exam, responses: rows, problems });
      setResult(judged);

      const responsesPath = examResponsesPath(exam.dir);
      if (await adapter.exists(responsesPath)) {
        const ok = window.confirm(`${responsesPath} 가 이미 있습니다. 덮어쓸까요?`);
        if (!ok) return;
      }
      await adapter.write(responsesPath, toResponsesCsv(rows));
      const attemptsPath = examAttemptsPath(exam.dir, attemptsStamp());
      await adapter.write(attemptsPath, `${JSON.stringify(judged, null, 2)}\n`);
      const examPath = `${exam.dir}/exam.json`;
      await adapter.write(
        examPath,
        `${JSON.stringify({ ...exam.exam, status: 'graded' }, null, 2)}\n`,
      );
      setSavedTo([responsesPath, attemptsPath, examPath]);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const summary = result === null ? null : summarize(result);

  return (
    <div className="flex flex-col gap-4">
      {error !== null && <Notice tone="error">{error}</Notice>}

      <Card title="리-1 채점 입력">
        <label className="flex flex-col text-xs text-stone-600">
          시험
          <select
            className="mt-1 w-full rounded border border-stone-300 px-2 py-1 text-sm"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">고르세요</option>
            {exams.map((e) => (
              <option key={e.dir} value={e.dir}>
                {e.exam.date} {e.exam.title} · {e.exam.class_ref}
                {e.hasAttempts ? '' : ' (채점 안 됨)'}
              </option>
            ))}
          </select>
        </label>
        {exams.length === 0 && (
          <p className="mt-2 text-xs text-stone-500">
            시험/ 아래에 exam.json 이 있는 폴더가 없습니다.
          </p>
        )}

        <label className="mt-3 flex flex-col text-xs text-stone-600">
          응답 붙여넣기 (CSV · TSV)
          <textarea
            className="mt-1 h-40 w-full rounded border border-stone-300 p-2 font-mono text-xs"
            data-testid="responses-paste"
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder={'student_id,item_no,answer_given\nS-2026-0017,1,3'}
          />
          <span className="mt-1 text-stone-500">
            3열형 또는 OMR 와이드형(student_id, 1, 2, …)을 받습니다. xlsx 파일은 다음 국면입니다.
          </span>
        </label>

        <div className="mt-3 flex items-center gap-2">
          <Button onClick={parse}>읽기</Button>
          <Button onClick={() => void runJudge()} disabled={rows.length === 0 || errorCount > 0}>
            판정
          </Button>
          {errorCount > 0 && (
            <span className="text-xs text-chart-actual">
              error {errorCount}건을 먼저 고쳐야 판정할 수 있습니다.
            </span>
          )}
        </div>
      </Card>

      {rows.length > 0 && (
        <Card title={`응답 ${rows.length}행`}>
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-white text-stone-500">
                <tr>
                  <th className="py-1">행</th>
                  <th>student_id</th>
                  <th>item_no</th>
                  <th>answer_given</th>
                  <th>검사</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const rowIssues = issues.filter((issue) => issue.line === row.line);
                  return (
                    <tr key={`${row.line}-${row.item_no}-${i}`} className="border-t border-stone-100">
                      <td className="py-1">{row.line}</td>
                      <td>
                        <input
                          className="w-32 rounded border border-stone-200 px-1"
                          value={row.student_id}
                          onChange={(e) => editRow(row.line, { student_id: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          className="w-14 rounded border border-stone-200 px-1"
                          value={row.item_no}
                          onChange={(e) =>
                            editRow(row.line, { item_no: Number.parseInt(e.target.value, 10) || 0 })
                          }
                        />
                      </td>
                      <td>
                        <input
                          className="w-20 rounded border border-stone-200 px-1"
                          value={row.answer_given}
                          onChange={(e) => editRow(row.line, { answer_given: e.target.value })}
                        />
                      </td>
                      <td className="text-chart-actual">
                        {rowIssues.map((issue) => issue.message).join(' · ')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-stone-500">
            빈 answer_given 은 무응답입니다(정상). 점수 칸은 없습니다 — 정오와 점수는 도구가 계산합니다.
          </p>
        </Card>
      )}

      {summary !== null && (
        <Card title="판정 요약">
          <dl className="grid grid-cols-[10rem_1fr] gap-y-1 text-sm">
            <dt>학생 수</dt>
            <dd>{summary.students}</dd>
            <dt>문항 수</dt>
            <dd>{summary.items}</dd>
            <dt>정답 / 오답</dt>
            <dd>
              {summary.correct} / {summary.wrong}
            </dd>
            <dt>unmapped</dt>
            <dd>
              {summary.unmapped}
              <span className="ml-2 text-xs text-stone-500">
                미끼 좌석이 없는 문항의 오답 — 신호 분모에서 빠집니다.
              </span>
            </dd>
            <dt>teacher_only</dt>
            <dd>
              {summary.teacherOnly}
              <span className="ml-2 text-xs text-stone-500">선생 검증만 된 문항</span>
            </dd>
          </dl>
          {missingProblems.length > 0 && (
            <Notice tone="warn">
              문제함에서 찾지 못한 문항 {missingProblems.length}개: {missingProblems.join(', ')} —
              이 문항의 응답은 판정에서 빠졌습니다.
            </Notice>
          )}
          {savedTo.length > 0 && (
            <ul className="mt-3 list-disc pl-5 text-xs text-stone-600">
              {savedTo.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex items-center gap-3">
            <Button disabled title="리포트는 다음 국면">
              리포트로
            </Button>
            <span className="text-xs text-stone-600">리포트(R2 이후)는 다음 국면입니다.</span>
          </div>
        </Card>
      )}
    </div>
  );
}
