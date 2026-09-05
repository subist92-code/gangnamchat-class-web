import { useMemo, useState } from 'react';
import { loadBundle } from '../nodemap/loader';
import { buildTree } from '../nodemap/tree';
import { prepareIntake, type PreparedIntake } from '../intake/files';
import { makeBatchId, type IntakePage } from '../intake/types';
import { transcribeBatch, type TranscribeProgress } from '../intake/transcribe';
import { newTranscript, saveTranscript } from '../intake/transcriptStore';
import type { TranscriptTmp } from '../folder/schemas/transcript';
import { useSession } from '../store/session';
import { Button, Card, Notice } from '../ui/parts';

/**
 * 가-1 접수함(S0) + 전사 시작(S1).
 * 노드맵은 이름·트리만 보인다(H-3). 저작권 체크 없이는 전사 시작 불가(C-030).
 */
export function ExamIntake({
  onTranscribed,
}: {
  onTranscribed: (t: TranscriptTmp, pages: IntakePage[]) => void;
}) {
  const { adapter, classJson, apiKey, refreshTranscripts } = useSession();
  const [prepared, setPrepared] = useState<PreparedIntake | null>(null);
  const [classRef, setClassRef] = useState('');
  const [midDefault, setMidDefault] = useState('');
  const [note, setNote] = useState('');
  const [rights, setRights] = useState(false);
  const [progress, setProgress] = useState<TranscribeProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const course = useMemo(() => {
    if (classJson === null) return 'high' as const;
    return classJson.classes[classRef]?.course ?? classJson.course_default;
  }, [classJson, classRef]);

  const tree = useMemo(() => buildTree(loadBundle(course)), [course]);
  const classOptions = classJson === null ? [] : Object.keys(classJson.classes);

  const onFiles = async (files: FileList | null) => {
    if (files === null) return;
    setError(null);
    setBusy(true);
    try {
      setPrepared(await prepareIntake([...files]));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const canStart =
    prepared !== null &&
    prepared.pages.length > 0 &&
    rights &&
    classRef.trim().length > 0 &&
    apiKey.length > 0 &&
    adapter !== null &&
    !busy;

  const start = async () => {
    if (prepared === null || adapter === null) return;
    setError(null);
    setBusy(true);
    setProgress({ done: 0, total: prepared.pages.length, failed: 0 });
    try {
      const outcome = await transcribeBatch(
        prepared.pages,
        apiKey,
        { adapter },
        setProgress,
      );
      const transcript = newTranscript({
        batchId: makeBatchId(),
        classRef: classRef.trim(),
        course,
        midDefault: midDefault.length > 0 ? midDefault : null,
        input: prepared.files.some((f) => f.extension === 'pdf') ? 'pdf' : 'photo',
        files: prepared.files.filter((f) => f.accepted).map((f) => f.name),
        note,
        rightsConfirmed: rights,
        items: outcome.items,
      });
      await saveTranscript(adapter, transcript);
      await refreshTranscripts();
      if (outcome.failedPages.length > 0) {
        setError(
          `${outcome.failedPages.length}쪽을 읽지 못했습니다: ` +
            outcome.failedPages.map((f) => `${f.pageNumber}쪽(${f.message})`).join(' · '),
        );
      }
      onTranscribed(transcript, prepared.pages);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="가-1 접수함">
      {error !== null && <Notice tone="error">{error}</Notice>}
      <label className="mt-2 block cursor-pointer rounded border-2 border-dashed border-stone-300 p-6 text-center hover:border-primary">
        <input
          type="file"
          multiple
          className="hidden"
          data-testid="intake-files"
          accept=".jpg,.jpeg,.png,.webp,.pdf,.hwp,.hwpx,.md,.txt,.json"
          onChange={(e) => void onFiles(e.target.files)}
        />
        <span className="text-sm text-stone-600">
          시험지·교재 사진이나 PDF를 고르세요 (jpg · png · pdf)
        </span>
      </label>

      {prepared !== null && (
        <div className="mt-3 text-xs">
          <ul className="list-disc pl-5">
            {prepared.files.map((f) => (
              <li key={f.name} className={f.accepted ? 'text-stone-700' : 'text-chart-actual'}>
                {f.name} {f.accepted ? '' : `— 제외: ${f.reason}`}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-stone-600">
            페이지 {prepared.pages.length}쪽 · 예상 호출 수 {prepared.expectedCalls}회 (전사 호출 수이며
            토큰이 아닙니다)
          </p>
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col text-xs text-stone-600">
          반
          <input
            list="class-options"
            data-testid="class-ref"
            className="mt-1 rounded border border-stone-300 px-2 py-1 text-sm"
            value={classRef}
            onChange={(e) => setClassRef(e.target.value)}
            placeholder="2026-2_고2A"
          />
          <datalist id="class-options">
            {classOptions.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <span className="mt-1 text-stone-500">과정: {course === 'high' ? '고등' : '중등'}</span>
        </label>

        <label className="flex flex-col text-xs text-stone-600">
          중위 단원 기본값
          <select
            className="mt-1 rounded border border-stone-300 px-2 py-1 text-sm"
            value={midDefault}
            onChange={(e) => setMidDefault(e.target.value)}
          >
            <option value="">고르지 않음</option>
            {tree.map((mid) => (
              <option key={mid.id} value={mid.id}>
                {mid.id} {mid.name}
              </option>
            ))}
          </select>
          {tree.length === 0 && (
            <span className="mt-1 text-chart-actual">이 과정의 번들이 아직 준비 중입니다.</span>
          )}
        </label>

        <label className="flex flex-col text-xs text-stone-600 sm:col-span-2">
          출처 메모
          <input
            className="mt-1 rounded border border-stone-300 px-2 py-1 text-sm"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="2026 6월 모평 · 교재명 p.12"
          />
        </label>
      </div>

      <label className="mt-4 flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          data-testid="rights-check"
          checked={rights}
          onChange={(e) => setRights(e.target.checked)}
        />
        <span>내가 만든 것 또는 사용 권한이 있는 것입니다.</span>
      </label>

      <div className="mt-4 flex items-center gap-3">
        <Button onClick={() => void start()} disabled={!canStart}>
          전사 시작
        </Button>
        {apiKey.length === 0 && (
          <span className="text-xs text-chart-actual">설정에서 API 키를 먼저 입력하세요.</span>
        )}
        {progress !== null && (
          <span className="text-xs text-stone-600">
            {progress.done} / {progress.total} 쪽
            {progress.failed > 0 && ` · 실패 ${progress.failed}`}
          </span>
        )}
      </div>
    </Card>
  );
}
