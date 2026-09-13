#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_kit_zip.py — 교사용 킷 배포 사본 zip 조립 (구현 지시서 02(2기) v2.0 §2-2 · S2)

  python scripts/build_kit_zip.py <클래스 docs/패키지/교사용킷/강남챗_교사용_AI수학도구_v1.1> [-o public/dl]

킷 정본은 강남챗 본체에 있다(H-1 · C2-100). 이 스크립트는 **내용을 고치지 않는다.**
지시서가 글자 단위로 지정한 것만 한다 — 그 밖의 판단은 하지 않는다.

  ① `00_시작하기.html` 제외(웹 `#kit-guide`가 대신한다 · C2-101)
  ② `00_시작하기.txt` 3줄 · `04_자료안내/배포본의범위와버전.txt` 1줄 교체(§3-4 표 그대로)
  ③ 나머지 13개는 바이트 그대로

  ④ (--guide-out) 교체를 마친 `00_시작하기.txt` 를 페이지 `#kit-guide` 접힘용 HTML 조각으로 뽑는다(§3-3).
     손으로 옮겨 적지 않는다 — 킷 원문에서 기계적으로 뽑아야 어긋나지 않는다. 새 문장을 짓지 않는다.

원문 줄이 **정확히 1번** 나오지 않으면 교체하지 않고 멈춘다(킷 판본이 바뀐 것이다 · §3-4).
원본 txt 는 UTF-8 BOM + LF 이다 — 교체한 파일도 BOM 과 줄바꿈을 그대로 둔다.
"""

import re
import sys
import html
import hashlib
import zipfile
import argparse
from pathlib import Path

KIT_DIR_NAME = "강남챗_교사용_AI수학도구_v1.1"   # zip 안 최상위 폴더 = 원본 폴더 이름 그대로
ZIP_NAME = "gangnamchat-teacher-kit-v1_1.zip"
ZIP_DATE = (2026, 9, 13, 0, 0, 0)               # 재현 가능한 zip — 고정 타임스탬프(킷 판본 날짜)
EXPECTED_FILES = 15

EXCLUDE = {"00_시작하기.html"}

BOM = b"\xef\xbb\xbf"

# 지시서 02(2기) v2.0 §3-4 — 원문 → 교체문 (글자 그대로 · 한 줄 단위)
REPLACE = {
    "00_시작하기.txt": [
        ("2. 풀린 폴더의 \"00_시작하기.html\"을 열면 안내와 모든 파일 내용을 편하게 보고 복사할 수 있습니다. 이 TXT 안내만 읽고 진행해도 됩니다.",
         "2. 이 TXT 안내만 읽고 진행하면 됩니다. 화면으로 보시려면 class.gangnamchat.com 의 「사용 안내」를 여세요."),
        ("이 안내·HTML·같은 내용의 복사본을 프로젝트 자료에 중복 등록하지 않습니다.",
         "이 안내와 같은 내용의 복사본을 프로젝트 자료에 중복 등록하지 않습니다."),
        ("HTML이 열리지 않으면: 이 TXT 안내와 각 TXT 파일을 메모장 등에서 열어 그대로 사용하면 됩니다.",
         "화면 안내가 필요하면: class.gangnamchat.com 의 「사용 안내」를 보세요. 각 TXT 파일은 메모장 등에서 열어 그대로 사용해도 됩니다."),
    ],
    "04_자료안내/배포본의범위와버전.txt": [
        ("오프라인 안내 HTML은 파일을 읽고 복사하는 도우미입니다. AI 호출·로그인·학생 답안 전송 기능이 없습니다.",
         "사용 안내는 class.gangnamchat.com 화면에서 제공합니다. 이 배포본에는 AI 호출·로그인·학생 답안 전송 기능이 없습니다."),
    ],
}


def apply_replacements(rel: str, raw: bytes) -> tuple[bytes, list[str]]:
    """줄 단위로 원문이 정확히 1번 있는지 확인하고 교체한다. BOM·LF 보존."""
    has_bom = raw.startswith(BOM)
    body = raw[len(BOM):] if has_bom else raw
    text = body.decode("utf-8")
    if "\r\n" in text:
        raise SystemExit(f"!! {rel}: CRLF 가 섞여 있다 — 원본이 LF 가 아니다. 멈춘다.")
    lines = text.split("\n")
    log = []
    for old, new in REPLACE[rel]:
        hits = [i for i, line in enumerate(lines) if line == old]
        if len(hits) != 1:
            raise SystemExit(f"!! {rel}: 원문 줄이 {len(hits)}번 나온다(기대 1) — 킷 판본이 바뀌었다. 교체하지 않고 멈춘다.\n   원문: {old}")
        lines[hits[0]] = new
        log.append(f"{hits[0]+1}행 교체 — 원문 일치 ✓")
    out = "\n".join(lines).encode("utf-8")
    return (BOM + out if has_bom else out), log


URL_RE = re.compile(r"https://[^\s<>\"']+")
GENERAL_USE_MARK = "<!-- 일반 용법 · H-4 대상 아님 -->"   # 지시서 §3-3 ② — 「처음」이 든 소제목 앞에 둔다


def guide_html(text: str, source_md5: str) -> str:
    """교체를 마친 00_시작하기.txt → #kit-guide 본문 HTML 조각.

    변환 규칙(문장은 건드리지 않는다): `# ` → h3 · `## ` → h4 · 빈 줄로 나뉜 줄 묶음 → <p>(줄은 <br>) ·
    https URL → 같은 글자의 링크. 그 밖의 글자는 이스케이프만 한다.
    """
    def inline(line: str) -> str:
        out, pos = [], 0
        for m in URL_RE.finditer(line):
            out.append(html.escape(line[pos:m.start()], quote=False))
            url = html.escape(m.group(0))
            out.append(f'<a href="{url}" rel="noopener">{url}</a>')
            pos = m.end()
        out.append(html.escape(line[pos:], quote=False))
        return "".join(out)

    parts = [f"<!-- 킷 원본 00_시작하기.txt(md5 {source_md5})에서 build_kit_zip.py --guide-out 으로 뽑음 · §3-4 교체 3줄 반영 · 손으로 고치지 않는다 -->"]
    para: list[str] = []

    def flush():
        if para:
            parts.append("<p>" + "<br>\n".join(inline(l) for l in para) + "</p>")
            para.clear()

    for line in text.split("\n"):
        if line.startswith("## "):
            flush()
            head = line[3:]
            if "처음" in head:
                parts.append(GENERAL_USE_MARK)
            parts.append(f"<h4>{inline(head)}</h4>")
        elif line.startswith("# "):
            flush()
            parts.append(f"<h3>{inline(line[2:])}</h3>")
        elif line.strip() == "":
            flush()
        else:
            para.append(line)
    flush()
    return "\n".join(parts) + "\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("kit_dir", help="클래스 리포 docs/패키지/교사용킷/강남챗_교사용_AI수학도구_v1.1 (이 리포 밖)")
    ap.add_argument("-o", "--out-dir", default="public/dl")
    ap.add_argument("--guide-out", default="src/kit-guide.html",
                    help="#kit-guide 접힘용 HTML 조각 출력 경로(빈 문자열이면 쓰지 않음)")
    args = ap.parse_args()

    src = Path(args.kit_dir)
    if not src.is_dir() or src.name != KIT_DIR_NAME:
        print(f"!! 킷 폴더가 아니다: {src}")
        return 2

    files = sorted(p for p in src.rglob("*") if p.is_file())
    rels = [p.relative_to(src).as_posix() for p in files]
    print(f"── 원본 {len(rels)}파일 ─────────────────────────────────────────")

    for rel in REPLACE:
        if rel not in rels:
            print(f"!! 교체 대상 파일 없음: {rel}")
            return 2

    members: list[tuple[str, bytes, str]] = []
    for p, rel in zip(files, rels):
        if rel in EXCLUDE:
            print(f"  제외   {rel}  ({p.stat().st_size} bytes)")
            continue
        raw = p.read_bytes()
        if rel in REPLACE:
            data, log = apply_replacements(rel, raw)
            print(f"  교체   {rel}  ({len(raw)} → {len(data)} bytes · BOM {'유지' if data.startswith(BOM) else '없음'})")
            for line in log:
                print(f"         · {line}")
            members.append((rel, data, "교체"))
        else:
            print(f"  그대로 {rel}  ({len(raw)} bytes)")
            members.append((rel, raw, "그대로"))

    if len(members) != EXPECTED_FILES:
        print(f"!! 파일 수 {len(members)} ≠ {EXPECTED_FILES} — 멈춘다.")
        return 2

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    zip_path = out_dir / ZIP_NAME
    if zip_path.exists():
        zip_path.unlink()
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        for rel, data, _ in members:
            info = zipfile.ZipInfo(f"{KIT_DIR_NAME}/{rel}", date_time=ZIP_DATE)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            z.writestr(info, data)

    # 바이트 그대로인 13개가 정말 원본과 같은지 zip 에서 다시 읽어 대조한다.
    with zipfile.ZipFile(zip_path) as z:
        for rel, data, kind in members:
            back = z.read(f"{KIT_DIR_NAME}/{rel}")
            if back != data:
                print(f"!! zip 재독 불일치: {rel}")
                return 2
            if kind == "그대로" and back != (src / rel).read_bytes():
                print(f"!! 원본과 바이트 불일치: {rel}")
                return 2

    blob = zip_path.read_bytes()
    md5 = hashlib.md5(blob).hexdigest()
    # 기록 파일 이름 = 지시서 02(2기) v2.0 §2-2 `gangnamchat-teacher-kit-v1_1.md5`
    # newline="\n" — Windows 에서 write_text 가 CRLF 로 바꾸면 로컬 산출물이 Pages 빌드(LF)와 바이트가 달라진다
    (out_dir / (Path(ZIP_NAME).stem + ".md5")).write_text(f"{md5}  {ZIP_NAME}\n", encoding="utf-8", newline="\n")

    if args.guide_out:
        start_rel = "00_시작하기.txt"
        replaced = next(data for rel, data, _ in members if rel == start_rel)
        src_md5 = hashlib.md5((src / start_rel).read_bytes()).hexdigest()
        text = replaced[len(BOM):].decode("utf-8") if replaced.startswith(BOM) else replaced.decode("utf-8")
        Path(args.guide_out).write_text(guide_html(text, src_md5), encoding="utf-8", newline="\n")
        print(f"  guide  : {args.guide_out} ← {start_rel}(교체 후 · 원본 md5 {src_md5})")

    unchanged = sum(1 for m in members if m[2] == "그대로")
    print("\n── zip ──────────────────────────────────────────────────────")
    print(f"  이름   : {zip_path}")
    print(f"  md5    : {md5}")
    print(f"  바이트 : {len(blob)}")
    print(f"  파일 수: {len(members)} (교체 {len(members) - unchanged} · 바이트 그대로 {unchanged} · 원본 재대조 통과)")
    print("\n다음: python scripts/check_forbidden.py --profile kit " + str(zip_path))
    return 0


if __name__ == "__main__":
    sys.exit(main())
