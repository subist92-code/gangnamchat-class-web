import { describe, expect, it } from 'vitest';
import { loadBundle } from '../../src/nodemap/loader';
import { isCommonBasic, midOptions, unitSlotFor } from '../../src/nodemap/unitSlot';

/**
 * 단원 슬롯 매핑(규격 §2 · C-065 · 지시서 02 §3-1).
 *
 * ★ 「공통수학」(P01~P06 → B10)과 「공통기초」(DF/DC/DW → B-D)는 다른 것이다.
 *   이름이 비슷해 뒤집히기 쉬운 자리라 양쪽을 모두 못 박아 둔다.
 */
describe('unitSlotFor — C-065 갈래', () => {
  const high = loadBundle('high');
  const middle = loadBundle('middle');

  it('course=middle 이면 mid 와 무관하게 B-D', () => {
    expect(unitSlotFor(middle, 'middle', 'DF01')).toBe('B-D');
    expect(unitSlotFor(middle, 'middle', null)).toBe('B-D');
    // 고등 노드 id 를 줘도 과정이 중등이면 B-D 다.
    expect(unitSlotFor(middle, 'middle', 'M01')).toBe('B-D');
  });

  it('공통기초(D노드)면 course=high 라도 B-D', () => {
    const firstBasic = (high.common_basic ?? [])[0];
    expect(firstBasic).toBeDefined();
    expect(isCommonBasic(high, firstBasic?.id as string)).toBe(true);
    expect(unitSlotFor(high, 'high', firstBasic?.id as string)).toBe('B-D');
  });

  it('공통수학은 B-D 가 아니라 B10 이다', () => {
    const p = high.mids.find((m) => m.domain_group === '공통수학');
    expect(p).toBeDefined();
    expect(unitSlotFor(high, 'high', p?.id as string)).toBe('B10');
  });

  it('그룹별 매핑 — 대수 B20 · 미적분Ⅰ B30 · 확률과통계 B40', () => {
    const pick = (group: string) => high.mids.find((m) => m.domain_group === group)?.id as string;
    expect(unitSlotFor(high, 'high', pick('대수'))).toBe('B20');
    expect(unitSlotFor(high, 'high', pick('미적분Ⅰ'))).toBe('B30');
    expect(unitSlotFor(high, 'high', pick('확률과통계'))).toBe('B40');
  });

  it('번들의 모든 중위 노드가 슬롯을 갖는다 — 빠진 그룹이 없어야 한다', () => {
    for (const mid of high.mids) {
      expect(unitSlotFor(high, 'high', mid.id), `${mid.id} ${mid.name}`).not.toBeNull();
    }
  });

  it('모르는 노드는 null — 임의 기본값을 밀어 넣지 않는다', () => {
    expect(unitSlotFor(high, 'high', 'ZZ99')).toBeNull();
    expect(unitSlotFor(high, 'high', null)).toBeNull();
    expect(unitSlotFor(high, 'high', '')).toBeNull();
  });

  it('midOptions — 고등은 중위 + 공통기초, 중등은 공통기초만', () => {
    const highOptions = midOptions(high, 'high');
    expect(highOptions.length).toBe(high.mids.length + (high.common_basic ?? []).length);
    expect(highOptions.some((o) => o.commonBasic)).toBe(true);

    const middleOptions = midOptions(middle, 'middle');
    expect(middleOptions.every((o) => o.commonBasic)).toBe(true);
    expect(middleOptions.length).toBe((middle.common_basic ?? []).length);
  });
});
