import { walk, type FolderAdapter } from './FolderAdapter';
import { parseCsv } from './csv';
import { ROOT } from './paths';
import { examJsonSchema, type ExamJson } from './schemas/exam';
import { problemJsonSchema } from './schemas/problem';
import type { ProblemEntry } from '../grading/judge';

/** 시험/**\/exam.json 재귀 탐색(규격 §1) */
export interface FoundExam {
  dir: string;
  exam: ExamJson;
  hasAttempts: boolean;
}

export async function findExams(adapter: FolderAdapter): Promise<FoundExam[]> {
  const out: FoundExam[] = [];
  for (const entry of await walk(adapter, ROOT.exams)) {
    if (entry.kind !== 'file' || entry.name !== 'exam.json') continue;
    const dir = entry.path.slice(0, entry.path.length - '/exam.json'.length);
    try {
      const exam = examJsonSchema.parse(JSON.parse(await adapter.read(entry.path)));
      const siblings = await adapter.list(dir);
      const hasAttempts = siblings.some(
        (s) => s.kind === 'file' && s.name.startsWith('attempts') && s.name.endsWith('.json'),
      );
      out.push({ dir, exam, hasAttempts });
    } catch {
      // 형식이 어긋난 exam.json 은 lint 가 말한다 — 여기서는 조용히 건너뛴다.
    }
  }
  return out;
}

/** 문제함에서 문항 JSON 을 모은다. _노드밖/ 아래 문항은 표시해 둔다(C-066 ⑤). */
export async function loadProblems(
  adapter: FolderAdapter,
  problemIds: readonly string[],
): Promise<Map<string, ProblemEntry>> {
  const wanted = new Set(problemIds);
  const found = new Map<string, ProblemEntry>();
  for (const entry of await walk(adapter, ROOT.bank)) {
    if (entry.kind !== 'file' || !entry.name.endsWith('.json')) continue;
    const id = entry.name.replace(/\.json$/, '');
    if (!wanted.has(id)) continue;
    try {
      const problem = problemJsonSchema.parse(JSON.parse(await adapter.read(entry.path)));
      found.set(id, {
        problem,
        outOfScope: entry.path.startsWith(`${ROOT.bankOutOfScope}/`),
      });
    } catch {
      // 읽히지 않는 문항은 판정에서 빠진다 — 화면이 건수를 말한다.
    }
  }
  return found;
}

export async function readRosterIds(adapter: FolderAdapter): Promise<Set<string>> {
  const ids = new Set<string>();
  if (!(await adapter.exists(ROOT.rosterCsv))) return ids;
  const { header, rows } = parseCsv(await adapter.read(ROOT.rosterCsv));
  const col = header.indexOf('student_id');
  if (col < 0) return ids;
  for (const row of rows) {
    const value = (row[col] ?? '').trim();
    if (value.length > 0) ids.add(value);
  }
  return ids;
}
