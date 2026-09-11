# gangnamchat-class-web — 랜딩 1장 정적 사이트 (2기)

class.gangnamchat.com. 한 장 · 회원가입 없음 · 이메일 입력 → 패키지 zip 링크를 메일로.

- 정본은 이 리포에 없다. 문안·규칙의 정본은 **클래스 docs 리포**(`gangnamchat-class/docs/`)다.
  대장 v1.0 → 선언문 v1.1 → 랜딩 1장 구조 v1.0 → 구현 지시서 01(2기) 순서로 읽는다.
- 여기는 그 정본을 **소비**만 한다. 문안을 고칠 일이 생기면 docs 를 먼저 고치고 여기를 맞춘다.
- 1기(Vite SPA · Pyodide · vault-proxy) 코드는 `archive/2026-09-06_class1` 브랜치에 그대로 있다.

## 구조

```
public/
  index.html      ← 빌드 산출물(손으로 고치지 않는다). 원본은 src/index.template.html
  styles.css      ← 디자인 토큰 · 반응형 · 인쇄 CSS
  fonts.css · fonts/   ← Gowun Batang · Noto Sans KR self-host (OFL)
  katex/          ← KaTeX CSS·woff2 self-host (빌드가 복사)
  dl/             ← 배포본 zip + md5
  _headers        ← CSP 등 (빌드가 생성 · 인라인 스크립트 sha256 포함)
functions/api/subscribe.ts   ← Pages Function 1개. 저장 1행 + 전송 1통
src/index.template.html      ← 문안 원본
src/build.mjs                ← 템플릿 + KaTeX 정적 렌더 → public/index.html
scripts/build_zip.py         ← 패키지 1~4 → 배포본 zip(내부 절 제거 · md5)
scripts/check_forbidden.py   ← 금지어·어휘·식별자·【 검사(양성 대조 포함)
scripts/fetch_fonts.mjs      ← 폰트 내려받기(한 번 돌리고 산출물을 커밋)
supabase/migrations/         ← package_requests 테이블 1개
```

## 명령

```bash
npm install                                   # katex 하나뿐
npm run build                                 # → public/index.html · public/_headers
npm run zip                                   # → public/dl/gangnamchat-class-v1_0.zip (+ .md5)
npm run check                                 # 금지어 검사 — 【 가 남아 있으면 실패한다(의도된 게이트)
npm run fonts                                 # 폰트 재취득(평소엔 돌릴 일 없음)
```

`npm run zip` 은 클래스 docs 리포를 **읽기만** 한다(`../gangnamchat-class/docs/패키지`).
원문을 이 리포 안에 복사하지 않는다.

## 검사가 통과하지 않는 것이 정상인 시점

`npm run check` 는 산출물에 `【` 가 하나라도 있으면 실패한다. 이것은 버그가 아니라 게이트다(C2-066).
아래 세 개가 확정되기 전에는 배포하지 않는다.

| 【자리】 | 누가 | 어디 |
|---|---|---|
| Google Play 링크 | 발주자 | `src/index.template.html` 구획 4 |
| 연락처 메일 주소 | 발주자 | 푸터 `mailto:` · 개인정보 고지 문의처 |
| 개인정보 고지 문안 확정 | 발주자 | 푸터 `#privacy` · 초안은 지시서 01 §4-4 |

## 환경변수

이름은 `.env.example` 에만 있다. 값은 **Cloudflare Pages 프로젝트 설정**에 넣는다.
키를 파일·커밋·로그·채팅에 싣지 않는다(H-6). 레이트 리밋 N·M 도 설정값이며 코드에 숫자를 적지 않는다.

## 서버가 보유하는 것

`email` · `consented_at` · `sent_at` · `ip_hash`(해시만) · `cta` — 그 외 0.
IP 원문과 이메일 전문은 로그에도 남기지 않는다. 응답은 전부 `Cache-Control: no-store`.

with gangnamchat
