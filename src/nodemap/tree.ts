import type { NodemapBundle } from './types';

/**
 * 화면 노출 상한(H-3 · C-018): 노드 이름·트리까지만.
 * 금고에만 있는 것들은 이 리포의 브라우저 코드에 존재하지 않는다.
 */
export interface TreeNode {
  id: string;
  name: string;
  children: TreeNode[];
}

export function buildTree(bundle: NodemapBundle): TreeNode[] {
  const mids: TreeNode[] = bundle.mids.map((mid) => ({
    id: mid.id,
    name: mid.name,
    children: mid.subs
      .filter((sub) => sub.backend_only !== true)
      .map((sub) => ({ id: sub.id, name: sub.name, children: [] })),
  }));
  const commonBasic = bundle.common_basic ?? [];
  if (commonBasic.length > 0) {
    mids.push({
      id: 'D',
      name: '공통기초',
      children: commonBasic.map((n) => ({ id: n.id, name: n.name, children: [] })),
    });
  }
  return mids;
}

/** 하위 노드 id 전체(문항 nodes.sub 검사에 쓴다 — lint L-14) */
export function subNodeIds(bundle: NodemapBundle): Set<string> {
  const ids = new Set<string>();
  for (const mid of bundle.mids) {
    for (const sub of mid.subs) ids.add(sub.id);
  }
  for (const node of bundle.common_basic ?? []) ids.add(node.id);
  return ids;
}

/** 노드 이름 조회 — 없으면 null. 도구가 이름을 지어내지 않는다(H-4). */
export function nodeName(bundle: NodemapBundle, id: string): string | null {
  for (const mid of bundle.mids) {
    if (mid.id === id) return mid.name;
    for (const sub of mid.subs) if (sub.id === id) return sub.name;
  }
  for (const node of bundle.common_basic ?? []) if (node.id === id) return node.name;
  return null;
}
