import { useEffect, useState } from 'react';
import { limits } from '../config/limits';
import { unsupportedBrowserNotice } from '../config/ui';
import { createClassFolder } from '../folder/classFolder';
import { chooseFolder, folderSupported } from '../folder/pickAdapter';
import { sha256Hex } from '../folder/FolderAdapter';
import { ROOT } from '../folder/paths';
import { readReceipts } from '../llm/receipts';
import { runCasSelfTest, type SelfTestResult } from '../cas/pyodide';
import {
  callPassthrough,
  currentEmail,
  isSupabaseConfigured,
  onAuthChange,
  sendMagicLink,
  signOut,
} from '../auth/supabase';
import { useSession } from '../store/session';
import { Button, Card, Notice } from '../ui/parts';
import type { ReceiptEntry } from '../folder/schemas/receipts';

/** 설정 — 폴더 · 키(메모리) · 과정 · 영수증 · 스택 자가진단(스모크 1·3·4 실행 자리) */
export function SettingsPage() {
  const { adapter, classJson, lint, apiKey, setApiKey, clearApiKey, attachFolder, detachFolder } =
    useSession();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [academy, setAcademy] = useState('');
  const [alias, setAlias] = useState('');
  const [receipts, setReceipts] = useState<ReceiptEntry[] | null>(null);
  const [cas, setCas] = useState<SelfTestResult | null>(null);
  const [hashLine, setHashLine] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [canary, setCanary] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  // 매직링크로 돌아온 순간에도 화면이 스스로 바뀌어야 한다 — 새로고침을 시키지 않는다.
  useEffect(() => {
    let alive = true;
    void currentEmail().then((mail) => {
      if (!alive) return;
      setSignedIn(mail);
      setAuthChecked(true);
    });
    const stop = onAuthChange((mail) => {
      setSignedIn(mail);
      setAuthChecked(true);
    });
    return () => {
      alive = false;
      stop();
    };
  }, []);

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    setMessage(null);
    try {
      await fn();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const openExisting = () =>
    run(async () => {
      const next = await chooseFolder();
      const result = await attachFolder(next);
      if (result.findings.some((f) => f.code === 'L-01')) {
        throw new Error('클래스 폴더가 아닙니다 — 「새 클래스 폴더」로 만들어 주세요.');
      }
      setMessage(`폴더를 열었습니다: ${next.rootName}`);
    });

  const createNew = () =>
    run(async () => {
      if (academy.trim().length === 0) throw new Error('학원 이름을 적어 주세요.');
      const next = await chooseFolder();
      await createClassFolder(next, {
        academyName: academy.trim(),
        teacherAlias: alias.trim().length > 0 ? alias.trim() : '선생님',
        courseDefault: 'high',
      });
      await attachFolder(next);
      setMessage(`새 클래스 폴더를 만들었습니다: ${next.rootName}`);
    });

  const verifyHash = () =>
    run(async () => {
      if (adapter === null) throw new Error('폴더를 먼저 여세요.');
      const text = await adapter.read(ROOT.classJson);
      setHashLine(`class.json sha256 = ${await sha256Hex(text)}`);
    });

  const showReceipts = () =>
    run(async () => {
      if (adapter === null) throw new Error('폴더를 먼저 여세요.');
      setReceipts((await readReceipts(adapter)).entries);
    });

  const casSelfTest = () =>
    run(async () => {
      setCas(await runCasSelfTest());
    });

  const passthroughSmoke = () =>
    run(async () => {
      if (apiKey.length === 0) throw new Error('API 키를 먼저 입력하세요.');
      const token = `CANARY-${crypto.randomUUID()}`;
      setCanary(token);
      const result = await callPassthrough(
        apiKey,
        `${token} 이 문장을 그대로 한 번만 되돌려 줘.`,
      );
      setMessage(
        `통로 함수 응답: ${result.text.slice(0, 120)} · 토큰 ${result.receipt.input_tokens}/${result.receipt.output_tokens}`,
      );
    });

  return (
    <div className="flex flex-col gap-4">
      {!folderSupported() && <Notice tone="warn">{unsupportedBrowserNotice}</Notice>}
      {error !== null && <Notice tone="error">{error}</Notice>}
      {message !== null && <Notice>{message}</Notice>}

      <Card title="폴더">
        <p className="mb-3 text-stone-600">
          이 폴더가 전부입니다. 클라우드 동기 폴더(드라이브·원드라이브)를 루트로 고르면 백업이 됩니다.
        </p>
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <label className="flex flex-col text-xs text-stone-600">
            학원 이름
            <input
              className="mt-1 rounded border border-stone-300 px-2 py-1 text-sm"
              value={academy}
              onChange={(e) => setAcademy(e.target.value)}
              placeholder="○○수학"
            />
          </label>
          <label className="flex flex-col text-xs text-stone-600">
            선생 표시 이름
            <input
              className="mt-1 rounded border border-stone-300 px-2 py-1 text-sm"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder="김선생"
            />
          </label>
          <Button onClick={createNew}>새 클래스 폴더</Button>
          <Button variant="ghost" onClick={openExisting}>
            기존 폴더 열기
          </Button>
          {adapter !== null && (
            <Button variant="ghost" onClick={detachFolder}>
              폴더 닫기
            </Button>
          )}
        </div>
        {classJson !== null && (
          <dl className="grid grid-cols-[8rem_1fr] gap-y-1 text-xs text-stone-600">
            <dt>규격</dt>
            <dd>{classJson.spec}</dd>
            <dt>노드맵 판본</dt>
            <dd>
              {classJson.nodemap.version}
              {classJson.nodemap.version === 'fixture' && ' (픽스처 — 문항 저장 불가)'}
            </dd>
            <dt>기본 과정</dt>
            <dd>{classJson.course_default === 'high' ? '고등' : '중등'}</dd>
            <dt>도구 판본</dt>
            <dd>{classJson.tool_version}</dd>
          </dl>
        )}
        {lint !== null && (
          <div className="mt-3 text-xs">
            <div className="text-stone-600">
              lint: error {lint.errors} · warning {lint.warnings} · 미구현 규칙{' '}
              {lint.todo.join(', ')}
            </div>
            <div className="mt-1 text-stone-500">
              0건은 깨끗함이 아닙니다 — 미구현 규칙은 검사하지 않았다는 뜻입니다.
            </div>
            <ul className="mt-2 list-disc pl-5">
              {lint.findings.map((f, i) => (
                <li key={i} className={f.level === 'error' ? 'text-chart-actual' : 'text-stone-600'}>
                  [{f.code}] {f.message} {f.path !== undefined && `(${f.path})`}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-3 flex items-center gap-2">
          <Button variant="ghost" onClick={verifyHash}>
            class.json 해시 보기
          </Button>
          {hashLine !== null && <code className="text-xs text-stone-600">{hashLine}</code>}
        </div>
      </Card>

      <Card title="API 키 (BYOK)">
        <p className="mb-2 text-stone-600">
          키는 이 브라우저 메모리에만 있습니다. 새로고침하면 사라지고, 폴더에도 우리 서버에도
          저장되지 않습니다.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="password"
            className="w-80 rounded border border-stone-300 px-2 py-1 font-mono text-sm"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="선생님 개인 Claude API 키"
            autoComplete="off"
          />
          <Button variant="ghost" onClick={clearApiKey}>
            지우기
          </Button>
          {apiKey.length >= 4 && (
            <span className="text-xs text-stone-500">끝 4자리 …{apiKey.slice(-4)}</span>
          )}
        </div>
      </Card>

      <Card title="영수증">
        <p className="mb-2 text-stone-600">
          호출마다 1행. 키는 마지막 4자리만 적고 금액은 적지 않습니다(단가는 변합니다).
        </p>
        <Button variant="ghost" onClick={showReceipts}>
          {ROOT.bankReceipts} 보기
        </Button>
        {receipts !== null && (
          <table className="mt-3 w-full text-left text-xs">
            <thead className="text-stone-500">
              <tr>
                <th className="py-1">시각</th>
                <th>차선</th>
                <th>용도</th>
                <th>모델</th>
                <th>in/out</th>
                <th>키</th>
              </tr>
            </thead>
            <tbody>
              {receipts.map((r, i) => (
                <tr key={i} className="border-t border-stone-100">
                  <td className="py-1">{r.at.slice(0, 19).replace('T', ' ')}</td>
                  <td>{r.lane}</td>
                  <td>{r.purpose}</td>
                  <td className="font-mono">{r.model}</td>
                  <td>
                    {r.input_tokens}/{r.output_tokens}
                  </td>
                  <td>…{r.key_last4}</td>
                </tr>
              ))}
              {receipts.length === 0 && (
                <tr>
                  <td className="py-2 text-stone-500" colSpan={6}>
                    아직 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="CAS 자가진단">
        <p className="mb-2 text-stone-600">
          Pyodide {limits.pyodideVersion} 를 불러 sympy 로 한 식을 풀어 봅니다. 로드 시간은 실측값입니다.
        </p>
        <Button variant="ghost" onClick={casSelfTest}>
          CAS 자가진단
        </Button>
        {cas !== null && (
          <div className="mt-2 text-xs">
            <div className={cas.passed ? 'text-primary' : 'text-chart-actual'}>
              결과 {cas.stdout || '(빈 출력)'} / 기대 {cas.expected} —{' '}
              {cas.passed ? '일치' : '불일치'}
            </div>
            <div className="text-stone-600">
              로드 {Math.round(cas.timing.elapsedMs)} ms ({cas.timing.cached ? '캐시 후' : '첫 로드'})
            </div>
          </div>
        )}
      </Card>

      <Card title="통로 함수 (무저장)">
        <p className="mb-2 text-stone-600">
          로그인한 선생만 부를 수 있습니다. 키는 요청에 실려 지나갈 뿐 서버에 남지 않습니다.
          폴더 작업과 직결 호출은 로그인 없이도 동작합니다.
        </p>
        {!isSupabaseConfigured() && (
          <Notice tone="warn">Supabase 설정(.env.local)이 없어 통로 함수를 부를 수 없습니다.</Notice>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {!authChecked ? (
            <span className="text-xs text-stone-500">로그인 상태 확인 중…</span>
          ) : signedIn !== null ? (
            <>
              <span className="text-xs text-primary">로그인됨 · {signedIn}</span>
              <Button
                variant="ghost"
                onClick={() =>
                  run(async () => {
                    await signOut();
                    setMessage("로그아웃했습니다.");
                  })
                }
              >
                로그아웃
              </Button>
            </>
          ) : (
            <>
              <input
                type="email"
                className="w-64 rounded border border-stone-300 px-2 py-1 text-sm"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="선생님 이메일"
              />
              <Button
                variant="ghost"
                disabled={!isSupabaseConfigured()}
                onClick={() =>
                  run(async () => {
                    await sendMagicLink(email);
                    setMessage(
                      "로그인 링크를 보냈습니다. 메일함에서 링크를 누르면 이 화면으로 돌아옵니다.",
                    );
                  })
                }
              >
                로그인 링크 받기
              </Button>
            </>
          )}
          <Button
            disabled={!isSupabaseConfigured() || signedIn === null}
            onClick={passthroughSmoke}
          >
            통로 함수 카나리 호출
          </Button>
        </div>
        {authChecked && signedIn === null && isSupabaseConfigured() && (
          <p className="mt-2 text-xs text-stone-500">
            통로 함수는 로그인한 선생만 부를 수 있습니다(verify_jwt). 먼저 로그인하세요.
          </p>
        )}
        {canary !== null && (
          <p className="mt-2 text-xs text-stone-600">
            이번 카나리 문자열: <code>{canary}</code> — 함수 로그에서 이 문자열이 0건이어야 합니다.
          </p>
        )}
      </Card>
    </div>
  );
}
