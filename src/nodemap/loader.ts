import type { Course } from '../folder/schemas/common';
import highBundle from './nodemap.bundle.high.json';
import middleBundle from './nodemap.bundle.middle.json';
import { nodemapBundleSchema, type NodemapBundle } from './types';

/**
 * 정본 SNAP 사본(C-036). 편집 금지 — 원본 md5 는 README 에 적혀 있다.
 * 중등 번들은 mids 가 비어 있다(공통기초 D만) — 「준비 중」으로 열고 문항 저작을 막는다(규격 §2-1).
 */
const bundles: Record<Course, NodemapBundle> = {
  high: nodemapBundleSchema.parse(highBundle),
  middle: nodemapBundleSchema.parse(middleBundle),
};

export function loadBundle(course: Course): NodemapBundle {
  return bundles[course];
}

/** 그 과정으로 문항을 저작할 수 있는가(중위 단원이 있어야 한다) */
export function hasMidNodes(course: Course): boolean {
  return bundles[course].mids.length > 0;
}
