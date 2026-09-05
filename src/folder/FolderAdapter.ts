/**
 * 파일의 집(H-1) — 앱 코드는 이 인터페이스만 본다.
 * 구현: fsAccessAdapter(File System Access API) · memoryAdapter(테스트).
 * 경로는 항상 루트 기준 상대경로, 구분자는 '/'.
 */

export type EntryKind = 'file' | 'directory';

export interface FolderEntry {
  /** 루트 기준 상대경로 */
  path: string;
  name: string;
  kind: EntryKind;
}

export interface FolderAdapter {
  /** 선생이 고른 루트 폴더 이름(표시용) */
  readonly rootName: string;
  read(path: string): Promise<string>;
  readBytes(path: string): Promise<Uint8Array>;
  write(path: string, content: string): Promise<void>;
  /** 디렉터리 한 겹의 항목. 없으면 빈 배열. */
  list(path: string): Promise<FolderEntry[]>;
  remove(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  /** 빈 디렉터리 생성(중간 경로 포함) */
  mkdir(path: string): Promise<void>;
}

/** 경로 정규화 — 앞뒤 '/' 제거, 중복 '/' 축약 */
export function normalizePath(path: string): string {
  return path.split('/').filter((seg) => seg.length > 0 && seg !== '.').join('/');
}

export function pathSegments(path: string): string[] {
  return normalizePath(path).split('/').filter((s) => s.length > 0);
}

export function joinPath(...parts: string[]): string {
  return normalizePath(parts.join('/'));
}

/**
 * 폴더 전체를 깊이 우선으로 훑는다(lint · 스캔용).
 * `skip` 이 true 를 돌려주는 디렉터리는 통째로 건너뛴다(예: `_임시/` — L-16).
 */
export async function walk(
  adapter: FolderAdapter,
  start = '',
  skip: (entry: FolderEntry) => boolean = () => false,
): Promise<FolderEntry[]> {
  const out: FolderEntry[] = [];
  const queue: string[] = [normalizePath(start)];
  while (queue.length > 0) {
    const dir = queue.shift() as string;
    const entries = await adapter.list(dir);
    for (const entry of entries) {
      if (skip(entry)) continue;
      out.push(entry);
      if (entry.kind === 'directory') queue.push(entry.path);
    }
  }
  return out;
}

/** sha256 hex — 파일 해시 대조(스모크 ①)와 request_hash(§4-5)에 쓴다. */
export async function sha256Hex(input: string | Uint8Array): Promise<string> {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  const view = new Uint8Array(bytes);
  const buffer = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
