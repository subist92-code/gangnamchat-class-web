/**
 * 금고 → 비공개 버킷 `vault` 동기(지시서 02 §2-2 · H-3 · H-6).
 *
 * 실행(발주자 로컬 · 셸에서 1회 주입 · `.env.local` 에 넣지 않는다):
 *   VAULT_DIR=... SUPABASE_URL=... SUPABASE_SECRET_KEY=sb_secret_… node scripts/vault-sync.ts
 *
 * 키는 새 체계의 secret 키다(sb_secret_…). 레거시 service_role 은 유출로 폐기 예정이라 받지 않는다.
 *
 * 이 스크립트는 파일을 읽어 올리기만 한다 — 내용을 stdout·로그에 찍지 않는다.
 * 올린 뒤 전건을 되받아 md5 를 대조한다. 하나라도 어긋나면 0 이 아닌 코드로 끝난다.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const BUCKET = 'vault';

/**
 * manifest 가 나열하지 않지만 금고 규격 §6 배치가 요구하는 파일들.
 * manifest 자신 · recipes.json · tools/ 3 — 이것들이 없으면 vault-proxy 가 뜨지 못한다.
 */
const FIXED_FILES = [
  'manifest.json',
  'recipes.json',
  'tools/emit_verdict.schema.json',
  'tools/emit_problem.schema.json',
  'tools/B51_uid_map.json',
];

function need(name: string): string {
  const v = process.env[name];
  if (v === undefined || v.length === 0) {
    console.error(`환경변수 ${name} 이 없습니다. 셸에서 1회 주입하세요(.env.local 금지 · H-6).`);
    process.exit(2);
  }
  return v;
}

function md5(buf: Buffer): string {
  return createHash('md5').update(buf).digest('hex');
}

function contentType(path: string): string {
  if (path.endsWith('.json')) return 'application/json';
  if (path.endsWith('.md')) return 'text/markdown';
  return 'application/octet-stream';
}

async function main(): Promise<void> {
  const vaultDir = need('VAULT_DIR');
  const url = need('SUPABASE_URL').replace(/\/+$/, '');
  const key = need('SUPABASE_SECRET_KEY');

  const manifestRaw = await readFile(join(vaultDir, 'manifest.json'), 'utf8');
  const manifest = JSON.parse(manifestRaw) as Record<string, { file?: string }>;

  const listed: string[] = [];
  for (const [id, entry] of Object.entries(manifest)) {
    if (id === '_meta') continue;
    if (entry !== null && typeof entry === 'object' && typeof entry.file === 'string') {
      listed.push(entry.file);
    }
  }

  const targets = [...listed, ...FIXED_FILES];
  console.log(`대상 ${targets.length}개 = manifest 나열 ${listed.length} + 배치 고정 ${FIXED_FILES.length}`);

  const rows: Array<{ path: string; bytes: number; md5: string; ok: boolean }> = [];
  let mismatched = 0;

  for (const path of targets) {
    const local = await readFile(join(vaultDir, path));
    const localMd5 = md5(local);

    const put = await fetch(`${url}/storage/v1/object/${BUCKET}/${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${key}`,
        apikey: key,
        'content-type': contentType(path),
        'x-upsert': 'true',
      },
      body: new Uint8Array(local),
    });
    if (!put.ok) {
      // 상태 코드만 옮긴다 — 응답 본문에 경로 외의 것이 섞일 이유는 없지만 찍지 않는다.
      console.error(`업로드 실패 ${path} — HTTP ${put.status}`);
      process.exit(1);
    }

    const get = await fetch(`${url}/storage/v1/object/${BUCKET}/${path}`, {
      headers: { authorization: `Bearer ${key}`, apikey: key },
    });
    if (!get.ok) {
      console.error(`되받기 실패 ${path} — HTTP ${get.status}`);
      process.exit(1);
    }
    const back = Buffer.from(await get.arrayBuffer());
    const ok = md5(back) === localMd5 && back.length === local.length;
    if (!ok) mismatched += 1;
    rows.push({ path, bytes: local.length, md5: localMd5, ok });
  }

  console.log('');
  console.log('파일'.padEnd(38) + '크기'.padStart(9) + '  md5(앞8)  일치');
  console.log('-'.repeat(66));
  for (const r of rows) {
    console.log(
      r.path.padEnd(38) + String(r.bytes).padStart(9) + '  ' + r.md5.slice(0, 8) + '    ' + (r.ok ? 'ok' : 'MISMATCH'),
    );
  }
  console.log('-'.repeat(66));
  console.log(`업로드 ${rows.length}개 · 불일치 ${mismatched}개`);

  if (mismatched > 0) process.exit(1);
}

await main();
