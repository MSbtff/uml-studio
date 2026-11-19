import { test, expect } from './fixtures.mjs';
import { createEmptyProject, createCanvasElement, renameSelectedElement } from './studio-helpers.mjs';

test('defaults to English and persists Korean without dropping project edits', async ({ studioPage: page }) => {
  const html = page.locator('html');
  await expect(html).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { name: 'Properties' })).toBeVisible();
  await expect(page.getByRole('toolbar', { name: 'Main toolbar' })).toBeVisible();
  await createEmptyProject(page);
  await createCanvasElement(page, 'Class', { x: 320, y: 200 });
  await renameSelectedElement(page, '남기는 모델');

  const settings = page.getByRole('button', { name: 'Settings', exact: true });
  await settings.focus();
  await page.keyboard.press('Enter');
  const english = page.getByRole('dialog', { name: 'Settings', exact: true });
  const englishLanguage = english.getByLabel('Editor language');
  await expect(englishLanguage).toBeFocused();
  await expect(englishLanguage).toHaveValue('en');
  await expect(english.getByRole('button', { name: 'Apply' })).toBeDisabled();
  await englishLanguage.selectOption('ko');
  await english.getByRole('button', { name: 'Apply' }).click();

  await expect(html).toHaveAttribute('lang', 'ko');
  await expect(page.getByRole('heading', { name: '속성' })).toBeVisible();
  await expect(page.getByRole('toolbar', { name: '주 도구 모음' })).toBeVisible();
  await expect(page.locator('#canvas')).toContainText('남기는 모델');
  await expect(page.locator('#status-left')).toContainText('Enter 편집');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'DDL 가져오기', exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: 'Example.sql',
    mimeType: 'text/plain',
    buffer: Buffer.from('CREATE TABLE example (id BIGINT PRIMARY KEY);'),
  });
  const preview = page.getByRole('dialog', { name: 'DDL 가져오기 미리보기' });
  await expect(preview.getByRole('heading', { name: '가져올 테이블' })).toBeVisible();
  await expect(preview.getByRole('button', { name: '가져오기 (1)', exact: true })).toBeVisible();
  await preview.getByRole('button', { name: '취소', exact: true }).click();
  await page.reload();
  await expect(html).toHaveAttribute('lang', 'ko');

  await page.getByRole('button', { name: '설정', exact: true }).click();
  const korean = page.getByRole('dialog', { name: '설정', exact: true });
  const koreanLanguage = korean.getByLabel('편집기 언어');
  await expect(koreanLanguage).toHaveValue('ko');
  await koreanLanguage.selectOption('en');
  await korean.getByRole('button', { name: '적용' }).click();
  await expect(html).toHaveAttribute('lang', 'en');
  await expect(page.locator('#canvas')).toContainText('남기는 모델');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Properties' })).toBeVisible();
  await expect(page.locator('#status-left')).toContainText('Enter to edit');
});

test('localizes every tool palette and keeps UML operators and model names intact', async ({ studioPage: page }) => {
  const tabs = page.locator('#tabs .tab');
  const sequence = page.getByRole('tab', { name: 'Render Sequence', exact: true });
  await sequence.click();
  await expect(page.getByRole('button', { name: 'Lifeline tool', exact: true })).toHaveText('Lifeline');

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Editor language').selectOption('ko');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
  await expect(tabs.first()).toBeVisible();

  const palette = page.locator('#toolbox .tb-tool');
  const labels = new Map();
  for (const tab of await tabs.all()) {
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    for (const [id, label] of await palette.evaluateAll((buttons) =>
      buttons.map((button) => [button.dataset.toolId, button.textContent.trim()]),
    )) {
      labels.set(id, label);
      expect(label, id).toMatch(/\p{Script=Hangul}/u);
    }
  }
  expect(labels.size).toBeGreaterThan(100);

  await sequence.click();
  await expect(page.getByRole('button', { name: '라이프라인 도구', exact: true })).toHaveText('라이프라인');
  await expect(page.getByRole('button', { name: '동기 메시지 도구', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '라이프라인 도구', exact: true }).click();
  await expect(page.locator('#status-left')).toContainText('라이프라인');
  await page.getByRole('button', { name: '선택 도구', exact: true }).click();

  const alt = page.locator('#canvas text').filter({ hasText: /^alt$/ }).first();
  await expect(alt).toBeVisible();
  await alt.click({ force: true });
  await expect(page.locator('#props .prop-kind')).toHaveText('결합 프래그먼트');
  await expect(page.getByLabel('연산자', { exact: true })).toHaveValue('alt');
  await expect(page.getByLabel('상호작용 피연산자')).toHaveValue('[layer.visible]\n[else]');
  await expect(sequence).toHaveText(/Render Sequence/);

  await page.getByRole('button', { name: '새 다이어그램 추가' }).click();
  await expect(page.locator('#tab-menu').getByText('시퀀스 다이어그램', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '모델 목록', exact: true }).click();
  const repository = page.getByRole('dialog', { name: '프로젝트 모델' });
  await repository.getByRole('searchbox').fill('라이프라인');
  await expect(repository.getByRole('listitem').first()).toContainText('라이프라인');
});
