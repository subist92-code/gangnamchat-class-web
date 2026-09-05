import {
  type FolderAdapter,
  type FolderEntry,
  normalizePath,
  pathSegments,
} from './FolderAdapter';

/**
 * File System Access API 구현(H-1 · C-009).
 * 업로드가 아니라 선생 폴더를 그 자리에서 읽고 그 자리에 쓴다.
 * 지원: 크롬 · 엣지 · 웨일(결재안 U-011 §2).
 */

type DirHandle = FileSystemDirectoryHandle;

export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

/** 선생이 폴더를 고른다. 사용자 제스처 안에서만 호출된다. */
export async function pickDirectory(): Promise<FsAccessFolderAdapter> {
  if (!isFileSystemAccessSupported()) {
    throw new Error('이 브라우저는 폴더 열기를 지원하지 않습니다.');
  }
  const picker = (
    window as unknown as {
      showDirectoryPicker: (opts?: { mode?: 'read' | 'readwrite' }) => Promise<DirHandle>;
    }
  ).showDirectoryPicker;
  const handle = await picker({ mode: 'readwrite' });
  return new FsAccessFolderAdapter(handle);
}

export class FsAccessFolderAdapter implements FolderAdapter {
  readonly rootName: string;
  private root: DirHandle;

  constructor(root: DirHandle) {
    this.root = root;
    this.rootName = root.name;
  }

  private async dirHandle(path: string, create: boolean): Promise<DirHandle | null> {
    let dir = this.root;
    for (const seg of pathSegments(path)) {
      try {
        dir = await dir.getDirectoryHandle(seg, { create });
      } catch {
        return null;
      }
    }
    return dir;
  }

  private async fileHandle(
    path: string,
    create: boolean,
  ): Promise<FileSystemFileHandle | null> {
    const segs = pathSegments(path);
    const name = segs.pop();
    if (name === undefined) return null;
    const dir = await this.dirHandle(segs.join('/'), create);
    if (dir === null) return null;
    try {
      return await dir.getFileHandle(name, { create });
    } catch {
      return null;
    }
  }

  async read(path: string): Promise<string> {
    const handle = await this.fileHandle(path, false);
    if (handle === null) throw new Error(`파일 없음: ${normalizePath(path)}`);
    const file = await handle.getFile();
    return await file.text();
  }

  async readBytes(path: string): Promise<Uint8Array> {
    const handle = await this.fileHandle(path, false);
    if (handle === null) throw new Error(`파일 없음: ${normalizePath(path)}`);
    const file = await handle.getFile();
    return new Uint8Array(await file.arrayBuffer());
  }

  async write(path: string, content: string): Promise<void> {
    const handle = await this.fileHandle(path, true);
    if (handle === null) throw new Error(`쓸 수 없음: ${normalizePath(path)}`);
    const writable = await handle.createWritable();
    await writable.write(content);
    await writable.close();
  }

  async list(path: string): Promise<FolderEntry[]> {
    const dir = await this.dirHandle(path, false);
    if (dir === null) return [];
    const base = normalizePath(path);
    const prefix = base === '' ? '' : `${base}/`;
    const out: FolderEntry[] = [];
    const iterable = dir as unknown as AsyncIterable<[string, FileSystemHandle]>;
    for await (const [name, handle] of iterable) {
      out.push({
        path: `${prefix}${name}`,
        name,
        kind: handle.kind === 'directory' ? 'directory' : 'file',
      });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }

  async remove(path: string): Promise<void> {
    const segs = pathSegments(path);
    const name = segs.pop();
    if (name === undefined) return;
    const dir = await this.dirHandle(segs.join('/'), false);
    if (dir === null) return;
    await dir.removeEntry(name, { recursive: true });
  }

  async exists(path: string): Promise<boolean> {
    const segs = pathSegments(path);
    const name = segs.pop();
    if (name === undefined) return true;
    const dir = await this.dirHandle(segs.join('/'), false);
    if (dir === null) return false;
    try {
      await dir.getFileHandle(name);
      return true;
    } catch {
      try {
        await dir.getDirectoryHandle(name);
        return true;
      } catch {
        return false;
      }
    }
  }

  async mkdir(path: string): Promise<void> {
    await this.dirHandle(path, true);
  }
}
