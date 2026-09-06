import { limits } from '../config/limits';

/**
 * 「키 기억하기」(지시서 02 §4 · C-039 ① · A-4).
 *
 * 기본값은 **꺼짐**이다. 켜면 선생 비밀번호로 키를 암호화해 이 브라우저에만 둔다.
 *   - 폴더 ✗ · 우리 서버 ✗ · localStorage ✗ — IndexedDB 에만.
 *   - 평문 키는 메모리에만 산다(H-2). 저장되는 것은 암호문 · 솔트 · IV 뿐이다.
 *   - 비밀번호는 어디에도 저장하지 않는다. 잊으면 복구할 방법이 없다 — 그게 맞다.
 *
 * 저장소를 인터페이스로 갈라 둔 이유: 잠금 해제 · 실패 삭제 같은 규칙을 IndexedDB
 * 없이도 시험할 수 있어야 한다. 브라우저는 IndexedDB, 시험은 메모리를 쓴다.
 */

export interface StoredKey {
  /** AES-GCM 암호문 */
  cipher: Uint8Array;
  salt: Uint8Array;
  iv: Uint8Array;
  /** 연속 실패 횟수 — 재시작해도 이어진다. */
  failures: number;
  savedAt: string;
}

export interface VaultStore {
  get(): Promise<StoredKey | null>;
  set(value: StoredKey): Promise<void>;
  clear(): Promise<void>;
}

const DB_NAME = 'gc-class-key';
const STORE = 'vault';
const RECORD_ID = 'byok';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('키 저장소를 열지 못했습니다.'));
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const request = run(db.transaction(STORE, mode).objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(new Error('키 저장소 접근에 실패했습니다.'));
      }),
  );
}

export const indexedDbStore: VaultStore = {
  get: async () => (await tx<StoredKey | undefined>('readonly', (s) => s.get(RECORD_ID))) ?? null,
  set: async (value) => {
    await tx('readwrite', (s) => s.put(value, RECORD_ID));
  },
  clear: async () => {
    await tx('readwrite', (s) => s.delete(RECORD_ID));
  },
};

/** 시험용 — 같은 규칙을 IndexedDB 없이 돌린다. */
export function memoryStore(): VaultStore {
  let held: StoredKey | null = null;
  return {
    get: () => Promise.resolve(held),
    set: (value) => {
      held = value;
      return Promise.resolve();
    },
    clear: () => {
      held = null;
      return Promise.resolve();
    },
  };
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations: limits.keyKdfIterations,
      hash: 'SHA-256',
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function rememberKey(
  store: VaultStore,
  apiKey: string,
  password: string,
): Promise<void> {
  if (password.length === 0) throw new Error('비밀번호를 적어 주세요.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    new TextEncoder().encode(apiKey),
  );
  await store.set({
    cipher: new Uint8Array(cipher),
    salt,
    iv,
    failures: 0,
    savedAt: new Date().toISOString(),
  });
}

export type UnlockResult =
  | { ok: true; apiKey: string }
  | { ok: false; reason: 'none' }
  | { ok: false; reason: 'wrong'; remaining: number }
  | { ok: false; reason: 'erased' };

/**
 * 잠금 해제. 연속 실패가 상한에 닿으면 암호문을 지운다(§4).
 * 지우는 쪽이 안전하다 — 공용 PC 에서 암호문이 무한정 남아 있는 것보다 낫다.
 */
export async function unlockKey(store: VaultStore, password: string): Promise<UnlockResult> {
  const held = await store.get();
  if (held === null) return { ok: false, reason: 'none' };

  try {
    const key = await deriveKey(password, held.salt);
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: held.iv as unknown as BufferSource },
      key,
      held.cipher as unknown as BufferSource,
    );
    if (held.failures !== 0) await store.set({ ...held, failures: 0 });
    return { ok: true, apiKey: new TextDecoder().decode(plain) };
  } catch {
    const failures = held.failures + 1;
    if (failures >= limits.keyUnlockMaxAttempts) {
      await store.clear();
      return { ok: false, reason: 'erased' };
    }
    await store.set({ ...held, failures });
    return { ok: false, reason: 'wrong', remaining: limits.keyUnlockMaxAttempts - failures };
  }
}

export async function hasRememberedKey(store: VaultStore): Promise<boolean> {
  return (await store.get()) !== null;
}

export async function forgetKey(store: VaultStore): Promise<void> {
  await store.clear();
}
