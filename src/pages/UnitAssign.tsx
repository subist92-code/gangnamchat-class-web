import { useState } from 'react';
import type { FormatType } from '../folder/schemas/common';
import type { TranscriptTmp, UnitSlot } from '../folder/schemas/transcript';
import { defaultS3, s3Open, saveTranscript, setS3, verifiable } from '../intake/transcriptStore';
import { loadBundle } from '../nodemap/loader';
import { midOptions, unitSlotFor } from '../nodemap/unitSlot';
import { useSession } from '../store/session';
import { Button, Card, Notice } from '../ui/parts';

/**
 * 단원 · 형식 지정(A-7 · 지시서 02 후속 1).
 *
 * 가-2 에서 S3 행을 빼서 이 단계로 옮겼다. 전사 확인은 문항을 **하나씩** 들여다보는 일이고
 * 단원 지정은 묶음을 **한눈에** 훑는 일이라, 같은 화면에 겹치면 한 문항당 보이는 것이 너무 많다.
 *
 * 여기서는 확인된 문항만 표로 세우고, 일괄 적용을 먼저 두고 문항별 덮어쓰기를 뒤에 둔다 —
 * 대개 한 시험지는 같은 단원이라 일괄이 기본 동작이고 예외만 손으로 고친다.
 */

const FORMATS: readonly FormatType[] = ['mc5', 'combo', 'short', 'essay'];

export function UnitAssign({
  transcript,
  onChange,
  onStartVerify,
  onBackToReview,
}: {
  transcript: TranscriptTmp;
  onChange: (t: TranscriptTmp) => void;
  onStartVerify?: () => void;
  onBackToReview?: () => void;
}) {
  const { adapter, refreshTranscripts } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [bulkMid, setBulkMid] = useState('');
  const [bulkFormat, setBulkFormat] = useState<FormatType | ''>('');

  const bundle = loadBundle(transcript.course);
  const mids = midOptions(bundle, transcript.course);
  const unitFor = (mid: string | null): UnitSlot | null =>
    unitSlotFor(bundle, transcript.course, mid);

  const openItems = transcript.items.filter(s3Open);
  const verifyCount = verifiable(transcript).length;

  const persist = async (next: TranscriptTmp) => {
    onChange(next);
    if (adapter === null) return;
    try {
      await saveTranscript(adapter, next);
      await refreshTranscripts();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  /** 확인된 문항 전부에 같은 값을 넣는다. 뒤에서 문항별로 덮어쓸 수 있다. */
  const applyBulk = () => {
    setError(null);
    setMessage(null);
    if (bulkMid.length === 0 && bulkFormat.length === 0) {
      setError('일괄로 넣을 값을 하나 이상 고르세요.');
      return;
    }
    const unit = bulkMid.length > 0 ? unitFor(bulkMid) : null;
    if (bulkMid.length > 0 && unit === null) {
      setError('그 단원의 블록 자리를 정할 수 없습니다.');
      return;
    }

    let next = transcript;
    for (const item of openItems) {
      const base = defaultS3(next, item, unitFor) ?? {
        mid: bulkMid,
        unit: unit ?? 'B20',
        format: item.format_guess,
        has_answer: item.edited.answer_raw !== null,
        teacher_note: null,
        answer_decision: null,
      };
      const patch: Partial<typeof base> = {};
      if (bulkMid.length > 0 && unit !== null) {
        patch.mid = bulkMid;
        patch.unit = unit;
      }
      if (bulkFormat !== '') patch.format = bulkFormat;
      next = setS3(next, item.tmp_no, patch, base);
    }
    setMessage(`확인된 ${openItems.length}개 문항에 넣었습니다. 아래에서 문항별로 고칠 수 있습니다.`);
    void persist(next);
  };

  const patchOne = (tmpNo: number, patch: Record<string, unknown>) => {
    const item = transcript.items.find((i) => i.tmp_no === tmpNo);
    if (item === undefined) return;
    const base = defaultS3(transcript, item, unitFor);
    if (base === null) {
      setError('먼저 중위 단원을 고르세요.');
      return;
    }
    void persist(setS3(transcript, tmpNo, patch, base));
  };

  return (
    <Card title="단원 · 형식 지정">
      {error !== null && <Notice tone="error">{error}</Notice>}
      {message !== null && <Notice>{message}</Notice>}

      <p className="mb-3 text-stone-600">
        확인된 문항만 나옵니다. 단원을 고르면 검증에 쓸 단원 블록이 따라 정해집니다.
      </p>

      {openItems.length === 0 ? (
        <>
          <p className="text-sm text-stone-500">
            확인된 문항이 없습니다. 전사 확인에서 「확인」을 먼저 눌러 주세요.
          </p>
          <div className="mt-3">
            <Button variant="ghost" onClick={() => onBackToReview?.()}>
              전사 확인으로
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="mb-4 rounded border border-stone-200 bg-primary-tint p-3">
            <div className="mb-2 text-xs font-medium text-primary">일괄 적용</div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col text-xs text-stone-600">
                중위 단원
                <select
                  className="mt-1 rounded border border-stone-300 px-2 py-1 text-sm"
                  data-testid="bulk-mid"
                  value={bulkMid}
                  onChange={(e) => setBulkMid(e.target.value)}
                >
                  <option value="">바꾸지 않음</option>
                  {mids.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.id} {m.name}
                      {m.commonBasic ? ' (공통기초)' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col text-xs text-stone-600">
                형식
                <select
                  className="mt-1 rounded border border-stone-300 px-2 py-1 text-sm"
                  data-testid="bulk-format"
                  value={bulkFormat}
                  onChange={(e) => setBulkFormat(e.target.value as FormatType | '')}
                >
                  <option value="">바꾸지 않음</option>
                  {FORMATS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </label>
              <Button onClick={applyBulk} data-testid="apply-bulk">
                확인된 {openItems.length}개에 적용
              </Button>
            </div>
            {bulkMid.length > 0 && unitFor(bulkMid) !== null && (
              <p className="mt-2 text-xs text-stone-600">
                단원 블록 {unitFor(bulkMid)}
                {unitFor(bulkMid) === 'B-D' && ' — 공통기초 D 범위로 검증합니다'}
              </p>
            )}
          </div>

          <table className="w-full text-left text-xs">
            <thead className="text-stone-500">
              <tr>
                <th className="py-1">번호</th>
                <th>문항</th>
                <th>중위 단원</th>
                <th>블록</th>
                <th>형식</th>
                <th>정답</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {openItems.map((item) => {
                const s3 = item.s3 ?? defaultS3(transcript, item, unitFor);
                const verdictDone = (item.verdict ?? null) !== null;
                return (
                  <tr
                    key={item.tmp_no}
                    className="border-t border-stone-100 align-top"
                    data-testid={`assign-${item.tmp_no}`}
                  >
                    <td className="py-2">{item.tmp_no}</td>
                    <td className="max-w-xs py-2 text-stone-700">
                      {item.edited.problem_text.slice(0, 60)}
                      {item.edited.problem_text.length > 60 ? '…' : ''}
                    </td>
                    <td className="py-2">
                      <select
                        className="rounded border border-stone-300 px-1 py-0.5"
                        data-testid={`assign-mid-${item.tmp_no}`}
                        value={s3?.mid ?? ''}
                        onChange={(e) => {
                          const mid = e.target.value;
                          const unit = unitFor(mid);
                          if (unit === null) return;
                          const item2 = transcript.items.find((i) => i.tmp_no === item.tmp_no);
                          const base = defaultS3(transcript, item2 as typeof item, unitFor) ?? {
                            mid,
                            unit,
                            format: item.format_guess,
                            has_answer: item.edited.answer_raw !== null,
                            teacher_note: null,
                            answer_decision: null,
                          };
                          void persist(setS3(transcript, item.tmp_no, { mid, unit }, base));
                        }}
                      >
                        <option value="">— 고르세요 —</option>
                        {mids.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.id} {m.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 text-stone-600">{s3?.unit ?? '—'}</td>
                    <td className="py-2">
                      <select
                        className="rounded border border-stone-300 px-1 py-0.5"
                        data-testid={`assign-format-${item.tmp_no}`}
                        value={s3?.format ?? item.format_guess}
                        disabled={s3 === null}
                        onChange={(e) =>
                          patchOne(item.tmp_no, { format: e.target.value as FormatType })
                        }
                      >
                        {FORMATS.map((f) => (
                          <option key={f} value={f}>
                            {f}
                          </option>
                        ))}
                      </select>
                      {s3?.format === 'essay' && (
                        <div className="mt-1 text-stone-500">트랙2 예고</div>
                      )}
                    </td>
                    <td className="py-2">
                      <input
                        type="checkbox"
                        data-testid={`assign-answer-${item.tmp_no}`}
                        checked={s3?.has_answer ?? false}
                        disabled={s3 === null}
                        onChange={(e) => patchOne(item.tmp_no, { has_answer: e.target.checked })}
                      />
                    </td>
                    <td className="py-2 text-stone-500">
                      {verdictDone ? '판정됨' : s3 === null ? '단원 미지정' : '검증 대기'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button variant="ghost" onClick={() => onBackToReview?.()}>
              전사 확인으로
            </Button>
            <Button
              disabled={verifyCount === 0 || onStartVerify === undefined}
              onClick={() => onStartVerify?.()}
              data-testid="start-verify"
            >
              검증 시작({verifyCount}건)
            </Button>
            {verifyCount === 0 && (
              <span className="text-xs text-stone-500">
                단원을 고른 문항이 있어야 검증을 시작할 수 있습니다.
              </span>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
