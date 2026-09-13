/**
 * functions/api/subscribe.ts — Cloudflare Pages Function 1개 (구현 지시서 01(2기) §5 · 02(2기) v2.0 §4)
 *
 * 하는 일: 이메일을 받고, 한 행을 저장하고, 배포물 링크 2개(패키지 · 교사용 킷)를 메일 1통으로 보낸다.
 * 그 외에는 아무것도 하지 않는다. 두 zip 은 합치지 않는다(C2-100) — 링크만 두 개다.
 *
 * 서버가 보유하는 것 (C2-065 · CLAUDE.md §6)
 *   email · consented_at · sent_at · ip_hash(해시만) · cta — 그 외 0.
 *   IP 원문 · 이메일 전문 · 키는 로그에도 남기지 않는다.
 *
 * 멱등이 아니다 — 같은 이메일이 다시 요청하면 다시 보내고 행을 하나 더 쌓는다(U2-003).
 * 남용 상한 N·M 은 환경변수다(P-9 · R-1). 코드에 숫자를 적지 않는다.
 */

// ── Pages Function 최소 타입 (외부 타입 패키지에 의존하지 않는다) ──────────
interface Env {
  SUPABASE_URL: string;
  SUPABASE_SECRET_KEY: string;
  RESEND_API_KEY: string;
  MAIL_FROM: string;
  PACKAGE_URL: string;
  KIT_URL: string;
  RATE_EMAIL_PER_DAY: string;
  RATE_IP_PER_DAY: string;
  IP_HASH_SALT: string;
}
interface EventContext<E> {
  request: Request;
  env: E;
}

// ── 사용자에게 보이는 문안 (§5-3 · 랜딩 v1.0 §2) ───────────────────────────
const MSG = {
  sent: '보냈습니다. 메일이 안 보이면 스팸함을 확인해 주세요.',
  badEmail: '이메일 형식을 확인해 주세요.',
  noConsent: '동의가 필요합니다.',
  rate: '오늘은 더 보낼 수 없습니다. 내일 다시 요청해 주세요.',
  down: '지금은 보낼 수 없습니다. 잠시 후 다시 시도해 주세요.',
} as const;

type Cta = 'A' | 'B' | 'C';

// 제목 — 폼 C(교사용 킷 구획)만 킷 제목 · 그 외(A·B·값 없음) 패키지 제목 (§4 · 랜딩 v1.1 §2)
const subjectFor = (cta: Cta | null) =>
  cta === 'C' ? '강남챗 클래스 — 교사용 킷' : '강남챗 클래스 — 미끼값 프롬프트 패키지';

const KIT_GUIDE_URL = 'https://class.gangnamchat.com/#kit-guide';

// ── 메일 본문 (지시서 02(2기) v2.0 §4-1 · 텍스트와 HTML이 같은 내용) ─────────
// 블록 두 개. 요청한 쪽을 위에 둔다 — 폼 C 는 두 블록의 순서만 바꾼다(§4-1 · C2-105 ⓓ).
// 문안은 지시서 §4-1 글자 그대로다. 고칠 일이 생기면 지시서·대장을 먼저 고친다.
type Block = { lines: string[]; url: string; guide?: string };

function blocks(env: Env, cta: Cta | null): Block[] {
  const pkg: Block = {
    lines: [
      '요청하신 「미끼값 프롬프트」 패키지입니다.',
      '받으시는 것: 미끼값 프롬프트 · 난이도 기준표 · 리포트 생성 규칙 · 예시 문항',
    ],
    url: env.PACKAGE_URL,
  };
  const kit: Block = {
    lines: [
      '문제를 직접 만드시는 분께 — 교사용 킷도 함께 보내 드립니다.',
      '저작·검수·고난도 설계·오개념 참고사전. 쓰는 법은 아래 안내를 보세요.',
    ],
    url: env.KIT_URL,
    guide: KIT_GUIDE_URL,
  };
  return cta === 'C' ? [kit, pkg] : [pkg, kit];
}

const CLOSING = [
  '두 자료는 따로입니다. 시험을 읽는 법이 먼저이고, 문제를 만드는 도구가 그다음입니다.',
  '라이선스 CC BY-ND 4.0 — 출처를 밝히면 자유롭게 배포할 수 있고, 수정본 배포는 하지 않습니다.',
];

function mailText(env: Env, cta: Cta | null): string {
  const parts = blocks(env, cta).map((b) =>
    [...b.lines, `내려받기: ${b.url}`, ...(b.guide ? [`사용 안내: ${b.guide}`] : [])].join('\n'));
  return ['오답은 말을 합니다.', ...parts, ...CLOSING, 'with gangnamchat\nclass.gangnamchat.com'].join('\n\n') + '\n';
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function mailHtml(env: Env, cta: Cta | null): string {
  const link = (label: string, url: string) =>
    `${label}: <a href="${esc(url)}" style="color:#3E6FA8">${esc(url)}</a>`;
  const parts = blocks(env, cta).map((b) =>
    `<p>${[...b.lines.map(esc), link('내려받기', b.url), ...(b.guide ? [link('사용 안내', b.guide)] : [])].join('<br>\n')}</p>`);
  return `<!doctype html><html lang="ko"><meta charset="utf-8">
<body style="margin:0;padding:24px;background:#FAF9F5;color:#1F2328;font:16px/1.8 -apple-system,'Segoe UI',sans-serif">
<div style="max-width:560px;margin:0 auto">
<p style="font-size:20px;margin:0 0 20px">오답은 말을 합니다.</p>
${parts.join('\n')}
${CLOSING.map((c) => `<p>${esc(c)}</p>`).join('\n')}
<p style="color:#4A5058;font-size:14px">with gangnamchat<br>class.gangnamchat.com</p>
</div></body></html>`;
}

// ── 응답 ───────────────────────────────────────────────────────────────────
function respond(request: Request, status: number, message: string, ok: boolean): Response {
  const headers: Record<string, string> = { 'Cache-Control': 'no-store' };
  const wantsJson = (request.headers.get('Accept') || '').includes('application/json');

  if (wantsJson) {
    headers['Content-Type'] = 'application/json; charset=utf-8';
    return new Response(JSON.stringify({ ok, message }), { status, headers });
  }

  // JS가 죽었을 때의 일반 POST 경로 — 같은 내용을 한 장으로 돌려준다.
  headers['Content-Type'] = 'text/html; charset=utf-8';
  const escaped = message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return new Response(
    `<!doctype html><html lang="ko"><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>강남챗 클래스</title>` +
    `<body style="margin:0;padding:3rem 1.25rem;background:#FAF9F5;color:#1F2328;` +
    `font:16px/1.8 -apple-system,'Segoe UI',sans-serif">` +
    `<div style="max-width:720px;margin:0 auto">` +
    `<p style="font-size:1.2rem">${escaped}</p>` +
    `<p><a href="/" style="color:#3E6FA8">돌아가기</a></p>` +
    `</div></body></html>`,
    { status, headers },
  );
}

// ── 도구 ───────────────────────────────────────────────────────────────────
const EMAIL_RE = /^[^\s@,;:<>()[\]\\"]+@[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$/;

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** 오늘(Asia/Seoul 자정)의 시작 시각을 ISO로. KST = UTC+9 고정(서머타임 없음). */
function seoulDayStartIso(now = new Date()): string {
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const seoul = new Date(now.getTime() + KST_OFFSET_MS);
  const midnightSeoulAsUtc = Date.UTC(seoul.getUTCFullYear(), seoul.getUTCMonth(), seoul.getUTCDate());
  return new Date(midnightSeoulAsUtc - KST_OFFSET_MS).toISOString();
}

/**
 * 새 키 체계의 secret 키(sb_secret_…)는 JWT가 아니다 — `apikey` 헤더에만 싣는다.
 * `Authorization: Bearer <secret 키>`를 함께 보내면 게이트웨이가 그대로 넘기고
 * PostgREST 가 401 PGRST303 으로 거절한다(S5 1차 · 09-13 로그 실측).
 * apikey 만 보내면 게이트웨이가 service_role JWT 를 넣어 준다.
 */
function restHeaders(env: Env): Record<string, string> {
  return {
    apikey: env.SUPABASE_SECRET_KEY,
    'Content-Type': 'application/json',
  };
}

/** PostgREST 의 Content-Range 로 개수만 센다 — 행 내용을 끌어오지 않는다. */
async function countSince(env: Env, column: 'email' | 'ip_hash', value: string, sinceIso: string): Promise<number> {
  const url = `${env.SUPABASE_URL}/rest/v1/package_requests`
    + `?select=id&${column}=eq.${encodeURIComponent(value)}`
    + `&created_at=gte.${encodeURIComponent(sinceIso)}&limit=1`;
  // limit=1 + count=exact → 행은 최대 1개만 오고 Content-Range 에 전체 개수가 실린다.
  // (Range 헤더를 쓰면 행이 0개일 때 416 이 날 수 있어 쓰지 않는다.)
  const res = await fetch(url, {
    headers: { ...restHeaders(env), Prefer: 'count=exact' },
  });
  if (!res.ok) throw new Error(`count ${res.status}`);
  const range = res.headers.get('content-range') || '';   // "0-0/7" 또는 "*/0"
  const total = Number(range.split('/')[1]);
  if (!Number.isFinite(total)) throw new Error('count parse');
  return total;
}

// ── 본체 ───────────────────────────────────────────────────────────────────
async function handlePost(context: EventContext<Env>): Promise<Response> {
  const { request, env } = context;

  // 설정값이 없으면 동작하지 않는다 — 기본값을 코드에 박아 두지 않는다(P-9 · 임시 땜질 금지).
  const required: (keyof Env)[] = [
    'SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'RESEND_API_KEY', 'MAIL_FROM',
    'PACKAGE_URL', 'KIT_URL', 'RATE_EMAIL_PER_DAY', 'RATE_IP_PER_DAY', 'IP_HASH_SALT',
  ];
  const missing = required.filter((k) => !env[k]);
  if (missing.length) {
    console.error(`subscribe: 환경변수 누락 ${missing.join(',')}`);
    return respond(request, 503, MSG.down, false);
  }

  const rateEmail = Number(env.RATE_EMAIL_PER_DAY);
  const rateIp = Number(env.RATE_IP_PER_DAY);
  if (!Number.isInteger(rateEmail) || !Number.isInteger(rateIp) || rateEmail < 1 || rateIp < 1) {
    console.error('subscribe: RATE_* 설정값이 양의 정수가 아니다');
    return respond(request, 503, MSG.down, false);
  }

  // 입력 — FormData(폼 직접 POST · fetch 둘 다) 와 JSON 을 받는다.
  let email = '', consent = '', website = '', cta = '';
  try {
    const type = request.headers.get('Content-Type') || '';
    if (type.includes('application/json')) {
      const body = await request.json() as Record<string, unknown>;
      email = String(body.email ?? '');
      consent = String(body.consent ?? '');
      website = String(body.website ?? '');
      cta = String(body.cta ?? '');
    } else {
      const form = await request.formData();
      email = String(form.get('email') ?? '');
      consent = String(form.get('consent') ?? '');
      website = String(form.get('website') ?? '');
      cta = String(form.get('cta') ?? '');
    }
  } catch {
    return respond(request, 400, MSG.badEmail, false);
  }

  // ① 허니팟 — 봇에게는 성공과 구분되지 않는 화면을 준다. 저장 0 · 전송 0.
  if (website.trim() !== '') {
    return respond(request, 200, MSG.sent, true);
  }

  // ② 검증
  email = email.trim().toLowerCase();
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return respond(request, 400, MSG.badEmail, false);
  }
  if (consent !== 'on' && consent !== 'true' && consent !== '1') {
    return respond(request, 400, MSG.noConsent, false);
  }
  // 'A'·'B'·'C' 외의 값은 null 로 저장한다(스키마 변경 없음 · text 열 · C2-105 ⓕ)
  const ctaValue: Cta | null = cta === 'A' || cta === 'B' || cta === 'C' ? cta : null;

  // ③ 레이트 리밋
  const ip = request.headers.get('CF-Connecting-IP')
    || (request.headers.get('X-Forwarded-For') || '').split(',')[0].trim();
  const ipHash = await sha256Hex(`${env.IP_HASH_SALT}${ip}`);
  const since = seoulDayStartIso();

  try {
    const [byEmail, byIp] = await Promise.all([
      countSince(env, 'email', email, since),
      countSince(env, 'ip_hash', ipHash, since),
    ]);
    if (byEmail >= rateEmail || byIp >= rateIp) {
      return respond(request, 429, MSG.rate, false);
    }
  } catch (err) {
    console.error(`subscribe: 레이트 조회 실패 ${(err as Error).message}`);
    return respond(request, 503, MSG.down, false);
  }

  // ④ 저장 — sent_at 은 아직 NULL
  let rowId: string;
  try {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/package_requests`, {
      method: 'POST',
      headers: { ...restHeaders(env), Prefer: 'return=representation' },
      body: JSON.stringify({
        email,
        consented_at: new Date().toISOString(),
        ip_hash: ipHash,
        cta: ctaValue,
      }),
    });
    if (!res.ok) throw new Error(`insert ${res.status}`);
    const rows = await res.json() as { id: string }[];
    rowId = rows[0].id;
  } catch (err) {
    console.error(`subscribe: 저장 실패 ${(err as Error).message}`);
    return respond(request, 503, MSG.down, false);
  }

  // ⑤ 전송 — 첨부 없음(링크만). 실패해도 ④의 행은 남는다.
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.MAIL_FROM,
        to: [email],
        subject: subjectFor(ctaValue),
        text: mailText(env, ctaValue),
        html: mailHtml(env, ctaValue),
      }),
    });
    // ⑥ 오류 본문은 남기지 않는다 — 상태 코드만.
    if (!res.ok) throw new Error(`resend ${res.status}`);
  } catch (err) {
    console.error(`subscribe: 전송 실패 ${(err as Error).message} (행 ${rowId} 는 sent_at NULL 로 남는다)`);
    return respond(request, 503, MSG.down, false);
  }

  // 전송 성공 → sent_at 기록. 이 갱신이 실패해도 메일은 이미 갔으므로 사용자에게는 성공이다.
  try {
    const res = await fetch(
      `${env.SUPABASE_URL}/rest/v1/package_requests?id=eq.${encodeURIComponent(rowId)}`,
      {
        method: 'PATCH',
        headers: { ...restHeaders(env), Prefer: 'return=minimal' },
        body: JSON.stringify({ sent_at: new Date().toISOString() }),
      },
    );
    if (!res.ok) throw new Error(`update ${res.status}`);
  } catch (err) {
    console.error(`subscribe: sent_at 갱신 실패 ${(err as Error).message} (메일은 발송됨 · 행 ${rowId})`);
  }

  return respond(request, 200, MSG.sent, true);
}

/** 진입점은 하나다. POST 외의 메서드는 받지 않는다. */
export const onRequest = async (context: EventContext<Env>): Promise<Response> => {
  if (context.request.method === 'POST') return handlePost(context);
  return new Response('Method Not Allowed', {
    status: 405,
    headers: { Allow: 'POST', 'Cache-Control': 'no-store' },
  });
};
