/// <reference lib="webworker" />

/**
 * CAS 실행 Worker(지시서 02 §3-3).
 *
 * 스크립트 1 건 = Worker 1 회 실행. 메인 스레드가 타임아웃에 걸리면 `terminate()` 로
 * 통째로 죽인다 — sympy 가 무한 루프에 빠져도 화면이 멎지 않게 하려는 것이다.
 * 그래서 이 Worker 는 상태를 남기지 않고, 결과만 postMessage 로 돌려준다.
 *
 * classic worker 다. Pyodide 배포본이 UMD 라 `importScripts` 로 불러야 한다.
 */

export interface CasWorkerRequest {
  script: string;
  indexUrl: string;
}

export type CasWorkerResponse =
  | { ok: true; stdout: string; elapsedMs: number }
  | { ok: false; error: string; elapsedMs: number };

interface PyodideRuntime {
  loadPackage(names: string | string[]): Promise<void>;
  runPythonAsync(code: string): Promise<unknown>;
  setStdout(options: { batched: (text: string) => void }): void;
}

declare const importScripts: (...urls: string[]) => void;
declare const loadPyodide: (options: { indexURL: string }) => Promise<PyodideRuntime>;

let runtime: PyodideRuntime | null = null;

async function boot(indexUrl: string): Promise<PyodideRuntime> {
  if (runtime !== null) return runtime;
  importScripts(`${indexUrl}pyodide.js`);
  const py = await loadPyodide({ indexURL: indexUrl });
  await py.loadPackage('sympy');
  runtime = py;
  return py;
}

self.onmessage = async (event: MessageEvent<CasWorkerRequest>) => {
  const started = performance.now();
  const { script, indexUrl } = event.data;
  try {
    const py = await boot(indexUrl);
    let out = '';
    py.setStdout({
      batched: (text: string) => {
        out += `${text}\n`;
      },
    });
    await py.runPythonAsync(script);
    const response: CasWorkerResponse = {
      ok: true,
      stdout: out.trim(),
      elapsedMs: performance.now() - started,
    };
    (self as unknown as Worker).postMessage(response);
  } catch (err) {
    // 예외 메시지에 스크립트 본문을 싣지 않는다 — 이름만 옮긴다.
    const name = err instanceof Error ? err.name : 'Error';
    const response: CasWorkerResponse = {
      ok: false,
      error: name,
      elapsedMs: performance.now() - started,
    };
    (self as unknown as Worker).postMessage(response);
  }
};
