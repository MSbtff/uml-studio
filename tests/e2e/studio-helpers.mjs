import { expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

export const canvasElements = (page) => page.locator('#canvas g[data-id][data-element-family]');

export async function openStudio(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#canvas')).toBeVisible();
  await expect(page.locator('#tabs .tab').first()).toBeVisible();
}

export async function currentProjectId(page) {
  return page.evaluate(() => localStorage.getItem('uml-studio-v7-active-project') || '');
}

export async function loadStoredProject(page, projectId = null) {
  const id = projectId || (await currentProjectId(page));
  if (!id) return null;
  const response = await page.request.get(`${new URL(page.url()).origin}/api/projects/${encodeURIComponent(id)}`);
  if (!response.ok()) return null;
  const record = await response.json();
  return { record, data: JSON.parse(record.json) };
}

export async function waitForStoredProject(page, predicate) {
  await expect
    .poll(
      async () => {
        try {
          const stored = await loadStoredProject(page);
          return Boolean(stored && predicate(stored.data, stored.record));
        } catch (_) {
          return false;
        }
      },
      { timeout: 12_000, intervals: [100, 200, 400, 800] },
    )
    .toBe(true);
  return loadStoredProject(page);
}

export async function createEmptyProject(page) {
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  const modal = page.locator('#project-manager-modal');
  await expect(modal).toBeVisible();
  await modal.getByRole('button', { name: 'New Project', exact: true }).click();
  await expect(modal).toBeHidden();
  await expect(page.locator('#tabs .tab.active .tab-name')).toHaveText('Class Diagram');
  await expect(canvasElements(page)).toHaveCount(0);
  await waitForStoredProject(
    page,
    (data) =>
      data.projectName === 'Untitled Project' && data.diagrams.length === 1 && data.diagrams[0].elements.length === 0,
  );
}

export async function clickTool(page, label) {
  const tool = page
    .locator('#toolbox .tb-tool')
    .filter({ hasText: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) });
  await expect(tool).toHaveCount(1);
  const box = await tool.boundingBox();
  if (!box) throw new Error(`도구 위치를 찾을 수 없습니다: ${label}`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

export async function createCanvasElement(page, toolLabel, position) {
  const before = await canvasElements(page).count();
  await clickTool(page, toolLabel);
  await page.locator('#canvas').click({ position });
  await expect(canvasElements(page)).toHaveCount(before + 1);
  return canvasElements(page).nth(before);
}

export async function clickCanvasElement(page, element) {
  const box = await element.boundingBox();
  if (!box) throw new Error('캔버스 요소 위치를 찾을 수 없습니다.');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

export async function renameSelectedElement(page, name) {
  const input = page.getByLabel('Name', { exact: true });
  await expect(input).toBeVisible();
  await input.fill(name);
  await expect(page.locator('#canvas')).toContainText(name);
}

export async function addDiagram(page, diagramLabel) {
  await page.locator('#tabs .tab-add').click();
  const menu = page.locator('#tab-menu');
  await expect(menu).toBeVisible();
  await menu.getByText(diagramLabel, { exact: true }).click();
  await expect(page.locator('#tabs .tab.active .tab-name')).toHaveText(diagramLabel);
}

export async function downloadFromToolbar(page, command) {
  const downloadPromise = page.waitForEvent('download');
  await page.locator(`#toolbar [data-cmd="${command}"]`).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  if (!downloadPath) throw new Error(`다운로드 경로를 찾을 수 없습니다: ${command}`);
  return {
    filename: download.suggestedFilename(),
    text: await readFile(downloadPath, 'utf8'),
  };
}

export async function downloadErdDdl(page, dialectLabel) {
  await page.locator('#toolbar [data-cmd="exportddl"]').click();
  const modal = page.locator('#erd-ddl-export-modal');
  await expect(modal).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await modal.getByRole('button', { name: dialectLabel, exact: true }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  if (!downloadPath) throw new Error(`${dialectLabel} DDL 다운로드 경로를 찾을 수 없습니다.`);
  return {
    filename: download.suggestedFilename(),
    text: await readFile(downloadPath, 'utf8'),
  };
}

export async function findServerRevision(page, projectId, predicate) {
  const origin = new URL(page.url()).origin;
  const historyResponse = await page.request.get(`${origin}/api/projects/${encodeURIComponent(projectId)}/revisions`);
  if (!historyResponse.ok()) return null;
  const history = await historyResponse.json();
  for (const item of history.revisions || []) {
    const response = await page.request.get(
      `${origin}/api/projects/${encodeURIComponent(projectId)}/revisions/${item.revision}`,
    );
    if (!response.ok()) continue;
    const record = await response.json();
    const data = JSON.parse(record.json);
    if (predicate(data, record)) return item.revision;
  }
  return null;
}
