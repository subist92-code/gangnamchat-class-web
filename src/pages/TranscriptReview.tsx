import { useState } from 'react';
import type { IntakePage } from '../intake/types';
import type { FormatType } from '../folder/schemas/common';
import type { TranscriptItem, TranscriptTmp } from '../folder/schemas/transcript';
import {
  allConfirmed,
  batchTranscriptionDiff,
  confirmItem,
  defaultS3,
  editItem,
  s3Open,
  saveTranscript,
  setS3,
  verifiable,
} from '../intake/transcriptStore';
import { splitItem, mergeWithNext } from '../intake/boundaries';
import { loadBundle } from '../nodemap/loader';
import { midOptions, unitSlotFor } from '../nodemap/unitSlot';
import { useSession } from '../store/session';
import { Button, Card, Notice } from '../ui/parts';
import { MathText } from '../ui/Math';

const FORMATS: readonly FormatType[] = ['mc5', 'combo', 'short', 'essay'];

/**
 * 가-2 전사 확인(S2) + 단원 · 형식 확정(S3).
 * 좌 원본 · 우 문항별 텍스트(KaTeX 렌더 + 원문 편집).
 * 「확인」은 선생이 누른다 — 자동 확인 금지. **S3 행은 확인된 문항에만 열린다.**
 * 검증(S4·S5)은 묶음 단위라 리듬이 달라 가-3 으로 화면을 가른다.
 */
export function TranscriptReview({
  transcript,
  pages,
  onChange,
  onStartVerify,
}: {
  transcript: TranscriptTmp;
  pages: readonly IntakePage[];
  onChange: (t: TranscriptTmp) => void;
  onStartVerify?: () => void;
}) {
  const { adapter, refreshTranscripts } = useSession();
  const [error, setError] = useState<string | null>(null);

  const bundle = loadBundle(transcript.course);
  const mids = midOptions(bundle, transcript.course);
  const unitFor = (mid: string | null) => unitSlotFor(bundle, transcript.course, mid);

  /** S3 값을 고칠 때 쓰는 바탕 — 묶음 기본값을 상속한다(§3-1). */
  const baseS3 = (item: TranscriptItem) => defaultS3(transcript, item, unitFor);

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

  const pending = transcript.items.filter((i) => i.confirmed_at === null).length;
  const ready = allConfirmed(transcript);
  const verifyCount = verifiable(transcript).length;

  return (
    <Card title="가-2 전사 확인">
      {error !== null && <Notice tone="error">{error}</Notice>}
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-stone-600">
        <span>묶음 {transcript.batch_id}</span>
        <span>문항 {transcript.items.length}개 · 미확인 {pending}개</span>
        <span>이번 묶음 전사 정확도: 고친 글자 {batchTranscriptionDiff(transcript)}자</span>
        <Button
          variant="ghost"
          onClick={() => {
            let next = transcript;
            for (const item of transcript.items) next = confirmItem(next, item.tmp_no);
            void persist(next);
          }}
        >
          전부 확인
        </Button>
      </div>

      <div className="flex flex-col gap-4">
        {transcript.items.map((item, index) => {
          const page = pages.find((p) => p.pageNumber === item.page);
          const base = baseS3(item);
          const s3 = item.s3 ?? base;
          return (
            <div
              key={item.tmp_no}
              className="grid gap-4 rounded border border-stone-200 p-3 md:grid-cols-2"
              data-testid={`transcript-item-${item.tmp_no}`}
            >
              <div>
                <div className="mb-2 text-xs text-stone-500">{item.page}쪽 원본</div>
                {page === undefined ? (
                  <div className="rounded bg-stone-100 p-6 text-center text-xs text-stone-500">
                    원본 이미지는 이 세션에만 있습니다(서버·폴더에 남기지 않습니다).
                  </div>
                ) : (
                  <img src={page.dataUrl} alt={`${item.page}쪽`} className="w-full rounded border border-stone-200" />
                )}
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded bg-primary-tint px-2 py-0.5 text-primary">
                    형식 추정 {item.format_guess}
                  </span>
                  {item.figure && (
                    <span className="rounded bg-stone-100 px-2 py-0.5 text-stone-600">
                      그림 있음 → 트랙2 예고
                    </span>
                  )}
                  {item.llm.uncertain.length > 0 && (
                    <span className="rounded bg-stone-100 px-2 py-0.5 text-chart-actual">
                      불확실 {item.llm.uncertain.length}곳
                    </span>
                  )}
                  {item.confirmed_at !== null && (
                    <span className="rounded bg-stone-100 px-2 py-0.5 text-primary">
                      확인됨 · 고친 글자 {item.diff_from_llm}
                    </span>
                  )}
                </div>

                <div className="rounded bg-stone-50 p-2 text-sm">
                  <MathText text={item.edited.problem_text} />
                </div>

                <textarea
                  className="h-28 w-full rounded border border-stone-300 p-2 font-mono text-xs"
                  data-testid={`edit-${item.tmp_no}`}
                  value={item.edited.problem_text}
                  onChange={(e) =>
                    onChange(editItem(transcript, item.tmp_no, { problem_text: e.target.value }))
                  }
                  onBlur={() => void persist(transcript)}
                />

                {item.edited.choices !== null && (
                  <ol className="list-decimal pl-5 text-sm">
                    {item.edited.choices.map((choice, ci) => (
                      <li key={ci}>
                        <MathText text={choice} />
                      </li>
                    ))}
                  </ol>
                )}

                {item.llm.uncertain.length > 0 && (
                  <ul className="list-disc pl-5 text-xs text-stone-600">
                    {item.llm.uncertain.map((u, ui) => (
                      <li key={ui}>
                        {u.where}: {u.read}
                        {u.alt !== null && ` (또는 ${u.alt})`}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => void persist(confirmItem(transcript, item.tmp_no))}
                    disabled={item.confirmed_at !== null}
                  >
                    확인
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => void persist(splitItem(transcript, item.tmp_no))}
                  >
                    나누기
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={index === transcript.items.length - 1}
                    onClick={() => void persist(mergeWithNext(transcript, item.tmp_no))}
                  >
                    다음 문항과 합치기
                  </Button>
                </div>

                {s3Open(item) && (
                  <div
                    className="mt-1 rounded border border-stone-200 bg-primary-tint p-2"
                    data-testid={`s3-${item.tmp_no}`}
                  >
                    <div className="mb-2 text-xs font-medium text-primary">단원 · 형식 확정</div>

                    {s3 === null ? (
                      <p className="text-xs text-chart-actual">
                        중위 단원을 고르세요 — 묶음 기본값이 없어 검증으로 넘어갈 수 없습니다.
                      </p>
                    ) : null}

                    <div className="flex flex-wrap items-end gap-2">
                      <label className="flex flex-col text-xs text-stone-600">
                        중위 단원
                        <select
                          className="mt-1 rounded border border-stone-300 px-2 py-1 text-sm"
                          data-testid={`s3-mid-${item.tmp_no}`}
                          value={s3?.mid ?? ''}
                          onChange={(e) => {
                            const mid = e.target.value;
                            const unit = unitFor(mid);
                            if (unit === null) return;
                            const next = base ?? {
                              mid,
                              unit,
                              format: item.format_guess,
                              has_answer: item.edited.answer_raw !== null,
                              teacher_note: null,
                              answer_decision: null,
                            };
                            void persist(setS3(transcript, item.tmp_no, { mid, unit }, next));
                          }}
                        >
                          <option value="">— 고르세요 —</option>
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
                          data-testid={`s3-format-${item.tmp_no}`}
                          value={s3?.format ?? item.format_guess}
                          disabled={s3 === null}
                          onChange={(e) => {
                            if (base === null) return;
                            void persist(
                              setS3(
                                transcript,
                                item.tmp_no,
                                { format: e.target.value as FormatType },
                                base,
                              ),
                            );
                          }}
                        >
                          {FORMATS.map((f) => (
                            <option key={f} value={f}>
                              {f}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="flex items-center gap-1 text-xs text-stone-600">
                        <input
                          type="checkbox"
                          data-testid={`s3-answer-${item.tmp_no}`}
                          checked={s3?.has_answer ?? false}
                          disabled={s3 === null}
                          onChange={(e) => {
                            if (base === null) return;
                            void persist(
                              setS3(
                                transcript,
                                item.tmp_no,
                                { has_answer: e.target.checked },
                                base,
                              ),
                            );
                          }}
                        />
                        정답 있음
                      </label>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      {s3 !== null && (
                        <span className="rounded bg-white px-2 py-0.5 text-stone-600">
                          단원 블록 {s3.unit}
                        </span>
                      )}
                      {s3?.unit === 'B-D' && (
                        <span className="rounded bg-white px-2 py-0.5 text-stone-600">
                          공통기초 D 범위로 검증합니다
                        </span>
                      )}
                      {s3?.format === 'essay' && (
                        <span className="rounded bg-white px-2 py-0.5 text-stone-600">
                          서술형 → 트랙2 예고(검증만 · 미끼 없음)
                        </span>
                      )}
                    </div>

                    <input
                      className="mt-2 w-full rounded border border-stone-300 px-2 py-1 text-xs"
                      placeholder="선생 메모(선택) — 검증 입력에만 쓰이고 문항에 저장되지 않습니다"
                      data-testid={`s3-note-${item.tmp_no}`}
                      value={s3?.teacher_note ?? ''}
                      disabled={s3 === null}
                      onChange={(e) => {
                        if (base === null) return;
                        onChange(
                          setS3(
                            transcript,
                            item.tmp_no,
                            { teacher_note: e.target.value.length > 0 ? e.target.value : null },
                            base,
                          ),
                        );
                      }}
                      onBlur={() => void persist(transcript)}
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          disabled={verifyCount === 0 || onStartVerify === undefined}
          onClick={() => onStartVerify?.()}
          data-testid="start-verify"
        >
          검증 시작({verifyCount}건)
        </Button>
        <span className="text-xs text-stone-600">
          「확인됨」은 선생님이 눌렀다는 뜻일 뿐, 문항이 검증되었다는 뜻이 아닙니다.
        </span>
        {!ready && <span className="text-xs text-chart-actual">미확인 문항 {pending}개</span>}
        {verifyCount === 0 && (
          <span className="text-xs text-stone-500">
            확인하고 단원까지 고른 문항이 있어야 검증을 시작할 수 있습니다.
          </span>
        )}
      </div>
    </Card>
  );
}
