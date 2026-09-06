import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assemble,
  blockIdFromFile,
  versionOf,
  type RecipesJson,
} from '../../supabase/functions/vault-proxy/assemble';

/**
 * 조립(지시서 02 §6 · assemble.test.ts).
 *
 * 가짜 블록 픽스처로만 돌린다 — 금고 본문은 이 리포에 없다(H-3).
 * 지시서는 이 시험을 「Deno · 함수 측」으로 적었지만 Deno 가 설치돼 있지 않다.
 * 조립 로직이 런타임에 기대지 않는 순수 모듈이라 함수와 vitest 가 **같은 파일**을 돌린다 —
 * 조립이 두 벌이 되면 스모크 ⑤ 의 문자 수 대조가 무의미해진다.
 */

const FIXTURE = join(process.cwd(), 'tests/fixtures/vault-fake');

function loadFixture(): { recipes: RecipesJson; files: Map<string, string> } {
  const recipes = JSON.parse(
    readFileSync(join(FIXTURE, 'recipes.json'), 'utf8'),
  ) as RecipesJson;

  const files = new Map<string, string>();
  const names = [
    'blocks/B00_core.md',
    'blocks/B03_difficulty.md',
    'blocks/B04_cas.md',
    'blocks/B05_output.md',
    'blocks/B20_algebra.md',
    'blocks/B10_precalc.md',
    'blocks/B-D_basic.md',
    'tasks/T-verify.md',
  ];
  for (const name of names) files.set(name, readFileSync(join(FIXTURE, name), 'utf8'));
  return { recipes, files };
}

describe('assemble', () => {
  const { recipes, files } = loadFixture();

  it('레시피 순서를 그대로 따른다', () => {
    const built = assemble('R-verify', 'B20', recipes, files);
    expect(built.blocks.map((b) => b.id)).toEqual([
      'B00',
      'B03',
      'B04',
      'B05',
      'B20',
      'T-verify',
    ]);
  });

  it('단원 슬롯 교체 — B20 자리가 B10 · B-D 로 바뀐다', () => {
    const b10 = assemble('R-verify', 'B10', recipes, files);
    expect(b10.blocks.map((b) => b.id)).toContain('B10');
    expect(b10.blocks.map((b) => b.id)).not.toContain('B20');

    const bd = assemble('R-verify', 'B-D', recipes, files);
    expect(bd.blocks.map((b) => b.id)).toContain('B-D');
    expect(bd.blocks.map((b) => b.id)).not.toContain('B20');

    // 나머지 자리는 그대로다 — 단원만 갈린다.
    expect(bd.blocks.length).toBe(6);
  });

  it('머리 주석은 1개만 벗기고 본문 주석은 남긴다', () => {
    const built = assemble('R-verify', 'B20', recipes, files);
    const first = built.blocks[0];
    expect(first).toBeDefined();
    const text = first?.text ?? '';

    expect(text).not.toContain('머리 주석');
    expect(text).toContain('본문 안 주석');
    expect(text).toContain('FAKE BLOCK B00');
  });

  it('캐시 경계 = 마지막 T-블록 — 마지막 조각이 T 다', () => {
    const built = assemble('R-verify', 'B20', recipes, files);
    const last = built.blocks[built.blocks.length - 1];
    expect(last?.id).toBe('T-verify');
  });

  it('charTotal 은 머리 주석을 벗긴 본문 길이의 합이다', () => {
    const built = assemble('R-verify', 'B20', recipes, files);
    const sum = built.blocks.reduce((n, b) => n + b.chars, 0);
    expect(built.charTotal).toBe(sum);

    // 원본보다는 짧다 — 머리 주석을 벗겼기 때문이다.
    const rawSum = [...files.values()].reduce((n, t) => n + t.length, 0);
    expect(built.charTotal).toBeLessThan(rawSum);
  });

  it('versions — 블록 id 별 판본이 영수증에 실릴 형태로 나온다', () => {
    const built = assemble('R-verify', 'B20', recipes, files);
    expect(built.versions).toEqual({
      B00: 'v1',
      B03: 'v1',
      B04: 'v1',
      B05: 'v1',
      B20: 'v1',
      'T-verify': 'v1',
    });
  });

  it('모르는 레시피 · 단원은 던진다 — 조용히 기본값으로 넘어가지 않는다', () => {
    expect(() => assemble('R-decoy', 'B20', recipes, files)).toThrow(/unknown_recipe/);
    expect(() => assemble('R-verify', 'ZZ' as never, recipes, files)).toThrow(/unknown_unit/);
  });

  it('블록이 없으면 던진다 — 빈 자리로 조립하지 않는다', () => {
    const missing = new Map(files);
    missing.delete('blocks/B04_cas.md');
    expect(() => assemble('R-verify', 'B20', recipes, missing)).toThrow(/missing_block/);
  });

  it('blockIdFromFile · versionOf', () => {
    expect(blockIdFromFile('blocks/B00_core.md')).toBe('B00');
    expect(blockIdFromFile('B-D_basic.md')).toBe('B-D');
    expect(blockIdFromFile('tasks/T-verify.md')).toBe('T-verify');
    expect(versionOf('<!-- v1 -->')).toBe('v1');
    expect(versionOf('판본 표기 없음')).toBe('?');
  });
});
