import { describe, expect, it } from 'vitest';
import { runLint } from '../../src/folder/lint';
import { MemoryFolderAdapter } from '../../src/folder/memoryAdapter';
import { fixtureAdapter } from './helpers';

const findings = (result: Awaited<ReturnType<typeof runLint>>, code: string) =>
  result.findings.filter((f) => f.code === code);

describe('L-01 class.json', () => {
  it('pass — 픽스처 폴더', async () => {
    expect(findings(await runLint(fixtureAdapter('class-folder')), 'L-01')).toHaveLength(0);
  });

  it('fail — class.json 없음', async () => {
    const adapter = new MemoryFolderAdapter('빈폴더', { 'readme.txt': 'hello' });
    expect(findings(await runLint(adapter), 'L-01').length).toBeGreaterThan(0);
  });
});

describe('L-02 명부', () => {
  it('pass — 픽스처 폴더', async () => {
    expect(findings(await runLint(fixtureAdapter('class-folder')), 'L-02')).toHaveLength(0);
  });

  it('fail — student_id 형식이 어긋나면 잡는다', async () => {
    const adapter = fixtureAdapter('class-folder');
    adapter.writeSync(
      '명부/students.csv',
      'student_id,name,status\n김철수,가학생,active\n',
    );
    expect(findings(await runLint(adapter), 'L-02').length).toBeGreaterThan(0);
  });

  it('fail — student_id 중복', async () => {
    const adapter = fixtureAdapter('class-folder');
    adapter.writeSync(
      '명부/students.csv',
      'student_id,name,status\nS-2026-0001,가,active\nS-2026-0001,나,active\n',
    );
    expect(findings(await runLint(adapter), 'L-02').some((f) => f.message.includes('중복'))).toBe(
      true,
    );
  });
});

describe('L-03 날짜 프리픽스', () => {
  it('pass — 픽스처 폴더', async () => {
    expect(findings(await runLint(fixtureAdapter('class-folder')), 'L-03')).toHaveLength(0);
  });

  it('fail — 날짜 없는 시험 폴더', async () => {
    const adapter = fixtureAdapter('class-folder');
    adapter.writeSync('시험/그냥시험/exam.json', '{}');
    expect(findings(await runLint(adapter), 'L-03').length).toBeGreaterThan(0);
  });
});

describe('L-06 responses', () => {
  it('pass — responses.csv 가 명부·문항과 맞는다', async () => {
    const adapter = fixtureAdapter('class-folder');
    adapter.writeSync(
      '시험/2026-09-01_9월모의고사_고2A/responses.csv',
      'student_id,item_no,answer_given\nS-2026-0001,1,3\nS-2026-0002,2,12\n',
    );
    expect(findings(await runLint(adapter), 'L-06')).toHaveLength(0);
  });

  it('fail — 명부에 없는 학생과 없는 문항 번호', async () => {
    const adapter = fixtureAdapter('class-folder');
    adapter.writeSync(
      '시험/2026-09-01_9월모의고사_고2A/responses.csv',
      'student_id,item_no,answer_given\nS-2026-9999,1,3\nS-2026-0001,7,3\n',
    );
    expect(findings(await runLint(adapter), 'L-06').length).toBe(2);
  });
});

describe('L-11 키 패턴 — 양성 대조 의무(C-046)', () => {
  it('깨끗한 픽스처는 0건', async () => {
    expect(findings(await runLint(fixtureAdapter('class-folder')), 'L-11')).toHaveLength(0);
  });

  it('독 픽스처는 반드시 error 를 낸다', async () => {
    const result = await runLint(fixtureAdapter('class-folder-poisoned'));
    const hits = findings(result, 'L-11');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.level).toBe('error');
  });
});

describe('미구현 규칙은 숨기지 않는다', () => {
  it('todo 목록으로 보고한다', async () => {
    const result = await runLint(fixtureAdapter('class-folder'));
    expect(result.todo).toContain('L-04');
    expect(result.todo).toContain('L-17');
  });
});
