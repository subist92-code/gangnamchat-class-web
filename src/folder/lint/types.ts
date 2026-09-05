import type { FolderAdapter } from '../FolderAdapter';

export type LintLevel = 'error' | 'warning' | 'info';

export interface LintFinding {
  code: string;
  level: LintLevel;
  message: string;
  path?: string;
}

export interface LintContext {
  adapter: FolderAdapter;
}

export interface LintRule {
  code: string;
  level: LintLevel;
  title: string;
  /** 이번 국면 구현 여부. false 면 자리만 등록되어 있다(지시서 §2-7). */
  implemented: boolean;
  run?: (ctx: LintContext) => Promise<LintFinding[]>;
}

export interface LintResult {
  findings: LintFinding[];
  errors: number;
  warnings: number;
  /** 구현되지 않은 규칙 코드 — 0건은 깨끗함이 아니다 */
  todo: string[];
}
