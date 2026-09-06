# vault-proxy — 금고 통로 본편(R-verify)

`passthrough-smoke`(지시서 01)의 골격을 확장한 통로다. 금고 블록을 버킷에서 읽어
메모리에서 조립하고, 모델의 판정을 `emit_verdict` 도구로 받아 돌려준다.
`passthrough-smoke` 는 카나리 회귀용으로 남긴다.

이 함수가 지키는 것:

- 블록은 버킷 → 함수 메모리 Map 까지만. 디스크 · KV · 로그 0(H-3).
- 조립 프롬프트와 블록 본문은 응답에 한 조각도 담기지 않는다(V-3).
- `console.*` 0. 예외 메시지에 요청 본문 · 블록 문자열을 섞지 않는다.
- 선생 키는 헤더로 지나갈 뿐 어디에도 남지 않는다. 영수증엔 끝 4자리만(H-2).
- 모델 ID 는 `MODEL_VERIFY` 환경변수에서만 온다(C-051 · 리터럴 0).

## 배포

```bash
supabase functions deploy vault-proxy --project-ref <PROJECT_REF>
supabase secrets set MODEL_VERIFY=<모델 ID> --project-ref <PROJECT_REF>
```

버킷 읽기 키는 따로 넣지 않는다 — 새 키 체계의 `SUPABASE_SECRET_KEYS` 가 함수 환경에
자동 주입된다. **이 값은 문자열이 아니라 이름별 JSON 객체이고 기본 이름은 `default` 다.**
레거시 `SUPABASE_SERVICE_ROLE_KEY` 는 읽지 않는다(2026-09-06 유출로 폐기).

버킷 `vault` 는 `public = false` · **RLS 정책 0개**여야 한다. 정책을 하나도 만들지 않는
것이 요점이다 — 그래야 RLS 를 우회하는 secret 키(= 이 함수)만 읽는다.

## 호출

### ★ 헤더 값은 반드시 ASCII 로 쓴다

HTTP 헤더 값에 한글 같은 비ASCII 문자를 넣으면 브라우저 `fetch` 가 요청 자체를 거부한다.
`x-byok-key` 자리에 설명 문구를 한글로 적어 넣는 실수가 실제로 있었다(2026-09-06).
응답 **본문**의 한글은 문제 없다 — UTF-8 JSON 이다. 헤더만 ASCII 면 된다.

로그인한 선생의 세션 토큰이 필요하다. 브라우저 콘솔에서:

```js
const t = JSON.parse(localStorage.getItem('sb-<PROJECT_REF>-auth-token')).access_token;
const r = await fetch('https://<PROJECT_REF>.supabase.co/functions/v1/vault-proxy', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'authorization': 'Bearer ' + t,
    'x-byok-key': '<선생 API 키>',
  },
  body: JSON.stringify({
    recipe: 'R-verify',
    unit: 'B20',
    course: 'high',
    input: { problem_text: '...' },
  }),
});
console.log(r.status, await r.json());
```

`?dry=1` 을 붙이면 상류 호출 없이 **조립 규모와 블록별 판본만** 돌려준다(스모크 ⑤).
본문은 나가지 않고 모델도 부르지 않으므로 비용이 0 이다.

## 인증 — verify_jwt 만으로는 부족하다

`config.toml` 의 `verify_jwt = true` 는 **로그인을 보장하지 않는다.** 실측 결과
publishable 키(브라우저 번들에 실려 나가는 공개 키)만으로 플랫폼 게이트를 통과했다.
그래서 함수 안에서 `Authorization` 의 JWT payload 를 열어 `role = authenticated` 와
`sub` 를 확인한다. 서명은 플랫폼이 이미 본다 — 위조 JWT 는 `apikey` 를 함께 보내도
401 로 막히는 것을 실측했다.

## 배포 해시(자리 G · C-039 ②)

배포할 때 시크릿에 그 커밋 해시를 넣는다:

```bash
supabase secrets set PASSTHROUGH_BUILD=$(git rev-parse --short HEAD) --project-ref <PROJECT_REF>
supabase functions deploy vault-proxy --project-ref <PROJECT_REF>
```

함수가 응답 헤더 `x-passthrough-build` 로 돌려주고 설정 화면이 표시한다.
**CORS 노출 목록에 올려야 브라우저가 읽는다** — `access-control-expose-headers` 가 없으면
헤더는 오지만 스크립트에서 보이지 않는다. 확인은 OPTIONS 한 번이면 된다(모델 호출 0):

```bash
curl -s -i -X OPTIONS https://<PROJECT_REF>.supabase.co/functions/v1/vault-proxy | grep -i x-passthrough-build
```

시크릿은 배포마다 손으로 갱신한다 — 자동 산출은 후속이다.

## 검사 기록 2026-09-06

### 버킷(§2-1)

`vault` · `public = false` · **정책 0개**. 파일 25개가 올라간 상태에서:

| 상태 | anon · publishable 목록 |
|---|---|
| 정책 0개 | `[]` |
| **임시 anon SELECT 정책(양성 대조)** | **루트 5항목 · `blocks/` 15개 보임** |
| 정책 삭제 후 | `[]` |

빈 버킷에서는 이 대조가 성립하지 않는다 — 정책이 있든 없든 `[]` 라 아무것도 증명하지
못한다. 반드시 파일이 올라간 뒤에 한다. 그리고 차단 시 응답은 403 이 아니라 **200 `[]`** 다.

### 동기(§2-2)

업로드 25개(manifest 나열 20 + 배치 고정 5) · 되받아 md5 전건 대조 · **불일치 0**.

### 스모크 ⑤ 조립 무결성

| | 값 |
|---|---|
| 함수 `?dry=1` | **23,853자** |
| 로컬 `assemble.py R-verify --unit B20` | **23,853자** |
| 판정 | **일치** |

블록별: B00 4,343 · B03 4,819 · B04 1,893 · B05 2,345 · B20 7,369 · T-verify 3,084
(전부 `v1`). manifest 의 `chars_body` 와도 일치한다.

### 스모크 ⑥(a) 로그 무기록

| | 양성 대조 | 본 검사 |
|---|---|---|
| 배포 판본 | `console.log(await req.clone().text())` 있음 | 그 줄 제거 |
| 호출 시각(UTC) | 06:53:40 | 07:01:13 |
| 카나리 | `CANARY-f9b56d14-3bd6-46d7-a2ce-9c402bbe67e9` | `CANARY-911d0ac1-3f37-4ebf-8a3f-973d5932c03a` |
| `function_logs` | 요청 본문 전체가 찍힘 | `booted` 뿐 |
| **카나리 적중** | **1건** | **0건** |

본 검사의 0건이 「호출이 없어서」가 아님을 `function_edge_logs` 의
`POST | 200 | .../vault-proxy?dry=1`(07:01:13)로 확인했다.

### 스모크 ⑥(b) 블록 유출

| | 양성 대조 | 본 검사 |
|---|---|---|
| 배포 판본 | `dry` 응답에 임시 `leak_probe` | 그 필드 제거 |
| 구분자 | **발견** | **0건** |
| 머리글 `## B0n-` | **발견** | **0건** |
| 응답 길이 | 364 | **310** |

양성 판에 넣은 것은 첫 블록의 **첫 줄(구분자 줄)과 인공 머리글** 두 가지뿐이다 —
블록 본문을 응답에 실으면 양성 대조 자체가 H-3 위반이 된다. 응답 길이가 364 → 310 으로
줄어든 폭이 프로브 두 줄과 맞아, 같은 응답에서 그것만 사라졌음을 뒷받침한다.

검사는 응답 JSON 을 브라우저에서 문자열화해 스스로 판정하게 했다. 응답 원문을 밖으로
옮기지 않아야 검사 과정 자체가 유출 경로가 되지 않는다.

### 인증 게이트

수리 후 재측정 — `vault-proxy` · `passthrough-smoke` 양쪽 동일:

| 시나리오 | 결과 |
|---|---|
| 헤더 없음 | 401 |
| `apikey` = publishable | **401** `login_required` |
| `Bearer` = publishable | **401** `login_required` |
| `Bearer` = 엉터리 문자열 | 401 |
| `apikey` + 위조 JWT(role=authenticated) | **401** |
| 실제 로그인 세션 | **200** |

`?dry=1` 의 조립 규모 · 블록 판본 노출도 함께 막혔다. 수리 전에는 로그인 없이
publishable 키만으로 그 정보를 받아낼 수 있었다.

### 실호출 실측 2건 (2026-09-06 · R-verify · B20 · claude-opus-5)

같은 단원으로 연달아 두 번 불렀다.

| | 1번째 | 2번째 |
|---|---|---|
| HTTP | 200 | 200 |
| `input_tokens` | 289 | 289 |
| `output_tokens` | 1,322 | 1,534 |
| `cache_read_tokens` | **0** | **22,916** |

`input_tokens` 가 두 번 다 289 로 같다 — 조립 프롬프트(23,853자)가 입력 토큰에 잡히지
않고 전부 캐시 구간으로 갔다는 뜻이다. 1번째가 캐시를 만들고 2번째가 22,916 토큰을
통째로 재사용했다. 매번 새로 계산되는 것은 선생 문항(289 토큰)뿐이다.
**캐시 경계를 마지막 T-블록 끝에 둔 설계가 실측으로 확인됐다**(규격 §5).

판정도 계약대로 나왔다 — `status: fail · track: 1 · issues: 2 · cas_script 975자`.

#### ★ 미결: 영수증이 캐시 생성 토큰을 적지 않는다

1번째 호출의 비용 대부분은 캐시를 **만드는** 토큰(`cache_creation_input_tokens` ≈ 22,916)인데,
영수증에는 `input_tokens = 289` 만 남는다. 실제로는 그 호출이 가장 비싼데 기록상 가장 싸 보인다.

함수가 그 값을 읽지 않는 것이 직접 원인이지만, 폴더의 `receipts.json` 스키마(규격 §4-5)에도
그 열이 없다 — 코드만 고쳐서는 저장할 곳이 없다. 규격 변경이라 결재 전에는 손대지 않는다.
**규격 v0.4 후보: `cache_creation_tokens` 열 추가.**

### 금고 어휘 검사 — 자기 코드 적중 1건 (2026-09-06)

`npm run config-layer` 의 금고 어휘 검사가 **개발 중 작성한 주석을 실제로 잡았다.**
`src/verify/verdict.ts` 의 주석에 금지 어휘가 들어가 EXIT 1 로 막혔고, 문구를 고쳐 해소했다.
심어 놓은 양성 대조가 아니라 **실제 코드에서 걸린 첫 건**이라 검사식이 살아 있다는 증거로 남긴다.
0건은 깨끗함이 아니다 — 검사가 돌고 있고 걸릴 때 걸린다는 것이 확인되어야 0건이 뜻을 갖는다.

### 조회 방법

`supabase functions logs` 는 CLI 에 없는 명령이다(2.84.2 · 2.116.0 확인).
대시보드 Logs Explorer 에서 SQL 로 조회한다:

```sql
select source, timestamp, event_message
from logs
where position(event_message, 'CANARY') > 0
order by timestamp desc
```
