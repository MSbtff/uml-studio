import { test, expect } from './fixtures.mjs';
import {
  addDiagram,
  canvasElements,
  createCanvasElement,
  createEmptyProject,
  currentProjectId,
  downloadFromToolbar,
  findServerRevision,
  openStudio,
  renameSelectedElement,
  waitForStoredProject,
} from './studio-helpers.mjs';

test('다이어그램 생성 → 요소 편집 → JSON 저장 → 재접속 복원', async ({ studioPage: page }) => {
  await createEmptyProject(page);
  await createCanvasElement(page, 'Class', { x: 360, y: 220 });
  await renameSelectedElement(page, 'E2E_OrderService');
  await waitForStoredProject(page, (data) =>
    Object.values(data.models).some((model) => model.name === 'E2E_OrderService'),
  );

  const saved = await downloadFromToolbar(page, 'save');
  expect(saved.filename).toBe('Untitled-Project.json');
  const project = JSON.parse(saved.text);
  expect(Object.values(project.models).some((model) => model.name === 'E2E_OrderService')).toBe(true);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#tabs .tab').first()).toBeVisible();
  await expect(page.locator('#canvas')).toContainText('E2E_OrderService');
  await expect(page.locator('#status-right')).toContainText('SQLite');
});

test('Undo/Redo, 복사·붙여넣기와 모델 삭제가 실제 UI에서 동작한다', async ({ studioPage: page }) => {
  await createEmptyProject(page);
  await createCanvasElement(page, 'Class', { x: 320, y: 220 });
  await renameSelectedElement(page, 'CopySource');

  await page.getByRole('button', { name: 'Copy', exact: true }).click();
  await page.getByRole('button', { name: 'Paste', exact: true }).click();
  await expect(canvasElements(page)).toHaveCount(2);

  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(canvasElements(page)).toHaveCount(1);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(canvasElements(page)).toHaveCount(2);

  await canvasElements(page).last().click();
  await page.getByRole('button', { name: 'Delete Model', exact: true }).click();
  await expect(canvasElements(page)).toHaveCount(0);
  await expect(page.locator('#status-left')).toContainText('모델 1개');
});

test('시퀀스 라이프라인 복사본은 원본과 분리된 모델이 된다', async ({ studioPage: page }) => {
  await createEmptyProject(page);
  await addDiagram(page, 'Sequence Diagram');
  await createCanvasElement(page, 'Lifeline', { x: 260, y: 120 });
  await renameSelectedElement(page, 'Original');

  await page.getByRole('button', { name: 'Copy', exact: true }).click();
  await page.getByRole('button', { name: 'Paste', exact: true }).click();
  await expect(canvasElements(page)).toHaveCount(2);
  await expect(page.locator('#status-left')).toContainText('라이프라인 1개를 독립 모델로');

  // 붙여넣은 사본의 이름을 바꿔도 원본은 그대로여야 한다
  await page.getByLabel('Name', { exact: true }).fill('Copied');
  await expect(page.locator('#canvas')).toContainText('Copied');
  await expect(page.locator('#canvas')).toContainText('Original');

  // 사본을 모델에서 지워도 원본 라이프라인은 남는다
  await page.getByRole('button', { name: 'Delete Model', exact: true }).click();
  await expect(canvasElements(page)).toHaveCount(1);
  await expect(page.locator('#canvas')).toContainText('Original');
});

test('두 탭의 stale revision 저장은 충돌 경고를 표시하고 최신본을 보존한다', async ({
  studioPage: firstPage,
  context,
  appServer,
}) => {
  await createEmptyProject(firstPage);
  await createCanvasElement(firstPage, 'Class', { x: 320, y: 220 });
  await renameSelectedElement(firstPage, 'SharedBeforeConflict');
  await waitForStoredProject(firstPage, (data) =>
    Object.values(data.models).some((model) => model.name === 'SharedBeforeConflict'),
  );

  const secondPage = await context.newPage();
  await openStudio(secondPage, appServer.url);
  await expect(secondPage.locator('#canvas')).toContainText('SharedBeforeConflict');

  await canvasElements(firstPage).first().click();
  await renameSelectedElement(firstPage, 'WriterA_Wins');
  await waitForStoredProject(firstPage, (data) =>
    Object.values(data.models).some((model) => model.name === 'WriterA_Wins'),
  );

  await canvasElements(secondPage).first().click();
  await renameSelectedElement(secondPage, 'WriterB_Stale');
  await expect(secondPage.locator('#status-left')).toContainText('다른 탭에서 이 프로젝트가 변경되었습니다', {
    timeout: 12_000,
  });
  await expect(secondPage.locator('#status-right')).toContainText('DB 저장 오류');
  await waitForStoredProject(
    firstPage,
    (data) =>
      Object.values(data.models).some((model) => model.name === 'WriterA_Wins') &&
      !Object.values(data.models).some((model) => model.name === 'WriterB_Stale'),
  );
  await secondPage.close({ runBeforeUnload: false });
});

test('복구 이력에서 이전 revision을 선택해 화면 상태를 복원한다', async ({ studioPage: page }) => {
  await createEmptyProject(page);
  await createCanvasElement(page, 'Class', { x: 320, y: 220 });
  await renameSelectedElement(page, 'Snapshot_V1');
  await waitForStoredProject(page, (data) => Object.values(data.models).some((model) => model.name === 'Snapshot_V1'));
  const projectId = await currentProjectId(page);

  await page.locator('#toolbar').click({ position: { x: 1, y: 1 } });
  await canvasElements(page).first().click();
  await renameSelectedElement(page, 'Snapshot_V2');
  await waitForStoredProject(page, (data) => Object.values(data.models).some((model) => model.name === 'Snapshot_V2'));

  const revision = await findServerRevision(page, projectId, (data) =>
    Object.values(data.models).some((model) => model.name === 'Snapshot_V1'),
  );
  expect(revision).not.toBeNull();

  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  const activeProject = page.locator('#project-manager-modal .project-row.active');
  await expect(activeProject).toBeVisible();
  await activeProject.getByRole('button', { name: /^복구 / }).click();
  const history = page.locator('#recovery-history-modal');
  await expect(history).toBeVisible();
  const row = history.locator('.recovery-row').filter({ hasText: `Revision ${revision}` });
  await expect(row).toHaveCount(1);
  page.once('dialog', (dialog) => dialog.accept());
  await row.getByRole('button', { name: /^이 버전 복원 / }).click();
  await expect(history).toBeHidden();
  await expect(page.locator('#canvas')).toContainText('Snapshot_V1');
  await expect(page.locator('#canvas')).not.toContainText('Snapshot_V2');
});

test('잡히지 않은 오류는 상태 표시줄에 표시되고 자동저장은 계속된다', async ({ studioPage: page }) => {
  await createEmptyProject(page);

  // 실제 예외 대신 합성 ErrorEvent를 보낸다 — 픽스처의 pageerror 검사와 충돌하지 않으면서
  // 브라우저의 error 이벤트 경로는 그대로 탄다
  await page.evaluate(() => {
    window.dispatchEvent(new ErrorEvent('error', { message: 'Uncaught TypeError: render broke' }));
  });
  await expect(page.locator('#status-left')).toContainText('⚠ 동작 중 오류: render broke');
  await expect(page.locator('#status-right')).toContainText('⚠ 오류 1건');

  await page.evaluate(() => {
    window.dispatchEvent(
      new PromiseRejectionEvent('unhandledrejection', {
        promise: Promise.resolve(),
        reason: new Error('autosave rejected'),
      }),
    );
  });
  await expect(page.locator('#status-right')).toContainText('⚠ 오류 2건');

  // 오류 뒤에도 편집과 자동저장은 정상이다
  await createCanvasElement(page, 'Class', { x: 260, y: 200 });
  await renameSelectedElement(page, 'AfterError');
  await waitForStoredProject(page, (data) => Object.values(data.models).some((model) => model.name === 'AfterError'));
  await expect(page.locator('#status-right')).toContainText('⚠ 오류 2건');
  await expect(page.locator('#status-right')).toContainText('SQLite 저장');
});
