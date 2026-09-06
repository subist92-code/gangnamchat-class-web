import { limits } from '../config/limits';
import type { FolderAdapter } from '../folder/FolderAdapter';
import { ROOT, transcriptPath } from '../folder/paths';
import type { Course } from '../folder/schemas/common';
import {
  transcriptTmpSchema,
  type CasResult,
  type ItemState,
  type P82Item,
  type S3Fields,
  type StoredVerdict,
  type TranscriptItem,
  type TranscriptTmp,
  type UnitSlot,
} from '../folder/schemas/transcript';
import { transcriptDiff } from './diff';

/**
 * S2 전사 확인본 저장 — `_임시/전사/<묶음id>.json`(C-066 ④ · Q-가-4).
 * 확인할 때마다 덮어쓴다. 부분 확인도 보존한다 — 전사 노동을 잃지 않게.
 * lint 대상 아님(L-16).
 */

export function emptyEdited(item: P82Item): TranscriptItem['edited'] {
  return {
    problem_text: item.problem_text,
    choices: item.choices,
    answer_raw: item.answer_raw,
  };
}

export function newTranscript(params: {
  batchId: string;
  classRef: string;
  course: Course;
  midDefault: string | null;
  input: 'photo' | 'pdf';
  files: string[];
  note: string;
  rightsConfirmed: boolean;
  items: P82Item[];
}): TranscriptTmp {
  const now = new Date().toISOString();
  return {
    spec: 'gc-class-transcript-tmp/0.1',
    batch_id: params.batchId,
    class_ref: params.classRef,
    course: params.course,
    mid_default: params.midDefault,
    source: {
      input: params.input,
      files: params.files,
      note: params.note,
      rights_confirmed: params.rightsConfirmed,
    },
    items: params.items.map((item, index) => ({
      tmp_no: index + 1,
      page: item.page,
      bbox: item.bbox,
      llm: item,
      edited: emptyEdited(item),
      confirmed_at: null,
      diff_from_llm: 0,
      figure: item.figure,
      format_guess: item.format_guess,
    })),
    receipts_ref: ROOT.bankReceipts,
    created_at: now,
    updated_at: now,
    tool_version: limits.toolVersion,
  };
}

export async function saveTranscript(
  adapter: FolderAdapter,
  transcript: TranscriptTmp,
): Promise<void> {
  const next: TranscriptTmp = { ...transcript, updated_at: new Date().toISOString() };
  await adapter.mkdir(ROOT.tmpTranscripts);
  await adapter.write(transcriptPath(next.batch_id), `${JSON.stringify(next, null, 2)}\n`);
}

export async function loadTranscript(
  adapter: FolderAdapter,
  batchId: string,
): Promise<TranscriptTmp | null> {
  const path = transcriptPath(batchId);
  if (!(await adapter.exists(path))) return null;
  return transcriptTmpSchema.parse(JSON.parse(await adapter.read(path)));
}

export async function listTranscripts(adapter: FolderAdapter): Promise<TranscriptTmp[]> {
  const out: TranscriptTmp[] = [];
  for (const entry of await adapter.list(ROOT.tmpTranscripts)) {
    if (entry.kind !== 'file' || !entry.name.endsWith('.json')) continue;
    try {
      out.push(transcriptTmpSchema.parse(JSON.parse(await adapter.read(entry.path))));
    } catch {
      // 형식이 다른 파일은 조용히 건너뛴다 — lint 대상이 아니다(L-16).
    }
  }
  return out;
}

/** 홈 하부 타일 「전사 확인 n건 남음」 */
export function pendingCount(transcripts: readonly TranscriptTmp[]): number {
  return transcripts.reduce(
    (sum, t) => sum + t.items.filter((i) => i.confirmed_at === null).length,
    0,
  );
}

/**
 * 선생이 「확인」을 누른 순간에만 상태가 바뀐다 — 자동 확인 금지(§4-3).
 * diff_from_llm 은 이때 계산한다.
 */
export function confirmItem(
  transcript: TranscriptTmp,
  tmpNo: number,
  now = new Date(),
): TranscriptTmp {
  return {
    ...transcript,
    items: transcript.items.map((item) =>
      item.tmp_no === tmpNo
        ? {
            ...item,
            confirmed_at: now.toISOString(),
            diff_from_llm: transcriptDiff(item.llm, item.edited),
          }
        : item,
    ),
  };
}

export function editItem(
  transcript: TranscriptTmp,
  tmpNo: number,
  edited: Partial<TranscriptItem['edited']>,
): TranscriptTmp {
  return {
    ...transcript,
    items: transcript.items.map((item) =>
      item.tmp_no === tmpNo ? { ...item, edited: { ...item.edited, ...edited } } : item,
    ),
  };
}

/** 이번 묶음 전사 정확도 — 누적 diff 를 화면 상단에 보인다(코너 가 §4-4 · 정직성) */
export function batchTranscriptionDiff(transcript: TranscriptTmp): number {
  return transcript.items.reduce((sum, item) => sum + item.diff_from_llm, 0);
}

export function allConfirmed(transcript: TranscriptTmp): boolean {
  return transcript.items.length > 0 && transcript.items.every((i) => i.confirmed_at !== null);
}

// ── S3 단원 · 형식 확정(지시서 02 §3-1) ──────────────────────────────────────

/**
 * S3 행은 「확인」된 문항에만 열린다 — 미확인 문항은 S3 로 못 간다(지시서 01 규칙 유지).
 */
export function s3Open(item: TranscriptItem): boolean {
  return item.confirmed_at !== null;
}

/**
 * 묶음 기본값 상속(§3-1). 문항별로 바꿀 수 있고, 바꾼 값이 우선이다.
 * `format` 은 전사의 `format_guess` 를 기본값으로 두되 선생이 확정한다.
 */
export function defaultS3(
  transcript: TranscriptTmp,
  item: TranscriptItem,
  unitFor: (mid: string | null) => UnitSlot | null,
): S3Fields | null {
  const mid = item.s3?.mid ?? transcript.mid_default;
  if (mid === null || mid.length === 0) return null;
  const unit = unitFor(mid);
  if (unit === null) return null;
  return {
    mid,
    unit,
    format: item.s3?.format ?? item.format_guess,
    has_answer: item.s3?.has_answer ?? item.edited.answer_raw !== null,
    teacher_note: item.s3?.teacher_note ?? null,
    answer_decision: item.s3?.answer_decision ?? null,
  };
}

export function setS3(
  transcript: TranscriptTmp,
  tmpNo: number,
  fields: Partial<S3Fields>,
  base: S3Fields,
): TranscriptTmp {
  return {
    ...transcript,
    items: transcript.items.map((item) =>
      item.tmp_no === tmpNo
        ? {
            ...item,
            s3: { ...base, ...(item.s3 ?? {}), ...fields },
            state: item.state ?? 'ready',
          }
        : item,
    ),
  };
}

export function setItemVerdict(
  transcript: TranscriptTmp,
  tmpNo: number,
  verdict: StoredVerdict | null,
  state: ItemState,
): TranscriptTmp {
  return {
    ...transcript,
    items: transcript.items.map((item) =>
      item.tmp_no === tmpNo ? { ...item, verdict, state } : item,
    ),
  };
}

export function setItemCas(
  transcript: TranscriptTmp,
  tmpNo: number,
  cas: CasResult | null,
): TranscriptTmp {
  return {
    ...transcript,
    items: transcript.items.map((item) => (item.tmp_no === tmpNo ? { ...item, cas } : item)),
  };
}

/** 검증 대상 — 확인됐고 S3 가 채워졌으며 아직 판정이 없는 문항. */
export function verifiable(transcript: TranscriptTmp): TranscriptItem[] {
  return transcript.items.filter(
    (i) => s3Open(i) && i.s3 !== null && i.s3 !== undefined && (i.verdict ?? null) === null,
  );
}

/** 홈 타일 「검증 대기 n건」 — s3 는 있고 verdict 는 없는 문항(§3-5). */
export function awaitingVerifyCount(transcripts: readonly TranscriptTmp[]): number {
  return transcripts.reduce((sum, t) => sum + verifiable(t).length, 0);
}

/**
 * 홈 타일 「정답표 확인 n건」 — answer_mismatch 가 있는데 선생 판정이 아직 없는 문항(§3-5).
 * 결함이 아니라 판단 대기다(기획 §7-4 · D11 ②).
 */
export function answerCheckCount(transcripts: readonly TranscriptTmp[]): number {
  return transcripts.reduce(
    (sum, t) =>
      sum +
      t.items.filter((i) => {
        const issues = i.verdict?.issues ?? [];
        const mismatch = issues.some((issue) => issue.kind === 'answer_mismatch');
        return mismatch && (i.s3?.answer_decision ?? null) === null;
      }).length,
    0,
  );
}

/** 판정 상태 → 항목 상태(§5-3). */
export function stateFromVerdict(verdict: StoredVerdict): ItemState {
  if (verdict.issues.some((i) => i.kind === 'out_of_scope')) return 'parked';
  if (verdict.track === 2) return 'track2';
  if (verdict.status === 'pass') return 'verified:pass';
  if (verdict.status === 'ambiguous') return 'verified:ambiguous';
  return 'verified:fail';
}
