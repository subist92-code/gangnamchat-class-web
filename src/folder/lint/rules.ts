import { walk, type FolderEntry } from '../FolderAdapter';
import { parseCsv } from '../csv';
import { ROOT } from '../paths';
import { classJsonSchema } from '../schemas/classJson';
import { examJsonSchema } from '../schemas/exam';
import { STUDENTS_CSV_REQUIRED, studentRowSchema } from '../schemas/students';
import type { LintContext, LintFinding, LintRule } from './types';

/** `_임시/` 는 lint 대상 아님(L-16) — 구조 규칙은 통째로 건너뛴다. */
const skipTmp = (entry: FolderEntry): boolean =>
  entry.path === ROOT.tmp || entry.path.startsWith(`${ROOT.tmp}/`);

const L01: LintRule = {
  code: 'L-01',
  level: 'error',
  title: 'class.json 존재 · spec 판본이 도구 판본 이하',
  implemented: true,
  run: async ({ adapter }: LintContext): Promise<LintFinding[]> => {
    if (!(await adapter.exists(ROOT.classJson))) {
      return [
        {
          code: 'L-01',
          level: 'error',
          message: '클래스 폴더가 아닙니다 — class.json 이 없습니다.',
          path: ROOT.classJson,
        },
      ];
    }
    try {
      classJsonSchema.parse(JSON.parse(await adapter.read(ROOT.classJson)));
    } catch (err) {
      return [
        {
          code: 'L-01',
          level: 'error',
          message: `class.json 을 읽을 수 없습니다: ${(err as Error).message}`,
          path: ROOT.classJson,
        },
      ];
    }
    return [];
  },
};

const L02: LintRule = {
  code: 'L-02',
  level: 'error',
  title: '명부/students.csv 존재 · 필수 열 · student_id 형식과 유일성',
  implemented: true,
  run: async ({ adapter }: LintContext): Promise<LintFinding[]> => {
    if (!(await adapter.exists(ROOT.rosterCsv))) {
      return [
        {
          code: 'L-02',
          level: 'error',
          message: '명부/students.csv 가 없습니다.',
          path: ROOT.rosterCsv,
        },
      ];
    }
    const out: LintFinding[] = [];
    const { header, rows } = parseCsv(await adapter.read(ROOT.rosterCsv));
    for (const col of STUDENTS_CSV_REQUIRED) {
      if (!header.includes(col)) {
        out.push({
          code: 'L-02',
          level: 'error',
          message: `명부에 필수 열 ${col} 이 없습니다.`,
          path: ROOT.rosterCsv,
        });
      }
    }
    if (out.length > 0) return out;
    const seen = new Set<string>();
    rows.forEach((row, i) => {
      const record = Object.fromEntries(header.map((h, idx) => [h, row[idx] ?? '']));
      const parsed = studentRowSchema.safeParse(record);
      if (!parsed.success) {
        out.push({
          code: 'L-02',
          level: 'error',
          message: `${i + 2}행: ${parsed.error.issues[0]?.message ?? '형식 오류'}`,
          path: ROOT.rosterCsv,
        });
        return;
      }
      if (seen.has(parsed.data.student_id)) {
        out.push({
          code: 'L-02',
          level: 'error',
          message: `${i + 2}행: student_id 중복 ${parsed.data.student_id}`,
          path: ROOT.rosterCsv,
        });
      }
      seen.add(parsed.data.student_id);
    });
    return out;
  },
};

const DATE_PREFIX = /^\d{4}-\d{2}-\d{2}_/;

const L03: LintRule = {
  code: 'L-03',
  level: 'error',
  title: '시험·숙제 폴더명 날짜 프리픽스',
  implemented: true,
  run: async ({ adapter }: LintContext): Promise<LintFinding[]> => {
    const out: LintFinding[] = [];
    for (const base of [ROOT.exams, ROOT.homework]) {
      for (const entry of await adapter.list(base)) {
        if (entry.kind !== 'directory') continue;
        if (DATE_PREFIX.test(entry.name)) continue;
        // 상위 묶음(2026/09/)은 시험·숙제 폴더 안쪽으로만 허용 — 한 겹 더 본다.
        const inner = await adapter.list(entry.path);
        const hasDatedChild = inner.some(
          (c) => c.kind === 'directory' && DATE_PREFIX.test(c.name),
        );
        if (hasDatedChild) {
          for (const child of inner) {
            if (child.kind === 'directory' && !DATE_PREFIX.test(child.name)) {
              out.push({
                code: 'L-03',
                level: 'error',
                message: `날짜 프리픽스(YYYY-MM-DD_)가 없습니다: ${child.name}`,
                path: child.path,
              });
            }
          }
          continue;
        }
        out.push({
          code: 'L-03',
          level: 'error',
          message: `날짜 프리픽스(YYYY-MM-DD_)가 없습니다: ${entry.name}`,
          path: entry.path,
        });
      }
    }
    return out;
  },
};

const L06: LintRule = {
  code: 'L-06',
  level: 'error',
  title: 'responses.csv 의 student_id 가 명부에 있고 item_no 가 exam.items 에 있다',
  implemented: true,
  run: async ({ adapter }: LintContext): Promise<LintFinding[]> => {
    const out: LintFinding[] = [];
    const roster = new Set<string>();
    if (await adapter.exists(ROOT.rosterCsv)) {
      const { header, rows } = parseCsv(await adapter.read(ROOT.rosterCsv));
      const col = header.indexOf('student_id');
      if (col >= 0) for (const row of rows) roster.add(row[col] ?? '');
    }
    for (const entry of await walk(adapter, ROOT.exams, skipTmp)) {
      if (entry.kind !== 'file' || entry.name !== 'responses.csv') continue;
      const dir = entry.path.slice(0, entry.path.length - '/responses.csv'.length);
      const examPath = `${dir}/exam.json`;
      if (!(await adapter.exists(examPath))) continue;
      const exam = examJsonSchema.safeParse(JSON.parse(await adapter.read(examPath)));
      if (!exam.success) continue;
      const itemNos = new Set(exam.data.items.map((i) => i.no));
      const { header, rows } = parseCsv(await adapter.read(entry.path));
      const sidCol = header.indexOf('student_id');
      const noCol = header.indexOf('item_no');
      rows.forEach((row, i) => {
        const sid = sidCol >= 0 ? (row[sidCol] ?? '') : '';
        const rawNo = noCol >= 0 ? (row[noCol] ?? '') : '';
        if (!roster.has(sid)) {
          out.push({
            code: 'L-06',
            level: 'error',
            message: `${i + 2}행: 명부에 없는 student_id ${sid}`,
            path: entry.path,
          });
        }
        if (!itemNos.has(Number.parseInt(rawNo, 10))) {
          out.push({
            code: 'L-06',
            level: 'error',
            message: `${i + 2}행: exam.items 에 없는 item_no ${rawNo}`,
            path: entry.path,
          });
        }
      });
    }
    return out;
  },
};

/**
 * L-11 키 패턴(H-2 · C-046) — 폴더 어디에도 API 키 접두 문자열 0.
 * 릴리스마다 양성 대조 픽스처로 살아 있음을 증명한다(0건은 깨끗함이 아니다).
 *
 * 규격 v0.4 후보: L-16 은 `_임시/`를 lint 대상에서 뺐지만 키 유출 방어는 헌법급(H-2)이라
 * 이 규칙만은 `_임시/`도 훑는다. 구조 규칙(L-01~L-06)은 규격대로 건너뛴다.
 *
 * 패턴 문자열을 소스에 통째로 적지 않는다 — 이 파일 자신이 검사에 걸리지 않게.
 */
const KEY_PATTERN = ['sk', 'ant', ''].join('-');

const L11: LintRule = {
  code: 'L-11',
  level: 'error',
  title: '폴더 어디에도 API 키 패턴 0',
  implemented: true,
  run: async ({ adapter }: LintContext): Promise<LintFinding[]> => {
    const out: LintFinding[] = [];
    for (const entry of await walk(adapter)) {
      if (entry.kind !== 'file') continue;
      let text: string;
      try {
        text = await adapter.read(entry.path);
      } catch {
        continue;
      }
      if (text.includes(KEY_PATTERN)) {
        out.push({
          code: 'L-11',
          level: 'error',
          message: 'API 키 패턴이 폴더 안에서 발견되었습니다 — 즉시 확인하세요.',
          path: entry.path,
        });
      }
    }
    return out;
  },
};

/** 자리만 등록된 규칙 — 다음 국면에서 구현(지시서 §2-7) */
const TODO_RULES: LintRule[] = [
  { code: 'L-04', level: 'error', title: '문항 JSON 필수 키 · decoys 5키', implemented: false },
  { code: 'L-05', level: 'warning', title: 'short 문항 expected_wrong_answers', implemented: false },
  { code: 'L-07', level: 'warning', title: '리포트 JSON 과 md 짝', implemented: false },
  { code: 'L-08', level: 'warning', title: 'exam.items.problem_id 존재 · usage 역참조', implemented: false },
  { code: 'L-09', level: 'info', title: 'index.json 재생성', implemented: false },
  { code: 'L-10', level: 'warning', title: 'nodemap_version 불일치', implemented: false },
  { code: 'L-12', level: 'warning', title: 'difficulty.reason 존재와 250자 상한', implemented: false },
  { code: 'L-13', level: 'error', title: '숨은조건 인용문이 본문에 없을 것', implemented: false },
  { code: 'L-14', level: 'error', title: 'course 와 nodes.sub 가 과정 번들 안', implemented: false },
  { code: 'L-15', level: 'warning', title: 'twin.group 역기록은 선생 확인 후', implemented: false },
  { code: 'L-16', level: 'info', title: '_임시/ 정리 제안 · _대화/ 프롬프트 본문 0', implemented: false },
  { code: 'L-17', level: 'error', title: 'nodes.mid null 이면 D노드 단독', implemented: false },
];

export const rules: readonly LintRule[] = [L01, L02, L03, L06, L11, ...TODO_RULES];
