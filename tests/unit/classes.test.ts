import { describe, expect, it } from 'vitest';
import { MemoryFolderAdapter } from '../../src/folder/memoryAdapter';
import { createClassFolder, loadClassFolder } from '../../src/folder/classFolder';
import {
  CLASS_CSV_HEADER,
  classCsvPath,
  classNameProblem,
  courseOf,
  listClasses,
  registerClass,
  suggestClassName,
} from '../../src/folder/classes';
import { parseCsv } from '../../src/folder/csv';

/**
 * 반 등록(지시서 02 §6 · classes.test.ts).
 * 반은 class.json 과 명부 CSV 두 곳에 함께 만들어져야 한다 — 한쪽만이면 반쪽이다.
 */

async function freshFolder() {
  const adapter = new MemoryFolderAdapter();
  await createClassFolder(adapter, {
    academyName: '시험학원',
    teacherAlias: '김선생',
    courseDefault: 'high',
  });
  const { classJson } = await loadClassFolder(adapter);
  return { adapter, classJson };
}

describe('registerClass', () => {
  it('반을 더하면 class.json 과 CSV 가 함께 생긴다', async () => {
    const { adapter, classJson } = await freshFolder();

    const result = await registerClass(adapter, classJson, {
      name: '2026-2_고2A',
      course: 'high',
    });
    expect(result.created).toBe(true);
    expect(result.classJson.classes['2026-2_고2A']).toEqual({ course: 'high' });

    // 디스크에도 반영됐는지 — 메모리 객체만 바꾸고 끝내면 안 된다.
    const reloaded = await loadClassFolder(adapter);
    expect(reloaded.classJson.classes['2026-2_고2A']).toEqual({ course: 'high' });

    const csv = parseCsv(await adapter.read(classCsvPath('2026-2_고2A')));
    expect(csv.header).toEqual([...CLASS_CSV_HEADER]);
    expect(csv.rows).toHaveLength(0);
  });

  it('같은 반을 다시 넣어도 명부를 비우지 않는다', async () => {
    const { adapter, classJson } = await freshFolder();
    const first = await registerClass(adapter, classJson, { name: '고3B', course: 'high' });

    // 학생이 한 줄 들어간 상태를 만든다.
    await adapter.write(
      classCsvPath('고3B'),
      `${CLASS_CSV_HEADER.join(',')}\nS-2026-0001,1\n`,
    );

    const again = await registerClass(adapter, first.classJson, {
      name: '고3B',
      course: 'high',
    });
    expect(again.created).toBe(false);

    const csv = parseCsv(await adapter.read(classCsvPath('고3B')));
    expect(csv.rows).toHaveLength(1);
  });

  it('과정이 반마다 다르게 기록된다(C-058)', async () => {
    const { adapter, classJson } = await freshFolder();
    const a = await registerClass(adapter, classJson, { name: '고2A', course: 'high' });
    const b = await registerClass(adapter, a.classJson, { name: '중3C', course: 'middle' });

    expect(courseOf(b.classJson, '고2A')).toBe('high');
    expect(courseOf(b.classJson, '중3C')).toBe('middle');
    // 등록되지 않은 반은 묶음 기본값을 따른다.
    expect(courseOf(b.classJson, '없는반')).toBe(b.classJson.course_default);
  });

  it('listClasses — 이름순으로 돌려준다', async () => {
    const { adapter, classJson } = await freshFolder();
    const a = await registerClass(adapter, classJson, { name: 'B반', course: 'high' });
    const b = await registerClass(adapter, a.classJson, { name: 'A반', course: 'high' });
    expect(listClasses(b.classJson).map((c) => c.name)).toEqual(['A반', 'B반']);
  });

  it('쓸 수 없는 이름은 거부한다 — 폴더·파일 이름이 되기 때문이다', async () => {
    const { adapter, classJson } = await freshFolder();
    for (const bad of ['', '   ', 'a/b', 'a\\b', 'a:b', 'a*b', 'a?b', '.숨김']) {
      expect(classNameProblem(bad), bad).not.toBeNull();
      await expect(
        registerClass(adapter, classJson, { name: bad, course: 'high' }),
      ).rejects.toThrow();
    }
    expect(classNameProblem('2026-2_고2A')).toBeNull();
  });

  it('suggestClassName — <YYYY-학기>_ 까지 채운다', () => {
    expect(suggestClassName(new Date('2026-03-02T00:00:00'))).toBe('2026-1_');
    expect(suggestClassName(new Date('2026-09-06T00:00:00'))).toBe('2026-2_');
    expect(suggestClassName(new Date('2026-06-30T00:00:00'))).toBe('2026-1_');
    expect(suggestClassName(new Date('2026-07-01T00:00:00'))).toBe('2026-2_');
  });
});
