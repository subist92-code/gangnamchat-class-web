import { useEffect, useState } from 'react';
import { classCsvPath, listClasses, registerClass, suggestClassName } from '../folder/classes';
import { parseCsv } from '../folder/csv';
import { ROOT } from '../folder/paths';
import type { Course } from '../folder/schemas/common';
import { useSession } from '../store/session';
import { Button, Card, Notice } from '../ui/parts';

/** 학생 — 명부 표시 + 반 등록(지시서 02 §5 · A-3). 학생 편집·발급은 다음 국면. */
export function StudentsPage() {
  const { adapter, classJson, setClassJson } = useSession();
  const [header, setHeader] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [className, setClassName] = useState('');
  const [course, setCourse] = useState<Course | null>(null);

  useEffect(() => {
    if (adapter === null) return;
    void (async () => {
      try {
        const parsed = parseCsv(await adapter.read(ROOT.rosterCsv));
        setHeader(parsed.header);
        setRows(parsed.rows);
      } catch (err) {
        setError((err as Error).message);
      }
    })();
  }, [adapter]);

  const classes = classJson === null ? [] : listClasses(classJson);
  const effectiveCourse = course ?? classJson?.course_default ?? 'high';

  const addClass = async () => {
    setError(null);
    setMessage(null);
    if (adapter === null || classJson === null) {
      setError('폴더를 먼저 여세요.');
      return;
    }
    try {
      const result = await registerClass(adapter, classJson, {
        name: className,
        course: effectiveCourse,
      });
      setClassJson(result.classJson);
      setMessage(
        result.created
          ? `반을 등록했습니다: ${className.trim()} · ${classCsvPath(className.trim())} 를 만들었습니다.`
          : `이미 있는 반입니다: ${className.trim()} — 명부는 그대로 두었습니다.`,
      );
      setClassName('');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {error !== null && <Notice tone="error">{error}</Notice>}
      {message !== null && <Notice>{message}</Notice>}

      <Card title="반">
        <p className="mb-3 text-stone-600">
          반은 <code>class.json</code> 과 <code>{ROOT.rosterClasses}/&lt;반&gt;.csv</code> 두 곳에
          함께 만듭니다. 한쪽만 있으면 반쪽입니다.
        </p>

        <div className="mb-3 flex flex-wrap items-end gap-2">
          <label className="flex flex-col text-xs text-stone-600">
            반 이름
            <input
              className="mt-1 w-56 rounded border border-stone-300 px-2 py-1 text-sm"
              data-testid="class-name"
              value={className}
              onChange={(e) => setClassName(e.target.value)}
              placeholder={`${suggestClassName()}고2A`}
            />
          </label>
          <Button
            variant="ghost"
            onClick={() => setClassName(suggestClassName())}
            title="YYYY-학기_ 까지 채웁니다. 뒤는 자유롭게 적으세요."
          >
            이름 틀
          </Button>
          <label className="flex flex-col text-xs text-stone-600">
            과정
            <select
              className="mt-1 rounded border border-stone-300 px-2 py-1 text-sm"
              data-testid="class-course"
              value={effectiveCourse}
              onChange={(e) => setCourse(e.target.value as Course)}
            >
              <option value="high">고등</option>
              <option value="middle">중등</option>
            </select>
          </label>
          <Button onClick={() => void addClass()} disabled={adapter === null}>
            반 추가
          </Button>
        </div>

        {effectiveCourse === 'middle' && (
          <Notice tone="warn">
            중등 반입니다 — 단원은 공통기초 D 노드로만 다룹니다.
          </Notice>
        )}

        <table className="mt-3 w-full text-left text-xs">
          <thead className="text-stone-500">
            <tr>
              <th className="py-1">반</th>
              <th>과정</th>
              <th>명부 파일</th>
            </tr>
          </thead>
          <tbody>
            {classes.map((row) => (
              <tr key={row.name} className="border-t border-stone-100">
                <td className="py-1">{row.name}</td>
                <td>{row.course === 'high' ? '고등' : '중등'}</td>
                <td className="font-mono text-stone-500">{classCsvPath(row.name)}</td>
              </tr>
            ))}
            {classes.length === 0 && (
              <tr>
                <td className="py-2 text-stone-500" colSpan={3}>
                  아직 등록된 반이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Card title="명부">
      <table className="w-full text-left text-xs">
        <thead className="text-stone-500">
          <tr>
            {header.map((h) => (
              <th key={h} className="py-1">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-stone-100">
              {header.map((h, j) => (
                <td key={h} className="py-1">
                  {row[j] ?? ''}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td className="py-2 text-stone-500" colSpan={Math.max(1, header.length)}>
                아직 학생이 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-stone-500">
        생년월일·연락처·학교명 열은 규격에 없습니다 — 도구가 읽지도 표시하지도 않습니다.
      </p>
      </Card>
    </div>
  );
}
