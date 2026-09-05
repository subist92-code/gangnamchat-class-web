import { z } from 'zod';
import {
  axisSchema,
  courseSchema,
  errorCodeSchema,
  formatTypeSchema,
  isoDateTimeSchema,
  problemIdSchema,
  verificationGradeSchema,
} from './common';

/**
 * 규격 §3-1 문항 파일. decoys = B′ 5키 고정(C-035 · C-043).
 * 정답 자리 "correct" 정확히 1개 · 오답 객체는 path·error_code·node·axis 4키 필수.
 * null 금지 — 미판정은 키 부재.
 */
export const decoySeatSchema = z.object({
  path: z.string().min(1),
  error_code: errorCodeSchema,
  node: z.string().min(1),
  axis: axisSchema,
  misconception: z
    .object({
      category: z.string(),
      category_label: z.string(),
      mc_id: z.string(),
    })
    .optional(),
});

export const decoysSchema = z.record(z.string(), z.union([z.literal('correct'), decoySeatSchema]));

export const problemJsonSchema = z.object({
  spec: z.string().regex(/^gc-class-problem\/\d+\.\d+$/),
  problem_id: problemIdSchema,
  source: z.object({
    kind: z.enum(['original', 'converted', 'twin', 'forge']),
    input: z.enum(['typed', 'photo', 'hwp', 'pdf']),
    seed_problem_id: problemIdSchema.nullable(),
    transcription: z
      .object({
        confirmed_by_teacher_at: isoDateTimeSchema,
        diff_from_llm: z.number().int().nonnegative(),
      })
      .nullable(),
    original_choices: z.array(z.string()).nullable(),
    note: z.string(),
  }),
  course: courseSchema,
  nodes: z.object({
    mid: z.string().nullable(),
    sub: z.array(z.string()).min(1),
    nodemap_version: z.string(),
  }),
  difficulty: z.object({
    level: z.number().int().min(1).max(5),
    basis: z.enum(['cas', 'teacher', 'llm']),
    band_hint: z.string().nullable(),
    reason: z.string().max(250).nullable(),
  }),
  format: z.object({
    type: formatTypeSchema,
    omr_integer: z.boolean(),
    track: z.union([z.literal(1), z.literal(2)]),
  }),
  problem_text: z.string(),
  svg_visual: z.string().nullable(),
  choices: z.array(z.string()),
  answer: z.object({
    index: z.number().int().nullable(),
    value: z.string().nullable(),
  }),
  expected_wrong_answers: z.array(z.object({ value: z.string(), decoy_ref: z.string() })),
  solution: z.object({ text: z.string(), kernel_sentence: z.string().nullable() }),
  decoys: decoysSchema.optional(),
  killer: z.object({
    is_killer: z.boolean(),
    trap_type: z.string().nullable(),
    time_strategy_note: z.string().nullable(),
  }),
  twin: z.object({ group: z.string().nullable(), level: z.number().int() }),
  verification: z.object({
    cas: z.object({
      status: z.enum(['pass', 'fail', 'na']),
      checks: z.array(z.string()),
      engine: z.string(),
      at: isoDateTimeSchema.nullable(),
      report_ref: z.string().nullable(),
    }),
    teacher: z.object({
      approved: z.boolean(),
      at: isoDateTimeSchema.nullable(),
      note: z.string(),
    }),
    grade: verificationGradeSchema,
  }),
  processing_depth: z.enum(['full', 'index_only']),
  usage: z.object({ exams: z.array(z.string()), homeworks: z.array(z.string()) }),
  donation: z.object({
    status: z.enum(['none', 'sent', 'accepted', 'declined']),
    donation_id: z.string().nullable(),
    sent_at: isoDateTimeSchema.nullable(),
    consent_version: z.string().nullable(),
  }),
  created_at: isoDateTimeSchema,
  updated_at: isoDateTimeSchema,
  tool_version: z.string(),
});

export type DecoySeat = z.infer<typeof decoySeatSchema>;
export type Decoys = z.infer<typeof decoysSchema>;
export type ProblemJson = z.infer<typeof problemJsonSchema>;

export function hasExactlyOneCorrectSeat(decoys: Decoys | undefined): boolean {
  if (decoys === undefined) return false;
  return Object.values(decoys).filter((v) => v === 'correct').length === 1;
}
