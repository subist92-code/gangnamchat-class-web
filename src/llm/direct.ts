import Anthropic from '@anthropic-ai/sdk';
import { limits } from '../config/limits';
import { models } from '../config/models';
import { P82_TRANSCRIBE } from './blocks/P82_transcribe';
import { p82ResponseSchema, type P82Response } from '../folder/schemas/transcript';

/**
 * 공개 차선 — 브라우저에서 Claude API 를 직접 부른다(C-039 C안 · Q-가-1 direct).
 * 원본 이미지는 우리 서버를 거치지 않는다(H-1 강화).
 *
 * 키(H-2): 인자로 받아 그 호출에만 쓴다. 모듈에 저장하지 않고, 폴더·로컬스토리지에 쓰지 않고,
 * 로그로 찍지 않는다. 새로고침하면 사라진다.
 *
 * 브라우저 직접 호출: 공식 문서(platform.claude.com/docs/en/cli-sdks-libraries/sdks/typescript,
 * 2026-09-06 확인)가 정한 스위치는 `dangerouslyAllowBrowser: true` 하나다.
 * 그 밖의 CORS 헤더는 문서에 명시가 없어 우리가 손으로 붙이지 않는다 — SDK 가 보내는 대로 둔다.
 * 실제 CORS 동작은 스모크 2 로 실측하기 전까지 미검증이다.
 */

export interface DirectCallResult<T> {
  data: T;
  usage: { input_tokens: number; output_tokens: number; cache_read_tokens: number };
  model: string;
}

function client(apiKey: string): Anthropic {
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
}

/** P82-2 출력 계약을 도구 스키마로 강제한다. */
const EMIT_TRANSCRIPTION = {
  name: 'emit_transcription',
  description: '전사한 문항들을 P82-2 계약대로 낸다. 문항마다 1객체.',
  input_schema: {
    type: 'object' as const,
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            no: { type: 'string' },
            stem_shared: { type: ['string', 'null'] },
            problem_text: { type: 'string' },
            choices: { type: ['array', 'null'], items: { type: 'string' } },
            format_guess: { type: 'string', enum: ['mc5', 'combo', 'short', 'essay'] },
            answer_raw: { type: ['string', 'null'] },
            solution_raw: { type: ['string', 'null'] },
            figure: { type: 'boolean' },
            figure_text: { type: ['string', 'null'] },
            points: { type: ['number', 'null'] },
            source_note: { type: ['string', 'null'] },
            uncertain: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  where: { type: 'string' },
                  read: { type: 'string' },
                  alt: { type: ['string', 'null'] },
                },
                required: ['where', 'read'],
              },
            },
            stray_marks: { type: 'boolean' },
            continues: { type: 'boolean' },
            page: { type: 'number' },
            bbox: { type: ['array', 'null'], items: { type: 'number' } },
          },
          required: [
            'no',
            'problem_text',
            'format_guess',
            'figure',
            'stray_marks',
            'continues',
            'page',
          ],
        },
      },
    },
    required: ['items'],
  },
};

export type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

export interface TranscribePageInput {
  apiKey: string;
  /** base64 (data: 접두 없이) */
  imageBase64: string;
  mediaType: ImageMediaType;
  /** 1부터 세는 페이지 번호 — 모델이 page 필드에 그대로 쓴다 */
  pageNumber: number;
}

/** 영수증의 request_hash 재료 — 키는 들어가지 않는다. */
export function transcribeRequestShape(input: {
  imageBase64: string;
  mediaType: string;
  pageNumber: number;
}): unknown {
  return {
    block: 'P82',
    model: models.transcribe,
    media_type: input.mediaType,
    page: input.pageNumber,
    image_len: input.imageBase64.length,
  };
}

/**
 * S1 전사 — 호출 단위는 이미지 1장(페이지).
 * 도구 스키마로 출력 계약을 강제하고, 응답은 zod 로 다시 검증한다.
 */
export async function transcribePage(
  input: TranscribePageInput,
): Promise<DirectCallResult<P82Response>> {
  const response = await client(input.apiKey).messages.create({
    model: models.transcribe,
    max_tokens: limits.transcribeMaxTokens,
    system: P82_TRANSCRIBE,
    tools: [EMIT_TRANSCRIPTION],
    // 전사는 자유 문장으로 답하지 않는다(P82-0) — 도구 호출을 강제한다.
    tool_choice: { type: 'tool', name: EMIT_TRANSCRIPTION.name },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: input.mediaType,
              data: input.imageBase64,
            },
          },
          {
            type: 'text',
            text: `이 페이지는 ${input.pageNumber}쪽이다. page 필드에 ${input.pageNumber}을 적는다.`,
          },
        ],
      },
    ],
  });

  const toolUse = response.content.find((block) => block.type === 'tool_use');
  if (toolUse === undefined || toolUse.type !== 'tool_use') {
    throw new Error('읽을 수 없음 — 모델이 전사 결과를 내지 않았습니다.');
  }
  // 도구 입력은 항상 파싱해서 다룬다(문자열 매칭 금지).
  const parsed = p82ResponseSchema.parse(toolUse.input);

  return {
    data: parsed,
    model: response.model,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      cache_read_tokens: response.usage.cache_read_input_tokens ?? 0,
    },
  };
}
