/**
 * 페이지 안에서 실행되는 초기화 스크립트(Playwright addInitScript).
 * 이 함수 본문은 브라우저로 직렬화되므로 바깥 스코프를 참조하지 않는다.
 */
export function installTestHooks(seed: Record<string, string>): void {
  const files = new Map(Object.entries(seed));
  const dirs = new Set<string>();
  const norm = (p: string): string =>
    String(p)
      .split('/')
      .filter((s) => s.length > 0 && s !== '.')
      .join('/');
  const addDirs = (p: string): void => {
    const segs = norm(p).split('/');
    for (let i = 1; i < segs.length; i += 1) dirs.add(segs.slice(0, i).join('/'));
  };
  for (const key of files.keys()) addDirs(key);

  const adapter = {
    rootName: 'e2e-폴더',
    __files: files,
    async read(path: string): Promise<string> {
      const v = files.get(norm(path));
      if (v === undefined) throw new Error(`파일 없음: ${norm(path)}`);
      return v;
    },
    async readBytes(path: string): Promise<Uint8Array> {
      return new TextEncoder().encode(await adapter.read(path));
    },
    async write(path: string, content: string): Promise<void> {
      addDirs(path);
      files.set(norm(path), content);
    },
    async list(path: string) {
      const base = norm(path);
      const prefix = base === '' ? '' : `${base}/`;
      const seen = new Map<string, { path: string; name: string; kind: string }>();
      const consider = (full: string, kind: string): void => {
        if (!full.startsWith(prefix)) return;
        const rest = full.slice(prefix.length);
        if (rest.length === 0) return;
        const parts = rest.split('/');
        const head = parts[0] as string;
        const entryPath = prefix + head;
        if (!seen.has(entryPath)) {
          seen.set(entryPath, {
            path: entryPath,
            name: head,
            kind: parts.length > 1 ? 'directory' : kind,
          });
        }
      };
      for (const full of files.keys()) consider(full, 'file');
      for (const full of dirs) consider(full, 'directory');
      return [...seen.values()];
    },
    async remove(path: string): Promise<void> {
      files.delete(norm(path));
      dirs.delete(norm(path));
    },
    async exists(path: string): Promise<boolean> {
      return files.has(norm(path)) || dirs.has(norm(path));
    },
    async mkdir(path: string): Promise<void> {
      const segs = norm(path).split('/');
      for (let i = 1; i <= segs.length; i += 1) dirs.add(segs.slice(0, i).join('/'));
    },
  };

  const transcribe = async (input: { pageNumber: number }) => ({
    model: 'fixture-model',
    usage: { input_tokens: 100, output_tokens: 200, cache_read_tokens: 0 },
    data: {
      items: [
        {
          no: '1',
          stem_shared: null,
          problem_text: '$x^2-3x+2=0$ 의 해를 구하시오.',
          choices: ['1', '2', '3', '4', '5'],
          format_guess: 'mc5',
          answer_raw: null,
          solution_raw: null,
          figure: false,
          figure_text: null,
          points: 4,
          source_note: null,
          uncertain: [],
          stray_marks: false,
          continues: false,
          page: input.pageNumber,
          bbox: null,
        },
      ],
    },
  });

  (window as unknown as { __GC_CLASS_TEST__: unknown }).__GC_CLASS_TEST__ = {
    adapter,
    transcribe,
  };
}
