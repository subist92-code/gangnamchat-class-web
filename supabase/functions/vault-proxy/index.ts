/**
 * 통로 본편 — 금고 조립 · R-verify(지시서 02 §2-4 · H-2 · H-3 · C-051).
 *
 * 골격 = `passthrough-smoke`(지시서 01 · fetch 방식). 그쪽은 카나리 회귀용으로 남긴다.
 *
 * 이 함수가 지키는 것:
 *   - 블록은 버킷 → 이 프로세스의 메모리 Map 까지만. 디스크·KV·로그 0(H-3).
 *   - 조립 프롬프트와 블록 본문은 응답에 한 조각도 담지 않는다(V-3).
 *   - `console.*` 0. 예외 메시지에 요청 본문·블록 문자열을 섞지 않는다.
 *   - 선생 키는 헤더로 받아 상류 호출에만 쓰고 영수증엔 끝 4자리만(H-2).
 *   - 모델 ID 는 환경변수에서만 온다(C-051 · 리터럴 0).
 */
import { assemble, type RecipesJson } from './assemble.ts';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, x-byok-key',
  'access-control-allow-methods': 'POST, OPTIONS',
  // 자리 G — 배포 해시를 브라우저가 읽으려면 노출 목록에 있어야 한다.
  'access-control-expose-headers': 'x-passthrough-build',
};

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';
const MAX_TOKENS = 4096;
const BUCKET = 'vault';

/** 이번 국면이 받는 레시피는 이것 하나다. 나머지는 400(지시서 02 §7). */
const ALLOWED_RECIPE = 'R-verify';
const ALLOWED_UNITS = ['B10', 'B20', 'B30', 'B40', 'B-D'];
const ALLOWED_COURSES = ['high', 'middle'];

/** B-D 분기 지시 1줄(규격 §2 · C-065 · 문구 확정 2026-09-06). */
function bdDirective(course: string): string {
  return (
    `이 문항의 과정(course)은 ${course}이다. ` +
    '공통기초 블록의 과정 분기표(B-D-2)에서 그 열의 조문만 적용한다.'
  );
}

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, ...extra, 'content-type': 'application/json' },
  });
}

function buildHeaders(): Record<string, string> {
  const build = Deno.env.get('PASSTHROUGH_BUILD');
  return build === undefined || build.length === 0 ? {} : { 'x-passthrough-build': build };
}

/** 【자리 F】 계정당 캡 · 대량 패턴 탐지. 결재(Q-02-2) 전까지 동작 0. */
function capHook(): void {
  // 의도적으로 비어 있다. 서버 카운터는 결재 후에만 생긴다(C-012 · 무기록과 긴장).
}

/**
 * 「로그인한 선생만」 게이트(2026-09-06 수리).
 *
 * `verify_jwt = true` 만으로는 부족하다 — 실측 결과 publishable 키(브라우저 번들에 실려
 * 나가는 공개 키)만으로도 플랫폼 게이트를 통과했다. 그 상태로는 로그인 없이 누구나
 * 이 함수를 부를 수 있어 「로그인한 선생만」이 성립하지 않는다.
 *
 * 서명은 플랫폼이 이미 검증한다 — 위조 JWT 는 apikey 를 함께 보내도 401 로 막히는 것을
 * 실측했다. 그래서 여기서는 payload 의 role · sub 만 본다.
 *
 * @returns 선생 식별자(JWT sub) · 로그인 세션이 아니면 null
 */
function signedInTeacher(req: Request): string | null {
  const auth = req.headers.get('authorization');
  if (auth === null) return null;

  const token = auth.replace(/^Bearer\s+/i, '').trim();
  const parts = token.split('.');
  if (parts.length !== 3) return null; // publishable 같은 opaque 키는 JWT 가 아니다

  try {
    const raw = parts[1] as string;
    const padded = raw.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(padded)) as { role?: unknown; sub?: unknown };
    if (payload.role !== 'authenticated') return null;
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) return null;
    return payload.sub;
  } catch {
    return null;
  }
}

// ── 금고 적재(콜드 스타트 1회) ────────────────────────────────────────────────
let vaultFiles: Map<string, string> | null = null;
let vaultRecipes: RecipesJson | null = null;
let vaultTool: Record<string, unknown> | null = null;

const FIXED = ['recipes.json', 'tools/emit_verdict.schema.json'];

/**
 * 버킷 읽기용 비밀 키(새 키 체계 · 2026-09-06 전환).
 *
 * `SUPABASE_SECRET_KEYS` 는 문자열이 아니라 **이름별 JSON 객체**다 — 기본 이름은 `default`.
 * 레거시 `SUPABASE_SERVICE_ROLE_KEY` 는 더 이상 읽지 않는다(유출로 폐기 예정).
 * `SUPABASE_SECRET_KEY`(단수)는 로컬 CLI 단일 키 구성의 폴백이다.
 */
let cachedSecret: string | null = null;

function secretKey(): string {
  if (cachedSecret !== null) return cachedSecret;

  const named = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (named !== undefined && named.length > 0) {
    try {
      const parsed = JSON.parse(named) as Record<string, unknown>;
      const found = parsed['default'];
      if (typeof found === 'string' && found.length > 0) {
        cachedSecret = found;
        return found;
      }
    } catch {
      // 형식이 아니면 아래 폴백으로 넘어간다. 값은 절대 찍지 않는다.
    }
  }

  const single = Deno.env.get('SUPABASE_SECRET_KEY');
  if (single !== undefined && single.length > 0) {
    cachedSecret = single;
    return single;
  }

  throw new Error('vault_env_missing');
}

async function fetchObject(path: string): Promise<string> {
  const url = Deno.env.get('SUPABASE_URL');
  if (url === undefined) throw new Error('vault_env_missing');
  const key = secretKey();
  const base = url.replace(/\/+$/, '');
  const res = await fetch(base + '/storage/v1/object/' + BUCKET + '/' + path, {
    headers: { authorization: 'Bearer ' + key, apikey: key },
  });
  if (!res.ok) throw new Error('vault_object_unavailable');
  return await res.text();
}

async function loadVault(): Promise<void> {
  if (vaultFiles !== null) return;

  const manifestRaw = await fetchObject('manifest.json');
  const manifest = JSON.parse(manifestRaw) as Record<string, { file?: string }>;

  const paths: string[] = [];
  for (const [id, entry] of Object.entries(manifest)) {
    if (id === '_meta') continue;
    if (entry !== null && typeof entry === 'object' && typeof entry.file === 'string') {
      paths.push(entry.file);
    }
  }

  const files = new Map<string, string>();
  files.set('manifest.json', manifestRaw);
  for (const path of [...paths, ...FIXED]) {
    files.set(path, await fetchObject(path));
  }

  const recipes = JSON.parse(files.get('recipes.json') as string) as RecipesJson;
  const schema = JSON.parse(files.get('tools/emit_verdict.schema.json') as string) as Record<
    string,
    unknown
  >;

  // 스키마 파일이 도구 정의 통째든 순수 JSON Schema 든 받는다(REF · 원문 무수정).
  vaultTool =
    typeof schema['name'] === 'string' && schema['input_schema'] !== undefined
      ? schema
      : { name: 'emit_verdict', description: '검증 판정을 이 도구로만 낸다.', input_schema: schema };

  vaultFiles = files;
  vaultRecipes = recipes;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

interface RequestBody {
  recipe?: unknown;
  unit?: unknown;
  course?: unknown;
  input?: Record<string, unknown>;
}

interface ModelResponse {
  model: string;
  content: Array<{ type: string; name?: string; input?: unknown }>;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

function extractVerdict(payload: ModelResponse): unknown {
  const block = payload.content.find((c) => c.type === 'tool_use' && c.name === 'emit_verdict');
  return block === undefined ? undefined : block.input;
}

Deno.serve(async (req: Request): Promise<Response> => {
  const headers = buildHeaders();
  if (req.method === 'OPTIONS') return new Response('ok', { headers: { ...CORS, ...headers } });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405, headers);

  // 로그인 확인이 먼저다 — 로그인하지 않은 호출은 입력 검증에 닿기 전에 끊는다.
  if (signedInTeacher(req) === null) {
    return json({ error: 'login_required' }, 401, headers);
  }

  const apiKey = req.headers.get('x-byok-key');
  if (apiKey === null || apiKey.length === 0) {
    return json({ error: 'x-byok-key 헤더가 없습니다.' }, 400, headers);
  }

  const model = Deno.env.get('MODEL_VERIFY');
  if (model === undefined || model.length === 0) {
    return json({ error: 'MODEL_VERIFY 환경변수가 설정되지 않았습니다.' }, 500, headers);
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return json({ error: '본문을 읽을 수 없습니다.' }, 400, headers);
  }

  if (body.recipe !== ALLOWED_RECIPE) {
    return json({ error: '이번 국면은 ' + ALLOWED_RECIPE + ' 만 받습니다.' }, 400, headers);
  }
  if (typeof body.unit !== 'string' || !ALLOWED_UNITS.includes(body.unit)) {
    return json({ error: 'unit 이 올바르지 않습니다.' }, 400, headers);
  }
  if (typeof body.course !== 'string' || !ALLOWED_COURSES.includes(body.course)) {
    return json({ error: 'course 가 올바르지 않습니다.' }, 400, headers);
  }

  capHook();

  try {
    await loadVault();
  } catch {
    return json({ error: 'vault_unavailable' }, 503, headers);
  }

  let built;
  try {
    built = assemble(
      ALLOWED_RECIPE,
      body.unit,
      vaultRecipes as RecipesJson,
      vaultFiles as Map<string, string>,
    );
  } catch {
    return json({ error: 'vault_unavailable' }, 503, headers);
  }

  // system = 블록 배열. 마지막 정적 블록 끝이 캐시 경계다(규격 §5).
  const system = built.blocks.map(
    (b) => ({ type: 'text', text: b.text }) as Record<string, unknown>,
  );
  if (body.course === 'middle' || body.unit === 'B-D') {
    system.push({ type: 'text', text: bdDirective(body.course) });
  }
  const last = system[system.length - 1];
  if (last !== undefined) last['cache_control'] = { type: 'ephemeral' };

  const userPayload = JSON.stringify(body.input ?? {});
  const requestHash = await sha256Hex(
    ALLOWED_RECIPE + '|' + body.unit + '|' + body.course + '|' + userPayload,
  );

  // ?dry=1 — 상류 호출 없이 조립 규모만 돌려준다(스모크 ⑤). 본문은 나가지 않는다.
  if (new URL(req.url).searchParams.get('dry') === '1') {
    return json(
      {
        dry: true,
        recipe: ALLOWED_RECIPE,
        unit: body.unit,
        chars: built.charTotal,
        blocks: built.versions,
        block_chars: Object.fromEntries(built.blocks.map((b) => [b.id, b.chars])),
        request_hash: requestHash,
      },
      200,
      headers,
    );
  }

  const callModel = async (extraTurn: string | null): Promise<Response> => {
    const messages: Array<Record<string, unknown>> = [{ role: 'user', content: userPayload }];
    if (extraTurn !== null) messages.push({ role: 'user', content: extraTurn });
    return await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': API_VERSION,
      },
      body: JSON.stringify({
        model,
        max_tokens: MAX_TOKENS,
        system,
        messages,
        tools: [vaultTool],
        tool_choice: { type: 'tool', name: 'emit_verdict' },
      }),
    });
  };

  try {
    let upstream = await callModel(null);
    if (!upstream.ok) {
      let kind = 'HTTP ' + String(upstream.status);
      try {
        const failure = (await upstream.json()) as { error?: { type?: unknown } };
        if (typeof failure.error?.type === 'string') kind = failure.error.type;
      } catch {
        // 형식이 아니면 상태 코드만 쓴다.
      }
      return json({ error: '모델 호출 실패: ' + kind }, 502, headers);
    }

    let payload = (await upstream.json()) as ModelResponse;
    let verdict = extractVerdict(payload);

    if (verdict === undefined) {
      // 1회 재요청. 그래도 안 되면 모델 자유 문장은 돌려주지 않는다(블록 문장 혼입 방지).
      upstream = await callModel('emit_verdict 도구로만 답하라.');
      if (upstream.ok) {
        payload = (await upstream.json()) as ModelResponse;
        verdict = extractVerdict(payload);
      }
    }

    if (verdict === undefined) {
      return json({ error: 'verdict_unparsable' }, 422, headers);
    }

    return json(
      {
        verdict,
        receipt: {
          lane: 'vault',
          purpose: 'verify',
          recipe: ALLOWED_RECIPE,
          blocks: built.versions,
          model: payload.model,
          input_tokens: payload.usage.input_tokens,
          output_tokens: payload.usage.output_tokens,
          cache_read_tokens: payload.usage.cache_read_input_tokens ?? 0,
          cache_creation_tokens: payload.usage.cache_creation_input_tokens ?? 0,
          key_last4: apiKey.slice(-4),
          request_hash: requestHash,
        },
      },
      200,
      headers,
    );
  } catch (err) {
    const name = err instanceof Error ? err.name : 'Error';
    return json({ error: '모델 호출 실패: ' + name }, 502, headers);
  }
});
