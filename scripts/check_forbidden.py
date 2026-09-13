#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
check_forbidden.py — 공개 산출물 금지어·어휘·식별자 검사 (구현 지시서 01(2기) P-6 · §3 · 스모크 ④)

근거
  H-4 / C2-008 : 자칭 금지어 — 처음 · 최초 · 원조 · 유일 · 첫 시작 · 국내 최초 · AI 수능 만점
  C2-009       : 결론 금지 — 찍었다 · 실수 확정 · 완전 이해 · 총점 회차 비교 · 「강남챗 덕분」 · 시간으로 실수/모름 판정
  C2-045       : 어휘 금지 — 온톨로지 · 사주오행 · MBTI · θ
  H-2          : 본체 식별자 — MC 번호 · 노드 ID · 본체 컬럼명
  C2-066       : 【 = 미확정 자리표시자. 공개본에 남아 있으면 배포 불가(의도된 게이트)

「0건은 깨끗함이 아니다」(CLAUDE.md §3)
  이 스크립트는 0건을 주장하기 전에 --positive-control 로 같은 검사식이 살아 있음을 증명하게 한다.
  또한 허용(예외)으로 넘긴 건은 전부 사유와 함께 출력한다 — 조용히 넘기지 않는다.

예외(허용)의 원칙
  금지어가 「쓰지 말라는 규칙을 인용한 문장」 안에 있으면 그것은 위반이 아니다.
  예: 패키지 3 「금지 표현: 「찍었다」 · … · 「국내 최초」류 과장」 — 금지 규칙 그 자체.
  예외는 반드시 아래 표에 문자열로 못 박고 사유를 적는다. 정규식 와일드카드로 뭉뚱그리지 않는다.

사용
  python scripts/check_forbidden.py <파일 또는 zip ...>
  python scripts/check_forbidden.py --positive-control <원본 파일 ...>   # ≥1건이어야 통과
"""

import re
import sys
import zipfile
import argparse
from pathlib import Path

# (분류, 규칙 이름, 정규식, [예외 문자열], 예외 사유)
RULES = [
    # ── H-4 / C2-008 자칭 금지어 : 예외 없음이 원칙 ─────────────────────────
    ("CLAIM", "처음", r"처음",
     ["사다리에서 처음 틀린",
      "「처음 정답은 찍었다」고 쓰지 않는다",
      "처음에는 치유가 자동으로 되지 않아도 좋다",
      "「처음으로 돌아갈 필요 없다」",
      "<h4>처음에는 세 파일로 시작하세요</h4>"],
     "① 패키지 3 ⓐ 정답 경계 — 난이도 사다리의 시간 순서 표현 ② 패키지 3 ⓖ — "
     "금지 결론을 인용해 「쓰지 않는다」고 못 박는 규칙 문장 ③ 선언문 §2 「원인을 아는 "
     "것만으로도」 첫 문장 그대로 — 시간 부사이지 「우리가 처음」 주장이 아님 ④ 패키지 3 v1.2~ "
     "B-3 금지 표현 목록에 인용된 문구(「처음으로 돌아갈 필요 없다」 — 쓰지 말라는 표현) ⑤ 페이지 #kit-guide 의 "
     "킷 원문 소제목 「처음에는 세 파일로 시작하세요」 — 일반 용법(지시서 02(2기) v2.0 §2-2 예외 · §3-3 ② · 사람 확인). "
     "다섯 다 자칭이 아님"),
    ("CLAIM", "최초", r"최초",
     ["「국내 최초」류 과장"],
     "패키지 3 B-금지표현 — 「국내 최초」를 쓰지 말라는 규칙 문장 그 자체"),
    ("CLAIM", "원조", r"원조", [], ""),
    ("CLAIM", "유일", r"유일", [], ""),
    ("CLAIM", "첫 시작", r"첫\s*시작", [], ""),
    ("CLAIM", "수능 만점", r"만점", [], ""),

    # ── C2-009 결론 금지 : 「…」로 인용된 금지 규칙은 예외 ────────────────────
    # 지시서 §3 지정 패턴 — 결론형 「찍었다 」만 잡고 인용형 「찍었다」는 넘긴다.
    ("CONCL", "찍었다(결론형)", r"찍었다(?!」)", [], ""),
    ("CONCL", "실수 확정", r"실수(로|였음이)?\s*확정",
     ["「실수로 확정」", "「실수였음이 확정됐다」"],
     "인용된 금지 표현 목록(패키지 1 B-9 · 패키지 3 A-1·B)"),
    ("CONCL", "완전 이해", r"완전(히)?\s*이해",
     ["「완전히 이해했다」"],
     "인용된 금지 표현 목록(패키지 1 B-9 · 패키지 3 A-1·B)"),
    ("CONCL", "총점 회차 비교", r"총점",
     ["총점의 회차 비교", "「지난번보다 총점이 올랐다/내렸다」", "점수는 이 규칙으로 바뀌지 않습니다",
      "총점 회차 비교: 시험마다 문항이 다르므로"],
     "리포트가 「말하지 않는 것」 표 / 금지 표현 인용 / 금지 사유를 적은 규칙 문장 — "
     "어느 것도 총점 비교를 하라는 문장이 아님"),
    ("CONCL", "강남챗 덕분", r"강남챗\s*덕분",
     ["「강남챗 덕분에」"],
     "인용된 금지 표현 목록(패키지 3 B)"),
    ("CONCL", "시간으로 실수/모름 판정", r"빨리\s*틀렸으니|오래\s*틀렸으니|시간으로\s*실수",
     ["「빨리 틀렸으니 실수 / 오래 틀렸으니 모름」",
      "푼 시간으로 실수와 모름을 가르지 않는다",
      "푼 시간으로 실수인지 모름인지"],
     "인용된 금지 표현 목록(패키지 3 B) / 「가르지 않는다」 금지 규칙(패키지 1 B-9) / "
     "리포트가 「말하지 않는 것」 표(패키지 3 A-1)"),

    # ── C2-045 어휘 : 예외 없음 ─────────────────────────────────────────────
    ("VOCAB", "온톨로지", r"온톨로지", [], ""),
    ("VOCAB", "사주오행", r"사주오행", [], ""),
    ("VOCAB", "MBTI", r"MBTI", [], ""),
    ("VOCAB", "θ(능력 추정치)", r"θ", [], ""),

    # ── H-2 본체 식별자 : 예외 없음 ─────────────────────────────────────────
    ("IDENT", "MC 번호", r"MC-\d{3}", [], ""),
    ("IDENT", "노드 ID", r"\b[MBP]\d\d[ab]?\b", [], ""),
    ("IDENT", "DC 코드", r"\bDC0\d\b", [], ""),
    ("IDENT", "DF 코드", r"\bDF0\d\b", [], ""),
    ("IDENT", "본체 컬럼명", r"is_primary|error_code|node_ids|no_signal", [], ""),

    # ── C2-102·104 용어 반전 : 공개 산출물의 주 용어는 「미끼값」 · 예외 없음 ────
    #    (지시서 02(2기) v2.0 §2-1 · 스모크 ②⑤ — 「진단값」 0건)
    ("TERM", "진단값(구 용어)", r"진단값", [], ""),

    # ── C2-066 자리표시자 게이트 ────────────────────────────────────────────
    ("PLACE", "【 자리표시자", r"【", [], ""),
]

# ── 교사용 킷 프로필 (지시서 02(2기) v2.0 §2-2 · §6⑤) ─────────────────────────
# 킷은 본체 정본이라 고치지 않는다(H-1). 그래서 검사식도 지시서가 지정한 목록 그대로다.
#   자동 grep = 「국내 최초 / 최초 / 원조 / 유일한 / 첫 시작 / 처음 개발 / 처음 만든」 + 식별자 + 【 + 진단값 + 시크릿
#   「처음」 단독은 **사람이 눈으로 확인**한다 — 기계가 문맥을 판정하지 않는다(REVIEW 로 전부 출력만).
SECRET_RULES = [
    ("SECRET", "Supabase 키", r"sb_(?:secret|publishable)_[A-Za-z0-9_-]{8,}", [], ""),
    ("SECRET", "service_role", r"service_role", [], ""),
    ("SECRET", "JWT", r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}", [], ""),
    ("SECRET", "Resend 키", r"\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{8,}", [], ""),
    ("SECRET", "Anthropic/OpenAI 키", r"\bsk-(?:ant-)?[A-Za-z0-9_-]{16,}", [], ""),
    ("SECRET", "AWS 키", r"\bAKIA[0-9A-Z]{16}\b", [], ""),
    ("SECRET", "GitHub 토큰", r"\bgh[pousr]_[A-Za-z0-9]{20,}", [], ""),
    ("SECRET", "개인키 블록", r"-----BEGIN [A-Z ]*PRIVATE KEY-----", [], ""),
]

KIT_RULES = [
    ("CLAIM", "국내 최초", r"국내\s*최초", [], ""),
    ("CLAIM", "최초", r"최초",
     ["진단용 최초 응답은", "최초 응답을 먼저 받는다", "| 최초/학습후 |"],
     "킷 원문의 응답 기록 용어 「최초 응답」(설명·힌트 전 첫 응답) 3곳 — 홍보 맥락이 아니다. "
     "CC 통독 확인(09-13). 지시서 02 v2.0 은 이 3곳을 예상하지 않았다 → 보고에 사람 확인 결과로 적는다"),
    ("CLAIM", "원조", r"원조", [], ""),
    ("CLAIM", "유일한", r"유일한", [], ""),
    ("CLAIM", "첫 시작", r"첫\s*시작", [], ""),
    ("CLAIM", "처음 개발", r"처음\s*개발", [], ""),
    ("CLAIM", "처음 만든", r"처음\s*만든", [], ""),
    ("CLAIM", "수능 만점", r"만점", [], ""),
    ("TERM", "진단값(구 용어)", r"진단값", [], ""),
    ("IDENT", "MC 번호", r"MC-\d{3}", [], ""),
    ("IDENT", "노드 ID", r"\b[MBP]\d\d[ab]?\b", [], ""),
    ("IDENT", "DC 코드", r"\bDC0\d\b", [], ""),
    ("IDENT", "DF 코드", r"\bDF0\d\b", [], ""),
    ("IDENT", "본체 컬럼명", r"is_primary|error_code|node_ids|no_signal", [], ""),
    ("PLACE", "【 자리표시자", r"【", [], ""),
] + SECRET_RULES

# 사람 확인 목록 — 위반으로 세지 않고 전부 문맥과 함께 출력한다.
KIT_REVIEW = [
    ("처음(단독 · 사람 확인)", r"처음"),
    ("결론형 표현(참고)", r"찍었|찍어서|완전히\s*모른"),
]

PROFILES = {"public": (RULES, []), "kit": (KIT_RULES, KIT_REVIEW)}

# 합성 양성 대조 — 실제 시크릿은 어디에도 없으므로, 검사식이 살아 있음은 가짜 문자열로 보인다.
SELF_TEST_LINES = [
    "sb_secret_AbCdEfGh12345678", "sb_publishable_AbCdEfGh1234", "role: service_role",
    "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.x", "re_AbCd1234_EfGh5678", "sk-ant-api03-AbCdEfGhIjKlMnOp",
    "AKIAABCDEFGHIJKLMNOP", "ghp_AbCdEfGhIjKlMnOpQrStUv", "-----BEGIN PRIVATE KEY-----",
    "국내 최초", "원조", "유일한", "첫 시작", "처음 개발", "처음 만든", "AI 수능 만점",
    "진단값", "MC-001", "노드 M01a", "DC01", "DF02", "is_primary", "【자리】",
    "처음", "최초", "유일", "찍었다.", "실수로 확정", "완전히 이해", "총점", "강남챗 덕분",
    "빨리 틀렸으니", "온톨로지", "사주오행", "MBTI", "θ",
]


def iter_targets(paths):
    """파일 · zip 안 파일을 (표시이름, 텍스트)로 펼친다."""
    for p in paths:
        path = Path(p)
        if not path.exists():
            yield (str(path), None)
            continue
        if path.suffix.lower() == ".zip":
            with zipfile.ZipFile(path) as z:
                for name in z.namelist():
                    if name.endswith("/"):
                        continue
                    raw = z.read(name)
                    try:
                        yield (f"{path.name}::{name}", raw.decode("utf-8"))
                    except UnicodeDecodeError:
                        yield (f"{path.name}::{name}", raw.decode("utf-8", "replace"))
        else:
            yield (str(path), path.read_text(encoding="utf-8", errors="replace"))


def scan(paths, rules=RULES, review=()):
    violations, allowed, missing, reviewed = [], [], [], []
    for name, text in iter_targets(paths):
        if text is None:
            missing.append(name)
            continue
        lines = text.lstrip("\ufeff").splitlines()
        for label, pattern in review:
            rx = re.compile(pattern)
            for i, line in enumerate(lines, 1):
                for m in rx.finditer(line):
                    reviewed.append((label, name, i, m.group(0), line.strip()[:200]))
        for kind, rule, pattern, exceptions, reason in rules:
            rx = re.compile(pattern)
            for i, line in enumerate(lines, 1):
                for m in rx.finditer(line):
                    hit = (kind, rule, name, i, m.group(0), line.strip()[:160])
                    if any(ex in line for ex in exceptions):
                        allowed.append(hit + (reason,))
                    else:
                        violations.append(hit)
    return violations, allowed, missing, reviewed


def print_expressions(rules=RULES, review=()):
    print("── 검사식 원문 ──────────────────────────────────────────────")
    for kind, rule, pattern, exceptions, reason in rules:
        ex = f"  예외={exceptions} ({reason})" if exceptions else ""
        print(f"  [{kind}] {rule:<20} /{pattern}/{ex}")
    for label, pattern in review:
        print(f"  [REVIEW] {label:<20} /{pattern}/  (위반으로 세지 않음 · 전부 출력 → 사람 확인)")
    print("─────────────────────────────────────────────────────────────")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("paths", nargs="*")
    ap.add_argument("--profile", choices=sorted(PROFILES), default="public",
                    help="public = 랜딩·패키지(기본) · kit = 교사용 킷(지시서 02(2기) v2.0 §2-2)")
    ap.add_argument("--self-test", action="store_true",
                    help="합성 문자열로 선택한 프로필의 모든 검사식이 적어도 1번 걸리는지 확인(시크릿 양성 대조용)")
    ap.add_argument("--positive-control", action="store_true",
                    help="양성 대조 모드 — 이 대상에서 ≥1건 걸려야 통과(검사식이 살아 있음의 증명)")
    ap.add_argument("--quiet-expressions", action="store_true")
    args = ap.parse_args()

    rules, review = PROFILES[args.profile]
    print(f"── 프로필: {args.profile} ──")

    if args.self_test:
        dead = []
        for kind, rule, pattern, exceptions, reason in rules:
            if not any(re.search(pattern, line) for line in SELF_TEST_LINES):
                dead.append(f"[{kind}] {rule}")
        print(f"[합성 양성 대조] 검사식 {len(rules)}개 중 적중 {len(rules) - len(dead)}개")
        for d in dead:
            print(f"  죽은 검사식: {d}")
        print("PASS — 모든 검사식이 살아 있다." if not dead else "FAIL — 적중하지 않은 검사식이 있다.")
        return 0 if not dead else 2

    if not args.paths:
        ap.error("검사할 파일 또는 zip 을 주시오")

    if not args.quiet_expressions:
        print_expressions(rules, review)

    violations, allowed, missing, reviewed = scan(args.paths, rules, review)

    if reviewed:
        print(f"\n── 사람 확인 목록(REVIEW · 위반 아님) {len(reviewed)}건 ──")
        for label, name, ln, tok, ctx in reviewed:
            print(f"  [{label}] {name}:{ln} · 「{tok}」")
            print(f"        {ctx}")

    for name in missing:
        print(f"!! 대상 없음: {name}")

    if allowed:
        print(f"\n── 허용(예외 · 사유 기재) {len(allowed)}건 ──")
        for kind, rule, name, ln, tok, ctx, reason in allowed:
            print(f"  [{kind}] {rule} · {name}:{ln} · 「{tok}」")
            print(f"        사유: {reason}")
            print(f"        문맥: {ctx}")

    print(f"\n── 위반 {len(violations)}건 ──")
    for kind, rule, name, ln, tok, ctx in violations:
        print(f"  [{kind}] {rule} · {name}:{ln} · 「{tok}」")
        print(f"        {ctx}")

    total_hits = len(violations) + len(allowed)

    if args.positive_control:
        print(f"\n[양성 대조] 총 적중 {total_hits}건 (위반 {len(violations)} + 허용 {len(allowed)})")
        if total_hits == 0:
            print("FAIL — 양성 대조에서 0건. 검사식이 죽었거나 대상이 틀렸다.")
            return 2
        print("PASS — 검사식이 살아 있다.")
        return 0

    if missing:
        return 2
    if violations:
        print("\nFAIL — 위반이 남아 있다. 배포 불가.")
        return 1
    print("\nPASS — 위반 0건. (0건은 깨끗함이 아니다 — 위 양성 대조 결과와 함께 읽을 것)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
