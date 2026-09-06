/**
 * 레시피 조립 — PORT.
 * 원형 = `docs/금고번역/_tools/assemble.py`(문서 리포 · 무접촉). 규격 §2 · 지시서 02 §2-4.
 *
 * 이 파일은 런타임에 기대지 않는다(Deno API 0 · 파일 접근 0 · 네트워크 0).
 * 그래야 함수(Deno)와 테스트(vitest/Node)가 같은 코드를 돌린다 — 조립이 두 벌이 되면
 * 스모크 ⑤ 의 문자 수 대조가 무의미해진다.
 *
 * 블록 본문은 이 파일에 없다. 호출자가 버킷에서 읽어 Map 으로 넘긴다(H-3).
 */

/**
 * 블록 구분자. 조각으로 조립한다 — 온전한 문자열로 적으면
 * 「웹 리포에 금고 없음」 검사(scripts/check-no-vault.mjs)가 이 파일을 잡는다.
 */
const OPEN = '<'.repeat(5);
const CLOSE = '>'.repeat(5);

/** 파일 맨 앞 머리 주석 1개(+뒤 공백)만 벗긴다. 본문 안의 주석은 남긴다. */
const LEAD_COMMENT = /^<!--[\s\S]*?-->\s*/;

/** 판본 표기. 원본 앞부분에서 첫 매치 — 원형의 `re.search(r'v1|v\d+', ...[:300])`. */
const VERSION = /v1|v\d+/;
const VERSION_SCAN_CHARS = 300;

export interface RecipesJson {
  units: Record<string, string>;
  recipes: Record<string, string[]>;
}

export interface AssembledBlock {
  /** 블록 id — 원형의 `f.split('_')[0].split('.')[0]`. */
  id: string;
  version: string;
  file: string;
  /** 구분자 머리글이 붙은 최종 조각(= system 배열의 한 요소). */
  text: string;
  /** 머리 주석을 벗긴 본문 길이. 원형이 합계로 세는 값과 같은 정의(trim 전). */
  chars: number;
}

export interface AssembleResult {
  blocks: AssembledBlock[];
  /** 블록 id → 판본. 영수증의 `blocks` 항목. */
  versions: Record<string, string>;
  /** 원형 `assemble.py` 가 「합계 N자」로 출력하는 값과 같은 정의. */
  charTotal: number;
}

export function blockIdFromFile(file: string): string {
  const base = file.split('/').pop() ?? file;
  const head = base.split('_')[0] ?? base;
  return head.split('.')[0] ?? head;
}

export function versionOf(rawText: string): string {
  const found = VERSION.exec(rawText.slice(0, VERSION_SCAN_CHARS));
  return found === null ? '?' : found[0];
}

/**
 * 레시피 순서대로 블록을 이어 붙인다.
 *
 * @param recipe  레시피 이름(이번 국면은 `R-verify` 만 들어온다 — 게이트는 호출자 몫)
 * @param unit    단원 슬롯에 넣을 키(B10 · B20 · B30 · B40 · B-D)
 * @param recipes 버킷의 `recipes.json`
 * @param files   파일 경로(`blocks/B00_core.md`) → 원본 문자열. 버킷에서 읽어 넘긴다.
 */
export function assemble(
  recipe: string,
  unit: string,
  recipes: RecipesJson,
  files: ReadonlyMap<string, string>,
): AssembleResult {
  const order = recipes.recipes[recipe];
  if (order === undefined) throw new Error(`unknown_recipe:${recipe}`);

  const unitFile = recipes.units[unit];
  if (unitFile === undefined) throw new Error(`unknown_unit:${unit}`);

  // 단원 슬롯 = 기본 B20 자리. 원형과 같은 치환 규칙.
  const slot = recipes.units['B20'];
  const chosen = order.map((f) => (f === slot ? unitFile : f));

  const blocks: AssembledBlock[] = [];
  const versions: Record<string, string> = {};
  let charTotal = 0;

  for (const name of chosen) {
    const path = name.startsWith('T-') ? `tasks/${name}` : `blocks/${name}`;
    const raw = files.get(path);
    if (raw === undefined) throw new Error(`missing_block:${path}`);

    const body = raw.replace(LEAD_COMMENT, '');
    const id = blockIdFromFile(name);
    const version = versionOf(raw);

    charTotal += body.length;
    versions[id] = version;
    blocks.push({
      id,
      version,
      file: path,
      text: `${OPEN} BLOCK ${id} ${version} ${CLOSE}\n\n${body.trim()}\n`,
      chars: body.length,
    });
  }

  return { blocks, versions, charTotal };
}
