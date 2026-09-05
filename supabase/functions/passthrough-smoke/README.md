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
