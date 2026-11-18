import { test, expect } from './fixtures.mjs';
import {
  addDiagram,
  canvasElements,
  clickTool,
  createCanvasElement,
  createEmptyProject,
  waitForStoredProject,
} from './studio-helpers.mjs';

const messageInput = (page) => page.getByRole('textbox', { name: 'Message Expression QuickEdit' });
const messages = (page) => page.locator('#canvas g[data-rel]');
const line = (message) => message.locator('line[stroke="transparent"]');
const relationship = (data, messageId) =>
  data.diagrams.flatMap((diagram) => diagram.relations).find((r) => r.id === messageId);

async function screenPoint(page, x, y) {
  return page.locator('#canvas > g').evaluate(
    (root, point) => {
      const { x, y } = new DOMPoint(point.x, point.y).matrixTransform(root.getScreenCTM());
      return { x, y };
    },
    { x, y },
  );
}

async function setupSequence(page) {
  await createEmptyProject(page);
  await addDiagram(page, 'Sequence Diagram');
  await createCanvasElement(page, 'Lifeline', { x: 184, y: 100 });
  await createCanvasElement(page, 'Lifeline', { x: 464, y: 100 });
  const { data } = await waitForStoredProject(page, (data) =>
    data.diagrams.some((diagram) => diagram.type === 'sequence' && diagram.elements.length === 2),
  );
  return data.diagrams.find((diagram) => diagram.type === 'sequence').elements.map((life) => life.x + life.w / 2);
}

async function zoomOut(page) {
  const zoom = page.getByRole('button', { name: '축소', exact: true });
  for (let i = 0; i < 4; i++) await zoom.click();
  await expect(page.locator('#zoomLabel')).toHaveText('48%');
}

async function connectMessage(page, from, to, y, name, clickToConnect = false) {
  await clickTool(page, 'Message (sync)');
  const start = await screenPoint(page, from, y);
  const end = await screenPoint(page, to + 14, y);
  if (clickToConnect) {
    await page.mouse.click(start.x, start.y);
    await page.mouse.move(end.x, end.y);
    await expect(page.locator('[data-message-link-target]')).toBeVisible();
    await expect(page.locator('[data-message-link-preview]')).toHaveAttribute('d', /H /);
    await page.mouse.click(end.x, end.y);
  } else {
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 5 });
    await page.mouse.up();
  }
  await expect(messageInput(page)).toBeFocused();
  if (name) {
    await messageInput(page).fill(name);
    await messageInput(page).press('Enter');
  } else {
    await messageInput(page).fill('discard()');
    await messageInput(page).press('Escape');
  }
  await expect(messageInput(page)).toHaveCount(0);
}

test('연결 직후 이름을 쓰고 축소 화면에서 한 번 클릭으로 메시지 이름을 바꾼다', async ({ studioPage: page }) => {
  const [a, b] = await setupSequence(page);
  await connectMessage(page, a, b, 216, 'fetch()', true);
  await expect(messages(page)).toHaveCount(1);
  await expect(messages(page).first()).toContainText('fetch()');
  await expect(messages(page).first().locator('line[stroke-width="1"][pointer-events="none"]')).toHaveCount(1);
  await connectMessage(page, a, b, 328, '');
  await expect(messages(page)).toHaveCount(2);
  await expect(messages(page).last()).not.toContainText('discard()');

  await zoomOut(page);
  const firstLine = line(messages(page).first());
  const box = await firstLine.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + 6);
  const rel = await messages(page).first().getAttribute('data-rel');
  await expect(page.locator('[data-message-hover]')).toHaveAttribute('data-message-hover', rel);
  await page.mouse.click(box.x + box.width / 2, box.y + 6);
  await page.getByRole('button', { name: '메시지 이름 편집', exact: true }).click();
  await expect(messageInput(page)).toBeFocused();
  await expect(messageInput(page)).toHaveValue('fetch()');
  await messageInput(page).fill('load()');
  await messageInput(page).press('Enter');
  await expect(messages(page).first()).toContainText('load()');

  await connectMessage(page, a, b, 232, 'nearby()');
  const nearer = messages(page).filter({ hasText: 'nearby()' });
  const nearerId = await nearer.getAttribute('data-rel');
  const earlier = await firstLine.boundingBox();
  const x = earlier.x + earlier.width * 0.2;
  await page.mouse.move(x, earlier.y + 1);
  await expect(page.locator('[data-message-hover]')).toHaveAttribute('data-message-hover', rel);
  await page.mouse.click(x, earlier.y + 1);
  await expect(page.locator('[data-message-action="move"]')).toHaveAttribute('data-message-id', rel);
  const later = await line(nearer).boundingBox();
  await page.mouse.click(x, later.y + 2);
  await expect(page.locator('[data-message-action="move"]')).toHaveAttribute('data-message-id', nearerId);
});

test('중앙 손잡이로 메시지 간격을 맞추고 Undo로 높이를 복원한다', async ({ studioPage: page }) => {
  const [a, b] = await setupSequence(page);
  await connectMessage(page, a, b, 216, 'first()');
  await connectMessage(page, a, b, 376, 'last()');
  await connectMessage(page, a, b, 264, 'middle()');
  const middle = messages(page).filter({ hasText: 'middle()' });
  const id = await middle.getAttribute('data-rel');
  const grip = page.locator(`[data-message-action="move"][data-message-id="${id}"]`);
  await zoomOut(page);
  const box = await grip.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(20);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2 + 5;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 12, y + 17, { steps: 6 });
  await expect(page.locator('[data-message-spacing-guide]')).toBeVisible();
  await expect(line(middle)).toHaveAttribute('y1', '296');
  await page.mouse.up();
  await expect(page.locator('[data-message-spacing-guide]')).toHaveCount(0);
  await waitForStoredProject(page, (data) => relationship(data, id)?.y === 296);

  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(line(middle)).toHaveAttribute('y1', '264');
  await expect(line(messages(page).filter({ hasText: 'first()' }))).toHaveAttribute('y1', '216');
  await expect(line(messages(page).filter({ hasText: 'last()' }))).toHaveAttribute('y1', '376');

  await connectMessage(page, a, a, 416, 'self()', true);
  const self = messages(page).filter({ hasText: 'self()' });
  const selfId = await self.getAttribute('data-rel');
  const selfGrip = await page.locator(`[data-message-action="move"][data-message-id="${selfId}"]`).boundingBox();
  await page.mouse.move(selfGrip.x + selfGrip.width / 2, selfGrip.y + selfGrip.height / 2);
  await page.mouse.down();
  await page.mouse.move(selfGrip.x + selfGrip.width / 2, selfGrip.y + selfGrip.height / 2 + 16, { steps: 5 });
  await page.mouse.up();
  await waitForStoredProject(page, (data) => relationship(data, selfId)?.y === 448);
});

test('Shift 드래그는 요소와 라벨의 축을 고정하고 Shift 클릭은 선택을 추가한다', async ({ studioPage: page }) => {
  await createEmptyProject(page);
  const first = await createCanvasElement(page, 'Class', { x: 144, y: 176 });
  await createCanvasElement(page, 'Class', { x: 448, y: 176 });
  const before = await first.boundingBox();
  const x = before.x + before.width / 2;
  const y = before.y + before.height / 2;
  await page.mouse.move(x, y);
  await page.keyboard.down('Shift');
  await page.mouse.down();
  await page.mouse.move(x + 80, y + 12, { steps: 4 });
  await page.mouse.move(x + 80, y + 72, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  const after = await first.boundingBox();
  expect(after.x - before.x).toBeCloseTo(80);
  expect(after.y).toBeCloseTo(before.y);
  await canvasElements(page)
    .nth(1)
    .click({ modifiers: ['Shift'] });
  await expect(page.locator('#props')).toContainText('요소 2개 선택됨');

  await addDiagram(page, 'Sequence Diagram');
  await createCanvasElement(page, 'Lifeline', { x: 184, y: 100 });
  await createCanvasElement(page, 'Lifeline', { x: 464, y: 100 });
  const { data } = await waitForStoredProject(page, (data) =>
    data.diagrams.some((diagram) => diagram.type === 'sequence' && diagram.elements.length === 2),
  );
  const [a, b] = data.diagrams
    .find((diagram) => diagram.type === 'sequence')
    .elements.map((life) => life.x + life.w / 2);
  await connectMessage(page, a, b, 248, 'receive()');
  const id = await messages(page).first().getAttribute('data-rel');
  const label = await messages(page).first().locator('text').boundingBox();
  const lx = label.x + label.width / 2;
  const ly = label.y + label.height / 2 - 2;
  await page.mouse.move(lx, ly);
  await page.keyboard.down('Shift');
  await page.mouse.down();
  await page.mouse.move(lx + 4, ly + 32, { steps: 4 });
  await page.mouse.move(lx + 64, ly + 32, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await waitForStoredProject(page, (data) => {
    const relation = relationship(data, id);
    return relation?.y === 248 && relation.lblOff?.name?.dx === 0 && relation.lblOff?.name?.dy === 32;
  });
});
