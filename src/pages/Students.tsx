import { useEffect, useState } from 'react';
import { parseCsv } from '../folder/csv';
import { ROOT } from '../folder/paths';
import { useSession } from '../store/session';
import { Card, Notice } from '../ui/parts';

/** 학생 — 이번 국면은 명부 읽기 표시만(students.csv 표). 편집·발급 화면은 다음 국면. */
export function StudentsPage() {
  const adapter = useSession((s) => s.adapter);
  const [header, setHeader] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <Card title="명부">
      {error !== null && <Notice tone="error">{error}</Notice>}
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
  );
}
