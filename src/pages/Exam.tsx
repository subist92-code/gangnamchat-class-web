import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { TranscriptTmp } from '../folder/schemas/transcript';
import type { IntakePage } from '../intake/types';
import { useSession } from '../store/session';
import { loadTranscript, verifiable } from '../intake/transcriptStore';
import { ExamIntake } from './ExamIntake';
import { TranscriptReview } from './TranscriptReview';
import { VerdictReview } from './VerdictReview';
import { Button, Card, Notice } from '../ui/parts';

/**
 * 시험만들기 — 단계 스위처(접수 S0~S1 → 전사 확인 S2·S3 → 검증 결과 S4·S5).
 *
 * 단계를 주소에 둔다(`?step=verdict&batch=T-…`) — 홈 타일이 각 단계로 직행하기 위해서다.
 * S6 이후(미끼 · 카드 · 저장)는 지시서 03 이다.
 */

type Step = 'intake' | 'review' | 'verdict';

const STEPS: ReadonlyArray<{ id: Step; label: string }> = [
  { id: 'intake', label: '접수' },
  { id: 'review', label: '전사 확인' },
  { id: 'verdict', label: '검증 결과' },
];

export function ExamPage() {
  const { transcripts, adapter } = useSession();
  const [params, setParams] = useSearchParams();
  const [transcript, setTranscript] = useState<TranscriptTmp | null>(null);
  const [pages, setPages] = useState<IntakePage[]>([]);

  const step = (params.get('step') as Step | null) ?? 'intake';
  const batch = params.get('batch');

  const go = (next: Step, batchId?: string) => {
    const query: Record<string, string> = { step: next };
    const id = batchId ?? transcript?.batch_id ?? batch;
    if (id !== null && id !== undefined) query.batch = id;
    setParams(query);
  };

  // 주소에 묶음이 지정돼 있으면 그것을 연다 — 홈 타일에서 직행할 때의 경로다.
  useEffect(() => {
    if (batch === null || adapter === null) return;
    if (transcript !== null && transcript.batch_id === batch) return;
    void loadTranscript(adapter, batch).then((loaded) => {
      if (loaded !== null) {
        setTranscript(loaded);
        setPages([]);
      }
    });
  }, [batch, adapter, transcript]);

  const open = (t: TranscriptTmp, next: Step) => {
    setTranscript(t);
    setPages([]);
    go(next, t.batch_id);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {STEPS.map((s, i) => (
          <span key={s.id} className="flex items-center gap-2">
            {i > 0 && <span className="text-stone-400">›</span>}
            <button
              className={
                step === s.id
                  ? 'rounded bg-primary px-2 py-1 text-white'
                  : 'rounded px-2 py-1 text-stone-600 hover:bg-primary-tint'
              }
              disabled={s.id !== 'intake' && transcript === null}
              onClick={() => go(s.id)}
            >
              {s.label}
            </button>
          </span>
        ))}
        {transcript !== null && (
          <span className="ml-2 text-stone-500">묶음 {transcript.batch_id}</span>
        )}
      </div>

      <Notice>
        이 화면은 접수(S0) · 전사(S1) · 전사 확인(S2) · 단원·형식 확정(S3) · 검증(S4·S5)까지입니다.
        미끼 입히기부터는 다음 국면입니다.
      </Notice>

      {step === 'intake' && (
        <>
          <ExamIntake
            onTranscribed={(t, p) => {
              setTranscript(t);
              setPages(p);
              go('review', t.batch_id);
            }}
          />
          {transcripts.length > 0 && (
            <Card title="이어서 할 묶음">
              <ul className="flex flex-col gap-2 text-sm">
                {transcripts.map((t) => {
                  const pending = t.items.filter((i) => i.confirmed_at === null).length;
                  const toVerify = verifiable(t).length;
                  const verified = t.items.filter((i) => (i.verdict ?? null) !== null).length;
                  return (
                    <li key={t.batch_id} className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs">{t.batch_id}</span>
                      <span className="text-xs text-stone-600">
                        {t.class_ref} · 문항 {t.items.length}개 · 미확인 {pending}개 · 검증 대기{' '}
                        {toVerify}건 · 판정 {verified}건
                      </span>
                      <Button variant="ghost" onClick={() => open(t, 'review')}>
                        전사 확인
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={toVerify === 0 && verified === 0}
                        onClick={() => open(t, 'verdict')}
                      >
                        검증 결과
                      </Button>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2 text-xs text-stone-500">
                원본 이미지는 세션이 끝나면 사라집니다. 전사 텍스트만 폴더에 남습니다.
              </p>
            </Card>
          )}
        </>
      )}

      {step === 'review' && transcript !== null && (
        <TranscriptReview
          transcript={transcript}
          pages={pages}
          onChange={setTranscript}
          onStartVerify={() => go('verdict')}
        />
      )}

      {step === 'verdict' && transcript !== null && (
        <VerdictReview
          transcript={transcript}
          onChange={setTranscript}
          onBackToReview={() => go('review')}
        />
      )}

      {step !== 'intake' && transcript === null && (
        <Card>
          <p className="text-sm text-stone-600">묶음을 먼저 고르세요.</p>
          <div className="mt-2">
            <Button variant="ghost" onClick={() => go('intake')}>
              접수로
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
