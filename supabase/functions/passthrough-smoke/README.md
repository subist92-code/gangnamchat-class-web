# passthrough-smoke — 무저장 통로 함수(스모크 4)

## 배포

```bash
supabase functions deploy passthrough-smoke --project-ref <PROJECT_REF>
supabase secrets set MODEL_SMOKE=<모델 ID> --project-ref <PROJECT_REF>
```

모델 ID 는 코드에 없다 — `MODEL_SMOKE` 시크릿에서만 온다(C-051).

## 무저장 검사 (카나리)

1. 설정 화면에서 「통로 함수 카나리 호출」을 누른다. 화면이 이번 카나리 문자열을 보여 준다.
2. 로그에서 그 문자열을 찾는다:

```bash
supabase functions logs passthrough-smoke --project-ref <PROJECT_REF>
```

3. 0건이어야 통과다.

## 양성 대조 (의무)

「0건」이 검사가 살아 있다는 뜻인지 증명해야 한다.

1. `index.ts` 의 `Deno.serve` 첫 줄에 임시로 `console.log(await req.clone().text())` 를 넣고 배포한다.
2. 다시 호출하고 로그에서 카나리 문자열이 **잡히는지** 확인한다(1건 이상이어야 한다).
3. 그 줄을 지우고 다시 배포한다.
4. 다시 호출하고 로그에서 **0건**을 확인한다.

두 결과를 나란히 보고서에 적는다.

## 검사 기록 2026-09-06

양성 대조와 본 검사를 같은 날 연달아 돌린 결과다. 0건이 의미를 갖는 것은
같은 호출 · 같은 카나리 장치 · 같은 로그 조회로 1건이 먼저 잡혔기 때문이다.

| | 양성 대조 | 본 검사 |
|---|---|---|
| 배포 판본 | v6 — `console.log(await req.clone().text())` 있음 | v7 — 그 줄 제거 |
| 호출 시각(UTC) | 2026-09-06 03:09:22 | 2026-09-06 03:11:52 |
| 화면의 카나리 | `CANARY-631cdfb5-e07b-4b90-9991-fb7ad9bca3fa` | 새 UUID |
| `function_logs` 내용 | `{"prompt":"CANARY-631cdfb5-e07b-4b90-9991-fb7ad9bca3fa 이 문장을 그대로 한 번만 되돌려 줘."}` | `booted (time: 22ms)` 뿐 |
| **카나리 적중** | **1건 — 잡힘** | **0건** |
| HTTP 결과 | `POST 200` | `POST 200` |

인증 게이트 실측: 토큰 없음 → 401 · 토큰 있고 키 헤더 없음 → 400 `x-byok-key 헤더가 없습니다`
(핸들러까지 도달) · 로그인 상태의 실제 호출 → 200.

### 조회 방법

`supabase functions logs` 는 CLI 2.84.2 에 없는 하위 명령이다. 실제로는 로그 스트림을
직접 조회했다 — 카나리는 모두 `CANARY-` 접두어를 달고 나오므로 접두어 하나로 전수 검사가 된다.
조회 범위는 마지막 24시간 · 전 소스였고, 결과는 위 표의 양성 대조 1건뿐이었다.

```sql
select source, timestamp, event_message
from logs
where position(event_message, 'CANARY') > 0
order by timestamp desc
```

### 이 검사가 말하는 것과 말하지 않는 것

말하는 것 = 배포된 함수가 요청 본문을 로그로 내보내지 않는다.
말하지 않는 것 = 저장 일반에 대한 주장이 아니다. 그쪽은 코드에 DB 쓰기 · 파일 쓰기가
아예 없다는 사실이 받치며, 이는 배포본 자신의 소스(v7 · `verify_jwt: true` · `console.*` 0건)를
되읽어 확인했다. 로컬 파일을 믿은 것이 아니다.

### 같은 날의 근본 수리 (H-7)

이 함수는 원래 배포해도 뜨지 않았다. 인증도 설정도 아닌 런타임 문제였다 —
엣지 런타임이 npm 패키지의 모든 파일을 미리 묶는데, 우리가 쓰지도 않는
`@anthropic-ai/sdk` 의 `helpers/zod.mjs` 가 peer 의존 `zod` 를 풀지 못해
워커가 아예 뜨지 않았다(`worker boot error` → 503). `deno.json` 임포트 맵과
함수별 `package.json` 을 차례로 시도했으나 두 CLI 판본 모두 `index.ts` 하나만
업로드해서 어느 쪽도 성립하지 않았다. 그래서 SDK 를 걷어내고
`https://api.anthropic.com/v1/messages` 로 직접 `fetch` 한다. 통로 함수가 하는 일은
POST 한 번을 넘기는 것뿐이라 SDK 가 벌어 주는 것이 없고, 의존을 없애면 그 실패 갈래가 사라진다.
무저장 약속은 그대로다 — `console` 출력 0 · 저장 0 · 키는 헤더로만 지나가고 영수증엔 끝 4자리만.
