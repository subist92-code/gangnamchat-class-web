/**
 * 무저장 통로 함수 — 스모크 4(C-054 · H-2 · 지시서 §3-4).
 *
 * 원형 = 강남챗 2.0 본체의 `supabase/functions/ai-proxy` 골격(PORT · 형식만).
 * 본체 리포는 이 작업에서 무접촉이므로 코드를 복사하지 않고 규격만 옮겼다(H-4).
 * 본체에 있던 사용량 DB 적재 · 원화 게이트 · userId · metadata 는 전부 뺐다.
 *
 * 이 함수는 아무것도 저장하지 않는다:
 *   - console 출력 0 (카나리 문자열이 로그에 남으면 안 된다)
 *   - DB 쓰기 0 · 파일 쓰기 0
 *   - 키는 요청 헤더로 받아 그 호출에만 쓰고 응답에 담지 않는다(마지막 4자리만)
 *
 * 모델 ID 는 환경변수에서만 온다(C-051 · 리터럴 금지).
 */
import Anthropic from 'npm:@anthropic-ai/sdk@0.72.0';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, x-byok-key',
  'access-control-allow-methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const apiKey = req.headers.get('x-byok-key');
  if (apiKey === null || apiKey.length === 0) {
    return json({ error: 'x-byok-key 헤더가 없습니다.' }, 400);
  }

  const model = Deno.env.get('MODEL_SMOKE');
  if (model === undefined || model.length === 0) {
    return json({ error: 'MODEL_SMOKE 환경변수가 설정되지 않았습니다.' }, 500);
  }

  let prompt: string;
  try {
    const body = (await req.json()) as { prompt?: unknown };
    prompt = typeof body.prompt === 'string' ? body.prompt : '';
  } catch {
    return json({ error: '본문을 읽을 수 없습니다.' }, 400);
  }
  if (prompt.length === 0) return json({ error: 'prompt 가 비었습니다.' }, 400);

  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model,
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = message.content
      .filter((block: { type: string }) => block.type === 'text')
      .map((block: { text?: string }) => block.text ?? '')
      .join('');

    // 영수증 요약만 돌려준다. 요청 본문도 응답 원문도 어디에도 남기지 않는다.
    return json({
      text,
      receipt: {
        model: message.model,
        input_tokens: message.usage.input_tokens,
        output_tokens: message.usage.output_tokens,
        key_last4: apiKey.slice(-4),
      },
    });
  } catch (err) {
    // 오류 메시지에 키나 프롬프트가 섞이지 않도록 형식만 돌려준다.
    const name = err instanceof Error ? err.name : 'Error';
    return json({ error: `모델 호출 실패: ${name}` }, 502);
  }
});
