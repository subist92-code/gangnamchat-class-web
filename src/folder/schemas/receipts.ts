import { z } from 'zod';
import { isoDateTimeSchema } from './common';

/**
 * 규격 §4-5 receipts.json — U-019 C안 4중 장치 ④.
 * 키는 마지막 4자리만. 금액은 적지 않는다(단가는 변한다 — R-3).
 */
export const receiptEntrySchema = z
  .object({
    at: isoDateTimeSchema,
    lane: z.enum(['vault', 'direct']),
    purpose: z.enum([
      'verify',
      'decoy',
      'twin',
      'forge',
      'report_qa',
      'transcribe',
      'explain',
    ]),
    model: z.string(),
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
    cache_read_tokens: z.number().int().nonnegative(),
    key_last4: z.string().length(4),
    request_hash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
    problem_ids: z.array(z.string()),
  })
  .strict();

export const receiptsJsonSchema = z.object({
  spec: z.string().regex(/^gc-class-receipts\/\d+\.\d+$/),
  entries: z.array(receiptEntrySchema),
});

export type ReceiptEntry = z.infer<typeof receiptEntrySchema>;
export type ReceiptsJson = z.infer<typeof receiptsJsonSchema>;
