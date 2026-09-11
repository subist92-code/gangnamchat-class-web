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
      "처음에는 치유가 자동으로 되지 않아도 좋다"],
     "① 패키지 3 ⓐ 정답 경계 — 난이도 사다리의 시간 순서 표현 ② 패키지 3 ⓖ — "
     "금지 결론을 인용해 「쓰지 않는다」고 못 박는 규칙 문장 ③ 선언문 v1.1 §2 「원인을 아는 "
     "것만으로도」 첫 문장 그대로 — 시간 부사이지 「우리가 처음」 주장이 아님. 셋 다 자칭이 아님"),
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

    # ── C2-066 자리표시자 게이트 ────────────────────────────────────────────
    ("PLACE", "【 자리표시자", r"【", [], ""),
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


def scan(paths):
    violations, allowed, missing = [], [], []
    for name, text in iter_targets(paths):
        if text is None:
            missing.append(name)
            continue
        lines = text.splitlines()
        for kind, rule, pattern, exceptions, reason in RULES:
            rx = re.compile(pattern)
            for i, line in enumerate(lines, 1):
                for m in rx.finditer(line):
                    hit = (kind, rule, name, i, m.group(0), line.strip()[:160])
                    if any(ex in line for ex in exceptions):
                        allowed.append(hit + (reason,))
                    else:
                        violations.append(hit)
    return violations, allowed, missing


def print_expressions():
    print("── 검사식 원문 ──────────────────────────────────────────────")
    for kind, rule, pattern, exceptions, reason in RULES:
        ex = f"  예외={exceptions} ({reason})" if exceptions else ""
        print(f"  [{kind}] {rule:<20} /{pattern}/{ex}")
    print("─────────────────────────────────────────────────────────────")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("paths", nargs="+")
    ap.add_argument("--positive-control", action="store_true",
                    help="양성 대조 모드 — 이 대상에서 ≥1건 걸려야 통과(검사식이 살아 있음의 증명)")
    ap.add_argument("--quiet-expressions", action="store_true")
    args = ap.parse_args()

    if not args.quiet_expressions:
        print_expressions()

    violations, allowed, missing = scan(args.paths)

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
