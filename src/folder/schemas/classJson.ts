import { z } from 'zod';
import { courseSchema, isoDateTimeSchema } from './common';

/** 규격 §2-1 class.json 매니페스트 */
export const classJsonSchema = z.object({
  spec: z.string().regex(/^gc-class\/\d+\.\d+$/),
  academy: z.object({
    name: z.string(),
    teacher_alias: z.string(),
  }),
  created_at: isoDateTimeSchema,
  tool_version: z.string(),
  nodemap: z.object({
    /** 픽스처 번들이면 "fixture" — 문항 저장을 막는다(자리 A) */
    version: z.string(),
    bundle_hash: z.string(),
  }),
  course_default: courseSchema,
  classes: z.record(z.string(), z.object({ course: courseSchema })),
  id_counters: z.object({
    student: z.number().int().nonnegative(),
    problem: z.number().int().nonnegative(),
    exam: z.number().int().nonnegative(),
    homework: z.number().int().nonnegative(),
  }),
  last_lint: z
    .object({
      at: isoDateTimeSchema,
      errors: z.number().int().nonnegative(),
      warnings: z.number().int().nonnegative(),
    })
    .nullable(),
  watermark_text: z.string(),
  naming: z.object({
    exam_folder: z.string(),
    homework_folder: z.string(),
    node_folder: z.string(),
  }),
});

export type ClassJson = z.infer<typeof classJsonSchema>;
