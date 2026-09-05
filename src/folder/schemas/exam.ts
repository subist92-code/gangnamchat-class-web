import { z } from 'zod';
import { examIdSchema, formatTypeSchema, isoDateTimeSchema, problemIdSchema } from './common';

/** 규격 §4-1 exam.json */
export const examItemSchema = z.object({
  no: z.number().int().positive(),
  problem_id: problemIdSchema,
  points: z.number().nonnegative(),
  format: formatTypeSchema,
  is_killer: z.boolean(),
});

export const examJsonSchema = z.object({
  spec: z.string().regex(/^gc-class-exam\/\d+\.\d+$/),
  exam_id: examIdSchema,
  title: z.string(),
  class_ref: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time_limit_min: z.number().int().positive(),
  items: z.array(examItemSchema),
  scope: z.object({
    mid_nodes: z.array(z.string()),
    difficulty_ladder: z.array(z.number().int()),
  }),
  watermark: z.boolean(),
  generated_at: isoDateTimeSchema,
  status: z.enum(['draft', 'printed', 'graded', 'reported']),
});

export type ExamItem = z.infer<typeof examItemSchema>;
export type ExamJson = z.infer<typeof examJsonSchema>;
