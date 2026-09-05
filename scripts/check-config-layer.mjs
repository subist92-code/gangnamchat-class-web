#!/usr/bin/env node
/**
 * 설정 계층 검사(지시서 §2-6) + 금고 어휘 검사(§4-2).
 *
 * 1) 모델 ID 문자열은 src/config/models.ts 밖에 있으면 안 된다.
 * 2) 금고 어휘(커널·미끼 설계 규칙·카탈로그 본문)는 브라우저 코드에 없어야 한다(H-3).
 *
 * 두 검사 모두 양성 대조가 가능해야 한다 — 일부러 심으면 잡혀야 한다.
 * 실행: npm run config-layer
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOTS = ['src', 'supabase'];
const EXTENSIONS = ['.ts', '.tsx'];
const MODEL_ALLOWED = join('src', 'config', 'models.ts');
const MODEL_NEEDLE = ['claude', ''].join('-');

/**
 * 금고 어휘. P82 공개 블록은 원본에 「금고 어휘(커널·미끼·카탈로그)는 여기 없다」는
 * 자기 선언 문장이 들어 있어 단어만으로는 잡힌다 — REF 사본이므로 그 파일은 면제하고,
 * 대신 사본이 원본과 같은지는 P82 단위 테스트가 지킨다.
 */
const VAULT_WORDS = ['커널', '미끼 설계', '오개념 카탈로그', '통제어휘규약', '저작카드'];
const VAULT_EXEMPT = [join('src', 'llm', 'blocks', 'P82_transcribe.ts')];

function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    if (name === 'node_modules' || name === 'dist') continue;
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (EXTENSIONS.some((ext) => name.endsWith(ext))) out.push(full);
  }
  return out;
}

const files = ROOTS.flatMap((root) => walk(root));
const modelHits = [];
const vaultHits = [];

for (const file of files) {
  const rel = relative(process.cwd(), file);
  const normalized = rel.split('/').join(sep);
  const text = readFileSync(file, 'utf8');
  text.split(/\r?\n/).forEach((line, i) => {
    if (normalized !== MODEL_ALLOWED && line.includes(MODEL_NEEDLE)) {
      modelHits.push(`${rel}:${i + 1}: ${line.trim()}`);
    }
    if (VAULT_EXEMPT.includes(normalized)) return;
    for (const word of VAULT_WORDS) {
      if (line.includes(word)) vaultHits.push(`${rel}:${i + 1}: ${word}`);
    }
  });
}

let failed = false;
if (modelHits.length > 0) {
  failed = true;
  console.error(`설정 계층 위반 ${modelHits.length}건 — 모델 ID 는 ${MODEL_ALLOWED} 에만 있어야 합니다.`);
  for (const hit of modelHits) console.error(`  ${hit}`);
} else {
  console.log(`설정 계층 검사 통과 — 검사 파일 ${files.length}개, 모델 ID 리터럴 0건.`);
}

if (vaultHits.length > 0) {
  failed = true;
  console.error(`금고 어휘 ${vaultHits.length}건이 브라우저 코드에 있습니다(H-3).`);
  for (const hit of vaultHits) console.error(`  ${hit}`);
} else {
  console.log('금고 어휘 검사 통과 — 0건.');
}

process.exit(failed ? 1 : 0);
