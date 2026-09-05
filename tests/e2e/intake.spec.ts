import { expect, test } from '@playwright/test';
import { installTestHooks } from './hooks';

/**
 * e2e 1건(§2-9 · §6): 폴더 열기 → 이미지 1장 → (직결은 목 응답) → 가-2 편집 → 확인 →
 * `_임시/전사/T-….json` 존재 · 미확인 상태로 S3 버튼 비활성.
 * showDirectoryPicker 와 모델 호출은 window 훅으로 대신한다.
 */
const CLASS_JSON = JSON.stringify({
  spec: 'gc-class/0.1',
  academy: { name: 'e2e수학', teacher_alias: '김선생' },
  created_at: '2026-09-05T10:00:00+09:00',
  tool_version: '0.1.0',
  nodemap: { version: 'fixture', bundle_hash: `sha256:${'0'.repeat(64)}` },
  course_default: 'high',
  classes: { '2026-2_고2A': { course: 'high' } },
  id_counters: { student: 0, problem: 0, exam: 0, homework: 0 },
  last_lint: null,
  watermark_text: '강남챗 클래스 · e2e수학',
  naming: {
    exam_folder: '{date}_{title}_{class}',
    homework_folder: '{date}_{node}_{class}',
    node_folder: '{id}_{name}',
  },
});

const STUDENTS_CSV = 'student_id,name,status\nS-2026-0001,가학생,active\n';

// 1x1 PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test('코너 가 S0~S2 — 접수 · 전사 · 확인', async ({ page }) => {
  await page.addInitScript(installTestHooks, {
    'class.json': CLASS_JSON,
    '명부/students.csv': STUDENTS_CSV,
  });

  await page.goto('/settings');
  await page.getByRole('button', { name: '기존 폴더 열기' }).click();
  await expect(page.getByText('폴더를 열었습니다')).toBeVisible();

  await page.getByPlaceholder('선생님 개인 Claude API 키').fill('test-key-ab12');

  // SPA 안에서 이동한다 — page.goto 는 새로고침이라 메모리의 폴더 상태가 사라진다.
  await page.getByRole('link', { name: '시험만들기' }).click();
  await page.getByTestId('intake-files').setInputFiles({
    name: 'page1.png',
    mimeType: 'image/png',
    buffer: PNG,
  });
  await expect(page.getByText('예상 호출 수 1회', { exact: false })).toBeVisible();

  await page.getByTestId('class-ref').fill('2026-2_고2A');
  await page.getByTestId('rights-check').check();
  await page.getByRole('button', { name: '전사 시작' }).click();

  const item = page.getByTestId('transcript-item-1');
  await expect(item).toBeVisible();

  // S3 는 미확인 상태에서도, 확인 뒤에도 이번 국면에서는 열리지 않는다.
  const s3 = page.getByRole('button', { name: '단원·형식 확정(S3)' });
  await expect(s3).toBeDisabled();

  await page.getByTestId('edit-1').fill('$x^2-3x+2=0$ 의 해를 구하시오. (고침)');
  await page.getByTestId('edit-1').blur();
  await item.getByRole('button', { name: '확인' }).click();
  await expect(item.getByText('확인됨', { exact: false })).toBeVisible();
  await expect(s3).toBeDisabled();

  const saved = await page.evaluate(() => {
    const files = (window.__GC_CLASS_TEST__?.adapter as unknown as {
      __files: Map<string, string>;
    }).__files;
    const key = [...files.keys()].find((k) => k.startsWith('_임시/전사/T-'));
    return key === undefined ? null : { key, body: files.get(key) as string };
  });

  expect(saved).not.toBeNull();
  expect(saved?.key).toMatch(/^_임시\/전사\/T-\d{8}T\d{6}\.json$/);
  const doc = JSON.parse(saved?.body ?? '{}') as {
    spec: string;
    items: { confirmed_at: string | null; diff_from_llm: number }[];
  };
  expect(doc.spec).toBe('gc-class-transcript-tmp/0.1');
  expect(doc.items[0]?.confirmed_at).not.toBeNull();
  expect(doc.items[0]?.diff_from_llm).toBeGreaterThan(0);
});
