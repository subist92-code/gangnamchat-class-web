import { useMemo, useState } from 'react';
import type { TranscriptItem, TranscriptTmp, UnitSlot } from '../folder/schemas/transcript';
import {
  setItemCas,
  setItemVerdict,
  setS3,
  stateFromVerdict,
  verifiable,
  saveTranscript,
} from '../intake/transcriptStore';
import { callVerify, orderByUnit, VerifyError } from '../verify/client';
import { numericDiff, numericsPreserved } from '../verify/numericTokens';
import { casDisagrees, runCasScript } from '../cas/runScript';
import { appendReceipt } from '../llm/receipts';
import { loadBundle } from '../nodemap/loader';
import { nodeName } from '../nodemap/tree';
import { useSession } from '../store/session';
import { Button, Card, Notice } from '../ui/parts';
import { MathText } from '../ui/Math';

/**
 * 가-3 검증 결과(S4 · S5).
 *
 * 검증은 묶음 단위다 — 단원별로 모아 순차로 부른다(규격 §5). 그래야 캐시가 산다.
 * 문항 하나씩 보는 가-2 와 리듬이 달라 화면을 가른다.
 *
 * 「통과」를 성공처럼 꾸미지 않는다 — 검증은 관문이지 상이 아니다(기획 §4).
 */

interface UnitProgress {
  total: number;
  done: number;
  cacheRead: number;
}

function chipClass(tone: 'neutral' | 'warn' | 'bad' | 'good'): string {
  const base = 'rounded px-2 py-0.5 text-xs';
  if (tone === 'bad') return `${base} bg-white text-chart-actual border border-chart-actual`;
  if (tone === 'warn') return `${base} bg-stone-100 text-stone-700`;
  if (tone === 'good') return `${base} bg-primary-tint text-primary`;
  return `${base} bg-stone-100 text-stone-600`;
}

/** 상태 칩(§3-4). 색은 토큰만 쓴다(C-024). */
function StatusChips({ item }: { item: TranscriptItem }) {
  const verdict = item.verdict ?? null;
  if (verdict === null) {
    return <span className={chipClass('neutral')}>검증 전</span>;
  }
  const outOfScope = verdict.issues.some((i) => i.kind === 'out_of_scope');
  const mismatch = verdict.issues.some((i) => i.kind === 'answer_mismatch');
  const disagree = casDisagrees(verdict.status, item.cas);
  return (
    <>
      {verdict.status === 'pass' && <span className={chipClass('good')}>pass</span>}
      {verdict.status === 'ambiguous' && <span className={chipClass('warn')}>ambiguous</span>}
      {verdict.status === 'fail' && <span className={chipClass('bad')}>fail</span>}
      {outOfScope && <span className={chipClass('warn')}>노드 밖</span>}
      {verdict.track === 2 && <span className={chipClass('warn')}>트랙2</span>}
      {mismatch && <span className={chipClass('bad')}>정답표 확인</span>}
      {disagree && <span className={chipClass('bad')}>검산 불일치</span>}
    </>
  );
}

export function VerdictReview({
  transcript,
  onChange,
  onBackToReview,
}: {
  transcript: TranscriptTmp;
  onChange: (t: TranscriptTmp) => void;
  onBackToReview?: (tmpNo: number) => void;
}) {
  const { adapter, apiKey, refreshTranscripts } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [current, setCurrent] = useState<number | null>(null);
  const [unfit, setUnfit] = useState<Record<number, string>>({});

  const bundle = loadBundle(transcript.course);

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

  /** 단원별 진행 — 캐시 적중은 영수증 합산이다(§3-2). */
  const progress = useMemo(() => {
    const byUnit = new Map<UnitSlot, UnitProgress>();
    for (const item of transcript.items) {
      const unit = item.s3?.unit;
      if (unit === undefined) continue;
      const row = byUnit.get(unit) ?? { total: 0, done: 0, cacheRead: 0 };
      row.total += 1;
      if ((item.verdict ?? null) !== null) row.done += 1;
      byUnit.set(unit, row);
    }
    return byUnit;
  }, [transcript]);

  const [cacheRead, setCacheRead] = useState(0);

  const pendingItems = verifiable(transcript);

  /** S4 — 단원별 순차 호출. 동시 호출 수는 설정 계층(기본 1). */
  const runBatch = async () => {
    if (apiKey.length === 0) {
      setError('API 키를 먼저 입력하세요(설정 화면).');
      return;
    }
    setRunning(true);
    setError(null);
    setNotice(null);

    let working = transcript;
    const queue = orderByUnit(
      pendingItems.flatMap((item) =>
        item.s3 === null || item.s3 === undefined ? [] : [{ item, unit: item.s3.unit }],
      ),
    );

    for (const { item } of queue) {
      const s3 = item.s3;
      if (s3 === null || s3 === undefined) continue;
      setCurrent(item.tmp_no);
      try {
        const result = await callVerify({
          apiKey,
          unit: s3.unit,
          course: transcript.course,
          input: {
            problem_text: item.edited.problem_text,
            choices: item.edited.choices,
            answer_raw: item.edited.answer_raw,
            solution_raw: item.llm.solution_raw,
            format_guess: s3.format,
            mid: s3.mid,
            teacher_note: s3.teacher_note,
          },
        });

        const stored = {
          ...result.verdict,
          received_at: new Date().toISOString(),
          receipt_ref: null,
        };
        working = setItemVerdict(working, item.tmp_no, stored, stateFromVerdict(stored));

        // 영수증 1행(규격 §4-5). 금액은 적지 않는다 — 단가는 변한다.
        if (adapter !== null) {
          try {
            await appendReceipt(adapter, {
              at: new Date().toISOString(),
              lane: 'vault',
              purpose: 'verify',
              model: result.receipt.model,
              input_tokens: result.receipt.input_tokens,
              output_tokens: result.receipt.output_tokens,
              cache_read_tokens: result.receipt.cache_read_tokens,
              cache_creation_tokens: result.receipt.cache_creation_tokens ?? 0,
              key_last4: result.receipt.key_last4,
              request_hash: `sha256:${result.receipt.request_hash}`,
              problem_ids: [],
            });
          } catch (err) {
            setError(`영수증 기록 실패: ${(err as Error).message}`);
          }
        }
        setCacheRead((n) => n + result.receipt.cache_read_tokens);

        // S4-CAS — 브라우저 Pyodide Worker. verdict 를 덮지 않는다(C-053).
        const cas = await runCasScript(result.verdict.cas_script, { track: result.verdict.track });
        working = setItemCas(working, item.tmp_no, cas);

        await persist(working);
      } catch (err) {
        if (err instanceof VerifyError && err.kind === 'vault_unavailable') {
          setError('서버 금고 미탑재 — 묶음을 중단했습니다. 관리자에게 알려 주세요.');
          break;
        }
        if (err instanceof VerifyError && err.kind === 'verdict_unparsable') {
          working = setItemVerdict(working, item.tmp_no, null, 'ready');
          setUnfit((u) => ({ ...u, [item.tmp_no]: '검증 불능' }));
          await persist(working);
          continue;
        }
        setError((err as Error).message);
        break;
      }
    }

    setCurrent(null);
    setRunning(false);
  };

  /** fix_suggestion 「적용」 — 수치가 바뀌면 거부한다(§3-4 · C-066 ②). */
  const applyFix = (item: TranscriptItem, suggestion: string) => {
    const before = item.edited.problem_text;
    if (!numericsPreserved(before, suggestion)) {
      const diff = numericDiff(before, suggestion);
      setError(
        `수치가 바뀌는 제안 — 직접 수정하세요. 사라짐: ${diff.removed.join(', ') || '없음'} · 새로 생김: ${diff.added.join(', ') || '없음'}`,
      );
      return;
    }
    const next: TranscriptTmp = {
      ...transcript,
      items: transcript.items.map((i) =>
        i.tmp_no === item.tmp_no
          ? { ...i, edited: { ...i.edited, problem_text: suggestion } }
          : i,
      ),
    };
    setNotice('문장을 바꿨습니다. 숫자는 그대로입니다.');
    void persist(next);
  };

  const summary = useMemo(() => {
    const counts = { pass: 0, ambiguous: 0, fail: 0, parked: 0, track2: 0 };
    for (const item of transcript.items) {
      const v = item.verdict ?? null;
      if (v === null) continue;
      if (v.issues.some((i) => i.kind === 'out_of_scope')) counts.parked += 1;
      else if (v.track === 2) counts.track2 += 1;
      else if (v.status === 'pass') counts.pass += 1;
      else if (v.status === 'ambiguous') counts.ambiguous += 1;
      else counts.fail += 1;
    }
    return counts;
  }, [transcript]);

  const verified = transcript.items.filter((i) => (i.verdict ?? null) !== null);

  return (
    <Card title="가-3 검증 결과">
      {error !== null && <Notice tone="error">{error}</Notice>}
      {notice !== null && <Notice>{notice}</Notice>}

      <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-stone-600">
        <span>묶음 {transcript.batch_id}</span>
        <Button onClick={() => void runBatch()} disabled={running || pendingItems.length === 0}>
          {running ? '검증 중…' : `검증 시작(${pendingItems.length}건)`}
        </Button>
        {current !== null && <span>지금 {current}번 문항</span>}
        <span>캐시 적중 {cacheRead} 토큰</span>
      </div>

      <div className="mb-4 flex flex-col gap-1">
        {[...progress.entries()].map(([unit, row]) => (
          <div key={unit} className="flex items-center gap-2 text-xs">
            <span className="w-12 text-stone-600">{unit}</span>
            <div className="h-2 w-40 overflow-hidden rounded bg-stone-100">
              <div
                className="h-full bg-primary"
                style={{ width: `${row.total === 0 ? 0 : (row.done / row.total) * 100}%` }}
              />
            </div>
            <span className="text-stone-600">
              {row.done}/{row.total}
            </span>
          </div>
        ))}
        <p className="mt-1 text-xs text-stone-500">
          같은 단원의 두 번째 문항부터 캐시 적중이 커져야 정상입니다.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {verified.length === 0 && (
          <p className="text-sm text-stone-500">아직 판정이 없습니다. 「검증 시작」을 누르세요.</p>
        )}

        {transcript.items.map((item) => {
          const verdict = item.verdict ?? null;
          const unfitNote = unfit[item.tmp_no];
          if (verdict === null && unfitNote === undefined) return null;

          return (
            <div
              key={item.tmp_no}
              className="rounded border border-stone-200 p-3"
              data-testid={`verdict-${item.tmp_no}`}
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="text-xs text-stone-500">{item.tmp_no}번</span>
                {unfitNote !== undefined ? (
                  <span className={chipClass('bad')}>{unfitNote}</span>
                ) : (
                  <StatusChips item={item} />
                )}
              </div>

              <div className="mb-2 rounded bg-stone-50 p-2 text-sm">
                <MathText text={item.edited.problem_text} />
              </div>

              {verdict !== null && (
                <>
                  {verdict.issues.length > 0 && (
                    <ul className="mb-2 flex flex-col gap-2">
                      {verdict.issues.map((issue, i) => (
                        <li
                          key={i}
                          className={`rounded border p-2 text-xs ${
                            issue.kind === 'answer_mismatch'
                              ? 'border-chart-actual bg-white'
                              : 'border-stone-200 bg-white'
                          }`}
                        >
                          <div className="font-medium">
                            {issue.kind === 'answer_mismatch' ? '정답표 확인' : issue.kind}
                          </div>
                          <div className="mt-1 text-stone-700">{issue.detail}</div>
                          {issue.where.length > 0 && (
                            <div className="mt-1 text-stone-500">위치: {issue.where}</div>
                          )}

                          {issue.kind === 'answer_mismatch' ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                              <span className="text-stone-600">
                                결함이 아닙니다 — 선생님이 판정하세요.
                              </span>
                              <Button
                                variant="ghost"
                                onClick={() => {
                                  const base = item.s3;
                                  if (base === null || base === undefined) return;
                                  void persist(
                                    setS3(
                                      transcript,
                                      item.tmp_no,
                                      { answer_decision: 'teacher_answer' },
                                      base,
                                    ),
                                  );
                                }}
                              >
                                내 정답이 맞다
                              </Button>
                              <Button
                                variant="ghost"
                                onClick={() => {
                                  const base = item.s3;
                                  if (base === null || base === undefined) return;
                                  void persist(
                                    setS3(
                                      transcript,
                                      item.tmp_no,
                                      { answer_decision: 'text_answer' },
                                      base,
                                    ),
                                  );
                                }}
                              >
                                본문 해로 바꾼다
                              </Button>
                              {item.s3?.answer_decision !== null &&
                                item.s3?.answer_decision !== undefined && (
                                  <span className={chipClass('neutral')}>
                                    판정함: {item.s3.answer_decision}
                                  </span>
                                )}
                            </div>
                          ) : (
                            issue.fix_suggestion !== null && (
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <span className="text-stone-600">
                                  제안: {issue.fix_suggestion}
                                </span>
                                <Button
                                  variant="ghost"
                                  onClick={() => applyFix(item, issue.fix_suggestion as string)}
                                >
                                  적용
                                </Button>
                              </div>
                            )
                          )}
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-stone-600">
                    <span>
                      제안 노드: {verdict.nodes_suggested.mid ?? '—'}
                      {verdict.nodes_suggested.mid !== null &&
                        ` ${nodeName(bundle, verdict.nodes_suggested.mid) ?? ''}`}
                    </span>
                    {verdict.nodes_suggested.sub.length > 0 && (
                      <span>
                        하위: {verdict.nodes_suggested.sub.join(', ')}
                      </span>
                    )}
                    <span>제안 난이도 {verdict.difficulty_suggested}</span>
                  </div>

                  {item.cas !== null && item.cas !== undefined && (
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                      <span
                        className={chipClass(
                          item.cas.status === 'pass'
                            ? 'good'
                            : item.cas.status === 'fail'
                              ? 'bad'
                              : 'neutral',
                        )}
                      >
                        CAS {item.cas.status}
                      </span>
                      {item.cas.note !== null && item.cas.note !== undefined && (
                        <span className="text-stone-600">{item.cas.note}</span>
                      )}
                      <span className="text-stone-500">
                        CAS는 보조 신호입니다 · 최종 확인은 선생님이 합니다
                      </span>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {verdict.status === 'pass' && (
                      <Button disabled title="미끼 입히기는 지시서 03">
                        미끼 입히기
                      </Button>
                    )}
                    {(verdict.status === 'fail' || verdict.status === 'ambiguous') && (
                      <Button
                        variant="ghost"
                        onClick={() => onBackToReview?.(item.tmp_no)}
                        disabled={onBackToReview === undefined}
                      >
                        수정 후 재검증
                      </Button>
                    )}
                    {verdict.status === 'fail' && (
                      <Button
                        variant="ghost"
                        onClick={() =>
                          void persist(setItemVerdict(transcript, item.tmp_no, verdict, 'rejected'))
                        }
                      >
                        반려
                      </Button>
                    )}
                    {verdict.track === 2 && (
                      <span className="self-center text-xs text-stone-600">
                        트랙2 — 검증만 하고 미끼는 붙이지 않습니다(S9 대기).
                      </span>
                    )}
                    {verdict.issues.some((i) => i.kind === 'out_of_scope') && (
                      <span className="self-center text-xs text-stone-600">
                        노드 밖 — 이번 국면은 표시만 합니다(저장은 S10).
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {verified.length > 0 && (
        <div className="mt-4 border-t border-stone-100 pt-3 text-xs text-stone-600">
          <div className="font-medium text-stone-700">묶음 요약</div>
          <div className="mt-1 flex flex-wrap gap-3">
            <span>통과 {summary.pass}</span>
            <span>모호 {summary.ambiguous}</span>
            <span>실패 {summary.fail}</span>
            <span>노드밖 {summary.parked}</span>
            <span>트랙2 {summary.track2}</span>
            <span>캐시 적중 {cacheRead} 토큰</span>
          </div>
          <p className="mt-1 text-stone-500">이 요약은 화면에만 있습니다 — 저장하지 않습니다.</p>
        </div>
      )}
    </Card>
  );
}
