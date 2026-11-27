import { test, expect } from './fixtures.mjs';
import {
  addDiagram,
  canvasElements,
  clickCanvasElement,
  clickTool,
  createCanvasElement,
  createEmptyProject,
  renameSelectedElement,
} from './studio-helpers.mjs';

test('도구 팔레트와 다이어그램 탭을 키보드로 조작할 수 있다', async ({ studioPage: page }) => {
  await createEmptyProject(page);

  const classTool = page.getByRole('button', { name: 'Class tool', exact: true });
  const selectTool = page.getByRole('button', { name: 'Select tool', exact: true });
  await expect(classTool).toHaveAttribute('aria-pressed', 'false');
  await classTool.focus();
  await page.keyboard.press('Enter');
  await expect(classTool).toHaveAttribute('aria-pressed', 'true');
  await expect(classTool).toBeFocused();
  await page.locator('#canvas').click({ position: { x: 300, y: 220 } });
  await expect(canvasElements(page)).toHaveCount(1);

  await selectTool.focus();
  await page.keyboard.press('Space');
  await expect(selectTool).toHaveAttribute('aria-pressed', 'true');
  await expect(classTool).toHaveAttribute('aria-pressed', 'false');
  const toolBox = await classTool.boundingBox();
  expect(toolBox?.height).toBeGreaterThanOrEqual(24);

  await addDiagram(page, 'ER Diagram');
  const tablist = page.getByRole('tablist', { name: 'Diagram tabs' });
  await expect(tablist).toBeVisible();
  await expect(page.getByRole('tabpanel', { name: 'Diagram canvas' })).toBeVisible();
  await expect(tablist.getByRole('tab')).toHaveCount(2);

  let classTab = tablist.getByRole('tab', { name: 'Class Diagram', exact: true });
  let erdTab = tablist.getByRole('tab', { name: 'ER Diagram', exact: true });
  await expect(erdTab).toHaveAttribute('aria-selected', 'true');
  await expect(erdTab).toHaveAttribute('tabindex', '0');
  await expect(classTab).toHaveAttribute('tabindex', '-1');

  await erdTab.focus();
  await page.keyboard.press('ArrowLeft');
  classTab = tablist.getByRole('tab', { name: 'Class Diagram', exact: true });
  await expect(classTab).toHaveAttribute('aria-selected', 'true');
  await expect(classTab).toBeFocused();

  await page.keyboard.press('End');
  erdTab = tablist.getByRole('tab', { name: 'ER Diagram', exact: true });
  await expect(erdTab).toHaveAttribute('aria-selected', 'true');
  await expect(erdTab).toBeFocused();
  await page.keyboard.press('Home');
  classTab = tablist.getByRole('tab', { name: 'Class Diagram', exact: true });
  await expect(classTab).toBeFocused();

  await page.keyboard.press('F2');
  const rename = page.getByLabel('Rename Class Diagram diagram', { exact: true });
  await expect(rename).toBeFocused();
  await rename.fill('Keyboard Class');
  await page.keyboard.press('Enter');
  const renamedTab = tablist.getByRole('tab', { name: 'Keyboard Class', exact: true });
  await expect(renamedTab).toHaveAttribute('aria-selected', 'true');
  await expect(renamedTab).toBeFocused();

  const closeButton = page.getByRole('button', { name: 'Close Keyboard Class diagram', exact: true });
  const closeBox = await closeButton.boundingBox();
  expect(closeBox?.width).toBeGreaterThanOrEqual(24);
  expect(closeBox?.height).toBeGreaterThanOrEqual(24);

  const addButton = page.getByRole('button', { name: 'Add Diagram', exact: true });
  await addButton.focus();
  await page.keyboard.press('Enter');
  const menu = page.locator('#tab-menu');
  await expect(menu).toBeVisible();
  await expect(menu.locator('.tm-item').first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(addButton).toBeFocused();
});

test('모달은 포커스를 가두고 닫은 뒤 호출 버튼으로 돌려보낸다', async ({ studioPage: page }) => {
  await createEmptyProject(page);

  const projectsButton = page.getByRole('button', { name: 'Projects', exact: true });
  await projectsButton.focus();
  await projectsButton.click();
  const manager = page.getByRole('dialog', { name: 'Project Manager', exact: true });
  await expect(manager).toBeVisible();
  await expect(page.locator('#app')).toHaveAttribute('inert', '');
  await expect(manager.getByRole('button', { name: 'New Project', exact: true })).toBeFocused();

  const renameButton = manager.getByRole('button', { name: /^Rename / }).first();
  await renameButton.click();
  const rename = page.getByRole('dialog', { name: 'Rename Project', exact: true });
  const nameInput = rename.getByLabel('Project Name', { exact: true });
  await expect(rename).toBeVisible();
  await expect(nameInput).toBeFocused();
  await expect(page.locator('#project-manager-modal')).toHaveAttribute('inert', '');
  await expect(page.locator('#project-manager-modal')).toHaveAttribute('aria-hidden', 'true');

  await rename.getByRole('button', { name: 'Rename', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(rename.getByRole('button', { name: 'Close Rename Project', exact: true })).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(rename).toBeHidden();
  await expect(manager).toBeVisible();
  await expect(renameButton).toBeFocused();
  await expect(page.locator('#project-manager-modal')).not.toHaveAttribute('inert', '');
  await expect(page.locator('#project-manager-modal')).not.toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('#app')).toHaveAttribute('inert', '');

  await page.keyboard.press('Escape');
  await expect(manager).toBeHidden();
  await expect(projectsButton).toBeFocused();
  await expect(page.locator('#app')).not.toHaveAttribute('inert', '');
});

test('메뉴바를 방향키로 이동하고 메뉴 항목을 키보드로 실행할 수 있다', async ({ studioPage: page }) => {
  await createEmptyProject(page);

  const menubar = page.getByRole('menubar', { name: 'Main menu' });
  await expect(menubar).toBeVisible();
  const fileMenu = menubar.getByRole('menuitem', { name: 'File', exact: true });
  const editMenu = menubar.getByRole('menuitem', { name: 'Edit', exact: true });
  const viewMenu = menubar.getByRole('menuitem', { name: 'View', exact: true });
  await expect(fileMenu).toHaveAttribute('tabindex', '0');
  await expect(editMenu).toHaveAttribute('tabindex', '-1');
  await expect(fileMenu).toHaveAttribute('aria-expanded', 'false');

  await fileMenu.focus();
  await page.keyboard.press('ArrowRight');
  await expect(editMenu).toBeFocused();
  await expect(editMenu).toHaveAttribute('tabindex', '0');
  await expect(fileMenu).toHaveAttribute('tabindex', '-1');

  await page.keyboard.press('End');
  await expect(menubar.getByRole('menuitem', { name: 'Help', exact: true })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(fileMenu).toBeFocused();

  await page.keyboard.press('ArrowDown');
  const filePopup = page.getByRole('menu');
  await expect(filePopup).toBeVisible();
  await expect(fileMenu).toHaveAttribute('aria-expanded', 'true');
  await expect(filePopup.getByRole('menuitem', { name: /New Project/ })).toBeFocused();

  await page.keyboard.press('ArrowUp');
  await expect(filePopup.getByRole('menuitem', { name: /Export ERD DDL/ })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(filePopup.getByRole('menuitem', { name: /New Project/ })).toBeFocused();

  await page.keyboard.press('ArrowRight');
  await expect(fileMenu).toHaveAttribute('aria-expanded', 'false');
  await expect(editMenu).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('menu')).toHaveAttribute('aria-labelledby', 'menubar-trigger-edit');

  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(editMenu).toBeFocused();
  await expect(editMenu).toHaveAttribute('aria-expanded', 'false');

  await viewMenu.focus();
  await page.keyboard.press('Enter');
  const viewPopup = page.getByRole('menu');
  const minimapItem = viewPopup.getByRole('menuitemcheckbox', { name: /Minimap/ });
  await expect(minimapItem).toHaveAttribute('aria-checked', 'false');
  await page.keyboard.press('m');
  await expect(minimapItem).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(page.locator('#minimap')).toBeVisible();
  await expect(viewMenu).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(page.getByRole('menu').getByRole('menuitemcheckbox', { name: /Minimap/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
});

test('Model Explorer 트리를 방향키로 탐색하고 항목을 선택할 수 있다', async ({ studioPage: page }) => {
  await createEmptyProject(page);
  await createCanvasElement(page, 'Class', { x: 260, y: 200 });
  await renameSelectedElement(page, 'Customer');
  await createCanvasElement(page, 'Class', { x: 520, y: 200 });
  await renameSelectedElement(page, 'Invoice');
  await addDiagram(page, 'ER Diagram');

  const tree = page.getByRole('tree', { name: 'Model Explorer' });
  await expect(tree).toBeVisible();
  const classRoot = tree.getByRole('treeitem', { name: 'Class Diagram' });
  const erdRoot = tree.getByRole('treeitem', { name: 'ER Diagram' });
  await expect(classRoot).toHaveAttribute('aria-expanded', 'false');
  await expect(classRoot).toHaveAttribute('aria-level', '1');
  await expect(erdRoot).toHaveAttribute('aria-level', '1');
  await expect(erdRoot).toHaveAttribute('aria-posinset', '2');
  await expect(erdRoot).toHaveAttribute('aria-setsize', '2');

  await page.getByLabel('Search Model Explorer').focus();
  await page.keyboard.press('ArrowDown');
  await expect(classRoot).toBeFocused();

  await page.keyboard.press('ArrowRight');
  await expect(classRoot).toHaveAttribute('aria-expanded', 'true');
  await expect(erdRoot).not.toHaveAttribute('aria-expanded', /.*/, {});
  await expect(classRoot).toBeFocused();

  await page.keyboard.press('ArrowRight');
  const customer = tree.getByRole('treeitem', { name: 'Customer' });
  await expect(customer).toBeFocused();
  await expect(customer).toHaveAttribute('aria-level', '2');
  await expect(customer).toHaveAttribute('aria-posinset', '1');

  await page.keyboard.press('ArrowDown');
  const invoice = tree.getByRole('treeitem', { name: 'Invoice' });
  await expect(invoice).toBeFocused();
  await expect(invoice).toHaveAttribute('aria-selected', 'false');

  await page.keyboard.press('Enter');
  await expect(invoice).toHaveAttribute('aria-selected', 'true');
  await expect(invoice).toBeFocused();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Invoice');

  await page.keyboard.press('ArrowLeft');
  await expect(classRoot).toBeFocused();
  await page.keyboard.press('End');
  await expect(erdRoot).toBeFocused();
  await page.keyboard.press('Home');
  await expect(classRoot).toBeFocused();
  await page.keyboard.press('c');
  await expect(customer).toBeFocused();
});

test('툴바는 탭 정지점 하나로 들어가 방향키로 이동한다', async ({ studioPage: page }) => {
  await createEmptyProject(page);

  const toolbar = page.getByRole('toolbar', { name: 'Main toolbar' });
  await expect(toolbar).toBeVisible();
  const newButton = toolbar.getByRole('button', { name: 'New', exact: true });
  const openButton = toolbar.getByRole('button', { name: 'Open', exact: true });
  await expect(toolbar.getByRole('button', { name: 'Projects', exact: true })).toHaveAttribute('tabindex', '0');
  await expect(newButton).toHaveAttribute('tabindex', '-1');
  await expect(openButton).toHaveAttribute('tabindex', '-1');
  await expect(toolbar.getByRole('button', { name: 'Zoom Out', exact: true })).toHaveAttribute('tabindex', '-1');
  expect(await toolbar.locator('button:not([tabindex="-1"])').count()).toBe(1);

  await newButton.focus();
  await page.keyboard.press('ArrowRight');
  await expect(openButton).toBeFocused();
  await expect(openButton).toHaveAttribute('tabindex', '0');
  await expect(newButton).toHaveAttribute('tabindex', '-1');

  await page.keyboard.press('End');
  await expect(toolbar.getByRole('button', { name: 'Zoom In', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(newButton).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(toolbar.getByRole('button', { name: 'Zoom In', exact: true })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(newButton).toBeFocused();

  await createCanvasElement(page, 'Class', { x: 300, y: 220 });
  const before = await page.locator('#canvas g[data-id]').first().getAttribute('transform');
  await newButton.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  expect(await page.locator('#canvas g[data-id]').first().getAttribute('transform')).toBe(before);

  await addDiagram(page, 'ER Diagram');
  const erdGroup = page.getByRole('group', { name: 'ERD display mode' });
  await expect(erdGroup).toBeVisible();
  const logicalButton = erdGroup.getByRole('button', { name: 'Logical', exact: true });
  await expect(logicalButton).toHaveAttribute('tabindex', '-1');
  await logicalButton.focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('group', { name: 'ERD display mode' }).getByRole('button', { name: 'Logical', exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole('group', { name: 'ERD display mode' }).getByRole('button', { name: 'Logical', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  expect(await toolbar.locator('button:not([tabindex="-1"])').count()).toBe(1);
});

test('속성 패널은 구획을 이름으로 구분하고 다시 그려도 포커스를 지킨다', async ({ studioPage: page }) => {
  await createEmptyProject(page);

  const panel = page.getByRole('region', { name: 'Properties', exact: true });
  await expect(panel).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Properties', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Model Explorer', exact: true })).toBeVisible();

  const box = await createCanvasElement(page, 'Class', { x: 300, y: 220 });
  await renameSelectedElement(page, 'Customer');

  const abstract = panel.getByRole('checkbox', { name: /Abstract/ });
  await abstract.focus();
  await abstract.press('Space');
  await expect(panel.getByRole('checkbox', { name: /Abstract/ })).toBeChecked();
  await expect(panel.getByRole('checkbox', { name: /Abstract/ })).toBeFocused();

  const nameInput = panel.getByLabel('Name', { exact: true });
  await nameInput.focus();
  await expect(nameInput).toBeFocused();

  const other = await createCanvasElement(page, 'Class', { x: 620, y: 220 });
  await renameSelectedElement(page, 'Order');
  await clickTool(page, 'Association');
  await clickCanvasElement(page, box);
  await clickCanvasElement(page, other);

  const sourceEnd = panel.getByRole('group', { name: 'Source End', exact: true });
  const targetEnd = panel.getByRole('group', { name: 'Target End', exact: true });
  await expect(sourceEnd).toBeVisible();
  await expect(targetEnd).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Source End', exact: true })).toBeVisible();
  await expect(panel.getByLabel('Name Expression', { exact: true })).toHaveCount(2);
  await expect(sourceEnd.getByLabel('Name Expression', { exact: true })).toHaveCount(1);
  await expect(targetEnd.getByLabel('Name Expression', { exact: true })).toHaveCount(1);

  await sourceEnd.getByLabel('Name Expression', { exact: true }).fill('owner');
  await expect(page.locator('#canvas')).toContainText('owner');
  await expect(sourceEnd.getByLabel('Name Expression', { exact: true })).toBeFocused();
});

test('캔버스 요소를 Tab으로 순회하고 끝에서는 캔버스를 벗어난다', async ({ studioPage: page }) => {
  await createEmptyProject(page);
  await createCanvasElement(page, 'Class', { x: 260, y: 200 });
  await renameSelectedElement(page, 'First');
  await createCanvasElement(page, 'Class', { x: 560, y: 200 });
  await renameSelectedElement(page, 'Second');

  const canvas = page.getByRole('tabpanel', { name: 'Diagram canvas' });
  const name = page.getByLabel('Name', { exact: true });
  const status = page.locator('#status-left');

  await canvas.focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('#props')).toContainText('Nothing selected.');

  await canvas.focus();
  await page.keyboard.press('Tab');
  await expect(name).toHaveValue('First');
  await expect(status).toContainText('Selected 1/2');
  await expect(status).toContainText('Esc clear selection');
  await expect(canvas).toBeFocused();

  await page.keyboard.press('Tab');
  await expect(name).toHaveValue('Second');
  await expect(status).toContainText('Selected 2/2');

  await page.keyboard.press('Shift+Tab');
  await expect(name).toHaveValue('First');

  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#props')).toContainText('Nothing selected.');
  await expect(canvas).not.toBeFocused();

  await canvas.focus();
  await page.keyboard.press('Tab');
  await expect(name).toHaveValue('First');
  const before = await canvasElements(page).first().boundingBox();
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await canvasElements(page).first().boundingBox())?.x).toBeGreaterThan(before.x);
  const fine = await canvasElements(page).first().boundingBox();
  await page.keyboard.press('Shift+ArrowRight');
  await expect.poll(async () => (await canvasElements(page).first().boundingBox())?.x).toBeGreaterThan(fine.x);
});

test('목록형 대화상자의 행 버튼은 어느 항목인지 이름으로 구분된다', async ({ studioPage: page }) => {
  await createEmptyProject(page);
  await createCanvasElement(page, 'Class', { x: 220, y: 180 });
  await renameSelectedElement(page, 'Order');

  await page.getByRole('button', { name: 'Models', exact: true }).click();
  const models = page.locator('#model-repository-modal');
  await expect(models).toBeVisible();
  await expect(models.getByRole('searchbox', { name: 'Search by model name or type' })).toBeVisible();
  const modelList = models.getByRole('list', { name: /^Models: \d+$/ });
  await expect(modelList).toBeVisible();
  await expect(modelList.getByRole('listitem')).not.toHaveCount(0);
  await expect(models.getByRole('button', { name: 'Select Order', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(models).toBeHidden();

  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  const projects = page.locator('#project-manager-modal');
  await expect(projects).toBeVisible();
  const projectList = projects.getByRole('list', { name: /^Saved projects: \d+$/ });
  await expect(projectList).toBeVisible();
  const firstRow = projectList.getByRole('listitem').first();
  const rowName = (await firstRow.locator('.project-name').textContent()).trim();
  for (const label of ['Open', 'History', 'Rename', 'Duplicate', 'Delete']) {
    await expect(projects.getByRole('button', { name: `${label} ${rowName}`, exact: true })).toHaveCount(1);
  }
  await page.keyboard.press('Escape');
  await expect(projects).toBeHidden();
});
