import { limits } from '../config/limits';
import { loadBundle } from '../nodemap/loader';
import { bundleVersionLabel } from '../nodemap/types';
import { type FolderAdapter, sha256Hex, walk } from './FolderAdapter';
import { toCsv, parseCsv } from './csv';
import { formatId, type IdKind, nextSequence } from './ids';
import { ROOT, SCAFFOLD_DIRS } from './paths';
import { classJsonSchema, type ClassJson } from './schemas/classJson';
import type { Course } from './schemas/common';
import { STUDENTS_CSV_HEADER } from './schemas/students';

export interface NewClassOptions {
  academyName: string;
  teacherAlias: string;
  courseDefault: Course;
  /** 픽스처 번들로 열 때만 true — 문항 저장을 막는다(자리 A) */
  useFixtureBundle?: boolean;
  fixtureBundleVersion?: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

/** 「새 클래스 폴더」 — class.json + 명부 헤더 + 4구역 + `_임시/`(§2-7) */
export async function createClassFolder(
  adapter: FolderAdapter,
  options: NewClassOptions,
): Promise<ClassJson> {
  if (await adapter.exists(ROOT.classJson)) {
    throw new Error('이미 클래스 폴더입니다. 「기존 폴더 열기」를 쓰세요.');
  }
  for (const dir of SCAFFOLD_DIRS) await adapter.mkdir(dir);

  const bundle = loadBundle(options.courseDefault);
  const bundleJson = JSON.stringify(bundle);
  const version = options.useFixtureBundle === true
    ? (options.fixtureBundleVersion ?? 'fixture')
    : bundleVersionLabel(bundle);

  const classJson: ClassJson = {
    spec: limits.classSpec,
    academy: { name: options.academyName, teacher_alias: options.teacherAlias },
    created_at: nowIso(),
    tool_version: limits.toolVersion,
    nodemap: { version, bundle_hash: `sha256:${await sha256Hex(bundleJson)}` },
    course_default: options.courseDefault,
    classes: {},
    id_counters: { student: 0, problem: 0, exam: 0, homework: 0 },
    last_lint: null,
    watermark_text: `강남챗 클래스 · ${options.academyName}`,
    naming: {
      exam_folder: '{date}_{title}_{class}',
      homework_folder: '{date}_{node}_{class}',
      node_folder: '{id}_{name}',
    },
  };

  await adapter.write(ROOT.classJson, `${JSON.stringify(classJson, null, 2)}\n`);
  await adapter.write(ROOT.rosterCsv, toCsv(STUDENTS_CSV_HEADER, []));
  return classJson;
}

/** class.json 읽기. 자기보다 새 판본이면 읽기 전용으로 연다(규격 판본 표기). */
export interface LoadedClass {
  classJson: ClassJson;
  readOnly: boolean;
}

function specMinor(spec: string): number {
  const m = /\/(\d+)\.(\d+)$/.exec(spec);
  if (m === null) return Number.POSITIVE_INFINITY;
  return Number(m[1]) * 1000 + Number(m[2]);
}

export async function loadClassFolder(adapter: FolderAdapter): Promise<LoadedClass> {
  const raw = await adapter.read(ROOT.classJson);
  const classJson = classJsonSchema.parse(JSON.parse(raw));
  const readOnly = specMinor(classJson.spec) > specMinor(limits.classSpec);
  return { classJson, readOnly };
}

export async function saveClassFolder(
  adapter: FolderAdapter,
  classJson: ClassJson,
): Promise<void> {
  await adapter.write(ROOT.classJson, `${JSON.stringify(classJson, null, 2)}\n`);
}

/** 번들이 픽스처인가 — 문항 저장 게이트(자리 A) */
export function isFixtureFolder(classJson: ClassJson): boolean {
  return classJson.nodemap.version === 'fixture';
}

/**
 * ID 발급(C-042). id_counters 캐시를 쓰되, 폴더를 스캔해 충돌을 막는다.
 * 발급된 ID 와 갱신된 class.json 을 함께 돌려준다(저장은 호출자 몫).
 */
export async function issueId(
  adapter: FolderAdapter,
  classJson: ClassJson,
  kind: IdKind,
  now = new Date(),
): Promise<{ id: string; classJson: ClassJson }> {
  const year = now.getFullYear();
  const existing = await scanExistingIds(adapter, kind, year);
  const seq = nextSequence(existing, classJson.id_counters[kind]);
  const id = formatId(kind, year, seq);
  const updated: ClassJson = {
    ...classJson,
    id_counters: { ...classJson.id_counters, [kind]: seq },
  };
  return { id, classJson: updated };
}

async function scanExistingIds(
  adapter: FolderAdapter,
  kind: IdKind,
  year: number,
): Promise<string[]> {
  if (kind === 'student') {
    if (!(await adapter.exists(ROOT.rosterCsv))) return [];
    const { header, rows } = parseCsv(await adapter.read(ROOT.rosterCsv));
    const col = header.indexOf('student_id');
    if (col < 0) return [];
    return rows.map((r) => r[col] ?? '').filter((v) => v.startsWith(`S-${year}-`));
  }
  if (kind === 'problem') {
    const entries = await walk(adapter, ROOT.bank);
    return entries
      .filter((e) => e.kind === 'file' && e.name.startsWith(`Q-${year}-`))
      .map((e) => e.name.replace(/\.json$/, ''));
  }
  // 시험·숙제 ID 는 폴더명이 아니라 파일 안에 있다 — 이번 국면은 캐시만 쓴다.
  return [];
}
