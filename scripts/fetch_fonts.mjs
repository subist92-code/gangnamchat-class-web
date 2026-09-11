// fetch_fonts.mjs — Gowun Batang · Noto Sans KR 를 public/fonts 에 내려받고 public/fonts.css 를 생성한다.
// CLAUDE.md §6(디자인 토큰 · self-host) · 랜딩 v1.0 §3(외부 요청 최소) · 지시서 01 §4-3.
// 한 번 돌리면 산출물이 커밋된다 — 배포 시점에 네트워크를 타지 않는다.
import fs from 'node:fs/promises';
import path from 'node:path';

const CSS_URL = 'https://fonts.googleapis.com/css2'
  + '?family=Gowun+Batang:wght@400;700&family=Noto+Sans+KR:wght@400;700&display=swap';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const OUT_DIR = 'public/fonts';

const res = await fetch(CSS_URL, { headers: { 'User-Agent': UA } });
if (!res.ok) throw new Error(`css2 ${res.status}`);
const css = await res.text();

await fs.mkdir(OUT_DIR, { recursive: true });
const urls = [...new Set([...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map(m => m[1]))];
console.log('font files:', urls.length);

const nameOf = (u) => {
  const seg = u.split('/s/')[1];          // gowunbatang/v12/AbCd.0.woff2
  const [fam, , file] = seg.split('/');
  return `${fam}-${file}`;
};

let done = 0, bytes = 0;
const queue = [...urls];
async function worker() {
  while (queue.length) {
    const u = queue.shift();
    const r = await fetch(u, { headers: { 'User-Agent': UA } });
    if (!r.ok) throw new Error(`${r.status} ${u}`);
    const b = Buffer.from(await r.arrayBuffer());
    await fs.writeFile(path.join(OUT_DIR, nameOf(u)), b);
    bytes += b.length; done++;
  }
}
await Promise.all(Array.from({ length: 12 }, worker));
console.log(`downloaded ${done} files, ${(bytes / 1024).toFixed(0)} KB`);

const header =
`/* 강남챗 클래스 — self-host 폰트 (CLAUDE.md §6 · 외부 요청 0)
 * Gowun Batang · Noto Sans KR — SIL Open Font License 1.1 (fonts/OFL.txt)
 * 원본 = Google Fonts css2 (2026-09-11 채취) · unicode-range 분할을 그대로 유지한다
 *   → 한국어 본문이라도 브라우저가 실제로 쓰는 조각만 내려받는다.
 * 생성: node scripts/fetch_fonts.mjs — 손으로 고치지 않는다.
 */
`;
const out = header + css.replace(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g,
  (_, u) => `url(fonts/${nameOf(u)})`);
await fs.writeFile('public/fonts.css', out);
console.log('wrote public/fonts.css');
