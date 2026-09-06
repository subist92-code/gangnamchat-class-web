import { z } from 'zod';
import { courseSchema, formatTypeSchema, isoDateTimeSchema } from './common';
import { verdictSchema } from '../../verify/verdict';

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


/** 단원 슬롯(규격 §2 · C-065). course=middle 또는 D노드면 B-D. */
export const unitSlotSchema = z.enum(['B10', 'B20', 'B30', 'B40', 'B-D']);
export type UnitSlot = z.infer<typeof unitSlotSchema>;

/**
 * answer_mismatch 에 대한 선생 판정(기획 §7-4 · D11 ②).
 * 결함이 아니라 판단이다 — 「내 정답이 맞다」/「본문 해로 바꾼다」.
 */
export const answerDecisionSchema = z.enum(['teacher_answer', 'text_answer']);
export type AnswerDecision = z.infer<typeof answerDecisionSchema>;

/** S3 단원 · 형식 확정(지시서 02 §3-1 · 자리 B 확장). */
export const s3Schema = z.object({
  mid: z.string(),
  unit: unitSlotSchema,
  format: formatTypeSchema,
  has_answer: z.boolean(),
  teacher_note: z.string().nullable(),
  answer_decision: answerDecisionSchema.nullable(),
});
export type S3Fields = z.infer<typeof s3Schema>;

/** 저장되는 판정 — emit_verdict 그대로 + 받은 시각 · 영수증 행 참조. */
export const storedVerdictSchema = verdictSchema.and(
  z.object({
    received_at: isoDateTimeSchema,
    receipt_ref: z.number().int().nonnegative().nullable(),
  }),
);
export type StoredVerdict = z.infer<typeof storedVerdictSchema>;

/**
 * CAS 검산 결과(지시서 02 §3-3 · 자리 E).
 * verdict 를 덮지 않는다 — 모델 판정과 나란히 보인다(C-053 · C-034).
 */
export const casStatusSchema = z.enum(['pass', 'fail', 'na']);
export const casResultSchema = z.object({
  status: casStatusSchema,
  checks: z.array(z.string()),
  engine: z.string(),
  at: isoDateTimeSchema,
  elapsed_ms: z.number().nonnegative(),
  note: z.string().nullable().optional(),
});
export type CasResult = z.infer<typeof casResultSchema>;

/** 항목 상태(지시서 02 §5-3). */
export const itemStateSchema = z.enum([
  'ready',
  'verified:pass',
  'verified:ambiguous',
  'verified:fail',
  'parked',
  'track2',
  'rejected',
]);
export type ItemState = z.infer<typeof itemStateSchema>;

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
  // ↓ 지시서 02 에서 붙는 자리. 기존 전사 파일에는 없으므로 전부 선택 항목이다.
  s3: s3Schema.nullable().optional(),
  verdict: storedVerdictSchema.nullable().optional(),
  cas: casResultSchema.nullable().optional(),
  state: itemStateSchema.optional(),
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
