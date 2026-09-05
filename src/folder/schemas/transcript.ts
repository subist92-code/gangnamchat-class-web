import { z } from 'zod';
import { courseSchema, formatTypeSchema, isoDateTimeSchema } from './common';

/**
 * 자리 B (제안) — `_임시/전사/<묶음id>.json` (지시서 §5-3).
 * 규격 v0.3 은 폴더(`_임시/`)만 정하고 파일 형식은 없다. 이 형식은 규격 v0.4 후보.
 * lint 대상 아님(L-16) · 저장 완료 시 삭제.
 */

/** P82-2 출력 계약 한 항목 (공개 블록 P82 · 문서 리포 docs/공개블록/P82_transcribe.md) */
export const p82ItemSchema = z.object({
  no: z.string(),
  stem_shared: z.string().nullable(),
  problem_text: z.string(),
  choices: z.array(z.string()).nullable(),
  format_guess: formatTypeSchema,
  answer_raw: z.string().nullable(),
  solution_raw: z.string().nullable(),
  figure: z.boolean(),
  figure_text: z.string().nullable(),
  points: z.number().nullable(),
  source_note: z.string().nullable(),
  uncertain: z.array(
    z.object({ where: z.string(), read: z.string(), alt: z.string().nullable() }),
  ),
  stray_marks: z.boolean(),
  continues: z.boolean(),
  page: z.number().int().positive(),
  bbox: z.array(z.number()).length(4).nullable(),
});

export const p82ResponseSchema = z.object({ items: z.array(p82ItemSchema) });

export const transcriptItemSchema = z.object({
  tmp_no: z.number().int().positive(),
  page: z.number().int().positive(),
  bbox: z.array(z.number()).length(4).nullable(),
  llm: p82ItemSchema,
  edited: z.object({
    problem_text: z.string(),
    choices: z.array(z.string()).nullable(),
    answer_raw: z.string().nullable(),
  }),
  confirmed_at: isoDateTimeSchema.nullable(),
  diff_from_llm: z.number().int().nonnegative(),
  figure: z.boolean(),
  format_guess: formatTypeSchema,
});

export const transcriptTmpSchema = z.object({
  spec: z.string().regex(/^gc-class-transcript-tmp\/\d+\.\d+$/),
  batch_id: z.string().regex(/^T-/),
  class_ref: z.string(),
  course: courseSchema,
  mid_default: z.string().nullable(),
  source: z.object({
    input: z.enum(['photo', 'pdf']),
    files: z.array(z.string()),
    note: z.string(),
    rights_confirmed: z.boolean(),
  }),
  items: z.array(transcriptItemSchema),
  receipts_ref: z.string(),
  created_at: isoDateTimeSchema,
  updated_at: isoDateTimeSchema,
  tool_version: z.string(),
});

export type P82Item = z.infer<typeof p82ItemSchema>;
export type P82Response = z.infer<typeof p82ResponseSchema>;
export type TranscriptItem = z.infer<typeof transcriptItemSchema>;
export type TranscriptTmp = z.infer<typeof transcriptTmpSchema>;
