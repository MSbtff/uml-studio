import { test, expect } from './fixtures.mjs';

/* 첫 실행은 샘플 프로젝트를 생성하므로, 이 스펙은 지원하는 모든 다이어그램 종류가
   실제로 그려지고 UML 검증을 통과하는지를 한 번에 확인한다. 모듈을 떼어낼 때
   특정 종류만 조용히 깨지는 일을 막는 그물이다. */
test('샘플 프로젝트의 모든 다이어그램이 그려지고 검증을 통과한다', async ({ studioPage: page }) => {
  const tabs = page.locator('#tabs .tab');
  const names = await tabs.locator('.tab-name').allTextContents();
  expect(names.length).toBeGreaterThanOrEqual(20);

  const blank = [];
  const kinds = new Set();
  for (let index = 0; index < names.length; index++) {
    const tab = tabs.nth(index);
    await tab.scrollIntoViewIfNeeded();
    await tab.click();
    await expect(tab).toHaveClass(/active/);
    const drawn = await page.evaluate(() => ({
      views: document.querySelectorAll('#canvas g[data-id]').length,
      kind: (document.getElementById('status-right')?.textContent || '').split(' · ')[2] || '',
    }));
    if (!drawn.views) blank.push(names[index]);
    if (drawn.kind) kinds.add(drawn.kind);
  }

  expect(blank, '요소가 하나도 그려지지 않은 다이어그램이 있으면 안 됩니다').toEqual([]);
  expect(kinds.size, '샘플은 여러 다이어그램 종류를 모두 덮어야 합니다').toBeGreaterThanOrEqual(20);

  await page.locator('#toolbar [data-cmd="validate"]').click();
  const summary = page.locator('#validation-summary');
  await expect(summary).toContainText('문제가 없습니다', { timeout: 15_000 });
  await expect(page.locator('#validation-results .validation-row')).toHaveCount(0);
});
