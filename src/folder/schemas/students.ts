import { z } from 'zod';
import { studentIdSchema } from './common';

/**
 * 규격 §2-2 명부/students.csv 한 행.
 * 생년월일·연락처·학교명 열은 규격에 없다(C-047 · 미성년자 데이터 최소화).
 */
export const studentRowSchema = z.object({
  student_id: studentIdSchema,
  name: z.string().min(1),
  grade: z.enum(['중1', '중2', '중3', '고1', '고2', '고3', 'N수', '']).optional(),
  status: z.enum(['active', 'paused', 'left']),
  joined_at: z.string().optional(),
  left_at: z.string().optional(),
  note: z.string().optional(),
});

export type StudentRow = z.infer<typeof studentRowSchema>;

export const STUDENTS_CSV_HEADER = [
  'student_id',
  'name',
  'grade',
  'status',
  'joined_at',
  'left_at',
  'note',
] as const;

/** 규격에 없는 열 — 도구가 읽지도 표시하지도 않는다(C-047) */
export const STUDENTS_CSV_REQUIRED = ['student_id', 'name', 'status'] as const;
