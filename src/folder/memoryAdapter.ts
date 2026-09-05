import {
  type FolderAdapter,
  type FolderEntry,
  normalizePath,
  pathSegments,
} from './FolderAdapter';

/**
 * 테스트용 인메모리 구현. 앱 코드는 어댑터만 보므로 그대로 주입된다(§2-7).
 * e2e 는 이것을 window 에 주입해 showDirectoryPicker 를 우회한다.
 */
export class MemoryFolderAdapter implements FolderAdapter {
  readonly rootName: string;
  private files = new Map<string, string>();
  private dirs = new Set<string>();

  constructor(rootName = '테스트폴더', seed: Record<string, string> = {}) {
    this.rootName = rootName;
    for (const [path, content] of Object.entries(seed)) {
      this.writeSync(path, content);
    }
  }

  /** 테스트 편의 — 동기 쓰기 */
  writeSync(path: string, content: string): void {
    const p = normalizePath(path);
    const segs = pathSegments(p);
    for (let i = 1; i < segs.length; i += 1) {
      this.dirs.add(segs.slice(0, i).join('/'));
    }
    this.files.set(p, content);
  }

  /** 테스트 편의 — 현재 담긴 파일 목록 */
  snapshot(): Record<string, string> {
    return Object.fromEntries(this.files);
  }

  async read(path: string): Promise<string> {
    const p = normalizePath(path);
    const v = this.files.get(p);
    if (v === undefined) throw new Error(`파일 없음: ${p}`);
    return v;
  }

  async readBytes(path: string): Promise<Uint8Array> {
    return new TextEncoder().encode(await this.read(path));
  }

  async write(path: string, content: string): Promise<void> {
    this.writeSync(path, content);
  }

  async list(path: string): Promise<FolderEntry[]> {
    const base = normalizePath(path);
    const prefix = base === '' ? '' : `${base}/`;
    const seen = new Map<string, FolderEntry>();
    const consider = (full: string, kind: 'file' | 'directory') => {
      if (!full.startsWith(prefix)) return;
      const rest = full.slice(prefix.length);
      if (rest.length === 0) return;
      const [head, ...tail] = rest.split('/');
      if (head === undefined) return;
      const entryPath = `${prefix}${head}`;
      const entryKind: 'file' | 'directory' = tail.length > 0 ? 'directory' : kind;
      if (!seen.has(entryPath)) {
        seen.set(entryPath, { path: entryPath, name: head, kind: entryKind });
      }
    };
    for (const full of this.files.keys()) consider(full, 'file');
    for (const full of this.dirs) consider(full, 'directory');
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }

  async remove(path: string): Promise<void> {
    const p = normalizePath(path);
    this.files.delete(p);
    this.dirs.delete(p);
    for (const key of [...this.files.keys()]) {
      if (key.startsWith(`${p}/`)) this.files.delete(key);
    }
    for (const key of [...this.dirs]) {
      if (key.startsWith(`${p}/`)) this.dirs.delete(key);
    }
  }

  async exists(path: string): Promise<boolean> {
    const p = normalizePath(path);
    return this.files.has(p) || this.dirs.has(p);
  }

  async mkdir(path: string): Promise<void> {
    const segs = pathSegments(path);
    for (let i = 1; i <= segs.length; i += 1) {
      this.dirs.add(segs.slice(0, i).join('/'));
    }
  }
}
