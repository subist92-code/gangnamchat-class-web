#!/usr/bin/env node
/**
 * 「웹 리포에 금고 없음」 검사(지시서 02 §2-3 · H-3).
 *
 * 금고 블록 본문은 공개 리포에 한 글자도 들어가지 않는다. 블록이 버킷에서
 * 함수 메모리로만 흐르는지는 카나리가 지키고, 실수로 리포에 붙는 것은 이 검사가 지킨다.
 *
 * 양성 대조가 가능해야 한다 — 일부러 심으면 잡혀야 한다.
 * 실행: npm run no-vault
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOTS = ['src', 'supabase', 'scripts', 'tests'];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'test-results']);

/**
 * 구분자는 쪼개서 조립한다 — 그러지 않으면 이 검사기 자신이 자기 패턴에 걸린다
 * (check-config-layer.mjs 의 MODEL_NEEDLE 과 같은 요령).
 */
const DELIMITER = '<'.repeat(5) + ' BLOCK';

/** 블록 · 과업 머리글. 줄 맨 앞에 올 때만 금고 본문으로 본다. */
const HEADINGS = [/^## B0[0-5]-/, /^## B[1-7]0-/, /^## B-D-/, /^## T-/];

function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const hits = [];
let scanned = 0;

for (const root of ROOTS) {
  for (const file of walk(root)) {
    let text;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue; // 바이너리 등은 건너뛴다
    }
    scanned += 1;
    const rel = relative(process.cwd(), file);
    text.split(/\r?\n/).forEach((line, i) => {
      if (line.includes(DELIMITER)) hits.push(`${rel}:${i + 1}: 블록 구분자`);
      for (const re of HEADINGS) {
        if (re.test(line)) hits.push(`${rel}:${i + 1}: 금고 머리글 ${line.trim().slice(0, 24)}`);
      }
    });
  }
}

if (hits.length > 0) {
  console.error(`금고 문자열 검사 실패 — ${hits.length}건.`);
  for (const h of hits) console.error(`  ${h}`);
  console.error('\n금고 블록 본문은 공개 리포에 들어가지 않는다(H-3). 픽스처는 tests/fixtures/vault-fake/ 의 가짜 블록만 쓴다.');
  process.exit(1);
}

console.log(`금고 문자열 검사 통과 — 검사 파일 ${scanned}개, 적중 0건.`);
