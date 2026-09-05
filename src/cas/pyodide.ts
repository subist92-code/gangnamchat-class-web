import { limits } from '../config/limits';

/**
 * CAS = 브라우저 Pyodide(sympy) 1차(C-071 ③ · Q-스택-3).
 * 모델이 스크립트를 쓰고 실행은 도구가 한다(H-5). 실행 주체가 선생 브라우저일 뿐이다.
 * 문항이 서버에 가지 않는다.
 */

interface PyodideRuntime {
  loadPackage(names: string | string[]): Promise<void>;
  runPythonAsync(code: string): Promise<unknown>;
  setStdout(options: { batched: (text: string) => void }): void;
}

declare global {
  interface Window {
    loadPyodide?: (options: { indexURL: string }) => Promise<PyodideRuntime>;
  }
}

let runtime: PyodideRuntime | null = null;
let loading: Promise<PyodideRuntime> | null = null;

export interface LoadTiming {
  /** ms — 실측값. 문서에 박지 않고 화면과 보고서가 그때그때 센다. */
  elapsedMs: number;
  /** 이미 메모리에 있던 런타임을 재사용했는가 */
  cached: boolean;
}

async function injectScript(url: string): Promise<void> {
  if (typeof window.loadPyodide === 'function') return;
  await new Promise<void>((resolve, reject) => {
    const tag = document.createElement('script');
    tag.src = url;
    tag.onload = () => resolve();
    tag.onerror = () => reject(new Error('Pyodide 스크립트를 불러오지 못했습니다.'));
    document.head.appendChild(tag);
  });
}

export async function loadCas(): Promise<{ runtime: PyodideRuntime; timing: LoadTiming }> {
  const started = performance.now();
  if (runtime !== null) {
    return { runtime, timing: { elapsedMs: performance.now() - started, cached: true } };
  }
  if (loading === null) {
    loading = (async () => {
      await injectScript(`${limits.pyodideIndexUrl}pyodide.js`);
      const factory = window.loadPyodide;
      if (factory === undefined) throw new Error('Pyodide 를 찾을 수 없습니다.');
      const py = await factory({ indexURL: limits.pyodideIndexUrl });
      await py.loadPackage('sympy');
      return py;
    })();
  }
  runtime = await loading;
  return { runtime, timing: { elapsedMs: performance.now() - started, cached: false } };
}

export interface SympyRunResult {
  stdout: string;
  timing: LoadTiming;
}

/** 스크립트를 그대로 실행하고 표준출력을 돌려준다. */
export async function runSympy(script: string): Promise<SympyRunResult> {
  const { runtime: py, timing } = await loadCas();
  let out = '';
  py.setStdout({ batched: (text: string) => { out += `${text}\n`; } });
  await py.runPythonAsync(script);
  return { stdout: out.trim(), timing };
}

/** 스모크 3 자가진단 — 결과 문자열이 [1, 2] 여야 한다. */
export const SELF_TEST_SCRIPT =
  "from sympy import *\nx = symbols('x')\nprint(solve(x**2 - 3*x + 2, x))";

export const SELF_TEST_EXPECTED = '[1, 2]';

export interface SelfTestResult {
  passed: boolean;
  stdout: string;
  expected: string;
  timing: LoadTiming;
  pyodideVersion: string;
}

export async function runCasSelfTest(): Promise<SelfTestResult> {
  const { stdout, timing } = await runSympy(SELF_TEST_SCRIPT);
  return {
    passed: stdout === SELF_TEST_EXPECTED,
    stdout,
    expected: SELF_TEST_EXPECTED,
    timing,
    pyodideVersion: limits.pyodideVersion,
  };
}
