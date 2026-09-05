import { z } from 'zod';
import { studentIdSchema } from './common';

/**
 * 규격 §4-2 responses.csv — 3열이 학원 제공 데이터의 전부(C-044).
 * is_correct·점수는 이 파일에 적지 않는다.
 */
export const responseRowSchema = z.object({
  student_id: studentIdSchema,
  item_no: z.number().int().positive(),
  /** mc5 = '1'~'5' · short = 문자열 · 무응답 = 빈 문자열 */
  answer_given: z.string(),
});

export type ResponseRow = z.infer<typeof responseRowSchema>;

export const RESPONSES_CSV_HEADER = ['student_id', 'item_no', 'answer_given'] as const;
