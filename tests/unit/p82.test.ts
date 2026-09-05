import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { P82_SOURCE_MD5, P82_TRANSCRIBE } from '../../src/llm/blocks/P82_transcribe';

/**
 * 공개 블록 REF 사본이 원본과 같은 문자열인가.
 * 원본은 문서 리포에 있고 여기서 고치지 않는다 — 사본이 흐트러지면 이 테스트가 먼저 운다.
 */
describe('P82 공개 블록 REF', () => {
  it('원본 md5 를 기록해 둔다', () => {
    expect(P82_SOURCE_MD5).toMatch(/^[0-9a-f]{32}$/);
  });

  it('사본의 md5 가 기록된 원본 md5 와 같다', () => {
    const md5 = createHash('md5').update(Buffer.from(P82_TRANSCRIBE, 'utf8')).digest('hex');
    expect(md5).toBe(P82_SOURCE_MD5);
  });

  it('출력 계약과 읽기 규칙이 그대로 들어 있다', () => {
    expect(P82_TRANSCRIBE).toContain('emit_transcription');
    expect(P82_TRANSCRIBE).toContain('format_guess');
    expect(P82_TRANSCRIBE).toContain('P82-3');
  });
});
