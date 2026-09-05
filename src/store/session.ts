import { create } from 'zustand';
import type { FolderAdapter } from '../folder/FolderAdapter';
import { runLint, type LintResult } from '../folder/lint';
import { isFixtureFolder, loadClassFolder } from '../folder/classFolder';
import type { ClassJson } from '../folder/schemas/classJson';
import { listTranscripts, pendingCount } from '../intake/transcriptStore';
import type { TranscriptTmp } from '../folder/schemas/transcript';

/**
 * 세션 상태. 키는 여기(메모리)에만 산다 — localStorage·폴더·서버 어디에도 쓰지 않는다(H-2).
 * 새로고침하면 사라진다.
 */
export interface SessionState {
  adapter: FolderAdapter | null;
  classJson: ClassJson | null;
  readOnly: boolean;
  lint: LintResult | null;
  transcripts: TranscriptTmp[];
  apiKey: string;
  setApiKey: (key: string) => void;
  clearApiKey: () => void;
  attachFolder: (adapter: FolderAdapter) => Promise<LintResult>;
  detachFolder: () => void;
  refreshTranscripts: () => Promise<void>;
  setClassJson: (classJson: ClassJson) => void;
}

export const useSession = create<SessionState>((set, get) => ({
  adapter: null,
  classJson: null,
  readOnly: false,
  lint: null,
  transcripts: [],
  apiKey: '',

  setApiKey: (key) => set({ apiKey: key }),
  clearApiKey: () => set({ apiKey: '' }),
  setClassJson: (classJson) => set({ classJson }),

  attachFolder: async (adapter) => {
    const lint = await runLint(adapter);
    if (lint.findings.some((f) => f.code === 'L-01')) {
      set({ adapter: null, classJson: null, lint });
      return lint;
    }
    const { classJson, readOnly } = await loadClassFolder(adapter);
    const transcripts = await listTranscripts(adapter);
    set({ adapter, classJson, readOnly, lint, transcripts });
    return lint;
  },

  detachFolder: () => set({ adapter: null, classJson: null, lint: null, transcripts: [] }),

  refreshTranscripts: async () => {
    const { adapter } = get();
    if (adapter === null) return;
    set({ transcripts: await listTranscripts(adapter) });
  },
}));

/** 픽스처 번들로 열린 폴더인가 — 문항 저장을 막는 게이트(자리 A) */
export function useFixtureGate(): boolean {
  const classJson = useSession((s) => s.classJson);
  return classJson !== null && isFixtureFolder(classJson);
}

export function useTranscriptPending(): number {
  return pendingCount(useSession((s) => s.transcripts));
}
