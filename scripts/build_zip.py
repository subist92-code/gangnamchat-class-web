#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_zip.py — 배포본 zip 조립 (구현 지시서 01(2기) §3 · S1)

  python scripts/build_zip.py <클래스 docs/패키지 경로> [-o public/dl]

원문(클래스 리포 docs/패키지/*_v1_0_*.md)은 읽기만 한다 — 이 리포 안에 복사하지 않는다.
「클래스 내부」에 해당하는 세 가지를 떼어 낸 본문이 배포본이다(§3 제거 규칙 ①②③).
"""

import re
import sys
import hashlib
import zipfile
import argparse
from pathlib import Path

# 원본 파일(글로브) → 배포본 파일명(판본 접미사 제거)
PACKAGE_MAP = [
    ("01_진단값_프롬프트_v1_0_*.md", "01_진단값_프롬프트.md"),
    ("02_난이도_기준표_v1_0_*.md",   "02_난이도_기준표.md"),
    ("03_리포트_생성_규칙_v1_0_*.md", "03_리포트_생성_규칙.md"),
    ("04_예시_문항_v1_0_*.md",       "04_예시_문항.md"),
]

ZIP_NAME = "gangnamchat-class-v1_0.zip"

# ── 제거 규칙 ────────────────────────────────────────────────────────────────
# ① 파일 머리의 `> 【클래스 내부 표기 — 배포본에서 제거】…` 인용 블록(연속된 > 줄 전부)
HEAD_QUOTE = re.compile(r"^>\s*【클래스 내부 표기")
# ② `## 클래스 내부` 절부터 끝  ③ `## … 결재 결과 …` 절부터 끝(패키지 2·3)
CUT_HEADING = re.compile(r"^##\s+(?:[A-Z]\.\s*)?(?:클래스 내부|결재 결과)")


def strip_internal(text: str) -> tuple[str, list[str]]:
    """내부 절을 떼어 낸 본문과, 무엇을 뗐는지의 기록을 돌려준다."""
    lines = text.splitlines()
    removed = []

    # ②③ — 먼저 꼬리를 자른다
    for i, line in enumerate(lines):
        if CUT_HEADING.match(line):
            removed.append(f"꼬리 절단 {i+1}행부터 끝까지 ({len(lines)-i}행) — 「{line.strip()}」")
            lines = lines[:i]
            break

    # ① — 머리 인용 블록
    out, i = [], 0
    while i < len(lines):
        if HEAD_QUOTE.match(lines[i]):
            start = i
            while i < len(lines) and lines[i].lstrip().startswith(">"):
                i += 1
            removed.append(f"머리 인용 블록 {start+1}~{i}행 ({i-start}행) — 【클래스 내부 표기】")
            # 블록 뒤에 붙은 빈 줄 하나는 같이 정리
            if i < len(lines) and lines[i].strip() == "":
                i += 1
            continue
        out.append(lines[i])
        i += 1

    body = "\n".join(out).rstrip() + "\n"
    return body, removed


README = """# 강남챗 클래스 — 진단값 프롬프트 패키지 v1.0

오답은 말을 합니다.

## 받으시는 것

| 파일 | 무엇인가 |
|---|---|
| `01_진단값_프롬프트.md` | 선생님이 만든 수학 문제에 「진단값」을 심는 방법 |
| `02_난이도_기준표.md` | 난이도 1~5를 선생님이 스스로 체크하는 한 장 |
| `03_리포트_생성_규칙.md` | 진단값 시험의 답안을 점수가 아니라 진단으로 읽는 규칙 |
| `04_예시_문항.md` | 진단값이 심긴 완성품 견본 다섯 개 — 선지마다 좌석 라벨 |

## 쓰는 법

클로드(또는 비슷한 AI 도구)의 프로젝트 지침에 `01_진단값_프롬프트.md`를 그대로 붙여 넣으십시오.
그다음 「이 문제에 진단값을 심어 줘」 또는 「이 단원으로 진단값이 있는 문제를 만들어 줘」라고 요청하면 됩니다.
B절이 AI에게 주는 규칙이고, A·D절은 선생님이 읽는 설명입니다. 선생님이 손으로 심을 때도 같은 규칙을 씁니다.

리포트를 만들 때는 `03_리포트_생성_규칙.md`를 같은 프로젝트 지침에 함께 붙여 넣고,
시험지(선지별 좌석표 포함)와 답안표를 준 뒤 「리포트 만들어 줘」라고 하면 됩니다.

`04_예시_문항.md`는 받아야 하는 출력의 모양을 보여 주는 견본입니다. 먼저 읽어 보시면 빠릅니다.

## 출처 · 라이선스

- 출처: 강남챗(gangnamchat.com) — 이 방식이 자동으로 돌아가는 학생용 앱(특허 출원 · 제품 검증 중)
- 라이선스: CC BY-ND 4.0 — 출처를 밝히면 자유롭게 배포할 수 있고, 수정본 배포는 하지 않습니다. `LICENSE.txt` 참조
- 이 지침으로 만든 문항·표 하단에 「with gangnamchat」 한 줄

with gangnamchat
class.gangnamchat.com
"""

LICENSE = """강남챗 클래스 — 진단값 프롬프트 패키지 v1.0
라이선스: 크리에이티브 커먼즈 저작자표시-변경금지 4.0 국제 (CC BY-ND 4.0)

전문: https://creativecommons.org/licenses/by-nd/4.0/deed.ko
법적 문서: https://creativecommons.org/licenses/by-nd/4.0/legalcode.ko

요지

  할 수 있는 것
    - 어떤 매체·형식으로든 복제하고 재배포할 수 있습니다.
    - 상업적 목적을 포함해 자유롭게 이용할 수 있습니다.
    - 이 규칙대로 선생님이 만든 문항·리포트는 선생님의 것입니다. 이 문서가 그 산출물을
      구속하지 않습니다. 변경금지는 이 문서 자체의 배포에 걸리는 조건입니다.

  지켜야 하는 것
    - 저작자표시 — 출처(강남챗 · gangnamchat.com)를 밝히고, 변경이 없었음을 알립니다.
      이 지침으로 만든 문항·표 하단에는 「with gangnamchat」 한 줄을 둡니다.
    - 변경금지 — 이 문서를 고치거나 다른 것과 섞어 만든 2차적 저작물은 배포하지 않습니다.
      (혼자 고쳐서 쓰는 것은 자유이며, 배포만 하지 않는 것입니다.)

저작권 (c) 2026 강남챗
특허 출원 10-2026-0135592
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("package_dir", help="클래스 리포 docs/패키지 경로(이 리포 밖)")
    ap.add_argument("-o", "--out-dir", default="public/dl")
    args = ap.parse_args()

    src = Path(args.package_dir)
    if not src.is_dir():
        print(f"!! 경로 없음: {src}")
        return 2

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    zip_path = out_dir / ZIP_NAME

    members: list[tuple[str, str]] = []
    print("── 원본 → 배포본 ────────────────────────────────────────────")
    for pattern, dest in PACKAGE_MAP:
        matches = sorted(src.glob(pattern))
        if len(matches) != 1:
            print(f"!! {pattern} 이 정확히 1건이 아니다: {[m.name for m in matches]}")
            return 2
        raw = matches[0].read_text(encoding="utf-8")
        body, removed = strip_internal(raw)
        print(f"  {matches[0].name}")
        print(f"    → {dest}  ({len(raw.splitlines())}행 → {len(body.splitlines())}행)")
        for r in removed:
            print(f"    · 제거: {r}")
        if not removed:
            print("    · 제거: 없음(내부 절 자체가 없는 파일)")
        members.append((dest, body))

    members.append(("README.md", README))
    members.append(("LICENSE.txt", LICENSE))

    if zip_path.exists():
        zip_path.unlink()
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        for name, text in members:
            # 재현 가능한 zip — 고정 타임스탬프
            info = zipfile.ZipInfo(name, date_time=(2026, 9, 11, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            z.writestr(info, text.encode("utf-8"))

    data = zip_path.read_bytes()
    md5 = hashlib.md5(data).hexdigest()
    (out_dir / (ZIP_NAME + ".md5")).write_text(f"{md5}  {ZIP_NAME}\n", encoding="utf-8")

    print("\n── zip ──────────────────────────────────────────────────────")
    print(f"  이름   : {zip_path}")
    print(f"  md5    : {md5}")
    print(f"  바이트 : {len(data)}")
    print(f"  파일 수: {len(members)}")
    for name, text in members:
        print(f"    - {name}  ({len(text.encode('utf-8'))} bytes)")
    print("\n다음: python scripts/check_forbidden.py " + str(zip_path))
    return 0


if __name__ == "__main__":
    sys.exit(main())
