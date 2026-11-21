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

async function dragSelectedRelationshipTarget(page, target, position) {
  const endpoint = await page.locator('#canvas [data-endpoint="dst"]').last().boundingBox();
  const box = await target.boundingBox();
  if (!endpoint || !box) throw new Error('The relationship handle or drop target is missing.');
  await page.mouse.move(endpoint.x + endpoint.width / 2, endpoint.y + endpoint.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + (position?.x ?? box.width / 2), box.y + (position?.y ?? box.height / 2), { steps: 12 });
  await page.mouse.up();
}

async function reopenBackup(page, backup, activeTabName) {
  await createEmptyProject(page);
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#toolbar [data-cmd="open"]').click();
  await (
    await chooser
  ).setFiles({
    name: backup.filename,
    mimeType: 'application/json',
    buffer: Buffer.from(backup.text),
  });
  await expect(page.locator('#tabs .tab.active .tab-name')).toHaveText(activeTabName);
}

test('C4 rejects invalid relationship drops and can reopen the JSON backup', async ({ studioPage: page }) => {
  await page.setViewportSize({ width: 1440, height: 920 });
  await createEmptyProject(page);
  await addDiagram(page, 'C4 System Context');
  await createCanvasElement(page, 'Software System', { x: 320, y: 170 });
  await renameSelectedElement(page, 'ERP');
  await page.getByRole('button', { name: 'Open Container Diagram' }).click();
  const canvas = page.locator('#canvas');
  const api = await createCanvasElement(page, 'Container', { x: 240, y: 180 });
  await renameSelectedElement(page, 'Billing API');
  const db = await createCanvasElement(page, 'Container', { x: 510, y: 180 });
  await renameSelectedElement(page, 'Billing DB');
  const note = await createCanvasElement(page, 'Note', { x: 400, y: 320 });

  await clickTool(page, 'Relationship');
  await clickCanvasElement(page, api);
  await clickCanvasElement(page, db);
  await page.getByLabel('Name', { exact: true }).fill('Stores invoices');

  await dragSelectedRelationshipTarget(page, note);
  await dragSelectedRelationshipTarget(page, canvas, { x: 260, y: 96 });
  const backup = await downloadFromToolbar(page, 'save');
  await reopenBackup(page, backup, 'ERP · Containers');
  const [diagram] = JSON.parse(backup.text).diagrams.filter((entry) => entry.type === 'c4container');
  expect(diagram.relations[0].to).toBe(await db.getAttribute('data-id'));
  await expect(canvas.locator('g[data-rel]')).toContainText('Stores invoices');
});

test('C4 preserves the original relationship after a pasted view is reconnected and its target deleted', async ({
  studioPage: page,
}) => {
  await page.setViewportSize({ width: 1440, height: 920 });
  await createEmptyProject(page);
  await addDiagram(page, 'C4 System Context');
  const canvas = page.locator('#canvas');
  const person = await createCanvasElement(page, 'Person', { x: 24, y: 162 });
  await renameSelectedElement(page, 'Employee');
  const system = await createCanvasElement(page, 'Software System', { x: 320, y: 170 });
  await renameSelectedElement(page, 'ERP');
  await clickTool(page, 'Relationship');
  await clickCanvasElement(page, person);
  await clickCanvasElement(page, system);
  await page.getByLabel('Name', { exact: true }).fill('Submits invoices');

  await clickCanvasElement(page, person);
  await page.keyboard.down('Shift');
  await clickCanvasElement(page, system);
  await page.keyboard.up('Shift');
  await page.locator('#toolbar [data-cmd="copy"]').click();
  await page.locator('#tabs .tab-add').click();
  await page.locator('#tab-menu').getByText('C4 System Context', { exact: true }).click();
  await page.locator('#toolbar [data-cmd="paste"]').click();
  await expect(canvas.locator('g[data-rel]')).toHaveCount(1);

  const alternate = await createCanvasElement(page, 'Software System', { x: 610, y: 170 });
  await renameSelectedElement(page, 'Replacement');
  const line = await canvas.locator('g[data-rel] line').first().boundingBox();
  if (!line) throw new Error('The pasted relationship is missing.');
  await page.mouse.click(line.x + line.width / 2, line.y + line.height / 2);
  await dragSelectedRelationshipTarget(page, alternate);
  await expect(page.locator('#props .prop-kind')).toContainText('Employee → Replacement');
  await page.getByLabel('Name', { exact: true }).fill('Submits to replacement');

  await clickCanvasElement(page, alternate);
  await page.locator('#toolbar [data-cmd="deletemodel"]').click();
  await expect(canvas.locator('g[data-rel]')).toHaveCount(0);
  const backup = await downloadFromToolbar(page, 'save');
  await reopenBackup(page, backup, 'C4 System Context 2');
  await page.getByRole('tab', { name: 'C4 System Context', exact: true }).click();
  await expect(canvas.locator('g[data-rel]')).toHaveCount(1);
  await expect(canvas.locator('g[data-rel]')).toContainText('Submits invoices');
});

test('C4 adds shared context views in one undoable batch and reopens them from JSON', async ({ studioPage: page }) => {
  await page.setViewportSize({ width: 1440, height: 920 });
  await createEmptyProject(page);
  await addDiagram(page, 'C4 System Context');
  const person = await createCanvasElement(page, 'Person', { x: 24, y: 162 });
  await renameSelectedElement(page, 'Employee');
  const personId = await person.getAttribute('data-id');
  const system = await createCanvasElement(page, 'Software System', { x: 320, y: 170 });
  await renameSelectedElement(page, 'ERP');
  const external = await createCanvasElement(page, 'Software System', { x: 604, y: 170 });
  await renameSelectedElement(page, 'Identity Provider');
  const externalId = await external.getAttribute('data-id');
  await createCanvasElement(page, 'Note', { x: 24, y: 360 });
  await clickTool(page, 'Relationship');
  await clickCanvasElement(page, person);
  await clickCanvasElement(page, system);

  await clickCanvasElement(page, system);
  await page.getByRole('button', { name: 'Open Container Diagram' }).click();
  await createCanvasElement(page, 'Container', { x: 240, y: 180 });
  await renameSelectedElement(page, 'Billing API');

  const canvas = page.locator('#canvas');
  const views = canvas.locator('g[data-element-family="c4"]');
  const addContextViews = page.getByRole('button', { name: 'Add Context Views' });
  await canvas.click({ position: { x: 260, y: 96 } });
  await addContextViews.click();
  await expect(views).toHaveCount(4);
  await expect(canvas).toContainText('Employee');
  await expect(canvas).toContainText('Identity Provider');
  await expect(canvas.locator('g[data-rel]')).toHaveCount(0);
  await addContextViews.click();
  await expect(views).toHaveCount(4);

  await page.locator('#toolbar [data-cmd="undo"]').click();
  await expect(views).toHaveCount(2);
  await expect(canvas).toContainText('Billing API');
  await page.locator('#toolbar [data-cmd="redo"]').click();
  await expect(views).toHaveCount(4);

  await clickCanvasElement(page, views.filter({ hasText: 'Employee' }));
  await renameSelectedElement(page, 'Finance Staff');
  const backup = await downloadFromToolbar(page, 'save');
  const saved = JSON.parse(backup.text);
  const context = saved.diagrams.find((diagram) => diagram.type === 'c4context');
  const containers = saved.diagrams.find((diagram) => diagram.type === 'c4container');
  const boundary = containers.elements.find((view) => view.c4Boundary);
  const contextViews = [personId, externalId].map((id) => context.elements.find((view) => view.id === id));
  for (const original of contextViews) {
    const added = containers.elements.find((view) => view.modelId === original.modelId);
    expect(added.id).not.toBe(original.id);
    expect(added.parentId).toBeUndefined();
    expect(added.y).toBeGreaterThan(boundary.y + boundary.h);
  }
  expect(context.relations).toHaveLength(1);
  expect(containers.relations).toHaveLength(0);
  expect(containers.elements).toHaveLength(4);

  await reopenBackup(page, backup, 'ERP · Containers');
  await expect(views).toHaveCount(4);
  await expect(canvas).toContainText('Finance Staff');
  await expect(canvas).toContainText('Identity Provider');
  await canvas.click({ position: { x: 260, y: 96 } });
  await page.getByRole('button', { name: 'Open System Context' }).click();
  await expect(canvas).toContainText('Finance Staff');
  await page.getByRole('button', { name: 'Open Container Diagram' }).click();
  await expect(addContextViews).toBeVisible();
});
