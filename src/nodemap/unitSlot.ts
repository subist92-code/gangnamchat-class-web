import type { Course } from '../folder/schemas/common';
import type { UnitSlot } from '../folder/schemas/transcript';
import type { NodemapBundle } from './types';

/**
 * 중위 단원 → 단원 슬롯(규격 §2 · C-065 · 지시서 02 §3-1).
 *
 * 조립 레시피의 단원 블록 자리에 무엇을 넣을지 정한다. 정본 번들의 `domain_group`
 * 으로 가르므로, 노드가 늘어도 그룹만 맞으면 따라온다 — 노드 id 를 하나하나 적지 않는다.
 *
 * `course = middle` 이거나 D노드(공통기초)면 항상 `B-D` 다(C-065).
 * 정본 명칭은 손대지 않는다 — 읽기만 한다(H-4).
 */

const GROUP_TO_SLOT: Record<string, UnitSlot> = {
  공통수학: 'B10',
  대수: 'B20',
  '미적분Ⅰ': 'B30',
  확률과통계: 'B40',
};

/** 공통기초 노드인가 — 번들의 `common_basic` 에 있으면 그렇다. */
export function isCommonBasic(bundle: NodemapBundle, mid: string): boolean {
  return (bundle.common_basic ?? []).some((n) => n.id === mid);
}

/**
 * 단원 슬롯을 고른다.
 * 그룹을 알 수 없으면 `null` 을 돌려준다 — 화면이 선생에게 직접 고르게 해야 하고,
 * 임의로 기본값을 밀어 넣으면 엉뚱한 단원 블록으로 검증하게 된다.
 */
export function unitSlotFor(
  bundle: NodemapBundle,
  course: Course,
  mid: string | null,
): UnitSlot | null {
  if (course === 'middle') return 'B-D';
  if (mid === null || mid.length === 0) return null;
  if (isCommonBasic(bundle, mid)) return 'B-D';

  const found = bundle.mids.find((m) => m.id === mid);
  if (found === undefined) return null;
  const group = found.domain_group;
  if (group === undefined) return null;
  return GROUP_TO_SLOT[group] ?? null;
}

/** 화면에 보이는 중위 단원 후보 — 이름과 id 만(H-3). */
export interface MidOption {
  id: string;
  name: string;
  /** D노드(공통기초)인가 — 화면이 「B-D · 예고 표시」를 붙인다(L-17). */
  commonBasic: boolean;
}

export function midOptions(bundle: NodemapBundle, course: Course): MidOption[] {
  const basics = (bundle.common_basic ?? []).map((n) => ({
    id: n.id,
    name: n.name,
    commonBasic: true,
  }));
  if (course === 'middle') return basics;
  return [
    ...bundle.mids.map((m) => ({ id: m.id, name: m.name, commonBasic: false })),
    ...basics,
  ];
}
