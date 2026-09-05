/** 규격 §1 루트 구조의 예약어. 도구가 만드는 4구역 + 임시·대화. */
export const ROOT = {
  classJson: 'class.json',
  roster: '명부',
  rosterCsv: '명부/students.csv',
  rosterClasses: '명부/반',
  rosterGoals: '명부/목표',
  bank: '문제함',
  bankOutOfScope: '문제함/_노드밖',
  bankReceipts: '문제함/receipts.json',
  bankIndex: '문제함/index.json',
  exams: '시험',
  homework: '숙제',
  tmp: '_임시',
  tmpTranscripts: '_임시/전사',
  talks: '_대화',
} as const;

/** 4구역 + 임시 — 「새 클래스 폴더」가 만드는 뼈대 */
export const SCAFFOLD_DIRS: readonly string[] = [
  ROOT.roster,
  ROOT.rosterClasses,
  ROOT.rosterGoals,
  ROOT.bank,
  ROOT.exams,
  ROOT.homework,
  ROOT.tmp,
  ROOT.tmpTranscripts,
];

export function transcriptPath(batchId: string): string {
  return `${ROOT.tmpTranscripts}/${batchId}.json`;
}

export function examResponsesPath(examDir: string): string {
  return `${examDir}/responses.csv`;
}

export function examAttemptsPath(examDir: string, stamp: string): string {
  return `${examDir}/attempts_${stamp}.json`;
}

/** attempts 파일명 시각 도장 — YYYYMMDDTHHmmss */
export function attemptsStamp(now = new Date()): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return (
    `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}` +
    `T${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`
  );
}
