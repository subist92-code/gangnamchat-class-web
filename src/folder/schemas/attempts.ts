import { z } from 'zod';
import {
  axisSchema,
  errorCodeSchema,
  errorSourceSchema,
  examIdSchema,
  isoDateTimeSchema,
  problemIdSchema,
  studentIdSchema,
  verificationGradeSchema,
} from './common';

/** 규격 §4-3 attempts.json — 판정 결과(원형 problem_attempts PORT · 형식만) */
export const attemptSchema = z.object({
  student_id: studentIdSchema,
  item_no: z.number().int().positive(),
  problem_id: problemIdSchema,
  answer_given: z.string(),
  is_correct: z.boolean(),
  error_code: errorCodeSchema.nullable(),
  error_source: errorSourceSchema.nullable(),
  node: z.string().nullable(),
  axis: axisSchema.nullable(),
  mc_id: z.string().nullable(),
  killer_tag: z.boolean(),
  verification_grade: verificationGradeSchema.nullable(),
});

export const attemptsJsonSchema = z.object({
  spec: z.string().regex(/^gc-class-attempts\/\d+\.\d+$/),
  exam_id: examIdSchema,
  judged_at: isoDateTimeSchema,
  tool_version: z.string(),
  attempts: z.array(attemptSchema),
});

export type Attempt = z.infer<typeof attemptSchema>;
export type AttemptsJson = z.infer<typeof attemptsJsonSchema>;
