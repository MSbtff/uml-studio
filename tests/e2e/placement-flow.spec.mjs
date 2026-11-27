import { test, expect } from './fixtures.mjs';
import {
  addDiagram,
  canvasElements,
  clickTool,
  createCanvasElement,
  createEmptyProject,
  waitForStoredProject,
} from './studio-helpers.mjs';

const status = (page) => page.locator('#status-left');
const kinds = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('#canvas g[data-element-family]')].map((g) => g.getAttribute('data-element-family')),
  );

test('도구로 놓은 요소는 컨테이너에 붙고, 호스트가 필요한 도구는 안내만 한다', async ({ studioPage: page }) => {
  await createEmptyProject(page);

  await clickTool(page, 'Class');
  await page.locator('#canvas').click({ position: { x: 220, y: 180 } });
  await expect(canvasElements(page)).toHaveCount(1);
  await expect(page.locator('#toolbox .tb-tool.active')).toHaveText('Select');

  await addDiagram(page, 'State Machine Diagram');
  await clickTool(page, 'Region');
  await page.locator('#canvas').click({ position: { x: 600, y: 500 } });
  await expect(canvasElements(page)).toHaveCount(0);
  await expect(status(page)).toContainText('inside a composite state');

  await clickTool(page, 'Composite State');
  await page.locator('#canvas').click({ position: { x: 260, y: 200 } });
  await expect(canvasElements(page)).toHaveCount(2);
  expect(await kinds(page)).toEqual(['state', 'state']);

  const composite = await canvasElements(page).first().boundingBox();
  await clickTool(page, 'Region');
  await page.mouse.click(composite.x + composite.width / 2, composite.y + composite.height - 12);
  await expect(canvasElements(page)).toHaveCount(3);

  await addDiagram(page, 'Sequence Diagram');
  await clickTool(page, 'Execution');
  await page.locator('#canvas').click({ position: { x: 500, y: 400 } });
  await expect(canvasElements(page)).toHaveCount(0);
  await expect(status(page)).toContainText('lifeline');

  await clickTool(page, 'Lifeline');
  await page.locator('#canvas').click({ position: { x: 300, y: 120 } });
  await expect(canvasElements(page)).toHaveCount(1);
  const lifeCentre = await page.evaluate(() => {
    const g = document.querySelector('#canvas g[data-element-family]');
    const box = g.getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height - 20 };
  });
  await clickTool(page, 'Execution');
  await page.mouse.click(lifeCentre.x, lifeCentre.y);
  await expect(canvasElements(page)).toHaveCount(2);
  expect(await kinds(page)).toEqual(['interaction', 'interaction']);
  await expect(page.locator('#props')).toContainText('Execution');
});

test('시퀀스 전체를 위아래로 드래그하면 alt와 메시지의 간격이 유지된다', async ({ studioPage: page }) => {
  await createEmptyProject(page);
  await addDiagram(page, 'Sequence Diagram');
  await createCanvasElement(page, 'Lifeline', { x: 180, y: 100 });
  await createCanvasElement(page, 'Actor', { x: 460, y: 100 });

  const canvas = page.locator('#canvas');
  const life = await canvasElements(page).first().boundingBox();
  const actor = await canvasElements(page).nth(1).boundingBox();
  await clickTool(page, 'Execution');
  await page.mouse.click(life.x + life.width / 2, life.y + 250);

  await clickTool(page, 'Message (sync)');
  await page.mouse.move(life.x + life.width / 2, life.y + 200);
  await page.mouse.down();
  await page.mouse.move(actor.x + actor.width / 2, life.y + 200, { steps: 4 });
  await page.mouse.up();
  const message = canvas.locator('g[data-rel] line[stroke="transparent"]');
  await expect(message).toHaveCount(1);
  await createCanvasElement(page, 'Combined Fragment', { x: 150, y: 130 });

  const sequence = (data) => data.diagrams.find((diagram) => diagram.type === 'sequence');
  const original = sequence((await waitForStoredProject(page, (data) => sequence(data)?.elements.length === 4)).data);
  const coordinatesMatch = (data, dy) => {
    const current = sequence(data);
    return (
      current?.elements.length === original.elements.length &&
      current.relations.length === original.relations.length &&
      original.elements.every(({ id, x, y }) =>
        current.elements.some((e) => e.id === id && e.x === x && e.y === y + dy),
      ) &&
      original.relations.every(({ id, y }) => current.relations.some((r) => r.id === id && r.y === y + dy))
    );
  };
  const dragMessage = async (dy) => {
    const arrow = await message.boundingBox();
    const x = arrow.x + arrow.width / 2;
    await page.mouse.move(x, arrow.y);
    await page.mouse.down();
    await page.mouse.move(x, arrow.y + dy, { steps: 8 });
    await page.mouse.up();
  };

  await page.getByRole('menuitem', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Select All' }).click();
  await dragMessage(80);
  await waitForStoredProject(page, (data) => coordinatesMatch(data, 80));

  const bounds = await canvas.boundingBox();
  const left = Math.min(...original.elements.map((e) => e.x)) - 12;
  const top = Math.min(...original.elements.map((e) => e.y)) + 80 - 12;
  const right = Math.max(...original.elements.map((e) => e.x + e.w)) + 12;
  const bottom = Math.max(...original.elements.map((e) => e.y + e.h)) + 80 + 12;
  await page.mouse.move(bounds.x + left, bounds.y + top);
  await page.mouse.down();
  await page.mouse.move(bounds.x + right, bounds.y + bottom, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('#props')).toContainText('Selected elements: 5');
  await dragMessage(-152);
  const topEdge = -Math.min(...original.elements.map((e) => e.y));
  await waitForStoredProject(page, (data) => coordinatesMatch(data, topEdge));
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await waitForStoredProject(page, (data) => coordinatesMatch(data, 80));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(message).toHaveAttribute('y1', String(original.relations[0].y + 80));

  await createCanvasElement(page, 'Lifeline', { x: 640, y: 300 });
  await waitForStoredProject(page, (data) => {
    const elements = sequence(data)?.elements;
    return elements?.length === 5 && elements.at(-1).y === original.elements[0].y + 80;
  });
});

test('시퀀스 중간 구간에서 선택한 alt와 화살표만 같이 이동한다', async ({ studioPage: page }) => {
  await createEmptyProject(page);
  await addDiagram(page, 'Sequence Diagram');
  await createCanvasElement(page, 'Lifeline', { x: 180, y: 100 });
  await createCanvasElement(page, 'Actor', { x: 540, y: 100 });

  const canvas = page.locator('#canvas');
  const { x, y } = await canvas.boundingBox();
  const source = await canvasElements(page).first().boundingBox();
  const target = await canvasElements(page).nth(1).boundingBox();
  const sourceX = source.x + source.width / 2;
  const targetX = target.x + target.width / 2;
  for (const offset of [112, 248, 416]) {
    await clickTool(page, 'Message (sync)');
    await page.mouse.move(sourceX, y + offset);
    await page.mouse.down();
    await page.mouse.move(targetX, y + offset);
    await page.mouse.up();
  }
  await clickTool(page, 'Message (sync)');
  await page.mouse.click(sourceX, y + 280);
  await page.mouse.click(sourceX, y + 280);
  const alt = await createCanvasElement(page, 'Combined Fragment', { x: 160, y: 184 });
  const sequence = (data) => data.diagrams.find((diagram) => diagram.type === 'sequence');
  const { data } = await waitForStoredProject(
    page,
    (project) => sequence(project)?.elements.length === 3 && sequence(project).relations.length === 4,
  );
  const original = sequence(data);
  const fragment = original.elements.at(-1);

  await page.mouse.move(x + fragment.x - 12, y + fragment.y - 8);
  await page.mouse.down();
  await page.mouse.move(x + fragment.x + fragment.w + 12, y + fragment.y + fragment.h + 8, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('#props')).toContainText('Selected elements: 3');

  const moved = (dy) => (project) => {
    const current = sequence(project);
    return (
      current.elements.every(
        (view, index) =>
          view.x === original.elements[index].x &&
          view.y === original.elements[index].y + (view.id === fragment.id ? dy : 0),
      ) &&
      current.relations.every((message, index) => {
        const selected = index === 1 || index === 3;
        return message.y === original.relations[index].y + (selected ? dy : 0);
      })
    );
  };
  const drag = async (startX, startY, dy) => {
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 24, startY + dy, { steps: 6 });
    await page.mouse.up();
  };
  const frame = await alt.boundingBox();
  await drag(frame.x + 15, frame.y + 8, 48);
  await waitForStoredProject(page, moved(48));

  const arrow = canvas.locator(`g[data-rel="${original.relations[1].id}"] line[stroke="transparent"]`);
  const box = await arrow.boundingBox();
  await drag(box.x + box.width / 2, box.y, -24);
  await waitForStoredProject(page, moved(24));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(arrow).toHaveAttribute('y1', String(original.relations[1].y + 24));
});

test('선택하지 않은 alt의 점선을 바로 드래그하면 분기 높이가 저장된다', async ({ studioPage: page }) => {
  await createEmptyProject(page);
  await addDiagram(page, 'Sequence Diagram');
  const alt = await createCanvasElement(page, 'Combined Fragment', { x: 230, y: 140 });
  await page.getByLabel('Interaction Operands', { exact: true }).fill('[success]\n[retry]\n[else]');
  const dividers = alt.locator('line[stroke-dasharray="6 4"]');
  await expect(dividers).toHaveCount(2);
  const originalY = Number(await dividers.first().getAttribute('y1'));
  const secondY = await dividers.last().getAttribute('y1');
  await page.locator('#canvas-wrap').focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('#props')).toContainText('Nothing selected.');

  const firstHandle = alt.locator('[data-operand-divider="1"]');
  await expect(firstHandle).toBeVisible();
  const bounds = await firstHandle.boundingBox();
  const dragX = bounds.x + bounds.width / 4;
  const centreY = bounds.y + bounds.height / 2;
  await page.mouse.move(dragX, centreY);
  await page.mouse.down();
  await page.mouse.move(dragX, centreY + 16, { steps: 6 });
  await page.mouse.up();

  await expect(page.locator('#props')).toContainText('Combined Fragment');
  await expect.poll(async () => Number(await dividers.first().getAttribute('y1'))).toBeCloseTo(originalY + 16, 4);
  await expect(dividers.last()).toHaveAttribute('y1', secondY);
  const stored = (project) => project.diagrams.find((diagram) => diagram.type === 'sequence')?.elements[0];
  await waitForStoredProject(page, (project) => stored(project)?.operandDividers?.length === 2);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect.poll(async () => Number(await dividers.first().getAttribute('y1'))).toBeCloseTo(originalY + 16, 4);
  await expect(dividers.last()).toHaveAttribute('y1', secondY);
});
