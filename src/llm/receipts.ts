import type { FolderAdapter } from '../folder/FolderAdapter';
import { sha256Hex } from '../folder/FolderAdapter';
import { ROOT } from '../folder/paths';
import {
  receiptsJsonSchema,
  type ReceiptEntry,
  type ReceiptsJson,
} from '../folder/schemas/receipts';

/**
 * 영수증(규격 §4-5 · C-039 ④). 호출 1건 = 1행.
 * 키는 마지막 4자리만. 금액은 적지 않는다 — 단가는 변한다(R-3).
 */

const EMPTY: ReceiptsJson = { spec: 'gc-class-receipts/0.1', entries: [] };

export function keyLast4(apiKey: string): string {
  return apiKey.slice(-4);
}

/** request_hash = 키를 제외한 요청 본문의 sha256 */
export async function requestHash(requestBody: unknown): Promise<string> {
  return `sha256:${await sha256Hex(JSON.stringify(requestBody))}`;
}

export async function readReceipts(
  adapter: FolderAdapter,
  path: string = ROOT.bankReceipts,
): Promise<ReceiptsJson> {
  if (!(await adapter.exists(path))) return EMPTY;
  try {
    return receiptsJsonSchema.parse(JSON.parse(await adapter.read(path)));
  } catch {
    return EMPTY;
  }
}

export async function appendReceipt(
  adapter: FolderAdapter,
  entry: ReceiptEntry,
  path: string = ROOT.bankReceipts,
): Promise<ReceiptsJson> {
  const current = await readReceipts(adapter, path);
  const next: ReceiptsJson = { ...current, entries: [...current.entries, entry] };
  await adapter.write(path, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}
