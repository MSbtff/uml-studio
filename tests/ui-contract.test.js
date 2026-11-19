'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'src/app.ts'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const persistence = fs.readFileSync(path.join(root, 'src/io/persistence.ts'), 'utf8');
const canvasGeometry = fs.readFileSync(path.join(root, 'src/canvas/canvas-geometry.ts'), 'utf8');
const elementRenderer = fs.readFileSync(path.join(root, 'src/canvas/element-renderer.ts'), 'utf8');
const relationRenderer = fs.readFileSync(path.join(root, 'src/canvas/relation-renderer.ts'), 'utf8');
const propertyPanel = fs.readFileSync(path.join(root, 'src/editor/property-panel.ts'), 'utf8');
const erdPropertySections = fs.readFileSync(path.join(root, 'src/editor/erd-property-sections.ts'), 'utf8');
const modelExplorer = fs.readFileSync(path.join(root, 'src/editor/model-explorer.ts'), 'utf8');
const diagramTabs = fs.readFileSync(path.join(root, 'src/editor/diagram-tabs.ts'), 'utf8');
const toolbox = fs.readFileSync(path.join(root, 'src/editor/toolbox.ts'), 'utf8');
const viewportController = fs.readFileSync(path.join(root, 'src/canvas/viewport-controller.ts'), 'utf8');
const commandRouter = fs.readFileSync(path.join(root, 'src/editor/command-router.ts'), 'utf8');
const quickEdit = fs.readFileSync(path.join(root, 'src/editor/quick-edit.ts'), 'utf8');
const erdColumnEditor = fs.readFileSync(path.join(root, 'src/editor/erd-column-editor.ts'), 'utf8');
const relationEndEditor = fs.readFileSync(path.join(root, 'src/editor/relation-end-editor.ts'), 'utf8');
const canvasInteraction = fs.readFileSync(path.join(root, 'src/canvas/canvas-interaction.ts'), 'utf8');
const elementPlacement = fs.readFileSync(path.join(root, 'src/canvas/element-placement.ts'), 'utf8');
const canvasKeyboard = fs.readFileSync(path.join(root, 'src/canvas/canvas-keyboard.ts'), 'utf8');
const runtimeErrors = fs.readFileSync(path.join(root, 'src/editor/runtime-errors.ts'), 'utf8');
const presentationRegistry = fs.readFileSync(path.join(root, 'src/model/presentation-registry.ts'), 'utf8');
const diagramRegistry = fs.readFileSync(path.join(root, 'src/model/diagram-registry.ts'), 'utf8');
const relationEnd = fs.readFileSync(path.join(root, 'src/model/relation-end.ts'), 'utf8');
const sampleDiagrams = fs.readFileSync(path.join(root, 'src/model/sample-diagrams.ts'), 'utf8');
const exporters = fs.readFileSync(path.join(root, 'src/io/exporters.ts'), 'utf8');
const ddlImporter = fs.readFileSync(path.join(root, 'src/io/ddl-importer.ts'), 'utf8');
const erdSchema = fs.readFileSync(path.join(root, 'src/model/erd-schema.ts'), 'utf8');
const erdCardinality = fs.readFileSync(path.join(root, 'src/model/erd-cardinality.ts'), 'utf8');
const validation = fs.readFileSync(path.join(root, 'src/model/validation.ts'), 'utf8');
const erdNameTools = fs.readFileSync(path.join(root, 'src/editor/erd-name-tools.ts'), 'utf8');
const importExport = fs.readFileSync(path.join(root, 'src/io/project-import.ts'), 'utf8');
const diagramExport = fs.readFileSync(path.join(root, 'src/io/diagram-export.ts'), 'utf8');
const importPreview = fs.readFileSync(path.join(root, 'src/io/import-preview.ts'), 'utf8');
const projectStore = fs.readFileSync(path.join(root, 'src/io/project-store.ts'), 'utf8');
const elementFactory = fs.readFileSync(path.join(root, 'src/model/element-factory.ts'), 'utf8');
const elementMeasure = fs.readFileSync(path.join(root, 'src/canvas/element-measure.ts'), 'utf8');
const memberListsModule = fs.readFileSync(path.join(root, 'src/editor/member-lists.ts'), 'utf8');
const statusBar = fs.readFileSync(path.join(root, 'src/editor/status-bar.ts'), 'utf8');
const modalFocus = fs.readFileSync(path.join(root, 'src/editor/modal-focus.ts'), 'utf8');
const containmentLayout = fs.readFileSync(path.join(root, 'src/canvas/containment-layout.ts'), 'utf8');
const relationRules = fs.readFileSync(path.join(root, 'src/model/relation-rules.ts'), 'utf8');
const relationCreation = fs.readFileSync(path.join(root, 'src/editor/relation-creation.ts'), 'utf8');
const validationPanel = fs.readFileSync(path.join(root, 'src/editor/validation-panel.ts'), 'utf8');
const interactionLayout = fs.readFileSync(path.join(root, 'src/canvas/interaction-layout.ts'), 'utf8');
const selectionEditing = fs.readFileSync(path.join(root, 'src/editor/selection-editing.ts'), 'utf8');
const hitTesting = fs.readFileSync(path.join(root, 'src/canvas/hit-testing.ts'), 'utf8');
const canvasRenderer = fs.readFileSync(path.join(root, 'src/canvas/canvas-renderer.ts'), 'utf8');
const historyController = fs.readFileSync(path.join(root, 'src/editor/history-controller.ts'), 'utf8');
const projectDocument = fs.readFileSync(path.join(root, 'src/io/project-document.ts'), 'utf8');
const modelRepository = fs.readFileSync(path.join(root, 'src/editor/model-repository.ts'), 'utf8');
const parametricBinding = fs.readFileSync(path.join(root, 'src/model/parametric-binding.ts'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.py'), 'utf8');

const REQUIRED_TOOLBAR_KEYS = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];

for (const menu of ['file', 'edit', 'format', 'model', 'tools', 'view', 'help']) {
  assert.match(html, new RegExp(`data-menu="${menu}"`), `${menu} 메뉴 트리거가 필요합니다`);
  assert.match(commandRouter, new RegExp(`\\b${menu}: \\[`), `${menu} 메뉴 정의가 필요합니다`);
}

for (const id of ['explorer-search', 'erd-name-tools-button', 'minimap', 'minimap-svg', 'minimapButton', 'bottom-panel', 'validation-summary', 'validation-results']) {
  assert.match(html, new RegExp(`id="${id}"`), `${id} UI 계약이 필요합니다`);
}
assert.match(html, /sequence-layout\.js/);
assert.match(html, /interaction-layout\.js/);
assert.match(html, /canvas-geometry\.js/);
assert.match(html, /element-renderer\.js/);
assert.match(html, /relation-renderer\.js/);
assert.match(html, /property-panel\.js/);
assert.match(html, /model-explorer\.js/);
assert.match(html, /diagram-tabs\.js/);
assert.match(html, /toolbox\.js/);
assert.match(html, /viewport-controller\.js/);
assert.match(html, /command-router\.js/);
assert.match(html, /quick-edit\.js/);
assert.match(html, /canvas-interaction\.js/);
assert.match(html, /canvas-keyboard\.js/);
assert.match(html, /orthogonal-router\.js/);
assert.match(html, /validation\.js/);
assert.match(html, /validation-panel\.js/);
assert.match(html, /exporters\.js/);
assert.match(html, /drawio-importer\.js/);
assert.match(html, /icon-script\.js/);
assert.match(html, /expression-parser\.js/);
assert.match(html, /presentation-registry\.js/);
assert.match(html, /diagram-registry\.js/);
assert.match(html, /relation-end\.js/);
assert.match(html, /erd-column\.js/);
assert.match(html, /erd-schema\.js/);
assert.match(html, /erd-name-tools\.js/);
assert.match(html, /erd-cardinality\.js/);
assert.match(html, /persistence\.js/);
assert.match(html, /sample-diagrams\.js/);
assert.match(html, /project-import\.js/);
assert.match(html, /project-store\.js/);
assert.match(html, /element-factory\.js/);
assert.match(html, /element-measure\.js/);
assert.match(html, /member-lists\.js/);
assert.match(html, /status-bar\.js/);
assert.match(html, /modal-focus\.js/);
assert.match(html, /containment-layout\.js/);
assert.match(html, /relation-rules\.js/);
assert.match(html, /relation-creation\.js/);
assert.match(html, /selection-editing\.js/);
assert.match(html, /hit-testing\.js/);
assert.match(html, /canvas-renderer\.js/);
assert.match(html, /history-controller\.js/);
assert.match(html, /project-document\.js/);
assert.match(html, /model-repository\.js/);
assert.match(html, /parametric-binding\.js/);
assert.ok(html.indexOf('expression-parser.js') < html.indexOf('app.js'), 'Expression Parser는 app.js보다 먼저 로드해야 합니다');
assert.ok(html.indexOf('canvas-geometry.js') < html.indexOf('app.js'), 'Canvas Geometry는 app.js보다 먼저 로드해야 합니다');
assert.ok(html.indexOf('sequence-layout.js') < html.indexOf('interaction-layout.js'), 'Sequence Layout은 Interaction Layout보다 먼저 로드해야 합니다');
assert.ok(html.indexOf('interaction-layout.js') < html.indexOf('app.js'), 'Interaction Layout 모듈은 app.js보다 먼저 로드해야 합니다');
assert.ok(html.indexOf('element-renderer.js') < html.indexOf('app.js'), 'Element Renderer는 app.js보다 먼저 로드해야 합니다');
assert.ok(html.indexOf('relation-renderer.js') < html.indexOf('app.js'), 'Relation Renderer는 app.js보다 먼저 로드해야 합니다');
assert.ok(html.indexOf('property-panel.js') < html.indexOf('app.js'), 'Property Panel은 app.js보다 먼저 로드해야 합니다');
assert.ok(html.indexOf('model-explorer.js') < html.indexOf('app.js'), 'Model Explorer 모듈은 app.js보다 먼저 로드해야 합니다');
assert.ok(html.indexOf('diagram-tabs.js') < html.indexOf('app.js'), 'Diagram Tabs 모듈은 app.js보다 먼저 로드해야 합니다');
assert.ok(html.indexOf('toolbox.js') < html.indexOf('app.js'), 'Toolbox 모듈은 app.js보다 먼저 로드해야 합니다');
assert.ok(html.indexOf('viewport-controller.js') < html.indexOf('app.js'), 'Viewport Controller 모듈은 app.js보다 먼저 로드해야 합니다');
assert.ok(html.indexOf('command-router.js') < html.indexOf('app.js'), 'Command Router 모듈은 app.js보다 먼저 로드해야 합니다');
assert.ok(html.indexOf('quick-edit.js') < html.indexOf('app.js'), 'QuickEdit 모듈은 app.js보다 먼저 로드해야 합니다');
assert.ok(html.indexOf('canvas-interaction.js') < html.indexOf('app.js'), 'Canvas Interaction 모듈은 app.js보다 먼저 로드해야 합니다');
assert.ok(html.indexOf('canvas-keyboard.js') < html.indexOf('app.js'), 'Canvas Keyboard 모듈은 app.js보다 먼저 로드해야 합니다');
assert.ok(html.indexOf('presentation-registry.js') < html.indexOf('app.js'), 'Presentation Registry는 app.js보다 먼저 로드해야 합니다');
assert.ok(html.indexOf('diagram-registry.js') < html.indexOf('app.js'), 'Diagram Registry는 app.js보다 먼저 로드해야 합니다');
assert.ok(html.indexOf('relation-end.js') < html.indexOf('app.js'), 'Relation End 모듈은 app.js보다 먼저 로드해야 합니다');
assert.ok(html.indexOf('erd-schema.js') < html.indexOf('model-core.js'), 'ERD Schema는 Model Core보다 먼저 로드해야 합니다');
assert.ok(html.indexOf('erd-column.js') < html.indexOf('app.js'), 'ERD Column 모듈은 app.js보다 먼저 로드해야 합니다');
assert.ok(html.indexOf('erd-column.js') < html.indexOf('erd-name-tools.js'), 'ERD Name Tools는 컬럼 파서 뒤에 로드해야 합니다');
assert.ok(html.indexOf('erd-name-tools.js') < html.indexOf('app.js'), 'ERD Name Tools 모듈은 app.js보다 먼저 로드해야 합니다');
assert.ok(html.indexOf('erd-schema.js') < html.indexOf('validation.js'), 'ERD Schema는 Validation보다 먼저 로드해야 합니다');
assert.ok(html.indexOf('erd-column.js') < html.indexOf('validation.js'), 'ERD Column 모듈은 validation.js보다 먼저 로드해야 합니다');
assert.ok(html.indexOf('erd-cardinality.js') < html.indexOf('exporters.js'), 'ERD Cardinality 모듈은 Exporter보다 먼저 로드해야 합니다');
assert.ok(html.indexOf('erd-cardinality.js') < html.indexOf('app.js'), 'ERD Cardinality 모듈은 app.js보다 먼저 로드해야 합니다');
assert.ok(html.indexOf('erd-column.js') < html.indexOf('ddl-importer.js'), 'ERD Column 모듈은 DDL Importer보다 먼저 로드해야 합니다');
assert.ok(html.indexOf('erd-schema.js') < html.indexOf('ddl-importer.js'), 'ERD Schema는 DDL Importer보다 먼저 로드해야 합니다');
assert.ok(html.indexOf('ddl-importer.js') < html.indexOf('project-import.js'), 'DDL Importer는 Import/Export 모듈보다 먼저 로드해야 합니다');
assert.ok(html.indexOf('persistence.js') < html.indexOf('app.js'), 'Persistence 모듈은 app.js보다 먼저 로드해야 합니다');
assert.ok(html.indexOf('sample-diagrams.js') < html.indexOf('app.js'), 'Sample Diagrams 모듈은 app.js보다 먼저 로드해야 합니다');
assert.ok(html.indexOf('project-import.js') < html.indexOf('app.js'), 'Import/Export 모듈은 app.js보다 먼저 로드해야 합니다');
assert.ok(html.indexOf('exporters.js') < html.indexOf('project-import.js'), 'Exporter는 Import/Export 모듈보다 먼저 로드해야 합니다');
assert.ok(html.indexOf('drawio-importer.js') < html.indexOf('project-import.js'), 'draw.io Importer는 Import/Export 모듈보다 먼저 로드해야 합니다');
assert.ok(html.indexOf('project-store.js') < html.indexOf('app.js'), 'Project Store 모듈은 app.js보다 먼저 로드해야 합니다');
assert.ok(html.indexOf('element-factory.js') < html.indexOf('app.js'), 'Element Factory 모듈은 app.js보다 먼저 로드해야 합니다');
assert.ok(html.indexOf('element-measure.js') < html.indexOf('app.js'), 'Element Measure 모듈은 app.js보다 먼저 로드해야 합니다');
assert.ok(html.indexOf('element-measure.js') < html.indexOf('member-lists.js'), 'Element Measure는 Member Lists보다 먼저 로드해야 합니다');
assert.ok(html.indexOf('member-lists.js') < html.indexOf('app.js'), 'Member Lists 모듈은 app.js보다 먼저 로드해야 합니다');
assert.ok(html.indexOf('status-bar.js') < html.indexOf('app.js'), 'Status Bar 모듈은 app.js보다 먼저 로드해야 합니다');
assert.ok(html.indexOf('modal-focus.js') < html.indexOf('app.js'), 'Modal Focus 모듈은 app.js보다 먼저 로드해야 합니다');
assert.ok(html.indexOf('element-measure.js') < html.indexOf('element-renderer.js'), 'Element Measure는 Element Renderer보다 먼저 로드해야 합니다');
assert.ok(html.indexOf('containment-layout.js') < html.indexOf('app.js'), 'Containment Layout 모듈은 app.js보다 먼저 로드해야 합니다');
assert.ok(html.indexOf('relation-rules.js') < html.indexOf('app.js'), 'Relation Rules 모듈은 app.js보다 먼저 로드해야 합니다');
assert.ok(html.indexOf('relation-creation.js') < html.indexOf('app.js'), 'Relation Creation 모듈은 app.js보다 먼저 로드해야 합니다');
assert.ok(html.indexOf('selection-editing.js') < html.indexOf('app.js'), 'Selection Editing 모듈은 app.js보다 먼저 로드해야 합니다');
assert.ok(html.indexOf('hit-testing.js') < html.indexOf('app.js'), 'Hit Testing 모듈은 app.js보다 먼저 로드해야 합니다');
assert.ok(html.indexOf('canvas-renderer.js') < html.indexOf('app.js'), 'Canvas Renderer 모듈은 app.js보다 먼저 로드해야 합니다');
assert.ok(html.indexOf('history-controller.js') < html.indexOf('app.js'), 'History Controller 모듈은 app.js보다 먼저 로드해야 합니다');
assert.ok(html.indexOf('project-document.js') < html.indexOf('history-controller.js'), 'Project Document는 History Controller보다 먼저 로드해야 합니다');
assert.ok(html.indexOf('model-repository.js') < html.indexOf('app.js'), 'Model Repository 모듈은 app.js보다 먼저 로드해야 합니다');
assert.ok(html.indexOf('parametric-binding.js') < html.indexOf('app.js'), 'Parametric Binding 모듈은 app.js보다 먼저 로드해야 합니다');
assert.ok(html.indexOf('validation.js') < html.indexOf('validation-panel.js'), 'Validation 규칙은 Validation Panel보다 먼저 로드해야 합니다');
assert.ok(html.indexOf('validation-panel.js') < html.indexOf('app.js'), 'Validation Panel 모듈은 app.js보다 먼저 로드해야 합니다');
assert.match(html, /data-cmd="exportmermaid"/);
assert.match(html, /data-cmd="exportdrawio"/);
assert.match(html, /data-cmd="exportddl"/);
assert.match(html, /data-cmd="importddl"/);
assert.match(html, /data-cmd="importdrawio"/);
assert.match(html, /data-cmd="projects"/);

assert.match(viewportController, /function fitToWindow\(/);
assert.match(viewportController, /function renderMinimap\(/);
assert.match(interactionLayout, /assignTemporalDepths/);
assert.match(validationPanel, /function run\(\)/);
assert.match(diagramExport, /exporters\.exportMermaid/);
assert.match(diagramExport, /exporters\.exportDrawio/);
assert.match(diagramExport, /exporters\.exportErdDdl/);
assert.match(importExport, /drawioImporter\.importDrawio/);
assert.match(importExport, /function importDrawioProjectFile\(/);
assert.match(importExport, /function importDdlProjectFile\(/);
assert.match(importPreview, /function openDdlImportPreview\(/);
assert.match(importExport, /function importSupportedFile\(/);
assert.match(importPreview, /function openDrawioImportPreview\(/);
assert.match(importExport, /function importedDiagramName\(/);
assert.match(importExport, /drawioImporter\.analyzeImport/);
assert.match(importExport, /\['keepBoth', uiText\('[^']+', '새 모델로 가져오기'\)\]/);
assert.match(importExport, /\['reuse', uiText\('[^']+', '기존 모델 재사용'\)\]/);
assert.match(importExport, /\['replace', uiText\('[^']+', '기존 모델 덮어쓰기'\)\]/);
assert.match(importPreview, /className = 'drawio-row-policy'/);
assert.match(importPreview, /drawio-conflict-search/);
assert.match(importPreview, /drawio-conflict-filter/);
assert.match(importPreview, /drawio-conflict-reset/);
assert.match(importPreview, /필터 초기화/);
assert.match(importPreview, /drawioImporter\.filterImportConflicts/);
assert.match(importPreview, /drawioImporter\.paginateImportConflicts/);
assert.match(importPreview, /paginateImportConflicts\(filteredConflicts\(\), conflictPage, 50\)/);
assert.match(importPreview, /검색 결과 일괄 처리/);
assert.match(importPreview, /개별 설정 \(혼합\)/);
assert.match(importPreview, /modelPolicies: Object\.fromEntries\(perModelPolicies\)/);
assert.match(importExport, /decision\.modelPolicies/);
assert.match(importPreview, /새 모델 \{0\} · 기존 재사용 \{1\} · 덮어쓰기 \{2\}/);
assert.match(importPreview, /drawio-conflict-replace/);
assert.match(importPreview, /가져오기 \(\{0\}\) · 덮어쓰기 \{1\}/);
assert.match(importExport, /MODEL_FIELDS\.forEach\(field => \{ delete target\[field\]; \}\)/,
  '덮어쓰기는 기존 의미 필드를 제거한 뒤 가져온 모델로 교체해야 합니다');
assert.match(importExport, /draw\.io 병합 검증에 실패하여 변경을 되돌렸습니다/,
  '병합한 프로젝트가 구조 검증에 실패하면 원래 상태로 롤백해야 합니다');
assert.match(importExport, /hydrateView\(remapView\(view\), state\.models, modelUid\)/,
  '현재 프로젝트로 병합한 draw.io 뷰도 의미 모델에 hydrate해야 합니다');
assert.match(commandRouter, /Import draw\.io…/);
assert.match(diagramRegistry, /State Machine Diagram/);
assert.match(sampleDiagrams, /function sampleState\(/);
assert.match(sampleDiagrams, /function sampleCompositeState\(/);
assert.match(containmentLayout, /function layoutCompositeRegions\(/);
assert.match(containmentLayout, /function layoutConnectionPointRefs\(/);
assert.match(sampleDiagrams, /function sampleSubmachineStatePair\(/);
assert.match(statusBar, /접점 참조/);
assert.match(propertyPanel, /Referenced State Machine/);
assert.match(canvasInteraction, /function handleMouseDown\(/);
assert.match(canvasInteraction, /function handleMouseMove\(/);
assert.match(canvasInteraction, /function handleMouseUp\(/);
assert.match(app, /UMLCanvasInteraction\.create\(/);
assert.match(diagramRegistry, /Object Diagram/);
assert.match(sampleDiagrams, /function sampleObject\(/);
assert.match(elementFactory, /classifierModelId/);
assert.match(presentationRegistry, /Artifact Instance/);
assert.match(presentationRegistry, /Directed Link/);
assert.match(diagramRegistry, /Communication Diagram/);
assert.match(sampleDiagrams, /function sampleCommunication\(/);
assert.match(app, /commconnector/);
assert.match(presentationRegistry, /Forward Message/);
assert.match(presentationRegistry, /Reverse Message/);
assert.match(relationCreation, /connectorId/);
assert.match(relationCreation, /messageSort/);
assert.match(interactionLayout, /function communicationMessagePoints\(/);
assert.match(diagramRegistry, /Composite Structure Diagram/);
assert.match(sampleDiagrams, /function sampleCompositeStructure\(/);
assert.match(containmentLayout, /function layoutCompositePorts\(/);
assert.match(elementFactory, /providedInterfaceModelId/);
assert.match(elementFactory, /requiredInterfaceModelId/);
assert.match(elementFactory, /collaborationModelId/);
assert.match(presentationRegistry, /Role Binding/);
assert.match(relationRules, /Role Binding은 Collaboration Use에서 Part 방향으로/);
assert.match(presentationRegistry, /csconnector/);
assert.match(relationRules, /kind === 'csconnector'/);
assert.match(diagramRegistry, /Timing Diagram/);
assert.match(sampleDiagrams, /function sampleTiming\(/);
assert.match(diagramRegistry, /Package Diagram/);
assert.match(sampleDiagrams, /function samplePackage\(/);
assert.match(app, /Containment/);
assert.match(containmentLayout, /function attachToPackageContainer\(/);
assert.match(elementFactory, /visibility/);
assert.match(diagramRegistry, /Profile Diagram/);
assert.match(sampleDiagrams, /function sampleProfile\(/);
assert.match(elementFactory, /MetaClass/);
assert.match(elementFactory, /Stereotype/);
assert.match(presentationRegistry, /Extension/);
assert.match(relationRules, /kind === 'extension'/);
assert.match(relationRules, /function profileRelationError\(/);
assert.match(app, /register\([\s\S]{0,200}UMLIconScript/,
  'Stereotype 아이콘 스크립트는 모듈 등록으로 배선합니다');
assert.match(diagramRegistry, /Interaction Overview Diagram/);
assert.match(sampleDiagrams, /function sampleInteractionOverviewPair\(/);
assert.match(presentationRegistry, /Interaction \(inline\)/);
assert.match(sampleDiagrams, /Interaction \(inline\)은 프레임을 더블클릭해 편집합니다/);
assert.match(elementFactory, /interactionDiagramId/);
assert.match(elementRenderer, /function drawInteractionPreview\(/);
assert.match(diagramRegistry, /Information Flow Diagram/);
assert.match(sampleDiagrams, /function sampleInformationFlow\(/);
assert.match(sampleDiagrams, /function linkSampleInformationFlowModels\(/);
assert.match(relationRules, /function informationFlowRelationError\(/);
assert.match(relationCreation, /conveyedModelIds/);
assert.match(elementFactory, /receptions/);
assert.match(diagramRegistry, /Requirement Diagram/);
assert.match(sampleDiagrams, /function sampleRequirement\(/);
assert.match(sampleDiagrams, /function linkSampleRequirementModels\(/);
assert.match(sampleDiagrams, /function reconcileTraceabilitySampleModels\(/);
assert.match(relationRules, /function requirementRelationError\(/);
assert.match(elementFactory, /requirementType/);
assert.match(elementFactory, /requirementId/);
assert.match(elementFactory, /requirementText/);
assert.match(elementFactory, /verificationMethod/);
assert.match(app, /reqcontainment/);
assert.match(app, /derivereqt/);
assert.match(diagramRegistry, /Block Definition Diagram/);
assert.match(sampleDiagrams, /function sampleBlockDefinition\(/);
assert.match(sampleDiagrams, /function linkSampleBlockDefinitionModels\(/);
assert.match(relationRules, /function bddRelationError\(/);
assert.match(elementFactory, /flowProperties/);
assert.match(elementFactory, /constraintParameters/);
assert.match(diagramRegistry, /Internal Block Diagram/);
assert.match(sampleDiagrams, /function sampleInternalBlock\(/);
assert.match(sampleDiagrams, /function linkSampleInternalBlockModels\(/);
assert.match(relationRules, /function ibdRelationError\(/);
assert.match(relationCreation, /itemFlowModelIds/);
assert.match(diagramRegistry, /Parametric Diagram/);
assert.match(sampleDiagrams, /function sampleParametric\(/);
assert.match(sampleDiagrams, /function linkSampleParametricModels\(/);
assert.match(relationRules, /function parametricRelationError\(/);
assert.match(parametricBinding, /function syncConstraintParameters\(container\b/);
assert.match(propertyPanel, /제약 매개변수 동기화/);
assert.match(validation, /bindingTypeCompatibility/,
  '타입 호환성 판정은 validation 모듈이 제공하고 app.js는 등록만 합니다');
assert.match(propertyPanel, /Type Compatibility/);
assert.match(validation, /defaultValueUnitCompatibility/);
assert.match(propertyPanel, /Default Unit/);
assert.match(parametricBinding, /function computeRoutes\(/);
assert.match(relationRenderer, /function drawBindingConnector\(/);
assert.match(parametricBinding, /routeManualOrthogonal/);
assert.match(parametricBinding, /collectPolylineCrossings/);
assert.match(app, /polylineJumpPath/);
assert.match(parametricBinding, /relation\.jumpStyle === 'none'[\s\S]*\? \[\][\s\S]*: collectPolylineCrossings/);
assert.match(parametricBinding, /function lock\(/);
assert.match(canvasRenderer, /data-route-point/);
assert.match(propertyPanel, /Manual · Locked/);
assert.match(propertyPanel, /Line Jumps/);
assert.match(propertyPanel, /Arc Bridge/);
assert.match(selectionEditing, /function bindingConnectorStackInfo\(/);
assert.match(selectionEditing, /function reorderBindingConnector\(/);
assert.match(selectionEditing, /function canReorderSelection\(/);
assert.match(propertyPanel, /Connector Layer/);
assert.match(propertyPanel, /한 단계 앞으로/);
assert.match(propertyPanel, /맨 앞으로/);
assert.match(elementRenderer, /data-quick-edit/);
assert.match(quickEdit, /function openLifelineNameEditor\(/);
assert.match(canvasInteraction, /ev\.detail >= 2 && handleCanvasQuickEdit\(ev, p\)/);
assert.match(quickEdit, /function openRelationQuickEdit\(/);
assert.match(app, /UMLDiagramRegistry/);
assert.match(app, /UMLCanvasGeometry/);
assert.match(app, /UMLElementRenderer\.create\(/);
assert.match(app, /UMLRelationRenderer\.create\(/);
assert.match(app, /UMLPropertyPanel\.create\(/);
assert.match(app, /UMLModelExplorer\.create\(/);
assert.match(app, /UMLDiagramTabs\.create\(/);
assert.match(app, /UMLToolbox\.create\(/);
assert.match(app, /UMLViewportController\.create\(/);
assert.match(app, /UMLCommandRouter\.create\(/);
assert.match(app, /UMLQuickEdit\.create\(/);
assert.match(app, /UMLPresentationRegistry/);
assert.match(app, /UMLRelationEnd/);
assert.match(presentationRegistry, /const DASH_PATTERNS/);
assert.match(presentationRegistry, /const KIND_META/);
assert.match(presentationRegistry, /const REL_STYLE/);
assert.match(presentationRegistry, /function presentationRegistryProblems\(/);
assert.match(presentationRegistry, /function deepFreeze(?:<[^>]+>)?\(/);
assert.match(canvasGeometry, /function edgePoint\(/);
assert.match(canvasGeometry, /function borderAnchorFrac\(/);
assert.match(canvasGeometry, /function relationEndpoints\(/);
assert.match(canvasGeometry, /function distToSegment\(/);
assert.match(canvasGeometry, /function selfTransitionGeometry\(/);
assert.match(app, /return computeRelationEndpoints\(r, a, b\)/);
assert.match(relationRenderer, /function drawGenericRelation\(/);
assert.match(relationRenderer, /function drawSequenceMessage\(/);
assert.match(relationRenderer, /function drawCommunicationMessage\(/);
assert.match(relationRenderer, /function drawErdEnd\(/);
assert.match(app, /return relationRenderer\.draw\(parent, relation\)/);
assert.match(elementRenderer, /function drawStructureElement\(/);
assert.match(elementRenderer, /function drawActivityElement\(/);
assert.match(elementRenderer, /function drawStateElement\(/);
assert.match(elementRenderer, /function drawInteractionElement\(/);
assert.match(elementRenderer, /function drawRuntimeElement\(/);
assert.match(elementRenderer, /function drawClassifierElement\(/);
assert.match(elementRenderer, /data-element-family/);
assert.match(app, /return elementRenderer\.draw\(parent, element\)/);
assert.match(propertyPanel, /function renderSelectionState\(/);
assert.match(propertyPanel, /function renderElementProperties\(/);
assert.match(propertyPanel, /function renderRelationProperties\(/);
assert.match(propertyPanel, /l\.htmlFor = node\.id/,
  '속성 이름 라벨은 입력 컨트롤과 명시적으로 연결되어야 합니다');
assert.match(app, /return propertyPanel\.render\(\)/);
assert.match(diagramRegistry, /const DIAGRAM_META/);
assert.match(diagramRegistry, /const DIAGRAM_TOOLS/);
assert.match(diagramRegistry, /function diagramAllowsElementKind\(/);
assert.match(app, /function assertDiagramRegistryIntegrity\(/);
assert.match(app, /registeredElementKinds\(\)\.filter\(kind => !Object\.hasOwn\(KIND_META, kind\)\)/);
assert.match(app, /registeredRelationKinds\(\)\.filter\(kind => !Object\.hasOwn\(REL_STYLE, kind\)\)/);
assert.match(relationEnd, /RELATION_END_QUICK_EDIT_KINDS/);
assert.match(relationEnd, /function validRelationEndMultiplicity\(/);
assert.match(app, /function relationEndAt\(/);
assert.match(relationEndEditor, /function openRelationEndQuickEdit\(/);
assert.match(relationEndEditor, /dataset\.quickEdit = 'relation-end'/);
assert.match(relationEndEditor, /wrap\.clientWidth - editor\.offsetWidth/,
  '관계 끝점 편집기는 보이는 캔버스 영역 안에 배치해야 합니다');
assert.match(propertyPanel, /function relationEndPropertySection\(/);
assert.match(erdPropertySections, /function erdForeignKeyProperty\(/);
assert.match(propertyPanel, /sourceColumnName|ColumnName/);
assert.match(erdPropertySections, /foreignKeyOnDelete/);
assert.match(erdPropertySections, /foreignKeyOnUpdate/);
assert.match(erdColumnEditor, /foreignKeyColumnImpacts\(state\.models, entity\.modelId, name\)/);
assert.match(quickEdit, /renameForeignKeyColumnReferences/);
assert.match(quickEdit, /disconnectForeignKeyColumnReferences/);
assert.match(erdPropertySections, /replaceErdColumns\(entity, next\)/);
assert.match(quickEdit, /const endHit = relationEndAt\(p\);[\s\S]*const e = elementAt\(p\)/,
  '관계 끝점은 요소보다 먼저 더블클릭 판정해야 합니다');
assert.match(css, /\.relation-end-editor/);
assert.match(css, /\.drawio-import-dialog/);
assert.match(css, /\.drawio-conflict-table/);
assert.match(css, /\.drawio-row-policy/);
assert.match(css, /\.drawio-policy-summary/);
assert.match(css, /\.drawio-conflict-replace/);
assert.match(css, /\.drawio-conflict-controls/);
assert.match(css, /\.drawio-conflict-reset/);
assert.match(css, /\.drawio-conflict-pager/);
assert.match(css, /\.drawio-conflict-pager\[hidden\][^{]*\{[^}]*display: none/);
assert.match(quickEdit, /function openElementQuickEdit\(/);
assert.match(quickEdit, /function handleCanvasQuickEdit\(/);
assert.match(quickEdit, /function openSelectedQuickEdit\(/);
assert.match(commandRouter, /event\.key === 'Enter' && !event\.ctrlKey && !event\.metaKey && !event\.altKey && openSelectedQuickEdit\(\)/);
assert.match(memberListsModule, /function ensureMemberArray\(/);
for (const [kind, label] of [
  ['entity', '테이블'], ['lifeline', '라이프라인'], ['object', '인스턴스'],
  ['artifactinstance', '인스턴스'], ['componentinstance', '인스턴스'], ['nodeinstance', '인스턴스'],
  ['node', '노드'], ['component', '컴포넌트'], ['artifact', '아티팩트'],
]) {
  assert.match(selectionEditing, new RegExp(`${kind}: uiText\\('[^']+', '${label}'\\),`),
    `${kind} 복사는 원본과 독립된 의미 모델을 만들어야 합니다`);
}
for (const kind of ['class', 'interface', 'enumeration']) {
  assert.doesNotMatch(selectionEditing, new RegExp(`\\n\\s*${kind}: `),
    `${kind}는 여러 다이어그램이 공유하는 분류자이므로 복사해도 같은 모델이어야 합니다`);
}
assert.match(selectionEditing, /els\.some\(view => view\.kind in INDEPENDENT_COPY_KINDS\)/);
assert.match(selectionEditing, /state\.models\[oldId\] && \(!(?:currentClipboard|clipboard)\.cloneModels \|\| viaReference\)/,
  '독립 복사에서는 기존 modelId를 재사용하면 안 됩니다');
assert.match(selectionEditing, /targetModelId\((?:source\[field\]|reference), true\)/,
  '복사한 뷰가 가리키기만 하는 분류자 모델까지 복제하면 안 됩니다');
assert.match(selectionEditing, /copySelection\(\{ cloneModels: false \}\)/,
  '잘라내기는 이동이므로 기존 의미 모델을 유지해야 합니다');
assert.match(selectionEditing, /독립 모델로 붙여넣었습니다/);
assert.match(quickEdit, /function openMemberRowQuickEdit\(/);
assert.match(erdColumnEditor, /function openErdColumnEditor\(/);
assert.match(erdColumnEditor, /function copyErdColumn\(/);
assert.match(erdColumnEditor, /function pasteErdColumn\(/);
assert.match(erdColumnEditor, /copiedColumnValue\(erdColumnClipboard\.raw, columns\)/);
assert.match(erdPropertySections, /복사한 ERD 컬럼 붙여넣기/);
assert.match(erdColumnEditor, /컬럼 복사/);
assert.match(erdColumnEditor, /중복을 피해 컬럼/);
assert.match(erdColumnEditor, /현재 ERD 컬럼 복사/);
assert.match(erdColumnEditor, /복사한 ERD 컬럼을 아래에 붙여넣기/);
assert.match(erdColumnEditor, /event\.key === 'Delete' && !isNew/,
  '기존 컬럼 편집 중에는 보조키 없는 Delete로 컬럼을 삭제해야 합니다');
assert.match(erdColumnEditor, /key === 'c'[\s\S]*copyCurrent\(\)/,
  '컬럼 편집기는 Ctrl\/Cmd+C 컬럼 복사를 지원해야 합니다');
assert.match(erdColumnEditor, /key === 'v'[\s\S]*pasteBelow\(\)/,
  '컬럼 편집기는 Ctrl\/Cmd+V 아래 붙여넣기를 지원해야 합니다');
assert.match(erdColumnEditor, /Backspace 글자 삭제/,
  'Delete를 컬럼 삭제에 사용하므로 Backspace 글자 삭제 안내가 필요합니다');
assert.match(erdColumnEditor, /dataset\.quickEdit = 'erd-column'/);
assert.match(erdColumnEditor, /저장 후 다음 추가/);
assert.match(erdColumnEditor, /openErdColumnEditor\(entity, index \+ 1, \{ insert: true \}\)/,
  '저장 후 다음 추가는 다음 기존 컬럼 편집이 아니라 새 컬럼을 삽입해야 합니다');
assert.match(erdColumnEditor, /options\.insert === true \|\| index >= columns\.length/);
assert.match(erdPropertySections, /function erdColumnsProperty\(/);
assert.match(erdPropertySections, /\+ 컬럼 추가/);
assert.match(erdPropertySections, /아래에 컬럼 추가/);
assert.match(erdColumnEditor, /function deleteErdColumn\(/);
assert.match(erdColumnEditor, /function moveErdColumn\(/);
assert.match(erdColumnEditor, /function moveErdColumnTo\(/);
assert.match(canvasInteraction, /mode: 'erdcolumn'/,
  'ERD 컬럼 행은 테이블 이동과 분리된 드래그 모드를 사용해야 합니다');
assert.match(elementRenderer, /data-erd-column-index/,
  '캔버스 컬럼 행에는 드래그 가능한 명시적 히트 영역이 필요합니다');
assert.match(elementRenderer, /function drawErdColumnBadges\(/);
assert.match(elementRenderer, /\['PK', 'FK'\](?: as const\))?\.filter/,
  'PK와 FK가 동시에 지정되어도 두 배지를 모두 표시해야 합니다');
assert.match(erdPropertySections, /erd-column-drag-handle/);
assert.match(erdPropertySections, /dragHandle\.draggable = true/);
assert.match(app, /function erdRelationCardinality\(/);
assert.match(relationRenderer, /data-erd-cardinality/,
  'ERD 관계 끝점은 0과 1을 구분하는 카디널리티 마커를 렌더링해야 합니다');
assert.match(erdCardinality, /ERD_CARDINALITY_OPTIONS/,
  '카디널리티 선택지는 erd-cardinality 모듈이 제공합니다');
assert.match(propertyPanel, /className = 'erd-cardinality-select'/);
assert.match(relationCreation, /raw\.sourceLabel = erdDefaultCardinality/,
  '새 ERD 관계는 기본 카디널리티를 데이터에 명시해야 합니다');
assert.match(app, /const ERD_VIEW_MODES/);
assert.match(app, /function setErdMode\(/);
assert.match(erdPropertySections, /function erdDisplayModeProperty\(/);
assert.match(elementMeasure, /primaryTitle = mode === 'physical'/,
  '엔티티 제목도 물리·논리·둘 다 표시 모드를 따라야 합니다');
assert.match(elementMeasure, /secondaryTitle = mode === 'both'/);
assert.match(css, /\.erd-column-editor/);
assert.match(css, /\.erd-column-editor-sheet/);
assert.match(css, /\.erd-column-editor-quick-actions/);
assert.match(css, /\.erd-columns-property/);
assert.match(css, /\.erd-column-property-row\.copied/);
assert.match(css, /\.erd-column-property-row\.drag-target/);
assert.match(css, /\.erd-column-drag-handle/);
assert.match(css, /\.erd-column-clipboard-hint/);
assert.match(css, /\.erd-display-selector/);
assert.match(quickEdit, /function memberKindForShortcut\(/);
assert.match(quickEdit, /function openSelectedMemberQuickEdit\(/);
assert.match(quickEdit, /opts\.onAddBelow/);
assert.match(quickEdit, /opts\.onDelete/);
assert.match(quickEdit, /opts\.onMove/);
assert.match(commandRouter, /openSelectedMemberQuickEdit\(event\.shiftKey\)/);
assert.match(statusBar, /Ctrl\/Cmd\+Enter 멤버 추가/);
assert.match(quickEdit, /function prepareQuickEditExpression\(/);
assert.match(quickEdit, /parseQuickEditExpression/);
assert.match(quickEdit, /opts\.prepare/);
assert.doesNotMatch(app, /function (?:openElementQuickEdit|openRelationQuickEdit|openErdColumnEditor|handleCanvasQuickEdit)\(/,
  'QuickEdit 구현은 app.js에 중복으로 남기지 않아야 합니다');
assert.match(projectStore, /function scheduleRecoverySave\(/);
assert.match(projectStore, /persistence\.saveProject/);
assert.match(projectStore, /persistence\.loadAutosave/);
assert.match(projectStore, /function openProjectManager\(/);
assert.match(projectStore, /function openRecoveryHistory\(/);
assert.match(projectStore, /function openStoredProject\(/);
assert.match(projectStore, /function createNewProject\(/);
assert.match(projectStore, /ACTIVE_PROJECT_KEY/);
assert.match(projectStore, /expectedRevision: state\.indexedRevision/);
assert.match(commandRouter, /Project Manager…/);
assert.match(commandRouter, /Recovery History…/);
assert.match(projectStore, /visibilitychange/);
assert.match(projectStore, /pagehide/);
assert.match(statusBar, /DB 자동저장/);
assert.match(persistence, /createObjectStore\(STORE_NAME/);
assert.match(persistence, /db\.transaction\(STORE_NAME, 'readwrite'\)/);
assert.match(persistence, /PREVIOUS_KEY/);
assert.match(persistence, /saveChain/);
assert.match(persistence, /loadServerAutosave/);
assert.match(persistence, /saveServerAutosave/);
assert.match(persistence, /PROJECT_STORE/);
assert.match(persistence, /REVISION_STORE/);
assert.match(persistence, /REVISION_LIMIT = 10/);
assert.match(persistence, /function saveProject\(/);
assert.match(persistence, /function listProjects\(/);
assert.match(persistence, /function listProjectRevisions\(/);
assert.match(persistence, /revision_conflict/);
assert.match(server, /CREATE TABLE IF NOT EXISTS project_recovery/);
assert.match(server, /CREATE TABLE IF NOT EXISTS projects/);
assert.match(server, /CREATE TABLE IF NOT EXISTS project_revisions/);
assert.match(server, /REVISION_LIMIT = 10/);
assert.match(server, /class UMLStudioServer\(ThreadingHTTPServer\)/,
  '테스트가 DB와 포트를 주입할 수 있는 서버 경계가 필요합니다');
assert.match(server, /def create_server\(/);
assert.match(server, /def wal_reset_fix_available\(/,
  '수정 전 SQLite에서는 WAL 동시쓰기 경로를 피해야 합니다');
assert.match(server, /def database_journal_mode\(/);
assert.match(server, /class RequestBodyTooLarge\(ValueError\)/);
assert.match(server, /connection\.close\(\)/,
  '요청별 SQLite 연결은 트랜잭션 종료 후 명시적으로 닫아야 합니다');
assert.match(server, /def list_projects\(/);
assert.match(server, /def put_project\(/);
assert.match(server, /HTTPStatus\.CONFLICT/);
assert.match(server, /BEGIN IMMEDIATE/);
assert.match(server, /\/api\/recovery\/autosave/);
assert.match(propertyPanel, /자동 경로로 재설정/);
assert.match(app, /bindingconnector/);
assert.match(app, /constraintproperty/);
assert.match(app, /constraintparameter/);
assert.match(app, /Project format v30/);
assert.match(containmentLayout, /function layoutTimingDiagram\(/);
assert.match(statusBar, /상태·조건/);
assert.match(statusBar, /시간 구간/);
assert.match(statusBar, /시간 눈금/);
assert.match(statusBar, /시간 제약/);
assert.match(presentationRegistry, /Duration Constraint/);
assert.match(relationCreation, /timingmessage/);
assert.match(containmentLayout, /constrainedViewId/);
assert.match(selectionEditing, /constrainedViewId/,
  'Time Constraint는 붙어 있던 대상과 함께 복사·삭제되어야 합니다');
assert.match(statusBar, /복합 상태/);
assert.match(app, /trigger.*guard.*effect/);
assert.match(modelExplorer, /searchInput\.addEventListener\('input', render\)/);
assert.match(modelExplorer, /searchInput\.removeEventListener\('input', render\)/);
assert.match(modelExplorer, /function render\(\)/);
assert.match(html, /id="explorer" role="tree" aria-label="Model Explorer"/,
  'Model Explorer는 tree 역할과 이름을 노출해야 합니다');
assert.match(modelExplorer, /node\.setAttribute\('role', 'treeitem'\)/);
assert.match(modelExplorer, /aria-level/);
assert.match(modelExplorer, /aria-posinset/);
assert.match(modelExplorer, /aria-setsize/);
assert.match(modelExplorer, /aria-expanded/);
assert.match(modelExplorer, /aria-selected/);
assert.match(modelExplorer, /function annotatePositions\(/,
  '평면 DOM 트리는 형제 위치를 ARIA로 알려야 합니다');
assert.match(modelExplorer, /function handleRowKeydown\(/);
assert.match(modelExplorer, /function focusRow\(/);
assert.match(modelExplorer, /function focusMatchingRow\(/);
assert.match(modelExplorer, /function explorerHasFocus\(/,
  '다시 그린 뒤에도 트리 포커스를 유지해야 합니다');
assert.match(modelExplorer, /searchInput\.addEventListener\('keydown', handleSearchKeydown\)/);
assert.match(modelExplorer, /searchInput\.removeEventListener\('keydown', handleSearchKeydown\)/);
for (const key of ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End']) {
  assert.match(modelExplorer, new RegExp(`case '${key}'`), `트리 ${key} 이동이 필요합니다`);
}
assert.match(css, /\.ex-item:focus-visible/);
assert.match(modelExplorer, /column\.phys, column\.logical/,
  'Model Explorer는 ERD 컬럼 논리명과 물리명을 함께 검색해야 합니다');
assert.match(erdNameTools, /function previewErdNameChanges\(/);
assert.match(erdNameTools, /function applyErdNameChanges\(/);
assert.match(erdNameTools, /renameForeignKeyColumnReferences/);
assert.match(erdNameTools, /rollbackLastSnapshot\(\)/,
  '일괄 변환 적용 실패는 Undo 스냅샷까지 되돌려야 합니다');
assert.match(erdNameTools, /aria-modal/);
assert.match(erdNameTools, /modalFocus\.activate/);
assert.doesNotMatch(erdNameTools, /event\.key === 'Escape'/,
  'ERD 이름 모달은 공통 포커스 관리자의 Esc 처리를 중복 구현하면 안 됩니다');
assert.match(app, /UMLErdNameTools\.create\(provide\(UMLErdNameTools\)\)/);
assert.doesNotMatch(app, /function (?:previewErdNameChanges|applyErdNameChanges)\(/,
  'ERD 이름 변환 구현은 app.js에 중복으로 남기지 않아야 합니다');
assert.doesNotMatch(app, /function renderExplorer\(/,
  'Model Explorer 구현은 app.js에 중복으로 남기지 않아야 합니다');
assert.match(commandRouter, /Ctrl\+Alt\+M/);
assert.match(diagramTabs, /function addDiagram\(/);
assert.match(diagramTabs, /function switchDiagram\(/);
assert.match(toolbox, /function toolIcon\(/);
assert.match(toolbox, /function render\(\)/);
assert.match(toolbox, /document\.createElement\('button'\)/,
  '도구 팔레트는 키보드 기본 동작이 있는 실제 button을 사용해야 합니다');
assert.match(toolbox, /aria-pressed/);
assert.doesNotMatch(toolbox, /tool\.addEventListener\('mousedown'/,
  '팔레트 선택을 포인터 전용 mousedown에 묶으면 안 됩니다');
assert.match(diagramTabs, /tabs\.setAttribute\('role', 'tablist'\)/);
assert.match(diagramTabs, /tab\.setAttribute\('role', 'tab'\)/);
assert.match(diagramTabs, /aria-selected/);
assert.match(diagramTabs, /event\.key === 'ArrowLeft'/);
assert.match(diagramTabs, /event\.key === 'ArrowRight'/);
assert.match(diagramTabs, /event\.key === 'F2'/);
assert.match(diagramTabs, /aria-keyshortcuts/);
assert.match(diagramTabs, /document\.createElement\('button'\)/,
  '탭·닫기·추가 동작은 실제 button을 사용해야 합니다');
assert.match(html, /id="tabs" role="tablist"/);
assert.match(html, /id="canvas-wrap" role="tabpanel"/);
assert.match(viewportController, /function attach\(\)/);
assert.match(viewportController, /function detach\(\)/);
assert.match(commandRouter, /function handleKeydown\(/);
assert.match(commandRouter, /function openMenu\(/);
assert.match(html, /<div class="menu-list" role="menubar"/,
  '메뉴 트리거는 menubar 역할의 컨테이너에 모여 있어야 합니다');
assert.match(html, /data-menu="file" role="menuitem" aria-haspopup="true" aria-expanded="false"/,
  '메뉴 트리거는 menuitem 의미와 확장 상태를 노출해야 합니다');
assert.doesNotMatch(html, /class="menu" data-menu="[a-z]+" role="button"/,
  '메뉴바 항목은 일반 button이 아니라 menuitem이어야 합니다');
assert.match(commandRouter, /trigger\.setAttribute\('role', 'menuitem'\)/);
assert.match(commandRouter, /trigger\.setAttribute\('aria-expanded', 'true'\)/);
assert.match(commandRouter, /popup\.setAttribute\('role', 'menu'\)/);
assert.match(commandRouter, /separator\.setAttribute\('role', 'separator'\)/);
assert.match(commandRouter, /'menuitemcheckbox'/);
assert.match(commandRouter, /aria-checked/);
assert.match(commandRouter, /function handleMenuKeydown\(/);
assert.match(commandRouter, /function handleTriggerKeydown\(/);
assert.match(commandRouter, /function setTabStop\(/,
  '메뉴바는 roving tabindex로 탭 정지점을 하나만 노출해야 합니다');
assert.match(commandRouter, /function focusMatchingItem\(/);
assert.match(commandRouter, /aria-disabled/);
assert.doesNotMatch(commandRouter, /item\.disabled = /,
  '사용할 수 없는 메뉴 항목도 키보드로 발견할 수 있도록 aria-disabled로 표시해야 합니다');
assert.match(css, /\.app-menu-item\[aria-disabled="true"\]/);
for (const key of ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End']) {
  assert.match(commandRouter, new RegExp(`case '${key}'`), `메뉴 ${key} 이동이 필요합니다`);
}
assert.match(css, /#menubar \.menu-list \{/);
assert.match(html, /<div id="toolbar" role="toolbar" aria-label="Main toolbar"/,
  '툴바는 toolbar 역할과 이름을 노출해야 합니다');
assert.match(html, /<span class="sep" role="separator" aria-orientation="vertical">/);
assert.match(html, /data-cmd="zoomout"[^>]*aria-label="Zoom Out"/,
  '기호만 있는 버튼은 읽을 수 있는 이름이 필요합니다');
assert.match(html, /data-cmd="zoomin"[^>]*aria-label="Zoom In"/);
assert.match(commandRouter, /function toolbarButtons\(/);
assert.match(commandRouter, /function syncToolbarTabStops\(/,
  '툴바도 roving tabindex로 탭 정지점을 하나만 노출해야 합니다');
assert.match(commandRouter, /function handleToolbarKeydown\(/);
assert.match(commandRouter, /function handleToolbarMutations\(/,
  '다시 그려진 툴바 버튼의 포커스와 탭 정지점을 되살려야 합니다');
assert.match(commandRouter, /new MutationObserver\(handleToolbarMutations\)/);
assert.match(commandRouter, /toolbarObserver\?\.disconnect\(\)/);
assert.match(commandRouter, /toolbar\.addEventListener\('focusin', handleToolbarFocusIn\)/);
assert.match(commandRouter, /toolbar\.removeEventListener\('focusin', handleToolbarFocusIn\)/);
assert.ok(REQUIRED_TOOLBAR_KEYS.every(key => commandRouter.includes(`case '${key}'`)),
  '툴바 방향키 이동이 필요합니다');
assert.match(app, /MutationObserver,/, 'MutationObserver도 주입하는 호스트 객체여야 합니다');
assert.match(canvasRenderer, /holder\.setAttribute\('role', 'group'\)/);
assert.match(css, /#toolbar button:focus-visible/);

/* ── 속성 패널 접근성 ──────────────────────────────────────── */
assert.match(html, /id="props-panel" role="region" aria-labelledby="props-panel-title"/,
  '속성 패널은 제목으로 이름 붙인 구역이어야 합니다');
assert.match(html, /id="props-panel-title" role="heading" aria-level="2"/);
assert.match(html, /id="explorer-panel-title" role="heading" aria-level="2"/);
assert.match(propertyPanel, /function sectionHeading\(/);
assert.match(propertyPanel, /title\.setAttribute\('role', 'heading'\)/);
assert.match(erdPropertySections, /section\.setAttribute\('aria-labelledby', title\.id\)/);
assert.match(propertyPanel, /box\.setAttribute\('aria-labelledby', title\.id\)/,
  '관계의 출발·도착 끝점은 같은 라벨을 반복하므로 각자 이름이 필요합니다');
assert.match(propertyPanel, /className = 'relation-end-prop-group'/);
assert.match(erdPropertySections, /list\.setAttribute\('role', 'list'\)/);
assert.match(erdPropertySections, /row\.setAttribute\('role', 'listitem'\)/);
assert.match(propertyPanel, /function capturePropertyFocus\(/,
  '패널을 다시 그려도 편집 중이던 컨트롤의 포커스를 잃으면 안 됩니다');
assert.match(propertyPanel, /function restorePropertyFocus\(/);
assert.match(propertyPanel, /function selectionFingerprint\(/);
assert.match(propertyPanel, /setSelectionRange\(captured\.start, captured\.end \?\? captured\.start\)/);
assert.match(propertyPanel, /l\.htmlFor = node\.id/,
  '생성된 입력은 label과 프로그래밍적으로 연결해야 합니다');
assert.doesNotMatch(propertyPanel, /end cardinality|end ERD column|foreign key owner end/,
  'propRow가 붙인 보이는 라벨을 aria-label로 덮으면 음성 입력이 라벨을 부를 수 없습니다');
assert.doesNotMatch(quickEdit, /end cardinality|end multiplicity|end navigability|end aggregation|end qualifiers/,
  'QuickEdit도 보이는 라벨을 영어 aria-label로 덮으면 안 됩니다');
assert.match(relationEndEditor, /control\.setAttribute\('aria-labelledby', caption\.id\)/,
  '행 전체가 label이므로 컨트롤 이름은 캡션만 가리켜야 합니다');
assert.match(erdColumnEditor, /input\.setAttribute\('aria-labelledby', label\.id\)/);
assert.match(relationEndEditor, /control\.setAttribute\('aria-describedby', small\.id\)/,
  '설명 문구는 이름이 아니라 설명으로 전달해야 합니다');
assert.match(erdColumnEditor, /input\.setAttribute\('aria-describedby', small\.id\)/);
assert.match(relationEndEditor, /editor\.setAttribute\('aria-labelledby', title\.id\)/,
  'QuickEdit 대화상자는 화면에 보이는 제목으로 이름 붙여야 합니다');

/* ── 캔버스 키보드 탐색 ────────────────────────────────────── */
assert.match(canvasKeyboard, /root\.UMLCanvasKeyboard = api/);
assert.match(canvasKeyboard, /function navigableItems\(/);
assert.match(canvasKeyboard, /function reveal\(/,
  '키보드로 고른 요소는 화면 안으로 스크롤해야 합니다');
assert.match(canvasKeyboard, /event\.key !== 'Tab'/);
assert.match(canvasKeyboard, /if \(next < 0 \|\| next >= items\.length\)/);
assert.doesNotMatch(canvasKeyboard, /clearSelection\(\);\s*\n\s*flashStatus\([^)]*\);\s*\n\s*return true;/,
  '양 끝에서는 Tab을 막지 않아야 캔버스가 키보드 함정이 되지 않습니다');
assert.match(canvasKeyboard, /function attach\(\)/);
assert.match(canvasKeyboard, /function detach\(\)/);
assert.match(canvasKeyboard, /wrap\.addEventListener\('keydown', handleKeydown\)/);
assert.match(canvasKeyboard, /wrap\.removeEventListener\('keydown', handleKeydown\)/);
assert.match(app, /UMLCanvasKeyboard\.create\(provide\(UMLCanvasKeyboard\)\)/);
assert.match(app, /canvasKeyboard\.attach\(\)/);
assert.doesNotMatch(canvasInteraction, /function handleKeydown\(/,
  '캔버스 키보드 탐색은 canvas-keyboard.js에만 있어야 합니다');
assert.doesNotMatch(app, /function (?:addDiagram|switchDiagram|renderTabs|toolIcon|renderToolbox|fitToWindow|renderMinimap|openAppMenu|closeAppMenu)\(/,
  '분리한 탭·도구상자·뷰포트·메뉴 구현은 app.js에 중복으로 남기지 않아야 합니다');

/* ── Sample Diagrams 모듈 ───────────────────────────────────── */
assert.match(sampleDiagrams, /function sampleProject\(/);
assert.match(sampleDiagrams, /function sampleEmpty\(/);
assert.match(sampleDiagrams, /function linkSampleBlockDefinitionModels\(/);
assert.match(sampleDiagrams, /function reconcileTraceabilitySampleModels\(/);
assert.match(sampleDiagrams, /function upgradeSampleCommunicationLayout\(/);
assert.match(sampleDiagrams, /Sample Diagrams 의존성이 없습니다/);
assert.match(sampleDiagrams, /root\.UMLSampleDiagrams = api/);
assert.match(sampleDiagrams, /return Object\.freeze\(\{ REQUIRED_FUNCTIONS, REQUIRED_VALUES, create \}\)/);
/* 샘플 데이터 ID 연결은 그대로 유지되어야 한다 */
assert.match(sampleDiagrams, /Rendering System Block Definition/);
assert.match(sampleDiagrams, /Rendering System Internal Structure/);
assert.match(sampleDiagrams, /Render Budget Parametric Analysis/);
assert.match(sampleDiagrams, /Rendering Information Flow/);
assert.match(sampleDiagrams, /Rendering Requirements/);
assert.match(sampleDiagrams, /Runtime Object Snapshot/);
assert.match(sampleDiagrams, /Diagram Rendering Communication/);
assert.match(sampleDiagrams, /Frame Rendering Timing/);
assert.match(sampleDiagrams, /Rendering Composite Structure/);
assert.match(sampleDiagrams, /submachineDiagramId: paymentId/);
assert.match(sampleDiagrams, /interactionDiagramId: inlineSequence\.id/);
assert.match(app, /UMLSampleDiagrams\.create\(/);
assert.match(app, /register\(sampleDiagrams, \{ sampleDiagrams \}\)/);
assert.doesNotMatch(app, /function sample[A-Z]\w*\(/,
  '샘플 다이어그램 구현은 app.js에 중복으로 남기지 않아야 합니다');
assert.doesNotMatch(app, /function (?:linkSample|upgradeSample|reconcileTraceability)\w*\(/,
  '샘플 모델 연결·보정 구현은 app.js에 중복으로 남기지 않아야 합니다');
assert.doesNotMatch(app, /^const N[ER] = /m,
  '샘플 뷰 생성 헬퍼는 app.js에 중복으로 남기지 않아야 합니다');

/* ── Import/Export 모듈 ─────────────────────────────────────── */
assert.match(importExport, /function attach\(\)/);
assert.match(importExport, /function detach\(\)/);
assert.match(diagramExport, /function exportSvg\(/);
assert.match(diagramExport, /function exportPngActive\(/);
assert.match(diagramExport, /function exportErdDdlFile\(/);
assert.match(diagramExport, /function openErdDdlExportDialog\(/);
assert.match(importExport, /function importSupportedFile\(/);
assert.match(importExport, /function importDrawioProjectFile\(/);
assert.match(importExport, /function importProjectFile\(/);
assert.match(importExport, /function importedProjectWithFreshIds\(/);
assert.match(importPreview, /function openDrawioImportPreview\(/);
assert.match(importExport, /프로젝트 가져오기 의존성이 없습니다/);
assert.match(importExport, /root\.UMLProjectImport = api/);
assert.match(diagramExport, /exporters\.exportMermaid\(/);
assert.match(diagramExport, /exporters\.exportDrawio\(/);
assert.match(importExport, /drawioImporter\.importDrawio\(/);
assert.match(importExport, /ddlImporter\.parseDdl\(/);
assert.match(diagramExport, /Mermaid 전용 다이어그램 문법으로 내보냈습니다/);
assert.match(diagramExport, /Mermaid flowchart 문법으로 내보냈습니다/);
assert.match(diagramExport, /draw\.io에서 편집 가능한 XML로 내보냈습니다/);
assert.match(diagramExport, /CREATE TABLE DDL로 내보냈습니다/);
assert.match(diagramExport, /FK 대상 컬럼이 아직 연결되지 않은 FK 플래그/);
assert.match(diagramExport, /내보낼 요소가 없습니다\./);
assert.match(importExport, /프로젝트 파일은 10MB 이하만 열 수 있습니다\./);
assert.match(importExport, /현재 프로젝트 가져오기는 \.drawio 또는 \.xml 파일만 지원합니다\./);
assert.match(importPreview, /draw\.io Import Preview/);
assert.match(importExport, /새 모델로 가져오기/);
assert.match(importExport, /기존 모델 재사용/);
assert.match(importExport, /기존 모델 덮어쓰기/);
assert.match(importPreview, /drawio-conflict-search/);
assert.match(importPreview, /drawio-conflict-filter/);
assert.match(importPreview, /drawio-conflict-policy/);
assert.match(app, /UMLProjectImport\.create\(/);
assert.match(app, /UMLDiagramExport\.create\(provide\(UMLDiagramExport\)\)/,
  '내보내기 모듈은 앱 레벨 의존성만 쓰므로 app.js가 직접 만듭니다');
assert.match(app, /importExport\.attach\(\)/);
assert.match(app, /exportsvg: \(\) => diagramExport\.exportSvgFile\(\)/);
assert.match(app, /exportpng: \(\) => diagramExport\.exportPngFile\(\)/);
assert.match(app, /exportmermaid: \(\) => diagramExport\.exportMermaidFile\(\)/);
assert.match(app, /exportdrawio: \(\) => diagramExport\.exportDrawioFile\(\)/);
assert.match(app, /exportddl: \(\) => diagramExport\.openErdDdlExportDialog\(\)/);
assert.match(app, /exportall: \(\) => diagramExport\.exportAllPngFiles\(\)/);
assert.match(app, /open: \(\) => importExport\.openProjectFileDialog\(\)/);
assert.match(app, /importdrawio: \(\) => importExport\.openDrawioAppendDialog\(\)/);
assert.match(app, /importddl: \(\) => importExport\.openDdlAppendDialog\(\)/);
assert.match(historyController, /function rollbackLastSnapshot\(/);
assert.doesNotMatch(app, /function (?:exportSvg|exportPngActive|importSupportedFile|importProjectFile|importDrawioProjectFile|importedProjectWithFreshIds|openDrawioImportPreview|resolveImportedDrawioType|importedDiagramName|appendDrawioPolicyOptions|download)\(/,
  '가져오기·내보내기 구현은 app.js에 중복으로 남기지 않아야 합니다');
assert.doesNotMatch(app, /fileInput\.addEventListener/,
  '파일 입력 이벤트는 Import/Export 모듈이 소유해야 합니다');
assert.doesNotMatch(app, /UMLDrawioImporter\.(?:importDrawio|analyzeImport|filterImportConflicts|paginateImportConflicts|inferDiagramType)\b/,
  'draw.io 가져오기 호출은 app.js에 중복으로 남기지 않아야 합니다');
assert.doesNotMatch(app, /UMLExporters\.export(?:Mermaid|Drawio)\b/,
  'Exporter 호출은 app.js에 중복으로 남기지 않아야 합니다');

/* ── ERD DDL Exporter ──────────────────────────────────────── */
assert.match(exporters, /const ERD_DDL_DIALECTS(?:[^=]+)?= Object\.freeze\(\{/);
assert.match(exporters, /function exportErdDdl\(/);
assert.match(exporters, /FOREIGN KEY/);
assert.match(exporters, /function erdDdlType\(/);
assert.match(exporters, /PRIMARY KEY/);
assert.match(exporters, /FK flags are not emitted as constraints until target columns are linked/);
assert.match(commandRouter, /Export ERD DDL/);
assert.match(commandRouter, /Import DDL/);
assert.match(ddlImporter, /function tokenize\(/);
assert.match(ddlImporter, /function parseDdl\(/);
assert.match(ddlImporter, /root\.UMLDdlImporter = api/);
assert.match(erdSchema, /root\.UMLErdSchema = api/);
assert.match(erdSchema, /function safeSqlFragment\(/);
assert.match(erdSchema, /function validateEntitySchema\(/);
assert.match(erdPropertySections, /DDL 제약조건과 인덱스/);
assert.match(erdColumnEditor, /\['PK', 'FK', 'UQ', 'NN'\]/);
assert.doesNotMatch(ddlImporter, /\beval\s*\(|new Function\s*\(/,
  'DDL Importer는 SQL을 코드로 실행하면 안 됩니다');
assert.doesNotMatch(erdSchema, /\beval\s*\(|new Function\s*\(/,
  'ERD Schema는 SQL 표현식을 코드로 실행하면 안 됩니다');
/* ── Project Store 모듈 ─────────────────────────────────────── */
assert.match(projectStore, /function attach\(\)/);
assert.match(projectStore, /function detach\(\)/);
assert.match(projectStore, /function saveRecoveryCopy\(/);
assert.match(projectStore, /function writeLocalRecovery\(/);
assert.match(projectStore, /function rememberActiveProject\(/);
assert.match(projectStore, /function listStoredProjects\(/);
assert.match(projectStore, /function newestProjectRecord\(/);
assert.match(projectStore, /function projectRecords\(/);
assert.match(projectStore, /function projectModal\(/);
assert.match(projectStore, /function projectActionButton\(/);
assert.match(projectStore, /function openProjectRenameDialog\(/);
assert.match(projectStore, /function restoreOnStartup\(/);
assert.match(projectStore, /Project Store 의존성이 없습니다/);
assert.match(projectStore, /root\.UMLProjectStore = api/);
assert.match(projectStore, /const PROJECT_VERSION = 30/,
  '저장 포맷 버전은 30을 유지해야 합니다');
assert.match(projectStore, /const RECOVERY_STORAGE_KEY = 'uml-studio-v7'/);
assert.match(projectStore, /const RECOVERY_META_KEY = 'uml-studio-v7-meta'/);
assert.match(projectStore, /const ACTIVE_PROJECT_KEY = 'uml-studio-v7-active-project'/);
assert.match(projectStore, /AUTOSAVE_HEARTBEAT_MS = 10000/);
assert.match(projectStore, /revision_conflict/);
assert.match(projectStore, /다른 탭에서 이 프로젝트가 변경되었습니다/);
assert.match(projectStore, /IndexedDB 저장 실패 · 비상 복구본은 브라우저 저장소에 보관했습니다/);
assert.match(projectStore, /자동 복구 저장 실패: SQLite와 IndexedDB를 모두 사용할 수 없습니다/);
assert.match(projectStore, /새 프로젝트를 만들까요\?/);
assert.match(projectStore, /기존 단일 자동저장 프로젝트를 새 프로젝트 저장소로 이전했습니다/);
assert.match(projectStore, /프로젝트를 복원했습니다/);
assert.match(projectStore, /최근 10개 스냅샷을 보관합니다/);
assert.match(projectStore, /SQLite와 브라우저 DB의 프로젝트를 통합 표시합니다/);
assert.match(projectStore, /UML Studio Samples/);
assert.match(app, /UMLProjectStore\.create\(/);
assert.match(app, /projectStore\.attach\(\)/);
assert.match(app, /projectStore\.restoreOnStartup\(\)/);
assert.match(app, /projectStore\.markRecoveryDirty\(\)/);
assert.match(historyController, /function resetHistory\(/);
assert.match(app, /persistence: UMLPersistence/);
assert.doesNotMatch(app, /function (?:saveRecoveryCopy|scheduleRecoverySave|writeLocalRecovery|rememberActiveProject|listStoredProjects|newestProjectRecord|projectRecords|openStoredProject|createNewProject|projectModal|projectActionButton|openProjectRenameDialog|openProjectManager|openRecoveryHistory)\(/,
  'Project Store 구현은 app.js에 중복으로 남기지 않아야 합니다');
assert.doesNotMatch(app, /\bUMLPersistence\.\w+\(/,
  'Persistence 호출은 Project Store 모듈이 소유해야 합니다');
assert.doesNotMatch(app, /\b(?:RECOVERY_STORAGE_KEY|RECOVERY_META_KEY|ACTIVE_PROJECT_KEY|recoveryDirty|autosaveTimer|autosaveErrorShown)\b/,
  '자동저장 내부 상태는 app.js에 중복으로 남기지 않아야 합니다');
assert.doesNotMatch(app, /addEventListener\('(?:pagehide|beforeunload|visibilitychange)'/,
  '자동저장 생명주기 이벤트는 Project Store 모듈이 소유해야 합니다');

/* ── Project Document 모듈 ──────────────────────────────────── */
assert.match(projectDocument, /const PROJECT_VERSION = 30/);
assert.match(projectDocument, /function projectData\(/);
assert.match(projectDocument, /function captureState\(/);
assert.match(projectDocument, /function restoreState\(/);
assert.match(projectDocument, /function serialize\(/);
assert.match(projectDocument, /function load\(/);
assert.match(projectDocument, /sourceVersion < 28/);
assert.match(projectDocument, /sourceVersion === 9/);
assert.match(projectDocument, /Project Document 의존성이 없습니다/);
assert.match(projectDocument, /root\.UMLProjectDocument = api/);
assert.match(app, /UMLProjectDocument\.create\(provide\(UMLProjectDocument\)\)/);
assert.match(app, /register\(projectDocument\)/);
assert.match(app, /hydrateCurrentProject, markDirty, markSaved,/);
assert.match(app, /syncRelationModel, syncAllRelationModels,/);
assert.match(app, /register\(sampleDiagrams, \{ sampleDiagrams \}\)/);
assert.doesNotMatch(app, /function (?:projectData|captureHistoryState|restoreHistoryState|serialize|load)\(/,
  '문서 직렬화·로드·마이그레이션 구현은 app.js에 중복으로 남기지 않아야 합니다');
assert.doesNotMatch(app, /v(?:7 single-diagram|8 → v9|9 → v10|27 → v28)/,
  '프로젝트 버전 마이그레이션은 Project Document 모듈이 소유해야 합니다');

/* ── History Controller 모듈 ────────────────────────────────── */
assert.match(historyController, /const MAX_HISTORY_ENTRIES = 100/);
assert.match(historyController, /function snapshot\(/);
assert.match(historyController, /function undo\(/);
assert.match(historyController, /function redo\(/);
assert.match(historyController, /History Controller 의존성이 없습니다/);
assert.match(historyController, /root\.UMLHistoryController = api/);
assert.match(historyController, /return Object\.freeze\(\{[\s\S]*snapshot,[\s\S]*undo,/);
assert.match(app, /UMLHistoryController\.create\(provide\(UMLHistoryController\)\)/);
assert.match(app, /register\(historyController\)/);
assert.match(projectDocument, /captureState,[\s\S]*restoreState,/);
assert.doesNotMatch(app, /can(?:Undo|Redo): \(\) => historyController/,
  'History Controller API는 임시 지연 래퍼 없이 직접 등록해야 합니다');
assert.doesNotMatch(app, /\b(?:undoStack|redoStack|stateJson)\b/,
  'Undo/Redo 스택은 app.js에 중복으로 남기지 않아야 합니다');
assert.doesNotMatch(app, /function (?:snapshot|undo|redo|resetHistory|rollbackLastSnapshot)\(/,
  'Undo/Redo 구현은 History Controller 모듈이 소유해야 합니다');

/* ── Element Factory 모듈 ───────────────────────────────────── */
assert.match(elementFactory, /const NAME_PREFIXES(?::[^=\n]+)? = Object\.freeze\(/);
assert.match(elementFactory, /function nextName\(/);
assert.match(elementFactory, /function createElement\(/);
assert.match(elementFactory, /Element Factory 의존성이 없습니다/);
assert.match(elementFactory, /root\.UMLElementFactory = api/);
assert.match(elementFactory, /return Object\.freeze\(\{[\s\S]*createElement,[\s\S]*nextName,/);
assert.match(app, /UMLElementFactory\.create\(provide\(UMLElementFactory\)\)/);
assert.match(app, /register\(elementFactory\)/);
assert.doesNotMatch(app, /function (?:nextName|createElement)\(/,
  '요소 이름·초기 데이터 생성 구현은 app.js에 중복으로 남기지 않아야 합니다');

/* ── Element Measure 모듈 ───────────────────────────────────── */
assert.match(elementMeasure, /function measure\(e: DiagramElement\)/);
assert.match(elementMeasure, /function normalizeSize\(e: DiagramElement\)/);
assert.match(elementMeasure, /function bddCompartments\(/);
assert.match(elementMeasure, /function wrapRequirementText\(/);
assert.match(elementMeasure, /function stateBehaviorLines\(/);
assert.match(elementMeasure, /function instanceClassifier\(/);
assert.match(elementMeasure, /function referencedInteractionName\(/);
assert.match(elementMeasure, /function referencedStateMachineName\(/);
assert.match(elementMeasure, /function parseConstraintParameterDefinition\(/);
assert.match(elementMeasure, /function profileElementTitle\(/);
assert.match(elementMeasure, /function packageElementTitle\(/);
assert.match(elementMeasure, /const erdMode = \(\) => dg\(\)\.erdMode \|\| 'physical'/);
assert.match(elementMeasure, /Element Measure 의존성이 없습니다/);
assert.match(elementMeasure, /root\.UMLElementMeasure = api/);
assert.match(elementMeasure, /VISIBILITY_SYMBOLS = Object\.freeze\(\{ public: '\+', protected: '#', private: '-', package: '~' \}\)/);
/* 측정값이 바뀌면 캔버스가 달라지므로 핵심 치수는 계약으로 고정한다 */
assert.match(elementMeasure, /case 'timingstate':\s*\n\s*return \{ minW: 760, minH: TIMING_ROW_HEIGHT \}/);
assert.match(elementMeasure, /parseIconScript\(e\.iconContent \|\| ''\)/);
assert.match(elementMeasure, /const headH = hasIcon \? 64 :/);
assert.match(elementMeasure, /e\._m = m;/);
assert.match(app, /UMLElementMeasure\.create\(/);
assert.match(app, /\} = elementMeasure;/);
assert.match(app, /TIMING_ROW_HEIGHT,/);
assert.doesNotMatch(app, /function (?:measure|normalizeSize|bddCompartments|wrapRequirementText|stateBehaviorLines|instanceClassifier|instanceTitle|lifelineTitle|typedElementTitle|ibdFrameTitle|parametricFrameTitle|constraintPropertyEquations|parseConstraintParameterDefinition|collaborationUseTitle|visibilitySymbol|packageElementTitle|profileElementTitle|columnDisplay|entityTitle|referencedInteraction|referencedInteractionName|referencedStateMachineName)\(/,
  '요소 측정·타이틀 구현은 app.js에 중복으로 남기지 않아야 합니다');
assert.doesNotMatch(app, /\bconst erdMode = /,
  'ERD 표시 모드 조회는 Element Measure 모듈이 소유해야 합니다');
assert.doesNotMatch(app, /\bminW:/, '최소 크기 계산은 app.js에 남기지 않아야 합니다');
/* 측정을 소비하는 쪽은 계속 app.js가 연결한다 */
assert.match(app, /function setErdMode\(/);
assert.match(app, /^  syncConstraintParameters,$/m,
  'Constraint Parameter 동기화는 Parametric Binding 모듈에서 연결해야 합니다');

/* ── Member Lists 모듈 ─────────────────────────────────────── */
assert.match(memberListsModule, /function ensureMemberArray\(element: MemberArrays, field: MemberField\)/);
assert.match(memberListsModule, /function memberLists\(element: MeasuredElement\)/);
assert.match(memberListsModule, /function memberListByKind\(element: MeasuredElement, kind: MemberKind\)/);
assert.match(memberListsModule, /const MEMBER_FIELDS = Object\.freeze\(\{/);
assert.match(memberListsModule, /root\.UMLMemberLists = api/);
assert.match(memberListsModule, /return Object\.freeze\(\{ ensureMemberArray, memberListByKind, memberLists \}\)/);
assert.match(app, /UMLMemberLists\.create\(\)/);
assert.match(app, /register\(memberListsController\);/);
assert.doesNotMatch(app, /function (?:ensureMemberArray|memberLists|memberListByKind)\(/,
  '멤버 배열·행 영역 계산 구현은 app.js에 중복으로 남기지 않아야 합니다');

/* ── Status Bar 모듈 ───────────────────────────────────────── */
assert.match(statusBar, /root\.UMLStatusBar = api/);
assert.match(statusBar, /const FLASH_DURATION_MS = 1800;/);
assert.match(statusBar, /function toolInstruction\(\)/);
assert.match(statusBar, /function autosaveStatusText\(\)/);
assert.match(statusBar, /function flash\(message(?:: string)?\)/);
assert.match(statusBar, /if \(flashTimer !== null\) clearTimeout\(flashTimer\);/,
  '연속 알림은 이전 복원 타이머를 취소해야 합니다');
assert.match(statusBar, /return Object\.freeze\(\{ clearFlash, flash, render \}\)/);
assert.match(statusBar, /Status Bar 의존성이 없습니다/);
assert.match(app, /UMLStatusBar\.create\(provide\(UMLStatusBar\)\)/);
assert.match(app, /const \{ flash: flashStatus, render: renderStatus \} = statusBar;/);
assert.match(app, /register\(\{ flashStatus, renderStatus, now: \(\) => Date\.now\(\) \}\);/);
assert.doesNotMatch(app, /function (?:flashStatus|renderStatus)\(/,
  '상태 표시 구현은 app.js에 중복으로 남기지 않아야 합니다');
assert.match(html, /id="status-left" role="status" aria-live="polite" aria-atomic="true"/,
  '일시 상태 안내는 보조기기에 정중한 라이브 영역으로 전달해야 합니다');

/* ── Modal Focus 모듈 ──────────────────────────────────────── */
assert.match(modalFocus, /root\.UMLModalFocus = api/);
assert.match(modalFocus, /function handleKeydown\(event(?:: KeyboardEvent)?\)/);
assert.match(modalFocus, /event\.key === 'Escape'/);
assert.match(modalFocus, /event\.key !== 'Tab'/);
assert.match(modalFocus, /appRoot\.inert = true/);
assert.match(modalFocus, /entry\.overlay\.inert = !isTop/);
assert.match(modalFocus, /aria-hidden/);
assert.match(modalFocus, /entry\.opener.*focus/);
assert.match(app, /UMLModalFocus\.create\(provide\(UMLModalFocus\)\)/);
assert.match(app, /closeTopModal: \(\) => modalFocus\.closeTop\(\)/);
assert.match(projectStore, /modalFocus\.activate/);
assert.match(modelRepository, /modalFocus\.activate/);
assert.match(importPreview, /modal\.setRequestCloseHandler/);
assert.doesNotMatch(commandRouter, /querySelector\('\.modal-overlay'\)/,
  'Esc는 모달 DOM을 직접 제거하지 않고 공통 수명주기를 거쳐야 합니다');

/* ── Containment Layout 모듈 ────────────────────────────────── */
assert.match(containmentLayout, /function childViews\(/);
assert.match(containmentLayout, /function descendantViews\(/);
assert.match(containmentLayout, /function containmentOrder\(/);
assert.match(containmentLayout, /function containmentDepth\(/);
assert.match(containmentLayout, /function rootViews\(/);
assert.match(containmentLayout, /function moveViewTree\(/);
assert.match(containmentLayout, /function isPortOwner\(/);
assert.match(containmentLayout, /function attachToContainingRegion\(/);
assert.match(containmentLayout, /function attachToActivityContainer\(/);
assert.match(containmentLayout, /function attachToInternalBlockContainer\(/);
assert.match(containmentLayout, /function attachToParametricContainer\(/);
assert.match(containmentLayout, /function attachPartToCompositeContainer\(/);
assert.match(containmentLayout, /function layoutActivityAttachments\(/);
assert.match(containmentLayout, /function layoutParametricParameters\(/);
assert.match(containmentLayout, /function timingConstraintAnchor\(/);
assert.match(containmentLayout, /Containment Layout 의존성이 없습니다/);
assert.match(containmentLayout, /root\.UMLContainmentLayout = api/);
assert.match(containmentLayout, /const regionLayoutCache = new WeakMap(?:<[^>]+>)?\(\)/,
  'Region 이전 크기는 모듈 내부 캐시로만 추적해야 합니다');
/* 레이아웃 상수가 바뀌면 캔버스 배치가 달라지므로 계약으로 고정한다 */
assert.match(containmentLayout, /lifeline\.h = Math\.max\(lifeline\.h, 44 \+ Math\.max\(1, states\.length\) \* TIMING_ROW_HEIGHT\)/);
assert.match(containmentLayout, /lifeline\.x \+ TIMING_LABEL_WIDTH \+ 8/);
assert.match(containmentLayout, /owner\.kind === 'ibdframe' \? 44 : 12/);
assert.match(containmentLayout, /owner\._m && owner\._m\.contentTop\) \|\| 28/);
assert.match(containmentLayout, /dg\(\)\.type === 'sequence' && view\.kind === 'lifeline'/,
  'Sequence 라이프라인은 세로로 움직이지 않아야 합니다');
assert.match(app, /UMLContainmentLayout\.create\(/);
assert.match(app, /\} = containmentLayout;/);
assert.ok(app.indexOf('UMLContainmentLayout.create(') < app.indexOf('UMLElementMeasure.create('),
  'Containment Layout은 childViews를 제공하므로 Element Measure보다 먼저 만들어야 합니다');
assert.doesNotMatch(app, /function (?:childViews|descendantViews|containmentDepth|containmentOrder|rootViews|regionAtPoint|compositeAtPoint|layoutCompositeRegions|layoutConnectionPointRefs|compositeContainerAtPoint|compositePortOwnerAtPoint|isPortOwner|layoutCompositePorts|activityContainerAtPoint|activityAttachmentOwnerAtPoint|layoutActivityAttachments|activityAncestor|attachToActivityContainer|packageContainerAtPoint|isViewAncestor|attachToPackageContainer|compositePortDirection|attachPartToCompositeContainer|ibdContainerAtPoint|attachToInternalBlockContainer|parametricContainerAtPoint|attachToParametricContainer|layoutParametricParameters|timingLifelineAtPoint|timingStateAtPoint|timingConstraintAnchor|layoutTimingDiagram|attachToContainingRegion|moveViewTree)\(/,
  '컨테인먼트·레이아웃 구현은 app.js에 중복으로 남기지 않아야 합니다');
assert.doesNotMatch(app, /\bregionLayoutCache\b/,
  'Region 레이아웃 캐시는 Containment Layout 모듈이 소유해야 합니다');

/* ── Relation Rules 모듈 ────────────────────────────────────── */
assert.match(relationRules, /function transitionDirectionError\(/);
assert.match(relationRules, /function compositeRelationError\(/);
assert.match(relationRules, /function activityRelationError\(/);
assert.match(relationRules, /function packageRelationError\(/);
assert.match(relationRules, /function relationError\(/);
assert.match(relationRules, /Relation Rules 의존성이 없습니다/);
assert.match(relationRules, /root\.UMLRelationRules = api/);
/* 규칙 순서가 바뀌면 사용자가 보는 안내 문구가 달라진다 */
assert.match(relationRules, /const DIAGRAM_RULES = Object\.freeze\(\[\s*\n\s*compositeRelationError,\s*\n\s*activityRelationError,\s*\n\s*packageRelationError,\s*\n\s*profileRelationError,\s*\n\s*informationFlowRelationError,\s*\n\s*requirementRelationError,\s*\n\s*bddRelationError,\s*\n\s*ibdRelationError,\s*\n\s*parametricRelationError,\s*\n\s*\]\)/,
  'relationError는 completeLink가 쓰던 순서를 그대로 유지해야 합니다');
/* 안내 문구는 사용자가 보는 UI 계약이다 */
assert.match(relationRules, /Composite Structure Connector는 Part 또는 Port 사이에만 연결할 수 있습니다/);
assert.match(relationRules, /Role Binding은 Collaboration Use에서 Part 방향으로 연결하세요/);
assert.match(relationRules, /Object Node와 Pin에는 Object Flow를 사용하세요/);
assert.match(relationRules, /Activity Interrupt의 대상은 같은 Interruptible Activity Region 밖에 있어야 합니다/);
assert.match(relationRules, /Package 포함 관계가 순환할 수 없습니다/);
assert.match(relationRules, /Extension은 Stereotype에서 MetaClass 방향으로 연결하세요/);
assert.match(relationRules, /Stereotype Generalization이 순환할 수 없습니다/);
assert.match(relationRules, /BDD Generalization이 순환할 수 없습니다/);
assert.match(relationRules, /Block Composition 계층이 순환할 수 없습니다/);
assert.match(relationRules, /같은 IBD 요소 사이에 Connector가 이미 있습니다/);
assert.match(relationRules, /같은 Parameter\/Value 사이에 Binding Connector가 이미 있습니다/);
assert.match(relationRules, /bindingTypeCompatibility\(/);
assert.match(app, /UMLRelationRules\.create\(/);
assert.match(app, /register\(relationRules\)/);
assert.match(relationCreation, /const legalityError = relationError\(kind, from, target\);/,
  'completeLink는 통합 규칙 한 번만 호출해야 합니다');
assert.doesNotMatch(app, /function (?:transitionDirectionError|compositeRelationError|activityRelationError|packageRelationError|profileRelationError|informationFlowRelationError|requirementRelationError|bddRelationError|ibdRelationError|parametricRelationError)\(/,
  '관계 유효성 규칙은 app.js에 중복으로 남기지 않아야 합니다');

/* ── Relation Creation 모듈 ─────────────────────────────────── */
assert.match(relationCreation, /function createCommunicationMessage\(/);
assert.match(relationCreation, /function completeLink\(/);
assert.match(relationCreation, /function finishLink\(/);
assert.match(relationCreation, /Relation Creation 의존성이 없습니다/);
assert.match(relationCreation, /root\.UMLRelationCreation = api/);
assert.match(relationCreation, /const ENDPOINT_MESSAGES = Object\.freeze\(/);
assert.match(relationCreation, /clearLinking\(\);\s*\n\s*state\.tool = 'select';\s*\n\s*renderAll\(\);/,
  '관계 생성 종료는 링크·도구·렌더링 상태를 한 경로에서 정리해야 합니다');
assert.match(app, /UMLRelationCreation\.create\(provide\(UMLRelationCreation\)\)/);
assert.match(app, /register\(relationCreation\)/);
assert.doesNotMatch(app, /function (?:createCommunicationMessage|completeLink)\(/,
  '관계 생성·커밋 구현은 app.js에 중복으로 남기지 않아야 합니다');

/* ── Validation Panel 모듈 ─────────────────────────────────── */
assert.match(validationPanel, /function updateSummary\(\)/);
assert.match(validationPanel, /function run\(\)/);
assert.match(validationPanel, /function clear\(\)/);
assert.match(validationPanel, /function render\(\)/);
assert.match(validationPanel, /function navigateToIssue\(item(?:: Issue)?\)/);
assert.match(validationPanel, /function toggle\(\)/);
assert.match(validationPanel, /function attach\(\)/);
assert.match(validationPanel, /function detach\(\)/);
assert.match(validationPanel, /Validation Panel 의존성이 없습니다/);
assert.match(validationPanel, /root\.UMLValidationPanel = api/);
assert.match(validationPanel, /row\.setAttribute\('role', 'button'\)/,
  '검증 결과 행은 키보드 사용자가 동작을 인식할 수 있어야 합니다');
assert.match(validationPanel, /event\.key !== 'Enter' && event\.key !== ' '/,
  '검증 결과는 Enter와 Space 키로 이동할 수 있어야 합니다');
assert.match(app, /UMLValidationPanel\.create\(provide\(UMLValidationPanel\)\)/);
assert.match(app, /validationPanelController\.attach\(\)/);
assert.doesNotMatch(app, /function (?:updateValidationSummary|runValidation|clearValidationResults|renderValidationResults|navigateToValidationIssue)\(/,
  '검증 결과 UI 구현은 app.js에 중복으로 남기지 않아야 합니다');

/* ── Selection Editing 모듈 ─────────────────────────────────── */
assert.match(selectionEditing, /function copySelection\(/);
assert.match(selectionEditing, /function pasteClipboard\(/);
assert.match(selectionEditing, /function cutSelection\(/);
assert.match(selectionEditing, /function duplicateSelection\(/);
assert.match(selectionEditing, /function deleteSelection\(/);
assert.match(selectionEditing, /function deleteFromModel\(/);
assert.match(selectionEditing, /function autoSizeSelection\(/);
assert.match(selectionEditing, /function reorderSelection\(/);
assert.match(selectionEditing, /function reorderBindingConnector\(/);
assert.match(selectionEditing, /function moveSelectionByKey\(/);
assert.match(selectionEditing, /function selectAllViews\(/);
assert.match(selectionEditing, /function hasClipboard\(/);
assert.match(selectionEditing, /Selection Editing 의존성이 없습니다/);
assert.match(selectionEditing, /root\.UMLSelectionEditing = api/);
assert.match(selectionEditing, /let clipboard: Clipboard \| null = null/,
  '클립보드 상태는 모듈 내부에만 있어야 합니다');
assert.match(selectionEditing, /const PASTE_OFFSET = 24/);
/* 복사본이 원본과 배열을 공유하면 원본이 함께 바뀐다 */
assert.match(selectionEditing, /CLONED_MODEL_LIST_FIELDS\.forEach\(k => \{\s*const list = state\.models\[nextId\]\[k\];\s*if \(list\) state\.models\[nextId\]\[k\] = \[\.\.\.list\];/);
assert.match(selectionEditing, /const cloneModels = options\.cloneModels \?\? els\.some\(view => view\.kind in INDEPENDENT_COPY_KINDS\)/,
  'ERD 테이블과 라이프라인은 기본적으로 독립 모델로 복사해야 합니다');
assert.match(selectionEditing, /관계\(선\)는 단독으로 복사할 수 없습니다/);
assert.match(selectionEditing, /클립보드가 비어 있습니다/);
assert.match(selectionEditing, /복사한 요소를 이 다이어그램에 붙여넣을 수 없습니다/);
assert.match(selectionEditing, /일부 요소는 이 다이어그램 타입에 맞지 않아 제외되었습니다/);
assert.match(selectionEditing, /잘라내기 완료 — Ctrl\+V로 붙여넣기/);
assert.match(selectionEditing, /Ctrl\+D는 클립보드를 건드리지 않음/);
assert.match(selectionEditing, /모델 \{0\}개와 모든 다이어그램의 연결된 뷰를 삭제했습니다/);
assert.match(selectionEditing, /자동 크기를 적용할 요소를 선택하세요/);
assert.match(selectionEditing, /순서를 변경할 요소 또는 Binding Connector를 선택하세요/);
assert.match(app, /UMLSelectionEditing\.create\(/);
assert.match(app, /\} = selectionEditing;/);
assert.match(app, /hasClipboard: \(\) => selectionEditing\.hasClipboard\(\),/);
assert.doesNotMatch(app, /function (?:copySelection|pasteClipboard|cutSelection|duplicateSelection|deleteSelection|deleteFromModel|autoSizeSelection|reorderSelection|reorderBindingConnector|bindingConnectorStackInfo|canReorderSelection|moveSelectionByKey|selectAllViews|expandedElementSelection)\(/,
  '선택 편집·클립보드 구현은 app.js에 중복으로 남기지 않아야 합니다');
assert.doesNotMatch(app, /\blet clipboard\b|\bclipboard\.(?:data|count|cloneModels|sourceRepository)\b/,
  '뷰 클립보드 상태는 app.js에 남기지 않아야 합니다');

/* ── Interaction Layout 모듈 ───────────────────────────────── */
assert.match(interactionLayout, /function computeSeqNumbers\(diagram\b/);
assert.match(interactionLayout, /function computeSequenceLayout\(diagram\b/);
assert.match(interactionLayout, /function msgDisplayLabel\(relation\b/);
assert.match(interactionLayout, /function msgPoints\(relation\b/);
assert.match(interactionLayout, /function communicationSelfConnectorGeom\(relation\b/);
assert.match(interactionLayout, /function communicationMessagePoints\(relation\b/);
assert.match(interactionLayout, /function syncCommunicationMessages\(connector(?::[^,]+)?, diagram = dg\(\)\)/);
assert.match(interactionLayout, /Interaction Layout 의존성이 없습니다/);
assert.match(interactionLayout, /root\.UMLInteractionLayout = api/);
assert.match(interactionLayout, /sequenceBars = Object\.freeze\(assignedBars\.map\(bar => Object\.freeze\(bar\)\)\)/,
  '활성 구간 캐시는 외부 소비자가 변경할 수 없어야 합니다');
assert.match(app, /UMLInteractionLayout\.create\(provide\(UMLInteractionLayout\)\)/);
assert.match(app, /register\(interactionLayout\);/);
assert.doesNotMatch(app, /\blet (?:seqBars|seqBottom|seqNoMap)\b/,
  'Interaction 배치 캐시는 app.js에 남기지 않아야 합니다');
assert.doesNotMatch(app, /function (?:computeSeqNumbers|computeSequenceLayout|msgDisplayLabel|msgPoints|communicationSelfConnectorGeom|communicationMessagePoints|syncCommunicationMessages)\(/,
  'Interaction 배치 구현은 app.js에 중복으로 남기지 않아야 합니다');

/* ── Hit Testing 모듈 ───────────────────────────────────────── */
assert.match(hitTesting, /function elementAt\(/);
assert.match(hitTesting, /function lifelineAt\(/);
assert.match(hitTesting, /function relationAt\(/);
assert.match(hitTesting, /function communicationConnectorAt\(/);
assert.match(hitTesting, /function relationLabelAt\(/);
assert.match(hitTesting, /function memberRowAt\(/);
assert.match(hitTesting, /function curveHit(?:<[^>]+>)?\(/);
assert.match(hitTesting, /const HIT_TOLERANCES = Object\.freeze\(/);
assert.match(hitTesting, /Hit Testing 의존성이 없습니다/);
assert.match(hitTesting, /root\.UMLHitTesting = api/);
assert.match(hitTesting, /getSequenceBottom\(\)/,
  'Sequence 라이프라인 판정은 현재 렌더링의 동적 하단 경계를 사용해야 합니다');
assert.match(app, /UMLHitTesting\.create\(/);
assert.match(app, /register\(hitTesting\);/);
assert.doesNotMatch(app, /function (?:elementAt|lifelineAt|relationAt|communicationConnectorAt|relationLabelAt|memberRowAt|inRect|nearFragmentEdge)\(/,
  '히트 테스트 구현은 app.js에 중복으로 남기지 않아야 합니다');

/* ── Canvas Renderer 모듈 ───────────────────────────────────── */
assert.match(canvasRenderer, /function render\(/);
assert.match(canvasRenderer, /function drawSelection\(/);
assert.match(canvasRenderer, /function handlePositions\(/);
assert.match(canvasRenderer, /function orderedElements\(/);
assert.match(canvasRenderer, /function runLayoutPasses\(/);
assert.match(canvasRenderer, /function buildCanvasRoot\(/);
assert.match(canvasRenderer, /function drawActivationBars\(/);
assert.match(canvasRenderer, /function renderSeqOpts\(/);
assert.match(canvasRenderer, /function renderErdMode\(/);
assert.match(canvasRenderer, /const RENDER_STYLE = Object\.freeze\(/);
assert.match(canvasRenderer, /Canvas Renderer 의존성이 없습니다/);
assert.match(canvasRenderer, /root\.UMLCanvasRenderer = api/);
assert.match(canvasRenderer, /interactionState\(\)/,
  '진행 중인 드래그·연결 상태는 렌더 시점에 조회해야 합니다');
assert.match(canvasRenderer, /getSequenceBars\(\)\.forEach/,
  '활성 구간 막대는 렌더 시점의 최신 목록을 사용해야 합니다');
assert.doesNotMatch(canvasRenderer, /document\.getElementById\('canvas'\)/,
  '캔버스 SVG는 주입받아야 합니다');
assert.match(app, /UMLCanvasRenderer\.create\(/);
assert.match(app, /const \{ render \} = canvasRenderer;/);
assert.match(interactionLayout, /function clearSequenceBars\(\)/);
assert.match(interactionLayout, /function getSequenceBars\(\)/);
assert.match(app, /interactionState: \(\) => canvasInteraction\.state\(\),/);
assert.doesNotMatch(app, /function (?:render|drawSelection|handlePositions|drawOrder|timingDrawOrder|activityDrawOrder|renderSeqOpts|renderErdMode)\(/,
  '캔버스 렌더링 구현은 app.js에 중복으로 남기지 않아야 합니다');
assert.doesNotMatch(app, /svg\.setAttribute\('viewBox'/,
  '캔버스 장면 그래프 생성은 app.js에 남기지 않아야 합니다');

/* ── Model Repository 모듈 ──────────────────────────────────── */
assert.match(modelRepository, /function createViewForModel\(/);
assert.match(modelRepository, /function canPlaceKind\(/);
assert.match(modelRepository, /function browsableModels\(/);
assert.match(modelRepository, /function buildRow\(/);
assert.match(modelRepository, /function addView\(/);
assert.match(modelRepository, /function open\(/);
assert.match(modelRepository, /function close\(/);
assert.match(modelRepository, /const DERIVED_VIEW_KINDS = Object\.freeze\(/);
assert.match(modelRepository, /const VIEW_PRESETS(?:[^=]+)?= Object\.freeze\(/);
assert.match(modelRepository, /Model Repository 의존성이 없습니다/);
assert.match(modelRepository, /root\.UMLModelRepository = api/);
assert.match(modelRepository, /Project Models/);
assert.match(modelRepository, /모델 이름 또는 종류 검색/);
assert.match(modelRepository, /일치하는 모델이 없습니다\./);
assert.match(modelRepository, /'Add View'/);
assert.match(modelRepository, /'Not compatible'/);
assert.match(modelRepository, /정보 흐름의 송신·수신 주체로 사용하세요\./);
assert.match(modelRepository, /충족, 검증, 구체화, 추적 관계로 연결하세요\./);
assert.match(modelRepository, /같은 모델을 여러 다이어그램에 배치하면 이름과 속성이 함께 동기화됩니다\./);
assert.match(modelRepository, /count === 1 \? '' : 's'/,
  '뷰 개수는 단수 · 복수를 구분해야 합니다');
assert.match(modelRepository, /view\.kind === 'compositestate'[\s\S]*regionOrder = 0/,
  'Composite State는 첫 Region과 함께 배치해야 합니다');
assert.match(app, /UMLModelRepository\.create\(/);
assert.match(app, /const \{ open: openModelRepository \} = modelRepository;/);
assert.match(app, /models: openModelRepository,/,
  '명령 라우터는 모듈의 열기 동작을 그대로 써야 합니다');
assert.doesNotMatch(app, /function (?:createViewForModel|openModelRepository)\(/,
  '모델 저장소 구현은 app.js에 중복으로 남기지 않아야 합니다');
assert.doesNotMatch(app, /model-repository-dialog|model-repository-row/,
  '모델 저장소 대화상자 마크업은 app.js에 남기지 않아야 합니다');

/* ── Parametric Binding 모듈 ────────────────────────────────── */
assert.match(parametricBinding, /function portDirection\(/);
assert.match(parametricBinding, /function obstaclesFor\(/);
assert.match(parametricBinding, /function declaredParameters\(/);
assert.match(parametricBinding, /function borderAnchorFor\(/);
assert.match(parametricBinding, /function addWaypoint\(/);
assert.match(parametricBinding, /function unlock\(/);
assert.match(parametricBinding, /function route\(/);
assert.match(parametricBinding, /const ROUTING = Object\.freeze\(/);
assert.match(parametricBinding, /Parametric Binding 의존성이 없습니다/);
assert.match(parametricBinding, /root\.UMLParametricBinding = api/);
assert.match(parametricBinding, /let routeCache = new Map(?:<[^>]+>)?\(\)/,
  '라우트 캐시는 모듈 내부에만 있어야 합니다');
assert.match(parametricBinding, /element\.kind !== 'parametricframe'/,
  'Parametric Frame은 장애물이 아닙니다');
assert.match(parametricBinding, /existingRoutes\.push\(route\.points\)/,
  '이전 라우트를 누적해야 나중 라우트가 점프를 계산할 수 있습니다');
assert.match(parametricBinding, /먼저 Constraint Block Type을 선택하세요/);
assert.match(parametricBinding, /선택한 Constraint Block에 정의된 Parameter가 없습니다/);
assert.match(parametricBinding, /모든 Constraint Parameter가 이미 동기화되어 있습니다/);
assert.match(parametricBinding, /Constraint Parameter \{0\}개를 추가했습니다/);
assert.match(app, /UMLParametricBinding\.create\(/);
assert.match(app, /route: bindingRoute,/);
assert.match(app, /computeRoutes: computeBindingRoutes,/);
assert.doesNotMatch(app, /function (?:syncConstraintParameters|computeBindingRoutes|bindingPortDirection|bindingWaypoints|lockBindingRoute|unlockBindingRoute|addBindingWaypoint|bindingRoute)\(/,
  'Binding Connector 라우팅 구현은 app.js에 중복으로 남기지 않아야 합니다');
assert.doesNotMatch(app, /bindingRouteCache/,
  '라우트 캐시는 app.js에 남기지 않아야 합니다');

/* ── 의존성 레지스트리 배선 ─────────────────────────────────── */
assert.match(app, /const wiring: Record<string, unknown> = Object\.create\(null\);/);
assert.match(app, /const register = \(\.\.\.sources: object\[\]\) => \{/);
assert.match(app, /배선 이름 충돌/,
  '컨트롤러의 흔한 export가 기존 배선을 조용히 덮어쓰면 즉시 실패해야 합니다');
assert.match(app, /const LIFECYCLE_EXPORTS = new Set\(\['attach', 'detach'\]\)/,
  'attach·detach는 어떤 모듈도 선언하지 않으므로 registry에 넣지 않습니다');
assert.match(app, /const REPLACEABLE_WIRING = new Set\(\[/,
  'TDZ 회피용 자리표시자만 두 번 등록할 수 있어야 합니다');
assert.doesNotMatch(app, /^register\(validationPanelController\)/m,
  'Validation Panel 컨트롤러는 generic한 render를 내보내므로 registry에 펼치면 안 됩니다');
assert.match(app, /function provide<Module extends WiredModule>\(mod: Module\)[\s\S]*REQUIRED_FUNCTIONS[\s\S]*REQUIRED_VALUES[\s\S]*if \(name in wiring\) out\[name\] = wiring\[name\];/,
  'provide는 모듈이 선언한 이름만 넘겨야 합니다');
assert.doesNotMatch(app, /function provide<Module extends WiredModule>[\s\S]{0,600}Object\.assign\(out, wiring\)/,
  '레지스트리를 통째로 넘기면 선언하지 않은 의존성에 닿을 수 있습니다');
/* 배선을 다시 손으로 나열하는 회귀를 막는다 */
[
  'UMLContainmentLayout', 'UMLElementFactory', 'UMLElementMeasure', 'UMLStatusBar', 'UMLModalFocus', 'UMLRelationRules', 'UMLRelationCreation', 'UMLParametricBinding', 'UMLInteractionLayout',
  'UMLCanvasRenderer', 'UMLHitTesting', 'UMLViewportController', 'UMLToolbox',
  'UMLDiagramTabs', 'UMLQuickEdit', 'UMLCanvasInteraction', 'UMLSelectionEditing',
  'UMLModelRepository', 'UMLModelExplorer', 'UMLErdNameTools', 'UMLValidationPanel', 'UMLProjectDocument', 'UMLHistoryController', 'UMLProjectStore', 'UMLProjectImport',
  'UMLCommandRouter', 'UMLSampleDiagrams',
].forEach(name => {
  assert.match(app, new RegExp(`${name}\\.create\\((?:provide\\(${name}\\)|\\{\\n  \\.\\.\\.provide\\(${name}\\),)`),
    `${name}은 레지스트리에서 의존성을 받아야 합니다`);
});
/* 지연이 필요한 배선은 화살표로 등록해야 TDZ에 걸리지 않는다 */
assert.match(app, /interactionState: \(\) => canvasInteraction\.state\(\),/);
assert.match(app, /getLinking: \(\) => canvasInteraction\.getLinking\(\),/);
assert.match(app, /clearValidationResults: \(\) => validationPanelController\.clear\(\),/);
assert.match(app, /renderExplorer: \(\) => modelExplorer\.render\(\),/);
assert.match(app, /renderMinimap: \(\) => viewportController\.renderMinimap\(\),/);
assert.match(app, /cancelInteraction: \(\) => cancelActiveInteraction\(\),/,
  '명령 라우터의 취소는 도구·선택까지 되돌리는 app.js 동작이어야 합니다');
/* 선언은 하지 않지만 값을 검사하는 모듈은 인라인으로 남긴다 */
assert.match(app, /\.\.\.provide\(UMLCanvasInteraction\),[\s\S]{0,200}eventRoot: window,/);
/* 렌더러 두 개는 measureText·stroke처럼 자체 이름을 쓰므로 계속 명시적으로 연결한다 */
['UMLElementRenderer', 'UMLRelationRenderer'].forEach(name => {
  assert.doesNotMatch(app, new RegExp(`provide\\(${name}\\)`),
    `${name}은 의존성 이름을 바꿔 받으므로 provide를 쓸 수 없습니다`);
});
assert.match(propertyPanel, /return Object\.freeze\(\{ REQUIRED_FUNCTIONS, REQUIRED_VALUES, selectionMode, create \}\)/,
  '속성 패널이 선언한 의존성 목록을 내보내야 provide가 채울 수 있습니다');

/* ER 전용 속성 블록은 별도 모듈이 소유하고, 속성 패널은 자기 propRow·sectionHeading만 넘긴다 */
assert.match(erdPropertySections, /root\.UMLErdPropertySections = api/);
assert.match(erdPropertySections, /ERD 속성 섹션 의존성이 없습니다/);
assert.match(erdPropertySections, /return Object\.freeze\(\{ REQUIRED_FUNCTIONS, REQUIRED_VALUES, create \}\)/);
assert.match(erdPropertySections,
  /return Object\.freeze\(\{\s*erdColumnsProperty,\s*erdDisplayModeProperty,\s*erdForeignKeyProperty,\s*erdSchemaProperty,\s*\}\)/,
  'ER 속성 섹션 네 개를 모두 내보내야 속성 패널이 그릴 수 있습니다');
['propRow', 'sectionHeading', 'renderProps'].forEach(name => {
  assert.match(erdPropertySections, new RegExp(`^\\s*'${name}',$`, 'm'),
    `${name}은 속성 패널이 넘기는 값이므로 ERD 섹션 모듈이 선언해야 합니다`);
});
assert.match(propertyPanel,
  /erdPropertySections\.create\(\{ \.\.\.deps, propRow, sectionHeading, renderProps \}\)/,
  '패널 고유 헬퍼만 직접 넘기고 나머지는 선언된 deps를 그대로 전달해야 합니다');
assert.match(propertyPanel, /"erdPropertySections",/,
  'erdPropertySections는 REQUIRED_VALUES에 선언해야 provide가 전달합니다');
assert.match(app, /register\(\{ erdPropertySections: UMLErdPropertySections \}\);/,
  'ERD 섹션은 컨트롤러가 아니라 팩토리를 배선합니다');
assert.match(html,
  /<script src="dist\/browser\/editor\/erd-property-sections\.js\?v=\d+"><\/script>\s*\n<script src="dist\/browser\/editor\/property-panel\.js\?v=\d+"><\/script>/,
  'ERD 섹션 모듈은 속성 패널보다 먼저 로드해야 합니다');
['erdColumnsProperty', 'erdDisplayModeProperty', 'erdForeignKeyProperty', 'erdSchemaProperty'].forEach(name => {
  assert.doesNotMatch(propertyPanel, new RegExp(`function ${name}\\(`),
    `${name} 구현이 속성 패널로 되돌아오면 안 됩니다`);
});

/* ERD 컬럼 클립보드·명령·편집 시트는 별도 모듈이 소유하고, QuickEdit가 만들어 다시 내보낸다 */
assert.match(erdColumnEditor, /root\.UMLErdColumnEditor = api/);
assert.match(erdColumnEditor, /ERD 컬럼 편집기 의존성이 없습니다/);
assert.match(erdColumnEditor, /return Object\.freeze\(\{ REQUIRED_FUNCTIONS, REQUIRED_VALUES, create \}\)/);
['closeOtherQuickEditors', 'nextFieldSequence', 'selectQuickEditTarget'].forEach(name => {
  assert.match(erdColumnEditor, new RegExp(`^\\s*'${name}',$`, 'm'),
    `${name}은 QuickEdit 내부 값이므로 ERD 컬럼 편집기가 선언해야 합니다`);
});
assert.match(quickEdit,
  /erdColumnEditor\.create\(\{\s*\.\.\.deps,\s*closeOtherQuickEditors: \(\) => \{ closeInlineEditor\(\); closeRelationEndEditor\(\); \},/,
  '한 번에 하나의 QuickEdit 편집기만 열려 있어야 합니다');
assert.match(quickEdit, /'erdColumnEditor',/,
  'erdColumnEditor는 REQUIRED_VALUES에 선언해야 provide가 전달합니다');
assert.match(app,
  /register\(\{ erdColumnEditor: UMLErdColumnEditor, relationEndEditor: UMLRelationEndEditor \}\);/,
  'QuickEdit의 두 편집기 모두 컨트롤러가 아니라 팩토리를 배선합니다');

/* 관계 끝점 편집 시트도 별도 모듈이 소유한다 */
assert.match(relationEndEditor, /root\.UMLRelationEndEditor = api/);
assert.match(relationEndEditor, /관계 끝점 편집기 의존성이 없습니다/);
assert.match(relationEndEditor, /return Object\.freeze\(\{ REQUIRED_FUNCTIONS, REQUIRED_VALUES, create \}\)/);
assert.match(quickEdit,
  /relationEndEditor\.create\(\{\s*\.\.\.deps,\s*closeOtherQuickEditors: \(\) => \{ closeInlineEditor\(\); closeErdColumnEditor\(\); \},/,
  '관계 끝점 시트를 열면 인라인·ERD 컬럼 편집기를 닫아야 합니다');
assert.match(quickEdit, /'relationEndEditor',/);
assert.ok(html.indexOf('relation-end-editor.js?v=') < html.indexOf('quick-edit.js?v='),
  '관계 끝점 편집기 모듈은 QuickEdit보다 먼저 로드해야 합니다');

/* 도구로 요소를 놓는 일은 드래그 상태 머신과 무관하므로 형제 모듈이 맡는다 */
assert.match(elementPlacement, /root\.UMLElementPlacement = api/);
assert.match(elementPlacement, /요소 배치 의존성이 없습니다/);
assert.match(elementPlacement, /return Object\.freeze\(\{ REQUIRED_FUNCTIONS, REQUIRED_VALUES, create \}\)/);
assert.match(elementPlacement, /return Object\.freeze\(\{ placeElementForTool \}\)/);
assert.doesNotMatch(elementPlacement, /^\s*(drag|linking)\s*=|function handleMouse/m,
  '배치 모듈은 드래그·연결 상태를 건드리면 안 됩니다');
assert.match(canvasInteraction,
  /if \(KIND_META\[tool\] && !REL_STYLE\[tool\] && tool !== 'select'\) \{[\s\S]{0,200}elementPlacement\.placeElementForTool\(p, tool, hitEl\);/,
  'mousedown은 도구가 요소를 놓으라고 했는지만 판단하고 위임해야 합니다');
assert.match(canvasInteraction, /'elementPlacement',/);
assert.match(canvasInteraction, /deps\.elementPlacement\?\.placeElementForTool !== 'function'/,
  '배치 모듈의 계약도 init에서 확인해야 합니다');

/* 드래그 중 캔버스 다시 그리기는 프레임당 한 번으로 합친다 */
assert.match(canvasInteraction, /function scheduleRender\(\) \{[\s\S]{0,200}requestAnimationFrame\(/,
  '드래그 그리기는 requestAnimationFrame으로 합쳐야 합니다');
assert.doesNotMatch(
  canvasInteraction.slice(canvasInteraction.indexOf('function handleMouseMove')),
  /^\s*render\(\);$/m,
  'mousemove 경로에서 동기 render()를 되살리면 큰 다이어그램에서 드래그가 멈춥니다',
);
assert.match(canvasInteraction, /cancelAnimationFrame\(renderFrame\)/,
  'detach는 예약된 프레임을 취소해야 합니다');
assert.match(app, /requestAnimationFrame, cancelAnimationFrame,/);

/* 잡히지 않은 오류는 콘솔에만 남지 않고 상태 표시줄에 닿는다 */
assert.match(runtimeErrors, /root\.UMLRuntimeErrors = api/);
assert.match(runtimeErrors, /런타임 오류 표시 의존성이 없습니다/);
assert.match(runtimeErrors, /addEventListener\('error', report\)/);
assert.match(runtimeErrors, /addEventListener\('unhandledrejection', report\)/);
assert.doesNotMatch(runtimeErrors, /preventDefault|stopPropagation/,
  '오류 이벤트를 삼키면 콘솔 기록과 E2E의 pageerror 감지가 함께 사라집니다');
assert.match(app, /UMLRuntimeErrors\.create\(provide\(UMLRuntimeErrors\)\)/);
assert.match(app, /runtimeErrors\.attach\(\)/);
assert.ok(html.indexOf('runtime-errors.js?v=') < html.indexOf('app.js?v='));
assert.match(statusBar, /function runtimeErrorText\(/);
assert.match(statusBar, /⚠ 오류 \{0\}건/);
assert.match(app, /UMLElementPlacement\.create\(provide\(UMLElementPlacement\)\)/,
  '배치 모듈은 앱 레벨 의존성만 쓰므로 app.js가 직접 만듭니다');
assert.ok(html.indexOf('element-placement.js?v=') < html.indexOf('canvas-interaction.js?v='),
  '배치 모듈은 캔버스 상호작용보다 먼저 로드해야 합니다');
['interactioninline', 'connectionpointref', 'timingstate', 'constraintparameter'].forEach(tool => {
  assert.doesNotMatch(canvasInteraction, new RegExp(`tool === '${tool}'`),
    `${tool} 배치 분기가 상호작용 모듈로 되돌아오면 안 됩니다`);
  assert.match(elementPlacement, new RegExp(`tool === '${tool}'|${tool}`),
    `${tool} 배치는 배치 모듈이 소유합니다`);
});
assert.doesNotMatch(quickEdit, /function openRelationEndQuickEdit\(/,
  '관계 끝점 편집기 구현이 QuickEdit로 되돌아오면 안 됩니다');
assert.match(quickEdit, /^\s*openRelationEndQuickEdit,$/m,
  'QuickEdit는 openRelationEndQuickEdit을 계속 내보내야 합니다');
assert.ok(html.indexOf('erd-column-editor.js?v=') < html.indexOf('quick-edit.js?v='),
  'ERD 컬럼 편집기 모듈은 QuickEdit보다 먼저 로드해야 합니다');
['openErdColumnEditor', 'copyErdColumn', 'pasteErdColumn', 'deleteErdColumn',
  'replaceErdColumns', 'moveErdColumn', 'moveErdColumnTo'].forEach(name => {
  assert.doesNotMatch(quickEdit, new RegExp(`function ${name}\\(`),
    `${name} 구현이 QuickEdit로 되돌아오면 안 됩니다`);
  assert.match(quickEdit, new RegExp(`^\\s*${name},$`, 'm'),
    `QuickEdit는 ${name}을(를) 계속 내보내야 배선이 그대로 유지됩니다`);
});

/* draw.io·DDL 가져오기 미리보기 시트는 별도 모듈이 소유한다 */
assert.match(importPreview, /root\.UMLImportPreview = api/);
assert.match(importPreview, /가져오기 미리보기 의존성이 없습니다/);
assert.match(importPreview, /return Object\.freeze\(\{ REQUIRED_FUNCTIONS, REQUIRED_VALUES, create \}\)/);
assert.doesNotMatch(importPreview, /\bstate\./,
  '미리보기는 결정만 돌려주고 프로젝트 상태를 건드리면 안 됩니다');
assert.doesNotMatch(importPreview, /\bsnapshot\(|renderAll\(|scheduleRecoverySave\(/,
  '가져오기를 실제로 적용하는 일은 project-import가 계속 맡습니다');
assert.match(importExport,
  /importPreview\.create\(\{ \.\.\.deps, DRAWIO_IMPORT_POLICIES \}\)/,
  'DRAWIO_IMPORT_POLICIES는 project-import의 공개 상수라 명시적으로 넘깁니다');
assert.match(importExport, /'importPreview',/,
  'importPreview는 REQUIRED_VALUES에 선언해야 provide가 전달합니다');
assert.match(app, /register\(\{ importPreview: UMLImportPreview \}\);/);
assert.ok(html.indexOf('import-preview.js?v=') < html.indexOf('project-import.js?v='),
  '미리보기 모듈은 project-import보다 먼저 로드해야 합니다');
['openDrawioImportPreview', 'openDdlImportPreview'].forEach(name => {
  assert.doesNotMatch(importExport, new RegExp(`function ${name}\\(`),
    `${name} 구현이 project-import로 되돌아오면 안 됩니다`);
  assert.match(importExport, new RegExp(`^\\s*${name},$`, 'm'),
    `project-import는 ${name}을(를) 계속 내보내야 합니다`);
});

/* 파일로 내보내는 일은 가져오기와 아무것도 공유하지 않으므로 형제 모듈이다 */
assert.match(diagramExport, /root\.UMLDiagramExport = api/);
assert.match(diagramExport, /다이어그램 내보내기 의존성이 없습니다/);
assert.match(diagramExport, /return Object\.freeze\(\{ REQUIRED_FUNCTIONS, REQUIRED_VALUES, create \}\)/);
assert.match(diagramExport, /function download\(/,
  'download는 내보내기 쪽 헬퍼이므로 이 모듈이 소유합니다');
assert.doesNotMatch(diagramExport, /fileInput|drawioImporter|ddlImporter|importPreview/,
  '내보내기 모듈은 가져오기 배선을 건드리지 않습니다');
assert.doesNotMatch(importExport, /function download\(|exporters\./,
  '내보내기 구현이 project-import로 되돌아오면 안 됩니다');
['exportSvgFile', 'exportPngFile', 'exportMermaidFile', 'exportDrawioFile',
  'exportErdDdlFile', 'openErdDdlExportDialog', 'exportAllPngFiles'].forEach(name => {
  assert.doesNotMatch(importExport, new RegExp(`^\\s*${name},$`, 'm'),
    `${name}은 이제 diagram-export가 내보냅니다`);
});
assert.ok(html.indexOf('diagram-export.js?v=') < html.indexOf('app.js?v='),
  '내보내기 모듈은 app.js보다 먼저 로드해야 합니다');
assert.match(app, /const \{ download \} = diagramExport;/,
  'app.js의 Save도 같은 download 헬퍼를 씁니다');

/* 부모가 만드는 자식 모듈은 `provide`가 채운 부모의 deps를 그대로 넘겨받는다.
   그래서 자식이 요구하는 이름 중 부모가 직접 주는 것을 뺀 나머지는 전부 부모의
   REQUIRED 목록에 선언되어 있어야 한다 — 빠지면 브라우저에서만 터진다. */
[
  {
    parent: require(path.join(root, 'dist/browser/editor/property-panel.js')),
    child: require(path.join(root, 'dist/browser/editor/erd-property-sections.js')),
    parentName: 'property-panel',
    supplied: ['propRow', 'sectionHeading', 'renderProps'],
  },
  {
    parent: require(path.join(root, 'dist/browser/editor/quick-edit.js')),
    child: require(path.join(root, 'dist/browser/editor/erd-column-editor.js')),
    parentName: 'quick-edit',
    supplied: ['closeOtherQuickEditors', 'nextFieldSequence', 'selectQuickEditTarget'],
  },
  {
    parent: require(path.join(root, 'dist/browser/editor/quick-edit.js')),
    child: require(path.join(root, 'dist/browser/editor/relation-end-editor.js')),
    parentName: 'quick-edit',
    supplied: ['closeOtherQuickEditors', 'nextFieldSequence', 'selectQuickEditTarget'],
  },
  {
    parent: require(path.join(root, 'dist/browser/io/project-import.js')),
    child: require(path.join(root, 'dist/browser/io/import-preview.js')),
    parentName: 'project-import',
    supplied: ['DRAWIO_IMPORT_POLICIES'],
  },
].forEach(({ parent, child, parentName, supplied }) => {
  const declared = new Set([...parent.REQUIRED_FUNCTIONS, ...parent.REQUIRED_VALUES]);
  const forwarded = [...child.REQUIRED_FUNCTIONS, ...child.REQUIRED_VALUES]
    .filter(name => !supplied.includes(name));
  const undeclared = forwarded.filter(name => !declared.has(name));
  assert.deepEqual(undeclared, [],
    `${parentName}이(가) 자식에게 넘겨야 하는 이름을 선언하지 않았습니다: ${undeclared.join(', ')}`);
});
assert.match(app, /UMLPropertyPanel\.create\(\{ \.\.\.provide\(UMLPropertyPanel\), GRID, FILL_DEFAULT \}\)/,
  '속성 패널 배선은 registry가 채우고, 선언하지 않은 두 값만 따로 넘깁니다');
for (const name of ['AUTO_LABEL', 'INSTANCE_CLASSIFIER_KINDS', 'REQUIREMENT_TYPES', 'INFORMATION_FLOW_CONVEYED_KINDS']) {
  assert.match(app, new RegExp(`\\n\\s*[^\\n]*\\b${name}\\b[,\\n]`),
    `${name}은 registry에 등록해야 provide가 전달할 수 있습니다`);
}

/* app.js는 모듈 생성과 의존성 연결을 담당하는 얇은 bootstrap이어야 한다 */
assert.ok(app.split('\n').length < 1750, 'app.js는 분리한 모듈만큼 줄어야 합니다');
assert.match(app, /const projectReady = projectStore\.restoreOnStartup\(\);/);
assert.match(app, /UMLLanguageSettings\.attach\(settingsButton, projectStore, projectReady\)/,
  '언어 설정은 프로젝트 복원이 끝난 후 사용할 수 있어야 합니다');
assert.match(css, /#toolbar button[\s\S]*white-space: nowrap/);
assert.match(css, /\.tb-tool[\s\S]*min-height: 32px/);
assert.match(css, /\.tab-close[\s\S]*min-width: 24px[\s\S]*min-height: 28px/);
assert.doesNotMatch(html, /<span class="menu">/, '동작 없는 상단 메뉴를 다시 추가하면 안 됩니다');

console.log('ui-contract tests: ok');
