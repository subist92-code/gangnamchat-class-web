import { z } from 'zod';

/** 과정 축(C-058) */
export const courseSchema = z.enum(['high', 'middle']);
export type Course = z.infer<typeof courseSchema>;

/** ID 체계(C-042) — 도구 발급·불변 */
export const studentIdSchema = z.string().regex(/^S-\d{4}-\d{4}$/, 'S-YYYY-NNNN 형식');
export const problemIdSchema = z.string().regex(/^Q-\d{4}-\d{4}$/, 'Q-YYYY-NNNN 형식');
export const examIdSchema = z.string().regex(/^E-\d{4}-\d{4}$/, 'E-YYYY-NNNN 형식');
export const homeworkIdSchema = z.string().regex(/^H-\d{4}-\d{4}$/, 'H-YYYY-NNNN 형식');

export const isoDateTimeSchema = z.string().min(1);

/** 오류 유형(규격 §3-1) — time_pressure 정적 부여 금지 */
export const errorCodeSchema = z.enum([
  'concept_missing',
  'concept_confusion',
  'calculation_error',
  'misreading',
  'trap_missed',
]);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const axisSchema = z.enum(['misconception', 'execution']);

/** 판정 결과의 미끼 출처(규격 §4-3 · C-069 ①) */
export const errorSourceSchema = z.enum(['distractor', 'decoy_value', 'none', 'unmapped']);
export type ErrorSource = z.infer<typeof errorSourceSchema>;

export const verificationGradeSchema = z.enum([
  'cas+teacher',
  'teacher_only',
  'cas_only',
  'unverified',
]);
export type VerificationGrade = z.infer<typeof verificationGradeSchema>;

export const formatTypeSchema = z.enum(['mc5', 'combo', 'short', 'essay']);
export type FormatType = z.infer<typeof formatTypeSchema>;
