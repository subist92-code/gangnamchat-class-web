import { useState } from 'react';
import type { TranscriptTmp } from '../folder/schemas/transcript';
import type { IntakePage } from '../intake/types';
import { useSession } from '../store/session';
import { loadTranscript } from '../intake/transcriptStore';
import { ExamIntake } from './ExamIntake';
import { TranscriptReview } from './TranscriptReview';
import { Card, Notice } from '../ui/parts';

/**
 * 시험만들기 — 이번 국면은 코너 가 S0~S2 만(접수 · 전사 · 전사 확인).
 * S3 이후(단원·형식 확정 · 검증 · 미끼 · 저장)는 다음 국면이다.
 */
export function ExamPage() {
  const { transcripts, adapter } = useSession();
  const [transcript, setTranscript] = useState<TranscriptTmp | null>(null);
  const [pages, setPages] = useState<IntakePage[]>([]);

  return (
    <div className="flex flex-col gap-4">
      <Notice>
        이 화면은 접수(S0) · 전사(S1) · 전사 확인(S2)까지입니다. 단원·형식 확정부터는 다음 국면입니다.
      </Notice>

      {transcript === null ? (
        <>
          <ExamIntake
            onTranscribed={(t, p) => {
              setTranscript(t);
              setPages(p);
            }}
          />
          {transcripts.length > 0 && (
            <Card title="이어서 확인할 묶음">
              <ul className="flex flex-col gap-1 text-sm">
                {transcripts.map((t) => {
                  const pending = t.items.filter((i) => i.confirmed_at === null).length;
                  return (
                    <li key={t.batch_id}>
                      <button
                        className="text-primary underline"
                        onClick={() => {
                          if (adapter === null) return;
                          void loadTranscript(adapter, t.batch_id).then((loaded) => {
                            if (loaded !== null) {
                              setTranscript(loaded);
                              setPages([]);
                            }
                          });
                        }}
                      >
                        {t.batch_id}
                      </button>{' '}
                      <span className="text-xs text-stone-600">
                        {t.class_ref} · 문항 {t.items.length}개 · 미확인 {pending}개
                      </span>
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
      ) : (
        <TranscriptReview transcript={transcript} pages={pages} onChange={setTranscript} />
      )}
    </div>
  );
}
