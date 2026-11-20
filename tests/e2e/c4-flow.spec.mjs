import { test, expect } from './fixtures.mjs';
import {
  addDiagram,
  clickCanvasElement,
  clickTool,
  createCanvasElement,
  createEmptyProject,
  downloadFromToolbar,
  renameSelectedElement,
  waitForStoredProject,
} from './studio-helpers.mjs';

async function inspectSvg(page, source) {
  return page.evaluate((xml) => {
    const root = new DOMParser().parseFromString(xml, 'image/svg+xml').documentElement;
    return {
      namespace: root.namespaceURI,
      labels: [...root.querySelectorAll('text')].map((node) => node.textContent),
      databaseShape: Boolean(root.querySelector('g[data-element-family="c4"] path[fill="none"]')),
    };
  }, source);
}

test('C4 diagrams share one system through editing, SQLite recovery, and SVG export', async ({ studioPage: page }) => {
  await page.setViewportSize({ width: 1440, height: 920 });
  await createEmptyProject(page);
  await addDiagram(page, 'C4 System Context');
  const canvas = page.locator('#canvas');
  const props = page.locator('#props');
  const tab = page.locator('#tabs .tab.active .tab-name');
  const openContainers = props.getByRole('button', { name: 'Open Container Diagram' });
  const openContext = props.getByRole('button', { name: 'Open System Context' });

  const person = await createCanvasElement(page, 'Person', { x: 24, y: 162 });
  await renameSelectedElement(page, 'Employee');
  const system = await createCanvasElement(page, 'Software System', { x: 320, y: 170 });
  await renameSelectedElement(page, 'ERP');
  await props.getByLabel('Description', { exact: true }).fill('Manages invoices and approvals');
  await createCanvasElement(page, 'Software System', { x: 604, y: 170 });
  await renameSelectedElement(page, 'Identity Provider');
  await expect(canvas).toContainText('External Software System');

  await clickTool(page, 'Relationship');
  await clickCanvasElement(page, person);
  await clickCanvasElement(page, system);
  await props.getByLabel('Name', { exact: true }).fill('Submits invoices');

  const l1 = await downloadFromToolbar(page, 'exportsvg');
  const contextSvg = await inspectSvg(page, l1.text);
  expect(contextSvg.namespace).toBe('http://www.w3.org/2000/svg');
  expect(contextSvg.labels).toEqual(
    expect.arrayContaining([
      'Employee',
      'ERP',
      'Identity Provider',
      'Manages invoices and approvals',
      'Submits invoices',
    ]),
  );

  await clickCanvasElement(page, system);
  await openContainers.click();
  await expect(tab).toHaveText('ERP · Containers');
  await expect(props.getByLabel('Name', { exact: true })).toHaveValue('ERP');
  await renameSelectedElement(page, 'ERP Platform');
  await expect(tab).toHaveText('ERP Platform · Containers');
  await expect(openContext).toBeVisible();

  const api = await createCanvasElement(page, 'Container', { x: 240, y: 180 });
  await renameSelectedElement(page, 'Billing API');
  await props.getByLabel('Technology', { exact: true }).fill('Spring Boot');
  const database = await createCanvasElement(page, 'Container', { x: 510, y: 180 });
  await renameSelectedElement(page, 'Billing DB');
  await props.getByLabel('Container Type').selectOption('database');
  await props.getByLabel('Technology', { exact: true }).fill('PostgreSQL');

  await clickTool(page, 'Relationship');
  await clickCanvasElement(page, api);
  await clickCanvasElement(page, database);
  await props.getByLabel('Name', { exact: true }).fill('Stores invoices');
  await props.getByLabel('Technology / Protocol').fill('JDBC');
  await canvas.click({ position: { x: 472, y: 218 } });
  await expect(props.getByLabel('Technology / Protocol')).toHaveValue('JDBC');

  const l2 = await downloadFromToolbar(page, 'exportsvg');
  const svg = await inspectSvg(page, l2.text);
  expect(svg.namespace).toBe('http://www.w3.org/2000/svg');
  expect(svg.labels).toEqual(
    expect.arrayContaining([
      'ERP Platform',
      'Software System Boundary',
      'Billing API',
      'Container · Spring Boot',
      'Billing DB',
      'Container · Database · PostgreSQL',
      'Stores invoices [JDBC]',
    ]),
  );
  expect(svg.databaseShape).toBe(true);

  const saved = JSON.parse((await downloadFromToolbar(page, 'save')).text);
  const context = saved.diagrams.find((diagram) => diagram.type === 'c4context');
  const containers = saved.diagrams.find((diagram) => diagram.type === 'c4container');
  const boundary = containers.elements.find((view) => view.c4Boundary);
  expect(context.elements.find((view) => view.c4ContextFocus).modelId).toBe(boundary.modelId);
  expect(saved.models[boundary.modelId].name).toBe('ERP Platform');
  const databaseModel =
    saved.models[containers.elements.find((view) => saved.models[view.modelId].name === 'Billing DB').modelId];
  expect(databaseModel).toMatchObject({ c4OwnerModelId: boundary.modelId, c4ContainerType: 'database' });
  await waitForStoredProject(
    page,
    (data) =>
      data.models[databaseModel.id]?.c4Technology === 'PostgreSQL' &&
      data.diagrams
        .find((diagram) => diagram.id === containers.id)
        ?.relations.some((view) => data.models[view.modelId].c4Technology === 'JDBC'),
  );

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(tab).toHaveText('ERP Platform · Containers');
  await expect(canvas).toContainText('Stores invoices [JDBC]');
  await canvas.click({ position: { x: 260, y: 96 } });
  await page.locator('#toolbar [data-cmd="delete"]').click();
  await expect(canvas).toContainText('Software System Boundary');
  await openContext.click();
  await expect(tab).toHaveText('C4 System Context');
  await expect(props.getByLabel('Name', { exact: true })).toHaveValue('ERP Platform');
  await openContainers.click();
  await expect(page.getByRole('tab', { name: /Containers/ })).toHaveCount(1);
  await expect(canvas).toContainText('Billing DB');
});
