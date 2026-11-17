import { test as base, expect } from '@playwright/test';
import { startTestServer } from './support/server-fixture.mjs';

export const test = base.extend({
  appServer: async ({}, use) => {
    const server = await startTestServer();
    try {
      await use(server);
    } finally {
      await server.stop();
    }
  },

  studioPage: async ({ page, appServer }, use) => {
    const runtimeErrors = [];
    page.on('pageerror', (error) => runtimeErrors.push(error.message));
    await page.goto(appServer.url, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#canvas')).toBeVisible();
    try {
      await expect(page.locator('#tabs .tab').first()).toBeVisible();
    } catch (error) {
      if (runtimeErrors.length) {
        throw new Error(`앱 시작 중 브라우저 런타임 오류:\n${runtimeErrors.join('\n')}`, { cause: error });
      }
      throw error;
    }
    await use(page);
    expect(runtimeErrors, '브라우저 런타임 오류가 없어야 합니다').toEqual([]);
  },
});

export { expect };
