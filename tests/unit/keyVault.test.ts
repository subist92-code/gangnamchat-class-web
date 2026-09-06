import { describe, expect, it } from 'vitest';
import { limits } from '../../src/config/limits';
import {
  forgetKey,
  hasRememberedKey,
  memoryStore,
  rememberKey,
  unlockKey,
} from '../../src/auth/keyVault';

/**
 * 키 기억하기(지시서 02 §4).
 * 저장소를 갈라 둔 덕에 IndexedDB 없이 규칙만 시험한다.
 */

const KEY = 'sk-ant-test-0123456789abcdef';
const PASSWORD = '열쇠비밀번호';

describe('keyVault', () => {
  it('암호화 왕복 — 저장한 뒤 다른 컨텍스트에서 같은 키가 나온다', async () => {
    const store = memoryStore();
    await rememberKey(store, KEY, PASSWORD);

    // 새 「컨텍스트」 = 메모리에 아무것도 들고 있지 않은 상태에서 저장소만 보고 푼다.
    const result = await unlockKey(store, PASSWORD);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.apiKey).toBe(KEY);
  });

  it('틀린 비밀번호는 실패하고 남은 횟수를 알려 준다', async () => {
    const store = memoryStore();
    await rememberKey(store, KEY, PASSWORD);

    const result = await unlockKey(store, '틀린비번');
    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === 'wrong') {
      expect(result.remaining).toBe(limits.keyUnlockMaxAttempts - 1);
    } else {
      throw new Error('wrong 이어야 한다');
    }
  });

  it('연속 실패가 상한에 닿으면 암호문을 지운다', async () => {
    const store = memoryStore();
    await rememberKey(store, KEY, PASSWORD);

    let last = await unlockKey(store, '틀린비번');
    for (let i = 1; i < limits.keyUnlockMaxAttempts; i += 1) {
      last = await unlockKey(store, '틀린비번');
    }
    expect(last.ok).toBe(false);
    if (!last.ok) expect(last.reason).toBe('erased');
    expect(await hasRememberedKey(store)).toBe(false);

    // 지워진 뒤에는 올바른 비밀번호로도 풀 것이 없다.
    const after = await unlockKey(store, PASSWORD);
    expect(after.ok).toBe(false);
    if (!after.ok) expect(after.reason).toBe('none');
  });

  it('성공하면 실패 횟수가 0 으로 돌아간다', async () => {
    const store = memoryStore();
    await rememberKey(store, KEY, PASSWORD);
    await unlockKey(store, '틀린비번');
    expect((await store.get())?.failures).toBe(1);

    await unlockKey(store, PASSWORD);
    expect((await store.get())?.failures).toBe(0);
  });

  it('저장된 것에 평문 키가 없다 — 양성 대조로 검사식이 사는지 함께 본다', async () => {
    const store = memoryStore();
    await rememberKey(store, KEY, PASSWORD);
    const held = await store.get();
    expect(held).not.toBeNull();

    const bytes = held as NonNullable<typeof held>;
    const asText = new TextDecoder().decode(bytes.cipher);
    const asJson = JSON.stringify({
      cipher: [...bytes.cipher],
      salt: [...bytes.salt],
      iv: [...bytes.iv],
    });

    expect(asText.includes('sk-ant-')).toBe(false);
    expect(asJson.includes('sk-ant-')).toBe(false);

    // 양성 대조 — 암호화 전 값이라면 같은 검사식이 잡아야 한다.
    const plain = new TextDecoder().decode(new TextEncoder().encode(KEY));
    expect(plain.includes('sk-ant-')).toBe(true);
  });

  it('기억 지우기 — 저장소가 비워진다', async () => {
    const store = memoryStore();
    await rememberKey(store, KEY, PASSWORD);
    expect(await hasRememberedKey(store)).toBe(true);

    await forgetKey(store);
    expect(await hasRememberedKey(store)).toBe(false);
  });

  it('빈 비밀번호는 거부한다', async () => {
    const store = memoryStore();
    await expect(rememberKey(store, KEY, '')).rejects.toThrow();
  });
});
