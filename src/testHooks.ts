import type { FolderAdapter } from './folder/FolderAdapter';
import type { transcribePage } from './llm/direct';
import type { callVerify } from './verify/client';

/**
 * 테스트 주입 지점 하나. e2e 는 showDirectoryPicker 와 모델 호출을 쓸 수 없으므로
 * 여기에 심어 둔 어댑터·목 호출을 대신 쓴다(§2-9).
 * 실제 서비스에서는 아무도 이 값을 채우지 않는다.
 */
export interface TestHooks {
  adapter?: FolderAdapter;
  transcribe?: typeof transcribePage;
  /** 검증 호출 목 — e2e 는 로그인 세션도 금고도 없다. */
  verify?: typeof callVerify;
}

declare global {
  interface Window {
    __GC_CLASS_TEST__?: TestHooks;
  }
}

export function testHooks(): TestHooks | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.__GC_CLASS_TEST__;
}
