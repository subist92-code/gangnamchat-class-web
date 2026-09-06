import { expect, test } from '@playwright/test';
import { installTestHooks } from './hooks';

/**
 * e2e 1건(§2-9 · 지시서 02 §6): 폴더 열기 → 이미지 1장 → (직결은 목 응답) → 가-2 편집 →
 * 확인 → S3 단원 확정 → 검증(통로는 목 verdict) → 가-3 칩 · issues · 「적용」 수치 보존 ·
 * 「미끼 입히기」 비활성 → 저장본과 영수증 확인.
 * showDirectoryPicker · 모델 호출 · 통로 호출은 window 훅으로 대신한다.
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

test('코너 가 S0~S5 — 접수 · 전사 · 확인 · 단원확정 · 검증 · 판정', async ({ page }) => {
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

  // 확인 전에는 단원 지정으로 넘어갈 수 없다.
  await expect(page.getByTestId('go-assign')).toBeDisabled();

  await page.getByTestId('edit-1').fill('$x^2-3x+2=0$ 의 해를 구하시오. (고침)');
  await page.getByTestId('edit-1').blur();
  await item.getByRole('button', { name: '확인' }).click();
  await expect(item.getByText('확인됨', { exact: false })).toBeVisible();

  // 확인하면 단원 지정 단계로 넘어갈 수 있다.
  await expect(page.getByTestId('go-assign')).toBeEnabled();

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

  // ── 단원 · 형식 지정(A-7) → 검증(목) → 가-3 ──────────────────────────────
  await page.getByTestId('go-assign').click();
  await expect(page.getByRole('heading', { name: '단원 · 형식 지정' })).toBeVisible();

  // 단원을 고르기 전에는 검증 대상이 아니다.
  await expect(page.getByTestId('start-verify')).toBeDisabled();

  // 일괄 적용이 기본 경로다 — 확인된 문항 전부에 같은 단원을 넣는다.
  await page.getByTestId('bulk-mid').selectOption('M01');
  await expect(page.getByText('단원 블록 B20')).toBeVisible();
  await page.getByTestId('apply-bulk').click();
  await expect(page.getByText('개 문항에 넣었습니다', { exact: false })).toBeVisible();

  await expect(page.getByTestId('start-verify')).toBeEnabled();
  await page.getByTestId('start-verify').click();
  await expect(page.getByRole('heading', { name: '가-3 검증 결과' })).toBeVisible();

  await page.getByRole('button', { name: /^검증 시작\(/ }).click();

  const verdict = page.getByTestId('verdict-1');
  await expect(verdict).toBeVisible();

  // 칩 — pass 와 「정답표 확인」이 함께 보인다(결함이 아니라 판정 대기다).
  await expect(verdict.getByText('pass', { exact: true })).toBeVisible();
  await expect(verdict.getByText('정답표 확인').first()).toBeVisible();

  // issues 가 화면에 나온다.
  await expect(verdict.getByText('「해」가 실근인지', { exact: false })).toBeVisible();

  // 「미끼 입히기」는 보이되 비활성 — 지시서 03 이다.
  await expect(verdict.getByRole('button', { name: '미끼 입히기' })).toBeDisabled();

  // 숫자를 바꾸는 제안은 적용이 막힌다.
  await verdict
    .getByText('$x^2-5x+6=0$ 의 해를 구하시오. (고침)', { exact: false })
    .locator('xpath=following-sibling::button[1]')
    .click();
  await expect(page.getByText('수치가 바뀌는 제안', { exact: false })).toBeVisible();

  // 숫자를 보존한 제안은 적용된다.
  await verdict
    .getByText('$x^2-3x+2=0$ 의 모든 실근을 구하시오. (고침)', { exact: false })
    .locator('xpath=following-sibling::button[1]')
    .click();
  await expect(page.getByText('문장을 바꿨습니다', { exact: false })).toBeVisible();

  // 저장본에도 판정과 바뀐 문장이 남는다.
  const after = await page.evaluate(() => {
    const files = (window.__GC_CLASS_TEST__?.adapter as unknown as {
      __files: Map<string, string>;
    }).__files;
    const key = [...files.keys()].find((k) => k.startsWith('_임시/전사/T-'));
    return key === undefined ? null : (files.get(key) as string);
  });
  const doc2 = JSON.parse(after ?? '{}') as {
    items: {
      s3: { mid: string; unit: string } | null;
      verdict: { status: string } | null;
      state: string;
      edited: { problem_text: string };
    }[];
  };
  expect(doc2.items[0]?.s3?.mid).toBe('M01');
  expect(doc2.items[0]?.s3?.unit).toBe('B20');
  expect(doc2.items[0]?.verdict?.status).toBe('pass');
  expect(doc2.items[0]?.state).toBe('verified:pass');
  expect(doc2.items[0]?.edited.problem_text).toContain('모든 실근');

  // 영수증 1행 — 금액은 없고 키는 끝 4자리만.
  const receipts = await page.evaluate(() => {
    const files = (window.__GC_CLASS_TEST__?.adapter as unknown as {
      __files: Map<string, string>;
    }).__files;
    return files.get('문제함/receipts.json') ?? null;
  });
  const rec = JSON.parse(receipts ?? '{"entries":[]}') as {
    entries: {
      lane: string;
      purpose: string;
      key_last4: string;
      cache_read_tokens: number;
      request_hash: string;
    }[];
  };

  // 전사(direct)도 1행을 남긴다 — 검증(vault) 행만 골라 본다.
  const transcribeRows = rec.entries.filter((e) => e.purpose === 'transcribe');
  const verifyRows = rec.entries.filter((e) => e.purpose === 'verify');
  expect(transcribeRows).toHaveLength(1);
  expect(verifyRows).toHaveLength(1);

  expect(verifyRows[0]?.lane).toBe('vault');
  expect(verifyRows[0]?.key_last4).toBe('ab12');
  expect(verifyRows[0]?.cache_read_tokens).toBe(0);
  // C-074 — 캐시 생성 열이 있어야 한다. 목은 0 이지만 열 자체가 없으면 안 된다.
  expect(verifyRows[0]).toHaveProperty('cache_creation_tokens');
  expect(transcribeRows[0]).toHaveProperty('cache_creation_tokens');
  // 금액 열은 없다 — 단가는 변한다(R-3).
  expect(Object.keys(verifyRows[0] ?? {})).not.toContain('cost');
  expect(verifyRows[0]?.request_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
});
