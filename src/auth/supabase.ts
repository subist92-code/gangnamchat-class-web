import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase Auth 이메일 매직링크만(C-071 부수 · C-039 ①).
 * 로그인은 통로 함수 호출에만 필요하다 — 폴더 작업과 직결 호출은 로그인 없이도 동작해야 한다
 * (H-1: 우리 서버가 없어도 선생 폴더는 산다).
 * 서버 DB 테이블 0개. 약관 동의 테이블은 U-008 후속.
 */

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

let cached: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return typeof url === 'string' && url.length > 0 && typeof anonKey === 'string' && anonKey.length > 0;
}

export function supabase(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase 설정이 없습니다(.env.local 의 VITE_SUPABASE_URL · VITE_SUPABASE_ANON_KEY).');
  }
  cached ??= createClient(url as string, anonKey as string);
  return cached;
}

/**
 * 매직링크를 보낸다. 링크를 누르면 지금 보고 있던 주소로 되돌아온다 —
 * supabase-js 가 주소 조각(#access_token)을 읽어 세션을 세운다(detectSessionInUrl 기본값).
 * 되돌아올 주소는 Supabase 대시보드 Auth > URL Configuration 에 등록되어 있어야 한다.
 */
export async function sendMagicLink(email: string): Promise<void> {
  const redirectTo = `${window.location.origin}${window.location.pathname}`;
  const { error } = await supabase().auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo },
  });
  if (error !== null) throw new Error(error.message);
}

/** 로그인한 선생(이메일). 로그인 안 했으면 null. */
export async function currentEmail(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const { data } = await supabase().auth.getSession();
  return data.session?.user.email ?? null;
}

/**
 * 로그인 상태가 바뀔 때마다 알려 준다(매직링크로 돌아온 순간 포함).
 * 반환값을 부르면 구독을 끊는다.
 */
export function onAuthChange(handle: (email: string | null) => void): () => void {
  if (!isSupabaseConfigured()) return () => {};
  const { data } = supabase().auth.onAuthStateChange((_event, session) => {
    handle(session?.user.email ?? null);
  });
  return () => data.subscription.unsubscribe();
}

export async function signOut(): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const { error } = await supabase().auth.signOut();
  if (error !== null) throw new Error(error.message);
}

export async function currentAccessToken(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const { data } = await supabase().auth.getSession();
  return data.session?.access_token ?? null;
}

export interface PassthroughSummary {
  text: string;
  receipt: {
    model: string;
    input_tokens: number;
    output_tokens: number;
    key_last4: string;
  };
}

/**
 * 스모크 4 — 무저장 통로 함수 호출.
 * 키는 헤더에 실려 지나갈 뿐 어디에도 저장되지 않는다(H-2).
 */
export async function callPassthrough(
  apiKey: string,
  prompt: string,
): Promise<PassthroughSummary> {
  const token = await currentAccessToken();
  if (token === null) throw new Error('통로 함수는 로그인이 필요합니다(verify_jwt).');
  const fn = (import.meta.env.VITE_PASSTHROUGH_FUNCTION as string | undefined) ?? 'passthrough-smoke';
  const response = await fetch(`${url as string}/functions/v1/${fn}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      'x-byok-key': apiKey,
    },
    body: JSON.stringify({ prompt }),
  });
  if (!response.ok) {
    throw new Error(`통로 함수 오류 ${response.status}: ${await response.text()}`);
  }
  return (await response.json()) as PassthroughSummary;
}
