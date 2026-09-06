import type { FolderAdapter } from './FolderAdapter';
import { saveClassFolder } from './classFolder';
import { toCsv } from './csv';
import { ROOT } from './paths';
import type { Course } from './schemas/common';
import type { ClassJson } from './schemas/classJson';

/**
 * 반 등록(지시서 02 §5 · 폴더 규격 §2-1 · §2-3 · C-058 · A-3).
 *
 * 반은 두 곳에 산다 — `class.json.classes[<반>]` 과 `명부/반/<반>.csv`.
 * 한쪽만 있으면 반쪽이다. 그래서 등록은 둘을 함께 만든다.
 *
 * CSV 헤더는 `student_id, seat_no` 뿐이다. 생년월일 · 연락처 · 학교명은 규격에 없고,
 * 도구가 만들지도 읽지도 않는다.
 */

export const CLASS_CSV_HEADER = ['student_id', 'seat_no'] as const;

export function classCsvPath(className: string): string {
  return `${ROOT.rosterClasses}/${className}.csv`;
}

/**
 * 반 이름 제안 — `<YYYY-학기>_<반>`.
 *
 * ★ 이 템플릿은 `class.json.naming` 에 자리가 없다(규격 v0.3 의 naming 은 시험 · 숙제 ·
 *   노드 폴더뿐이다). 그래서 코드가 **제안만** 하고 값은 자유 입력으로 둔다.
 *   naming 에 항목을 더하는 것은 규격 변경이라 여기서 하지 않는다.
 */
export function suggestClassName(now = new Date(), label = ''): string {
  const year = now.getFullYear();
  const term = now.getMonth() + 1 <= 6 ? 1 : 2;
  return `${year}-${term}_${label}`;
}

/** 반 이름에 쓸 수 없는 글자 — 폴더·파일 이름이 되기 때문이다. */
const FORBIDDEN = /[\\/:*?"<>|]/;

export function classNameProblem(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) return '반 이름을 적어 주세요.';
  if (FORBIDDEN.test(trimmed)) return '반 이름에 \\ / : * ? " < > | 는 쓸 수 없습니다.';
  if (trimmed.startsWith('.')) return '반 이름은 점으로 시작할 수 없습니다.';
  return null;
}

export interface RegisterResult {
  classJson: ClassJson;
  /** 이미 있던 반이면 false — 덮어쓰지 않는다. */
  created: boolean;
}

/**
 * 반을 등록한다. 이미 있으면 그대로 두고 `created: false` 를 돌려준다 —
 * 같은 이름을 다시 넣었다고 명부 CSV 를 비우면 안 된다.
 */
export async function registerClass(
  adapter: FolderAdapter,
  classJson: ClassJson,
  params: { name: string; course: Course },
): Promise<RegisterResult> {
  const problem = classNameProblem(params.name);
  if (problem !== null) throw new Error(problem);

  const name = params.name.trim();
  const already = classJson.classes[name] !== undefined;

  const next: ClassJson = already
    ? classJson
    : { ...classJson, classes: { ...classJson.classes, [name]: { course: params.course } } };

  if (!already) await saveClassFolder(adapter, next);

  const path = classCsvPath(name);
  if (!(await adapter.exists(path))) {
    await adapter.mkdir(ROOT.rosterClasses);
    await adapter.write(path, toCsv(CLASS_CSV_HEADER, []));
  }

  return { classJson: next, created: !already };
}

export interface ClassRow {
  name: string;
  course: Course;
}

export function listClasses(classJson: ClassJson): ClassRow[] {
  return Object.entries(classJson.classes)
    .map(([name, value]) => ({ name, course: value.course }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** 반의 과정 — 등록되지 않은 반이면 묶음 기본값을 따른다. */
export function courseOf(classJson: ClassJson, className: string): Course {
  return classJson.classes[className.trim()]?.course ?? classJson.course_default;
}
