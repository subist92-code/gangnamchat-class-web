import { testHooks } from '../testHooks';
import type { FolderAdapter } from './FolderAdapter';
import { isFileSystemAccessSupported, pickDirectory } from './fsAccessAdapter';

/** 어댑터 선택 한 곳. 앱 코드는 어댑터만 본다. */
export async function chooseFolder(): Promise<FolderAdapter> {
  const injected = testHooks()?.adapter;
  if (injected !== undefined) return injected;
  return await pickDirectory();
}

export function folderSupported(): boolean {
  return testHooks()?.adapter !== undefined || isFileSystemAccessSupported();
}
