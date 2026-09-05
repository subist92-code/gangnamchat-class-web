import type { FolderAdapter } from '../FolderAdapter';
import { rules } from './rules';
import type { LintFinding, LintResult } from './types';

export * from './types';
export { rules } from './rules';

/**
 * 폴더 lint(규격 §6). 결과는 class.json.last_lint 에 남는다.
 * 구현되지 않은 규칙은 todo 로 함께 보고한다 — 0건이 곧 깨끗함은 아니다(C-046).
 */
export async function runLint(adapter: FolderAdapter): Promise<LintResult> {
  const findings: LintFinding[] = [];
  const todo: string[] = [];
  for (const rule of rules) {
    if (!rule.implemented || rule.run === undefined) {
      todo.push(rule.code);
      continue;
    }
    findings.push(...(await rule.run({ adapter })));
  }
  return {
    findings,
    errors: findings.filter((f) => f.level === 'error').length,
    warnings: findings.filter((f) => f.level === 'warning').length,
    todo,
  };
}

/** L-01 만 먼저 본다 — 「기존 폴더 열기」 관문 */
export async function isClassFolder(adapter: FolderAdapter): Promise<boolean> {
  const rule = rules.find((r) => r.code === 'L-01');
  if (rule?.run === undefined) return false;
  return (await rule.run({ adapter })).length === 0;
}
