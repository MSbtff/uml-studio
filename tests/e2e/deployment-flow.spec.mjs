import { test, expect } from './fixtures.mjs';
import {
  addDiagram,
  canvasElements,
  clickCanvasElement,
  clickTool,
  createCanvasElement,
  createEmptyProject,
  downloadFromToolbar,
  renameSelectedElement,
} from './studio-helpers.mjs';

test('deployment database and boundary styles survive a JSON round trip', async ({ studioPage: page, appServer }) => {
  await createEmptyProject(page);
  await addDiagram(page, 'Deployment Diagram');

  await createCanvasElement(page, 'System Boundary', { x: 128, y: 96 });
  await renameSelectedElement(page, 'Local PC');
  await createCanvasElement(page, 'Database', { x: 552, y: 184 });
  await renameSelectedElement(page, 'uml-studio.db');
  await page.getByLabel('Database Type').fill('SQLite');
  await createCanvasElement(page, 'System Boundary', { x: 496, y: 96 });
  await renameSelectedElement(page, 'External Environment');
  await page.getByLabel('Dashed Border').check();
  await page.getByLabel('Fill Color').fill('#faf7ff');

  const checkShapes = async (targetPage) => {
    const shape = (name) => canvasElements(targetPage).filter({ has: targetPage.getByText(name, { exact: true }) });
    const solid = shape('Local PC');
    const dashed = shape('External Environment');
    const database = shape('uml-studio.db');

    await expect(canvasElements(targetPage)).toHaveCount(3);
    await expect(canvasElements(targetPage).last()).toContainText('uml-studio.db');
    await expect(database.locator('ellipse')).toBeVisible();
    await expect(database.locator('path')).toBeVisible();
    await expect(database).toContainText('SQLite');
    await expect(solid.locator('rect[stroke-dasharray]')).toHaveCount(0);
    await expect(dashed.locator('rect[stroke-dasharray]')).toBeVisible();
    await expect(dashed.locator('rect')).toHaveAttribute('fill', '#faf7ff');
  };

  await checkShapes(page);
  const saved = await downloadFromToolbar(page, 'save');
  const before = await downloadFromToolbar(page, 'exportsvg');
  const data = JSON.parse(saved.text);
  const deployment = data.diagrams.find((diagram) => diagram.type === 'deployment');
  expect(deployment.elements.some((element) => data.models[element.modelId].kind === 'database')).toBe(true);
  expect(
    deployment.elements.find((element) => data.models[element.modelId].name === 'External Environment'),
  ).toMatchObject({ borderStyle: 'dashed', fill: '#faf7ff' });

  const reopened = await page.context().browser().newPage();
  try {
    await reopened.goto(appServer.url);
    await expect(reopened.locator('#tabs .tab').first()).toBeVisible();
    const chooser = reopened.waitForEvent('filechooser');
    await reopened.getByRole('button', { name: 'Open', exact: true }).click();
    await (
      await chooser
    ).setFiles({ name: saved.filename, mimeType: 'application/json', buffer: Buffer.from(saved.text) });
    await expect(reopened.getByRole('tab', { name: 'Deployment Diagram', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await checkShapes(reopened);
    const after = await downloadFromToolbar(reopened, 'exportsvg');
    expect(after.text).toBe(before.text);
  } finally {
    await reopened.close();
  }
});

test('communication path direction stays in sync with end settings, exports, and JSON', async ({
  studioPage: page,
  appServer,
}) => {
  await createEmptyProject(page);
  await addDiagram(page, 'Deployment Diagram');
  const client = await createCanvasElement(page, 'Node', { x: 128, y: 144 });
  await renameSelectedElement(page, 'Client');
  const server = await createCanvasElement(page, 'Node', { x: 472, y: 144 });
  await renameSelectedElement(page, 'Server');
  const clientId = await client.getAttribute('data-id');
  const serverId = await server.getAttribute('data-id');
  await clickTool(page, 'Communication Path');
  await clickCanvasElement(page, client);
  await clickCanvasElement(page, server);
  await renameSelectedElement(page, 'HTTPS');

  const edge = (targetPage) => targetPage.locator('#canvas [data-rel]');
  const arrowheads = (targetPage) => edge(targetPage).locator('path[fill="none"]');
  const selectPath = (targetPage) =>
    targetPage.getByRole('treeitem', { name: 'Communication Path (Client → Server)', exact: true }).click();
  const direction = (targetPage) => targetPage.getByLabel('Arrowhead Direction', { exact: true });
  const endProperty = (end, label) =>
    page.getByRole('group', { name: `${end} End`, exact: true }).getByLabel(label, { exact: true });
  const navigability = (end) => endProperty(end, 'Navigability');

  await expect(arrowheads(page)).toHaveCount(0);
  await expect(direction(page)).toHaveValue('none');
  await expect(navigability('Source')).toHaveValue('unspecified');
  await expect(navigability('Target')).toHaveValue('unspecified');
  const [sourceTip, targetTip] = await edge(page)
    .locator('line[pointer-events="none"]')
    .evaluate((line) => [1, 2].map((end) => `${line.getAttribute(`x${end}`)} ${line.getAttribute(`y${end}`)}`));
  const expectTips = async (targetPage, tips) => {
    await expect
      .poll(() =>
        arrowheads(targetPage).evaluateAll((paths) => paths.map((path) => path.getAttribute('d').split(' L ')[1])),
      )
      .toEqual(tips);
  };

  await direction(page).focus();
  await direction(page).selectOption('both');
  await expect(direction(page)).toBeFocused();
  await expect(navigability('Source')).toHaveValue('navigable');
  await expect(navigability('Target')).toHaveValue('navigable');
  await expectTips(page, [sourceTip, targetTip]);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expectTips(page, []);
  await selectPath(page);
  await expect(direction(page)).toHaveValue('none');

  await direction(page).selectOption('source');
  await expect(navigability('Source')).toHaveValue('navigable');
  await expectTips(page, [sourceTip]);
  const reverseMermaid = await downloadFromToolbar(page, 'exportmermaid');
  expect(reverseMermaid.text).toContain(`n_${serverId} -->|HTTPS| n_${clientId}`);

  await navigability('Target').selectOption('navigable');
  await expect(direction(page)).toHaveValue('both');
  await expectTips(page, [sourceTip, targetTip]);
  const bothMermaid = await downloadFromToolbar(page, 'exportmermaid');
  expect(bothMermaid.text).toContain(`n_${clientId} <-->|HTTPS| n_${serverId}`);
  const drawio = await downloadFromToolbar(page, 'exportdrawio');
  expect(drawio.text).toMatch(/startArrow=open;startFill=0;endArrow=open;endFill=0;/);

  await direction(page).selectOption('target');
  await expect(navigability('Source')).toHaveValue('unspecified');
  await expectTips(page, [targetTip]);

  await navigability('Source').selectOption('notNavigable');
  await expect(direction(page).locator('option[value="source"]')).toBeDisabled();
  await expect(direction(page).locator('option[value="both"]')).toBeDisabled();
  await direction(page).selectOption('none');
  await expect(navigability('Source')).toHaveValue('notNavigable');
  await expect(navigability('Target')).toHaveValue('unspecified');

  await navigability('Source').selectOption('navigable');
  const aggregation = endProperty('Source', 'Aggregation');
  await aggregation.selectOption('shared');
  await expect(direction(page)).toHaveValue('none');
  await expect(direction(page).locator('option[value="source"]')).toBeDisabled();
  await direction(page).selectOption('target');
  await expect(aggregation).toHaveValue('shared');
  await expect(navigability('Source')).toHaveValue('navigable');
  await navigability('Source').selectOption('unspecified');
  await aggregation.selectOption('none');
  await expectTips(page, [targetTip]);
  const saved = await downloadFromToolbar(page, 'save');
  const before = await downloadFromToolbar(page, 'exportsvg');

  const reopened = await page.context().browser().newPage();
  try {
    await reopened.goto(appServer.url);
    await expect(reopened.locator('#tabs .tab').first()).toBeVisible();
    const chooser = reopened.waitForEvent('filechooser');
    await reopened.getByRole('button', { name: 'Open', exact: true }).click();
    await (
      await chooser
    ).setFiles({ name: saved.filename, mimeType: 'application/json', buffer: Buffer.from(saved.text) });
    await expectTips(reopened, [targetTip]);
    await selectPath(reopened);
    await expect(direction(reopened)).toHaveValue('target');
    const after = await downloadFromToolbar(reopened, 'exportsvg');
    expect(after.text).toBe(before.text);
  } finally {
    await reopened.close();
  }
});
