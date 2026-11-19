import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';
import { installPackedDdlLibrary } from '../support/install-packed-ddl-library.js';
import { test, expect } from './fixtures.mjs';
import {
  canvasElements,
  createCanvasElement,
  createEmptyProject,
  downloadErdDdl,
  downloadFromToolbar,
  renameSelectedElement,
  waitForStoredProject,
} from './studio-helpers.mjs';

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const DRAWIO_CONFLICT_FIXTURE = path.resolve(TEST_DIRECTORY, '../fixtures/drawio-mixed-conflicts.drawio');
const ERD_DDL_FIXTURE = path.resolve(TEST_DIRECTORY, '../fixtures/erd-import.sql');

test('JSON·Mermaid·draw.io 파일을 실제 다운로드한다', async ({ studioPage: page }) => {
  await createEmptyProject(page);
  await createCanvasElement(page, 'Class', { x: 340, y: 220 });
  await renameSelectedElement(page, 'ExportTarget');

  const json = await downloadFromToolbar(page, 'save');
  expect(json.filename).toBe('Untitled-Project.json');
  expect(Object.values(JSON.parse(json.text).models).some((model) => model.name === 'ExportTarget')).toBe(true);

  const mermaid = await downloadFromToolbar(page, 'exportmermaid');
  expect(mermaid.filename).toBe('class-diagram.mmd');
  expect(mermaid.text).toContain('classDiagram');
  expect(mermaid.text).toContain('ExportTarget');

  const drawio = await downloadFromToolbar(page, 'exportdrawio');
  expect(drawio.filename).toBe('class-diagram.drawio');
  expect(drawio.text).toContain('<mxfile');
  expect(drawio.text).toContain('ExportTarget');

  const svg = await downloadFromToolbar(page, 'exportsvg');
  expect(svg.filename).toBe('class-diagram.svg');
  expect(svg.text).toContain('<svg');
  expect(svg.text).toContain('ExportTarget');
});

test('draw.io 가져오기 충돌을 미리 보고 기존 모델 재사용 정책으로 병합한다', async ({ studioPage: page }) => {
  await createEmptyProject(page);
  await createCanvasElement(page, 'Class', { x: 250, y: 190 });
  await renameSelectedElement(page, 'Shape');
  await createCanvasElement(page, 'Class', { x: 560, y: 190 });
  await renameSelectedElement(page, 'Style');

  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import draw.io', exact: true }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles(DRAWIO_CONFLICT_FIXTURE);

  const preview = page.locator('#drawio-import-preview-modal');
  await expect(preview).toBeVisible();
  await expect(preview.locator('.drawio-import-stat').filter({ hasText: 'Compatible conflicts' })).toContainText('2');
  await expect(preview.locator('.drawio-conflict-table tbody tr')).toHaveCount(2);
  await preview.locator('#drawio-conflict-policy').selectOption('reuse');
  await expect(preview.locator('.drawio-policy-summary')).toContainText('Reuse 2');
  await preview
    .locator('.project-dialog-footer')
    .getByRole('button', { name: /Import/ })
    .click();

  await expect(preview).toBeHidden();
  await expect(page.locator('#tabs .tab.active .tab-name')).toHaveText('Mixed Conflict Import');
  await expect(canvasElements(page)).toHaveCount(3);
  await expect(page.locator('#canvas')).toContainText('ImportedService');

  const saved = JSON.parse((await downloadFromToolbar(page, 'save')).text);
  expect(Object.values(saved.models).filter((model) => model.kind === 'class' && model.name === 'Shape')).toHaveLength(
    1,
  );
  expect(Object.values(saved.models).filter((model) => model.kind === 'class' && model.name === 'Style')).toHaveLength(
    1,
  );
});

test('압축된 draw.io 파일을 열고 요소를 가져온다', async ({ studioPage: page }) => {
  await createEmptyProject(page);
  const source = await readFile(DRAWIO_CONFLICT_FIXTURE, 'utf8');
  const compressed = source.replace(/<mxGraphModel[\s\S]*?<\/mxGraphModel>/, (graph) =>
    deflateRawSync(Buffer.from(encodeURIComponent(graph))).toString('base64'),
  );
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import draw.io', exact: true }).click();
  await (
    await chooser
  ).setFiles({ name: 'compressed.drawio', mimeType: 'application/xml', buffer: Buffer.from(compressed) });

  const preview = page.locator('#drawio-import-preview-modal');
  await expect(preview).toBeVisible();
  await preview
    .locator('.project-dialog-footer')
    .getByRole('button', { name: /Import/ })
    .click();
  await expect(preview).toBeHidden();
  await expect(page.locator('#canvas')).toContainText('ImportedService');
  await expect(canvasElements(page)).toHaveCount(3);
});

test('CREATE TABLE DDL을 미리 보고 의미적 FK가 있는 ERD로 가져온다', async ({ studioPage: page }) => {
  await createEmptyProject(page);

  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import DDL', exact: true }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles(ERD_DDL_FIXTURE);

  const preview = page.locator('#ddl-import-preview-modal');
  await expect(preview).toBeVisible();
  await expect(preview.locator('.ddl-import-stat').filter({ hasText: 'Tables' })).toContainText('2');
  await expect(preview.locator('.ddl-import-stat').filter({ hasText: 'Columns' })).toContainText('5');
  await expect(preview.locator('.ddl-import-stat').filter({ hasText: 'Relationships' })).toContainText('1');
  await expect(preview.locator('.ddl-import-stat').filter({ hasText: 'CHECK' })).toContainText('0');
  await expect(preview.locator('.ddl-import-stat').filter({ hasText: 'Indexes' })).toContainText('1');
  await expect(preview.locator('.ddl-import-warnings')).toHaveCount(0);
  await preview.getByRole('button', { name: 'Import (2)', exact: true }).click();

  await expect(preview).toBeHidden();
  await expect(page.locator('#tabs .tab.active .tab-name')).toHaveText('erd-import');
  await expect(canvasElements(page)).toHaveCount(2);
  await expect(page.locator('#canvas')).toContainText('users');
  await expect(page.locator('#canvas')).toContainText('posts');

  const mermaid = await downloadFromToolbar(page, 'exportmermaid');
  expect(mermaid.filename).toBe('erd-import.mmd');
  expect(mermaid.text).toContain('erDiagram');
  expect(mermaid.text).toContain('["users"]');
  expect(mermaid.text).toContain('["posts"]');
  expect(mermaid.text).toMatch(/\}o\.\.\|\| .+ : "posts_user_fk"/);

  await waitForStoredProject(page, (data) => {
    const diagram = data.diagrams.find((item) => item.type === 'erd' && item.name === 'erd-import');
    const relationView = diagram?.relations[0];
    const relation = relationView && data.models[relationView.modelId];
    const posts = Object.values(data.models).find((model) => model.kind === 'entity' && model.name === 'posts');
    return (
      relation?.foreignKeyEnd === 'source' &&
      relation.sourceColumnName === 'user_id' &&
      relation.targetColumnName === 'id' &&
      relation.foreignKeyOnDelete === 'CASCADE' &&
      posts?.erdColumnDetails?.title?.defaultValue === "'Untitled'" &&
      posts?.erdIndexes?.[0]?.name === 'posts_user_idx'
    );
  });

  const sqlite = await downloadErdDdl(page, 'SQLite');
  expect(sqlite.text).toContain('CREATE TABLE IF NOT EXISTS "users"');
  expect(sqlite.text).toContain('"email" VARCHAR(120) NOT NULL UNIQUE');
  expect(sqlite.text).toContain('"title" VARCHAR(200) DEFAULT \'Untitled\'');
  expect(sqlite.text).toContain('FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE');
  expect(sqlite.text).toContain('CREATE INDEX "posts_user_idx" ON "posts" ("user_id");');
});

test('설치한 npm 패키지의 ERD를 열고 재접속한 뒤에도 컬럼과 FK가 보존된다', async ({ studioPage: page }) => {
  const converted = await test.step('압축 파일을 별도 프로젝트에 설치하고 SQL을 변환한다', async () => {
    const work = await mkdtemp(path.join(tmpdir(), 'uml-ddl-package-browser-'));
    try {
      installPackedDdlLibrary(work);
      const requireFromConsumer = createRequire(path.join(work, 'package.json'));
      const { ddlToMermaid } = requireFromConsumer('uml-studio-ddl-to-mermaid');
      return ddlToMermaid(
        `CREATE TABLE items ("PK" INTEGER PRIMARY KEY);
         CREATE TABLE stock (
           "FK value" INTEGER NOT NULL,
           "자재" TEXT,
           "수량" INTEGER DEFAULT 0 CHECK ("수량" >= 0),
           "item name" TEXT,
           item_name TEXT,
           CONSTRAINT stock_item_fk FOREIGN KEY ("FK value") REFERENCES items("PK") ON DELETE CASCADE
         );`,
        { diagramName: 'Package ERD' },
      );
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  });

  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: 'npm-package.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(converted.erd)),
  });

  const activeTab = page.locator('#tabs .tab.active .tab-name');
  await expect(activeTab).toHaveText('Package ERD');
  await waitForStoredProject(page, (data) => data.diagrams.some((diagram) => diagram.name === 'Package ERD'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(activeTab).toHaveText('Package ERD');
  await expect(canvasElements(page)).toHaveCount(2);
  const canvas = page.locator('#canvas');
  for (const label of ['FK value', '자재', '수량', 'item name', 'item_name']) {
    await expect(canvas).toContainText(label);
  }
  await expect(canvas.locator('[data-rel]')).toHaveCount(1);

  const { text: savedJson } = await downloadFromToolbar(page, 'save');
  expect(JSON.parse(savedJson).models).toEqual(converted.erd.models);
  const { text: mermaid } = await downloadFromToolbar(page, 'exportmermaid');
  expect(mermaid).toBe(converted.mermaid);
});
