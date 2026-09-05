import { limits } from '../config/limits';
import type { FolderAdapter } from '../folder/FolderAdapter';
import { transcribePage, transcribeRequestShape } from '../llm/direct';
import { appendReceipt, keyLast4, requestHash } from '../llm/receipts';
import type { P82Item } from '../folder/schemas/transcript';
import { testHooks } from '../testHooks';
import type { IntakePage } from './types';

/**
 * S1 전사(direct · P82 v1) — 호출 단위 = 이미지 1장(페이지).
 * 호출마다 영수증 1행(규격 §4-5). 원본 이미지는 폴더에 쓰지 않는다 — 텍스트만 남는다(H-1).
 */

export interface TranscribeDeps {
  /** 테스트·e2e 는 목 함수를 주입한다 */
  call?: typeof transcribePage;
  adapter?: FolderAdapter;
}

export interface TranscribeProgress {
  done: number;
  total: number;
  failed: number;
}

export interface TranscribeOutcome {
  items: P82Item[];
  failedPages: { pageNumber: number; message: string }[];
}

/**
 * `continues: true` 인 항목은 다음 페이지 첫 항목과 합친다(P82-1 6).
 */
export function mergeContinuations(items: readonly P82Item[]): P82Item[] {
  const out: P82Item[] = [];
  for (const item of items) {
    const prev = out[out.length - 1];
    if (prev !== undefined && prev.continues) {
      out[out.length - 1] = {
        ...prev,
        problem_text: `${prev.problem_text}\n${item.problem_text}`,
        choices: item.choices ?? prev.choices,
        answer_raw: prev.answer_raw ?? item.answer_raw,
        solution_raw: prev.solution_raw ?? item.solution_raw,
        figure: prev.figure || item.figure,
        uncertain: [...prev.uncertain, ...item.uncertain],
        continues: item.continues,
      };
      continue;
    }
    out.push(item);
  }
  return out;
}

async function runPage(
  page: IntakePage,
  apiKey: string,
  deps: TranscribeDeps,
): Promise<P82Item[]> {
  const call = deps.call ?? testHooks()?.transcribe ?? transcribePage;
  const result = await call({
    apiKey,
    imageBase64: page.base64,
    mediaType: page.mediaType,
    pageNumber: page.pageNumber,
  });
  if (deps.adapter !== undefined) {
    await appendReceipt(deps.adapter, {
      at: new Date().toISOString(),
      lane: 'direct',
      purpose: 'transcribe',
      model: result.model,
      input_tokens: result.usage.input_tokens,
      output_tokens: result.usage.output_tokens,
      cache_read_tokens: result.usage.cache_read_tokens,
      key_last4: keyLast4(apiKey),
      request_hash: await requestHash(
        transcribeRequestShape({
          imageBase64: page.base64,
          mediaType: page.mediaType,
          pageNumber: page.pageNumber,
        }),
      ),
      problem_ids: [],
    });
  }
  return result.data.items;
}

/** 동시 호출 수는 설정 계층이 정한다(C-017 · 리터럴 금지). */
export async function transcribeBatch(
  pages: readonly IntakePage[],
  apiKey: string,
  deps: TranscribeDeps = {},
  onProgress?: (progress: TranscribeProgress) => void,
): Promise<TranscribeOutcome> {
  const results = new Map<number, P82Item[]>();
  const failedPages: { pageNumber: number; message: string }[] = [];
  let done = 0;
  const queue = [...pages];

  const worker = async (): Promise<void> => {
    for (;;) {
      const page = queue.shift();
      if (page === undefined) return;
      try {
        results.set(page.pageNumber, await runPage(page, apiKey, deps));
      } catch (err) {
        failedPages.push({ pageNumber: page.pageNumber, message: (err as Error).message });
        results.set(page.pageNumber, []);
      }
      done += 1;
      onProgress?.({ done, total: pages.length, failed: failedPages.length });
    }
  };

  const lanes = Math.max(1, Math.min(limits.transcribeConcurrency, pages.length));
  await Promise.all(Array.from({ length: lanes }, worker));

  const ordered: P82Item[] = [];
  for (const page of pages) ordered.push(...(results.get(page.pageNumber) ?? []));
  return { items: mergeContinuations(ordered), failedPages };
}
