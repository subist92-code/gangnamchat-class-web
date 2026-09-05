import type { P82Item } from '../folder/schemas/transcript';

/** S0 접수 — 받는 형식(코너 가 §4-1) */
export const ACCEPTED_EXTENSIONS = [
  'jpg',
  'jpeg',
  'png',
  'webp',
  'pdf',
  'hwp',
  'hwpx',
  'md',
  'txt',
  'json',
] as const;

/** 이번 국면에 실제 전사까지 가는 형식 */
export const RASTERIZABLE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'pdf'] as const;

export type IntakeStatus = 'received' | 'transcribed' | 'confirmed';

export interface IntakeFile {
  name: string;
  extension: string;
  sizeBytes: number;
  accepted: boolean;
  /** 제외 사유 — 묶음 전체를 거부하지 않는다 */
  reason: string | null;
}

export interface IntakePage {
  /** 1부터 */
  pageNumber: number;
  fileName: string;
  /** base64 (data: 접두 없이) — 브라우저 메모리에만 산다(H-1) */
  base64: string;
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
  /** 화면 좌측 원본 표시에 쓰는 data URL */
  dataUrl: string;
}

export interface IntakeBatch {
  batchId: string;
  classRef: string;
  midDefault: string | null;
  note: string;
  rightsConfirmed: boolean;
  files: IntakeFile[];
  pages: IntakePage[];
}

export interface TranscribedItem {
  tmpNo: number;
  page: number;
  llm: P82Item;
  status: IntakeStatus;
}

/** 묶음 id — T-<시각>. 임시이고 문항 ID 가 아니다(코너 가 §4-1). */
export function makeBatchId(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `T-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}` +
    `T${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`
  );
}
