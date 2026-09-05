import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { chatDeferredNotice, chatTabs, tileCopy, type ChatTabId } from '../config/ui';
import { limits } from '../config/limits';
import { findExams } from '../folder/bank';
import { pendingCount } from '../intake/transcriptStore';
import { useSession } from '../store/session';
import { Button, Card, Notice } from '../ui/parts';

/**
 * 홈 — 채팅 우선 껍데기(C-070 · 대시보드 v0.1).
 * 대화층은 다음 국면이다(U-022 · 자리 C): 입력창 전송은 모델을 부르지 않고 안내 카드를 띄운다.
 * 카드 안 버튼은 모델을 거치지 않는다.
 */
interface Tile {
  label: string;
  route: string;
}

export function HomePage() {
  const navigate = useNavigate();
  const { adapter, transcripts } = useSession();
  const [tab, setTab] = useState<ChatTabId>('chat');
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [ungraded, setUngraded] = useState<Tile[]>([]);

  useEffect(() => {
    if (adapter === null) {
      setUngraded([]);
      return;
    }
    void findExams(adapter).then((exams) => {
      setUngraded(
        exams
          .filter((e) => !e.hasAttempts)
          .map((e) => ({ label: tileCopy.ungraded(e.exam.title), route: '/grade' })),
      );
    });
  }, [adapter]);

  const tiles = useMemo<Tile[]>(() => {
    const out: Tile[] = [];
    const pending = pendingCount(transcripts);
    if (pending > 0) out.push({ label: tileCopy.transcriptPending(pending), route: '/exam' });
    out.push(...ungraded);
    return out.slice(0, limits.homeTileMax);
  }, [transcripts, ungraded]);

  const active = chatTabs.find((t) => t.id === tab) ?? chatTabs[0];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {chatTabs.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setTab(t.id);
              setNotice(null);
            }}
            className={`rounded-full px-3 py-1 text-sm ${
              t.id === tab ? 'bg-primary text-white' : 'border border-stone-300 bg-white text-stone-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Card>
        <textarea
          className="h-24 w-full rounded border border-stone-300 p-2 text-sm"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={active?.placeholder}
        />
        <div className="mt-2 flex items-center gap-2">
          <Button onClick={() => setNotice(chatDeferredNotice)}>보내기</Button>
          {active?.route != null && (
            <Button variant="ghost" onClick={() => navigate(active.route as string)}>
              {active.label} 카드 열기
            </Button>
          )}
        </div>
        {notice !== null && (
          <div className="mt-3">
            <Notice>{notice}</Notice>
          </div>
        )}
      </Card>

      <div className="flex flex-wrap gap-2">
        {tiles.length === 0 ? (
          <span className="text-xs text-stone-500">{tileCopy.recent}: 아직 없습니다.</span>
        ) : (
          tiles.map((tile) => (
            <button
              key={tile.label}
              onClick={() => navigate(tile.route)}
              className="rounded border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700 hover:bg-primary-tint"
            >
              {tile.label}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
