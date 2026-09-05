import { describe, expect, it } from 'vitest';
import { appendReceipt, keyLast4, readReceipts, requestHash } from '../../src/llm/receipts';
import { receiptEntrySchema } from '../../src/folder/schemas/receipts';
import { transcribeRequestShape } from '../../src/llm/direct';
import { MemoryFolderAdapter } from '../../src/folder/memoryAdapter';

const FAKE_KEY = ['sk', 'ant', 'api03', 'FAKE0000000000ab12'].join('-');

describe('영수증(규격 §4-5 · U-019 C안 4)', () => {
  it('키는 마지막 4자리만 적는다', () => {
    expect(keyLast4(FAKE_KEY)).toBe('ab12');
    expect(keyLast4(FAKE_KEY)).toHaveLength(4);
  });

  it('금액 필드는 규격에 없다 — 넣으면 스키마가 막는다', () => {
    const entry = {
      at: '2026-09-05T10:00:00+09:00',
      lane: 'direct',
      purpose: 'transcribe',
      model: 'fixture-model',
      input_tokens: 10,
      output_tokens: 20,
      cache_read_tokens: 0,
      key_last4: 'ab12',
      request_hash: `sha256:${'0'.repeat(64)}`,
      problem_ids: [],
    };
    expect(() => receiptEntrySchema.parse(entry)).not.toThrow();
    expect(() => receiptEntrySchema.parse({ ...entry, krw: 120 })).toThrow();
  });

  it('request_hash 에 키가 들어가지 않는다', async () => {
    const shape = transcribeRequestShape({
      imageBase64: 'AAAA',
      mediaType: 'image/jpeg',
      pageNumber: 1,
    });
    expect(JSON.stringify(shape)).not.toContain(FAKE_KEY);
    const hash = await requestHash(shape);
    expect(hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(hash).not.toContain('ab12');
  });

  it('폴더에 한 줄씩 쌓인다', async () => {
    const adapter = new MemoryFolderAdapter('폴더');
    const entry = {
      at: '2026-09-05T10:00:00+09:00',
      lane: 'direct' as const,
      purpose: 'transcribe' as const,
      model: 'fixture-model',
      input_tokens: 10,
      output_tokens: 20,
      cache_read_tokens: 0,
      key_last4: keyLast4(FAKE_KEY),
      request_hash: `sha256:${'0'.repeat(64)}`,
      problem_ids: [],
    };
    await appendReceipt(adapter, entry);
    await appendReceipt(adapter, entry);
    const read = await readReceipts(adapter);
    expect(read.entries).toHaveLength(2);
    const raw = adapter.snapshot()['문제함/receipts.json'] as string;
    expect(raw).not.toContain(FAKE_KEY);
  });
});
