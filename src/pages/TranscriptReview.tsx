import { useState } from 'react';
import type { IntakePage } from '../intake/types';
import type { TranscriptTmp } from '../folder/schemas/transcript';
import {
  allConfirmed,
  batchTranscriptionDiff,
  confirmItem,
  editItem,
  s3Open,
  saveTranscript,
} from '../intake/transcriptStore';
import { splitItem, mergeWithNext } from '../intake/boundaries';
import { useSession } from '../store/session';
import { Button, Card, Notice } from '../ui/parts';
import { MathText } from '../ui/Math';

/**
 * 가-2 전사 확인(S2).
 * 좌 원본 · 우 문항별 텍스트(KaTeX 렌더 + 원문 편집).
 * 「확인」은 선생이 누른다 — 자동 확인 금지.
 *
 * 단원 · 형식 지정(S3)은 여기 있지 않다(A-7 · 2026-09-06). 전사 확인은 문항을 하나씩
 * 들여다보는 일이고 단원 지정은 묶음을 한눈에 훑는 일이라 화면을 갈랐다.
 */
export function TranscriptReview({
  transcript,
  pages,
  onChange,
  onAssign,
}: {
  transcript: TranscriptTmp;
  pages: readonly IntakePage[];
  onChange: (t: TranscriptTmp) => void;
  onAssign?: () => void;
}) {
  const { adapter, refreshTranscripts } = useSession();
  const [error, setError] = useState<string | null>(null);

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
  const confirmedCount = transcript.items.filter(s3Open).length;

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

              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          disabled={confirmedCount === 0 || onAssign === undefined}
          onClick={() => onAssign?.()}
          data-testid="go-assign"
        >
          단원 · 형식 지정({confirmedCount}건)
        </Button>
        <span className="text-xs text-stone-600">
          「확인됨」은 선생님이 눌렀다는 뜻일 뿐, 문항이 검증되었다는 뜻이 아닙니다.
        </span>
        {!ready && <span className="text-xs text-chart-actual">미확인 문항 {pending}개</span>}
        {confirmedCount === 0 && (
          <span className="text-xs text-stone-500">
            확인한 문항이 있어야 단원을 지정할 수 있습니다.
          </span>
        )}
      </div>
    </Card>
  );
}
