import { test, expect } from './fixtures.mjs';
import {
  addDiagram,
  canvasElements,
  clickCanvasElement,
  clickTool,
  createCanvasElement,
  createEmptyProject,
  downloadErdDdl,
  downloadFromToolbar,
  renameSelectedElement,
  waitForStoredProject,
} from './studio-helpers.mjs';

test('ERD 컬럼·관계·카디널리티 편집 결과가 저장과 내보내기에 반영된다', async ({ studioPage: page }) => {
  await createEmptyProject(page);
  await addDiagram(page, 'ER Diagram');

  await createCanvasElement(page, 'Entity', { x: 260, y: 190 });
  await renameSelectedElement(page, 'users');
  await page.getByRole('button', { name: 'ERD 컬럼 추가', exact: true }).click();
  const editor = page.locator('.erd-column-editor');
  await expect(editor).toBeVisible();
  await editor.getByLabel('물리명 *', { exact: true }).fill('user_id');
  await editor.getByLabel('논리명', { exact: true }).fill('회원번호');
  await editor.getByLabel('데이터 타입', { exact: true }).fill('BIGINT');
  await editor.getByLabel('DEFAULT', { exact: true }).fill('0');
  await editor.getByLabel('UQ', { exact: true }).check();
  await editor.getByLabel('NN', { exact: true }).check();
  await editor.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.locator('#canvas')).toContainText('user_id');

  await page.getByRole('button', { name: '+ CHECK', exact: true }).click();
  await page.getByLabel('CHECK 1 적용 범위').selectOption('user_id');
  await page.getByLabel('CHECK 1 이름').fill('users_user_id_check');
  await page.getByLabel('CHECK 1 이름').blur();
  await page.getByLabel('CHECK 1 표현식').fill('user_id >= 0');
  await page.getByLabel('CHECK 1 표현식').blur();
  await page.getByRole('button', { name: '+ 인덱스', exact: true }).click();
  await page.getByLabel('인덱스 1 이름').fill('users_user_id_idx');
  await page.getByLabel('인덱스 1 이름').blur();
  await page.getByLabel('인덱스 1 컬럼').fill('user_id DESC');
  await page.getByLabel('인덱스 1 컬럼').blur();
  await page.getByRole('button', { name: '컬럼 user_id 편집', exact: true }).click();
  await editor.getByLabel('물리명 *', { exact: true }).fill('member_code');
  await editor.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.locator('#canvas')).toContainText('member_code');

  await createCanvasElement(page, 'Entity', { x: 620, y: 190 });
  await renameSelectedElement(page, 'orders');
  await page.getByRole('button', { name: 'ERD 컬럼 추가', exact: true }).click();
  await expect(editor).toBeVisible();
  await editor.getByLabel('물리명 *', { exact: true }).fill('order_id');
  await editor.getByLabel('데이터 타입', { exact: true }).fill('VARCHAR2(50)');
  await editor.getByLabel('PK', { exact: true }).check();
  await editor.getByRole('button', { name: '저장', exact: true }).click();
  await page.getByRole('button', { name: 'ERD 컬럼 추가', exact: true }).click();
  await expect(editor).toBeVisible();
  await editor.getByLabel('물리명 *', { exact: true }).fill('user_id');
  await editor.getByLabel('논리명', { exact: true }).fill('주문 회원');
  await editor.getByLabel('데이터 타입', { exact: true }).fill('INTEGER');
  await editor.getByLabel('FK', { exact: true }).check();
  await editor.getByLabel('NN', { exact: true }).check();
  await editor.getByRole('button', { name: '저장', exact: true }).click();
  await clickTool(page, 'One to Many (1..N)');
  await clickCanvasElement(page, canvasElements(page).nth(0));
  await clickCanvasElement(page, canvasElements(page).nth(1));

  // 출발·도착 끝점은 같은 라벨을 반복하므로 각 그룹 안에서 찾는다
  const sourceEnd = () => page.getByRole('group', { name: /^출발 · / });
  const targetEnd = () => page.getByRole('group', { name: /^도착 · / });
  const cardinality = (end) => end().getByLabel('참여 개수', { exact: true });
  await expect(cardinality(sourceEnd)).toHaveValue('1');
  await expect(cardinality(targetEnd)).toHaveValue('1..N');
  await cardinality(sourceEnd).selectOption('0..1');
  await cardinality(targetEnd).selectOption('0..N');
  await expect(cardinality(sourceEnd)).toHaveValue('0..1');
  await expect(cardinality(targetEnd)).toHaveValue('0..N');
  await page.getByLabel('FK 보유 엔티티', { exact: true }).selectOption('target');
  await page.getByLabel('ON DELETE', { exact: true }).selectOption('CASCADE');
  await page.getByLabel('ON UPDATE', { exact: true }).selectOption('RESTRICT');
  await sourceEnd().getByLabel('연결 컬럼', { exact: true }).selectOption('id');
  await targetEnd().getByLabel('연결 컬럼', { exact: true }).selectOption('user_id');

  await clickCanvasElement(page, canvasElements(page).nth(1));
  await page.getByRole('button', { name: '컬럼 user_id 편집', exact: true }).click();
  await editor.getByLabel('물리명 *', { exact: true }).fill('member_id');
  await editor.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.locator('#status-left')).toContainText('FK 연결 1개도 갱신');

  await waitForStoredProject(page, (data) => {
    const diagram = data.diagrams.find((item) => item.type === 'erd');
    const relation = diagram?.relations[0];
    const entity = Object.values(data.models).find((model) => model.kind === 'entity' && model.name === 'users');
    return (
      relation &&
      entity?.columns?.some((column) => column.includes('member_code')) &&
      entity?.erdColumnDetails?.member_code?.defaultValue === '0' &&
      entity?.erdChecks?.[0]?.expression === 'member_code >= 0' &&
      entity?.erdIndexes?.[0]?.columns?.[0]?.name === 'member_code' &&
      data.models[relation.modelId]?.sourceLabel === '0..1' &&
      data.models[relation.modelId]?.targetLabel === '0..N' &&
      data.models[relation.modelId]?.foreignKeyEnd === 'target' &&
      data.models[relation.modelId]?.sourceColumnName === 'id' &&
      data.models[relation.modelId]?.targetColumnName === 'member_id' &&
      data.models[relation.modelId]?.foreignKeyOnDelete === 'CASCADE' &&
      data.models[relation.modelId]?.foreignKeyOnUpdate === 'RESTRICT'
    );
  });

  const mermaid = await downloadFromToolbar(page, 'exportmermaid');
  expect(mermaid.filename).toBe('er-diagram.mmd');
  expect(mermaid.text).toContain('erDiagram');
  expect(mermaid.text).toContain('o{');

  const drawio = await downloadFromToolbar(page, 'exportdrawio');
  expect(drawio.filename).toBe('er-diagram.drawio');
  expect(drawio.text).toContain('ERzeroToOne');
  expect(drawio.text).toContain('ERzeroToMany');
  expect(drawio.text).toContain('umlForeignKeyEnd="target"');
  expect(drawio.text).toContain('umlForeignKeyOnDelete="CASCADE"');
  expect(drawio.text).toContain('umlForeignKeyOnUpdate="RESTRICT"');

  const postgres = await downloadErdDdl(page, 'PostgreSQL');
  expect(postgres.filename).toBe('er-diagram.postgresql.sql');
  expect(postgres.text).toContain('-- Dialect: PostgreSQL');
  expect(postgres.text).toContain('CREATE TABLE IF NOT EXISTS "users"');
  expect(postgres.text).toContain('"member_code" BIGINT NOT NULL DEFAULT 0 UNIQUE');
  expect(postgres.text).toContain('CONSTRAINT "users_user_id_check" CHECK (member_code >= 0)');
  expect(postgres.text).toContain('CREATE INDEX "users_user_id_idx" ON "users" ("member_code" DESC);');
  expect(postgres.text).toContain('"order_id" VARCHAR(50) NOT NULL');
  expect(postgres.text).toContain(
    'FOREIGN KEY ("member_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE RESTRICT',
  );

  const mysql = await downloadErdDdl(page, 'MySQL');
  expect(mysql.filename).toBe('er-diagram.mysql.sql');
  expect(mysql.text).toContain('-- Dialect: MySQL');
  expect(mysql.text).toContain('CREATE TABLE IF NOT EXISTS `orders`');
  expect(mysql.text).toContain('`order_id` VARCHAR(50) NOT NULL');
  expect(mysql.text).toContain(
    'FOREIGN KEY (`member_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT',
  );

  const sqlite = await downloadErdDdl(page, 'SQLite');
  expect(sqlite.filename).toBe('er-diagram.sqlite.sql');
  expect(sqlite.text).toContain('-- Dialect: SQLite');
  expect(sqlite.text).toContain('"order_id" TEXT NOT NULL');
  expect(sqlite.text).toContain('PRAGMA foreign_keys = ON;');
  expect(sqlite.text).toContain(
    'FOREIGN KEY ("member_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE RESTRICT',
  );

  await page.getByRole('button', { name: '컬럼 member_id 편집', exact: true }).click();
  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('FK 관계 1개');
    expect(dialog.message()).toContain('관계선은 유지');
    await dialog.dismiss();
  });
  await editor.getByRole('button', { name: '삭제', exact: true }).click();
  await expect(editor).toBeVisible();
  await expect(page.locator('#canvas')).toContainText('member_id');

  page.once('dialog', (dialog) => dialog.accept());
  await editor.getByRole('button', { name: '삭제', exact: true }).click();
  await expect(editor).toBeHidden();
  await expect(page.locator('#status-left')).toContainText('FK 연결 1개 해제');
  await waitForStoredProject(page, (data) => {
    const diagram = data.diagrams.find((item) => item.type === 'erd');
    const relationView = diagram?.relations[0];
    const relation = relationView && data.models[relationView.modelId];
    return (
      diagram?.relations.length === 1 &&
      relation?.foreignKeyEnd === '' &&
      relation.sourceColumnName === '' &&
      relation.targetColumnName === '' &&
      relation.foreignKeyOnDelete === '' &&
      relation.foreignKeyOnUpdate === ''
    );
  });

  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('#canvas')).toContainText('member_id');
  await waitForStoredProject(page, (data) => {
    const diagram = data.diagrams.find((item) => item.type === 'erd');
    const relationView = diagram?.relations[0];
    const relation = relationView && data.models[relationView.modelId];
    return (
      relation?.foreignKeyEnd === 'target' &&
      relation.targetColumnName === 'member_id' &&
      relation.foreignKeyOnDelete === 'CASCADE' &&
      relation.foreignKeyOnUpdate === 'RESTRICT'
    );
  });
});

test('ERD 논리명·물리명 검색과 일괄 변환은 충돌을 막고 Undo로 복원된다', async ({ studioPage: page }) => {
  await createEmptyProject(page);
  await addDiagram(page, 'ER Diagram');
  await createCanvasElement(page, 'Entity', { x: 320, y: 210 });
  await renameSelectedElement(page, 'TB_USER');

  const logicalName = page.getByLabel('Logical Name (논리명)');
  await logicalName.fill('회원');
  await logicalName.blur();

  const addColumn = page.getByRole('button', { name: 'ERD 컬럼 추가', exact: true });
  const editor = page.locator('.erd-column-editor');
  await addColumn.click();
  await editor.getByLabel('물리명 *', { exact: true }).fill('user_id');
  await editor.getByLabel('논리명', { exact: true }).fill('회원번호');
  await editor.getByLabel('데이터 타입', { exact: true }).fill('BIGINT');
  await editor.getByRole('button', { name: '저장', exact: true }).click();
  await addColumn.click();
  await editor.getByLabel('물리명 *', { exact: true }).fill('member_id');
  await editor.getByLabel('논리명', { exact: true }).fill('담당자번호');
  await editor.getByLabel('데이터 타입', { exact: true }).fill('BIGINT');
  await editor.getByRole('button', { name: '저장', exact: true }).click();

  const explorerSearch = page.getByLabel('Model Explorer 검색');
  await explorerSearch.fill('회원번호');
  await expect(page.locator('#explorer')).toContainText('user_id ↔ 회원번호');
  await explorerSearch.fill('');

  const trigger = page.getByRole('button', { name: 'ERD 이름', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'ERD 이름 일괄 변환' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('찾을 이름')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await dialog.getByLabel('변환 대상').selectOption('physical');
  await dialog.getByLabel('일치 방식').selectOption('exact');
  await dialog.getByLabel('찾을 이름').fill('user_id');
  await dialog.getByLabel('바꿀 이름').fill('member_id');
  await expect(dialog).toContainText("'member_id' 컬럼이 이미 있습니다.");
  await expect(dialog.getByRole('button', { name: '변환 적용', exact: true })).toBeDisabled();

  await dialog.getByLabel('바꿀 이름').fill('account_id');
  await expect(dialog).toContainText('변경 후보 1개');
  await dialog.getByRole('button', { name: '변환 적용', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('#canvas')).toContainText('account_id');
  await waitForStoredProject(page, (data) =>
    Object.values(data.models).some(
      (model) =>
        model.kind === 'entity' &&
        model.name === 'TB_USER' &&
        model.columns?.some((column) => column.includes('account_id')),
    ),
  );

  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('#canvas')).toContainText('user_id');
  await waitForStoredProject(page, (data) =>
    Object.values(data.models).some(
      (model) =>
        model.kind === 'entity' &&
        model.name === 'TB_USER' &&
        model.columns?.some((column) => column.includes('user_id')) &&
        !model.columns?.some((column) => column.includes('account_id')),
    ),
  );

  await trigger.click();
  await dialog.getByLabel('변환 대상').selectOption('logical');
  await dialog.getByLabel('찾을 이름').fill('회원');
  await dialog.getByLabel('바꿀 이름').fill('고객');
  await expect(dialog).toContainText('변경 후보 2개');
  await dialog.getByRole('button', { name: '변환 적용', exact: true }).click();
  await expect(page.locator('#status-left')).toContainText('ERD 이름 2개를 일괄 변환');
  await waitForStoredProject(page, (data) =>
    Object.values(data.models).some(
      (model) =>
        model.kind === 'entity' &&
        model.name === 'TB_USER' &&
        model.logicalName === '고객' &&
        model.columns?.some((column) => column.includes('user_id <고객번호>')),
    ),
  );

  await explorerSearch.fill('고객번호');
  await expect(page.locator('#explorer')).toContainText('user_id ↔ 고객번호');
});
