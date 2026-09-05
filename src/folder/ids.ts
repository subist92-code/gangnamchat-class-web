/**
 * ID 발급(C-042 · F-5) — `S-/Q-/E-/H-YYYY-NNNN`. 도구 발급·불변.
 * id_counters 는 캐시다. 정본은 파일 자체 — 충돌 시 스캔해 재계산한다(규격 §2-1).
 */
export type IdKind = 'student' | 'problem' | 'exam' | 'homework';

const PREFIX: Record<IdKind, string> = {
  student: 'S',
  problem: 'Q',
  exam: 'E',
  homework: 'H',
};

export function formatId(kind: IdKind, year: number, seq: number): string {
  return `${PREFIX[kind]}-${year}-${String(seq).padStart(4, '0')}`;
}

export function idPrefix(kind: IdKind): string {
  return PREFIX[kind];
}

/** 이미 쓰인 ID 목록에서 다음 순번을 고른다(캐시와 스캔 결과 중 큰 쪽). */
export function nextSequence(existingIds: readonly string[], cached: number): number {
  let max = cached;
  for (const id of existingIds) {
    const seq = Number.parseInt(id.slice(-4), 10);
    if (Number.isFinite(seq) && seq > max) max = seq;
  }
  return max + 1;
}
