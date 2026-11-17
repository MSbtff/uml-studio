'use strict';

const assert = require('node:assert/strict');
const {
  REQUIRED_FUNCTIONS,
  REQUIRED_VALUES,
  CLONED_MODEL_LIST_FIELDS,
  CLONED_MODEL_STRUCTURED_FIELDS,
  MODEL_REFERENCE_FIELDS,
  PASTE_OFFSET,
  create,
} = require('../selection-editing.js');
const { GRID, snap } = require('../canvas-geometry.js');
const { sequenceLifelineTop } = require('../sequence-layout.js');

/* app.js의 뷰/모델 저장소를 축소한 하네스 */
function harness(overrides = {}) {
  let idSeq = 1;
  const diagram = overrides.diagram || { id: 'd1', type: 'class', name: 'D', elements: [], relations: [] };
  const state = {
    diagrams: [diagram, ...(overrides.extraDiagrams || [])],
    activeId: diagram.id,
    models: overrides.models || {},
    selection: [],
    selectedId: null,
    tool: 'select',
  };
  const log = { status: [], render: [], snapshots: 0 };
  const dg = () => state.diagrams.find(d => d.id === state.activeId);
  const byId = id => dg().elements.find(e => e.id === id);
  const relById = id => dg().relations.find(r => r.id === id);
  const childViews = (parentId, d = dg()) => d.elements.filter(e => e.parentId === parentId);
  const descendantViews = (parentId, d = dg()) => {
    const out = [];
    const visit = id => childViews(id, d).forEach(child => { out.push(child); visit(child.id); });
    visit(parentId);
    return out;
  };
  const deps = {
    adoptView: view => {
      if (!view.modelId) {
        const id = 'm' + (idSeq++);
        state.models[id] = { id, kind: view.kind, name: view.name || '' };
        view.modelId = id;
      }
      return view;
    },
    byId,
    descendantViews,
    dg,
    diagramAllowsElementKind: (type, kind) => !(type === 'class' && kind === 'lifeline'),
    flashStatus: message => { log.status.push(message); },
    isMsg: kind => kind?.startsWith('msg-'),
    modelUid: () => 'm' + (idSeq++),
    /* 실제 containment-layout처럼 격자에 맞춘다 — 스냅을 빼면 1px 이동이
       실제로는 사라진다는 사실을 테스트가 놓친다 */
    moveViewTree: (view, dx, dy, origins, grid) => {
      [view, ...descendantViews(view.id)].forEach(node => {
        const origin = origins && origins.get(node.id);
        node.x = Math.max(0, snap((origin ? origin.x : node.x) + dx, grid));
        node.y = Math.max(0, snap((origin ? origin.y : node.y) + dy, grid));
      });
    },
    relById,
    render: () => { log.render.push('canvas'); },
    renderAll: () => { log.render.push('all'); },
    renderProps: () => { log.render.push('props'); },
    rootViews: views => {
      const selected = new Set(views.map(e => e.id));
      return views.filter(view => {
        let parent = byId(view.parentId);
        while (parent) {
          if (selected.has(parent.id)) return false;
          parent = byId(parent.parentId);
        }
        return true;
      });
    },
    setSelection: ids => { state.selection = ids; state.selectedId = ids.length === 1 ? ids[0] : null; },
    sequenceLifelineTop,
    snap,
    snapshot: () => { log.snapshots += 1; },
    syncRelationModel: (relation, d) => {
      const model = state.models[relation.modelId];
      if (!model || !d) return;
      const from = d.elements.find(e => e.id === relation.from);
      const to = d.elements.find(e => e.id === relation.to);
      model.fromModelId = from ? from.modelId : null;
      model.toModelId = to ? to.modelId : null;
    },
    uid: () => 'e' + (idSeq++),
    state,
    GRID,
    ...overrides.deps,
  };
  return { deps, state, diagram, dg, byId, log, editing: create(deps) };
}

const view = (id, kind, extra = {}) => ({ id, kind, modelId: 'model-' + id, x: 0, y: 0, w: 80, h: 40, name: id, ...extra });

assert.ok(Object.isFrozen(REQUIRED_FUNCTIONS));
assert.ok(Object.isFrozen(REQUIRED_VALUES));
assert.ok(Object.isFrozen(CLONED_MODEL_LIST_FIELDS));
assert.ok(Object.isFrozen(CLONED_MODEL_STRUCTURED_FIELDS));
assert.ok(Object.isFrozen(MODEL_REFERENCE_FIELDS));
assert.equal(PASTE_OFFSET, 24);
assert.ok(CLONED_MODEL_LIST_FIELDS.includes('columns'));
assert.ok(CLONED_MODEL_STRUCTURED_FIELDS.includes('erdIndexes'));
assert.ok(MODEL_REFERENCE_FIELDS.includes('classifierModelId'));

/* ── 의존성 검증 ────────────────────────────────────────────── */
assert.throws(() => create(), /Selection Editing 의존성이 없습니다/);
assert.throws(() => create({}), /adoptView/);
{
  const { deps } = harness();
  const { state: _state, ...withoutState } = deps;
  assert.throws(() => create(withoutState), /state/);
  assert.throws(() => create({ ...deps, state: { selection: null } }), /state\.selection/);
  assert.throws(() => create({ ...deps, GRID: null }), /GRID/);
}
{
  const { editing } = harness();
  assert.ok(Object.isFrozen(editing));
  assert.equal(editing.hasClipboard(), false);
}

/* ── 전체 선택 / 키보드 이동 ────────────────────────────────── */
{
  const h = harness({
    diagram: {
      id: 'd1', type: 'class', name: 'D', relations: [],
      elements: [view('a', 'class'), view('b', 'class', { x: 100 })],
    },
  });
  h.editing.selectAllViews();
  assert.deepEqual(h.state.selection, ['a', 'b']);
  assert.ok(h.log.render.includes('canvas'));
}
{
  const h = harness({
    diagram: {
      id: 'd1', type: 'class', name: 'D', relations: [],
      elements: [
        view('parent', 'class', { x: 100, y: 100 }),
        view('child', 'part', { x: 120, y: 120, parentId: 'parent' }),
      ],
    },
  });
  assert.equal(h.editing.moveSelectionByKey('ArrowRight', false), false, '선택이 없으면 움직이지 않습니다');
  h.state.selection = ['parent', 'child'];
  assert.equal(h.editing.moveSelectionByKey('ArrowRight', false), true);
  assert.equal(h.byId('parent').x, 101, '기본 이동은 1px이며 그리드 스냅에 먹히면 안 됩니다');
  assert.equal(h.byId('child').x, 121, '자손도 함께 움직입니다');
  h.editing.moveSelectionByKey('ArrowLeft', false);
  assert.equal(h.byId('parent').x, 100, '되돌리는 것도 1px입니다');
  /* Shift 이동은 두 축을 모두 그리드에 맞춘다 */
  assert.equal(h.editing.moveSelectionByKey('ArrowDown', true), true);
  assert.equal(h.byId('parent').y, snap(100 + GRID), 'coarse 이동은 그리드에 맞춥니다');
  assert.equal(h.byId('parent').x, snap(100), '그리드 이동은 어긋난 축도 정렬합니다');
  assert.equal(h.log.snapshots, 3);
}

/* ── 복사 ───────────────────────────────────────────────────── */
{
  const h = harness({
    diagram: {
      id: 'd1', type: 'class', name: 'D',
      elements: [view('a', 'class'), view('b', 'class', { x: 200 }), view('c', 'class', { x: 400 })],
      relations: [
        { id: 'r1', kind: 'association', modelId: 'model-r1', from: 'a', to: 'b' },
        { id: 'r2', kind: 'association', modelId: 'model-r2', from: 'b', to: 'c' },
      ],
    },
    models: {
      'model-a': { id: 'model-a', kind: 'class', name: 'A', classifierModelId: 'model-shared' },
      'model-b': { id: 'model-b', kind: 'class', name: 'B' },
      'model-c': { id: 'model-c', kind: 'class', name: 'C' },
      'model-r1': { id: 'model-r1', kind: 'association', name: '' },
      'model-r2': { id: 'model-r2', kind: 'association', name: '' },
      'model-shared': { id: 'model-shared', kind: 'class', name: 'Shared' },
    },
  });
  assert.equal(h.editing.copySelection(), false, '선택이 없으면 복사하지 않습니다');
  assert.equal(h.editing.hasClipboard(), false);

  h.state.selection = ['a', 'b'];
  assert.equal(h.editing.copySelection(), true);
  assert.equal(h.editing.hasClipboard(), true);
  assert.match(h.log.status.at(-1), /요소 2개 \(관계 1개 포함\) 복사됨/,
    '양 끝이 모두 선택된 관계만 함께 복사됩니다');

  h.state.selection = ['a'];
  h.editing.copySelection();
  assert.match(h.log.status.at(-1), /"a" 복사됨/);
}
{
  /* 관계만 선택하면 안내만 하고 복사하지 않는다 */
  const h = harness({
    diagram: {
      id: 'd1', type: 'class', name: 'D',
      elements: [view('a', 'class'), view('b', 'class')],
      relations: [{ id: 'r1', kind: 'association', modelId: 'model-r1', from: 'a', to: 'b' }],
    },
  });
  h.state.selection = ['r1'];
  h.state.selectedId = 'r1';
  assert.equal(h.editing.copySelection(), false);
  assert.match(h.log.status.at(-1), /관계\(선\)는 단독으로 복사할 수 없습니다/);
}
{
  /* Region을 고르면 소유 Composite State 전체가 복사 대상이 된다 */
  const h = harness({
    diagram: {
      id: 'd1', type: 'state', name: 'S', relations: [],
      elements: [
        view('cs', 'compositestate'),
        view('r1', 'region', { parentId: 'cs' }),
        view('inner', 'state', { parentId: 'r1' }),
      ],
    },
  });
  h.state.selection = ['r1'];
  assert.deepEqual(h.editing.expandedElementSelection().map(v => v.id).sort(), ['cs', 'inner', 'r1']);
}
{
  /* Time Constraint는 붙어 있는 대상과 함께 따라간다 */
  const h = harness({
    diagram: {
      id: 'd1', type: 'timing', name: 'T', relations: [],
      elements: [
        view('seg', 'timesegment'),
        view('tc', 'timeconstraint', { constrainedViewId: 'seg' }),
        view('other', 'timesegment'),
      ],
    },
  });
  h.state.selection = ['seg'];
  assert.equal(h.editing.copySelection(), true);
  assert.match(h.log.status.at(-1), /요소 2개/);
}

/* ── 붙여넣기 ───────────────────────────────────────────────── */
{
  const h = harness({
    diagram: {
      id: 'd1', type: 'class', name: 'D',
      elements: [view('a', 'class', { x: 100, y: 100 }), view('b', 'class', { x: 300, y: 100 })],
      relations: [{ id: 'r1', kind: 'association', modelId: 'model-r1', from: 'a', to: 'b' }],
    },
    models: {
      'model-a': { id: 'model-a', kind: 'class', name: 'A' },
      'model-b': { id: 'model-b', kind: 'class', name: 'B' },
      'model-r1': { id: 'model-r1', kind: 'association', name: '' },
    },
  });
  h.editing.pasteClipboard();
  assert.equal(h.log.status.at(-1), '클립보드가 비어 있습니다');

  h.state.selection = ['a', 'b'];
  h.editing.copySelection();
  h.editing.pasteClipboard();
  assert.equal(h.diagram.elements.length, 4);
  assert.equal(h.diagram.relations.length, 2, '관계도 함께 붙여넣습니다');
  const pasted = h.diagram.elements.slice(2);
  assert.equal(pasted[0].x, snap(100 + PASTE_OFFSET), '붙여넣기는 오프셋을 줍니다');
  assert.deepEqual(h.state.selection, pasted.map(e => e.id), '붙여넣은 요소가 선택됩니다');
  assert.equal(pasted[0].modelId, 'model-a', '같은 프로젝트에서는 모델을 공유합니다');
  const newRelation = h.diagram.relations[1];
  assert.equal(newRelation.from, pasted[0].id);
  assert.equal(newRelation.to, pasted[1].id);
  assert.notEqual(newRelation.id, 'r1');

  /* 두 번째 붙여넣기는 오프셋이 두 배 */
  h.editing.pasteClipboard();
  assert.equal(h.diagram.elements.at(-2).x, snap(100 + PASTE_OFFSET * 2));
}
{
  /* ERD 테이블은 독립 모델로 복제된다 */
  const h = harness({
    diagram: {
      id: 'd1', type: 'erd', name: 'E', relations: [],
      elements: [view('t', 'entity', { x: 0, y: 0 })],
    },
    models: { 'model-t': {
      id: 'model-t', kind: 'entity', name: 'TB_USER', columns: ['PK id: VARCHAR2(50)'],
      erdColumnDetails: { id: { defaultValue: '1' } },
      erdIndexes: [{ kind: 'index', name: 'id_idx', columns: [{ name: 'id', order: '' }] }],
    } },
  });
  h.state.selection = ['t'];
  h.editing.copySelection();
  h.editing.pasteClipboard();
  const pasted = h.diagram.elements[1];
  assert.notEqual(pasted.modelId, 'model-t', 'ERD 테이블은 새 모델을 받습니다');
  const clone = h.state.models[pasted.modelId];
  assert.equal(clone.name, 'TB_USER');
  assert.notEqual(clone.columns, h.state.models['model-t'].columns, '열 배열도 복제해야 원본이 안전합니다');
  clone.columns.push('NN name: VARCHAR2(50)');
  clone.erdColumnDetails.id.defaultValue = '2';
  clone.erdIndexes[0].columns[0].name = 'other';
  assert.equal(h.state.models['model-t'].columns.length, 1, '복사본을 고쳐도 원본은 그대로입니다');
  assert.equal(h.state.models['model-t'].erdColumnDetails.id.defaultValue, '1');
  assert.equal(h.state.models['model-t'].erdIndexes[0].columns[0].name, 'id');
  assert.match(h.log.status.at(-1), /테이블 1개를 독립 모델로 붙여넣었습니다/);
}
{
  /* 시퀀스 라이프라인도 독립 모델로 복제되지만, 가리키는 분류자는 공유를 유지한다 */
  const h = harness({
    diagram: {
      id: 'd1', type: 'sequence', name: 'S', relations: [],
      elements: [view('l', 'lifeline', { x: 40, y: 32 })],
    },
    models: {
      'model-l': { id: 'model-l', kind: 'lifeline', name: ':CanvasView', classifierModelId: 'model-c' },
      'model-c': { id: 'model-c', kind: 'class', name: 'CanvasView', attributes: ['+ id: String'] },
    },
  });
  h.state.selection = ['l'];
  h.editing.copySelection();
  h.editing.pasteClipboard();
  const pasted = h.diagram.elements[1];
  assert.notEqual(pasted.modelId, 'model-l', '라이프라인 복사본은 새 모델을 받습니다');
  const clone = h.state.models[pasted.modelId];
  clone.name = 'COPY_RENAMED';
  assert.equal(h.state.models['model-l'].name, ':CanvasView',
    '복사본 이름을 바꿔도 원본 라이프라인은 그대로여야 합니다');
  assert.equal(clone.classifierModelId, 'model-c',
    '라이프라인이 가리키는 분류자는 여전히 같은 Class여야 합니다');
  assert.equal(Object.values(h.state.models).filter(model => model.kind === 'class').length, 1,
    '라이프라인을 복사했다고 Class 모델이 복제되면 안 됩니다');
  assert.match(h.log.status.at(-1), /라이프라인 1개를 독립 모델로 붙여넣었습니다/);
}
{
  /* Combined Fragment를 붙여넣거나 복제하면 매번 독립 모델을 받는다 */
  const fragment = { id: 'model-f', kind: 'fragment', name: 'Fragment', operator: 'alt',
    condition: '[fallback]', operands: ['[success]', '[else]'] };
  const h = harness({
    diagram: { id: 'd1', type: 'sequence', elements: [view('f', 'fragment')], relations: [] },
    models: { [fragment.id]: fragment },
  });
  h.state.selection = ['f'];
  h.editing.copySelection();
  h.editing.pasteClipboard();
  h.editing.pasteClipboard();
  h.state.selection = ['f'];
  h.editing.duplicateSelection();

  const ids = h.diagram.elements.map(element => element.modelId);
  assert.equal(new Set(ids).size, 4);
  const copies = ids.slice(1).map(id => h.state.models[id]);
  copies.forEach(copy => assert.deepEqual(copy, { ...fragment, id: copy.id }));
  copies[0].operator = 'opt';
  copies[0].condition = '[new condition]';
  copies[0].operands[0] = '[new guard]';
  for (const model of [fragment, ...copies.slice(1)]) {
    assert.equal(model.operator, 'alt');
    assert.equal(model.condition, '[fallback]');
    assert.deepEqual(model.operands, ['[success]', '[else]']);
  }
  h.editing.cutSelection();
  h.editing.pasteClipboard();
  assert.equal(h.diagram.elements.at(-1).modelId, ids.at(-1));
}
{
  /* 잘라내기는 이동이므로 라이프라인 모델이 그대로 따라간다 */
  const h = harness({
    diagram: {
      id: 'd1', type: 'sequence', name: 'S', relations: [],
      elements: [view('l', 'lifeline', { x: 40, y: 32 })],
    },
    models: { 'model-l': { id: 'model-l', kind: 'lifeline', name: ':CanvasView' } },
  });
  h.state.selection = ['l'];
  h.editing.cutSelection();
  h.editing.pasteClipboard();
  assert.equal(h.diagram.elements[0].modelId, 'model-l', '잘라내기 후 붙여넣기는 같은 모델을 유지합니다');
}
{
  /* Object·Node·Component·Artifact 인스턴스도 복사하면 개별 객체가 된다 */
  const h = harness({
    diagram: {
      id: 'd1', type: 'object', name: 'O', relations: [],
      elements: [
        view('o', 'object', { x: 0, y: 0 }),
        view('n', 'nodeinstance', { x: 200, y: 0 }),
      ],
    },
    models: {
      'model-o': { id: 'model-o', kind: 'object', name: 'canvasView', classifierModelId: 'model-c' },
      'model-n': { id: 'model-n', kind: 'nodeinstance', name: 'appServer' },
      'model-c': { id: 'model-c', kind: 'class', name: 'CanvasView' },
    },
  });
  h.state.selection = ['o', 'n'];
  h.editing.copySelection();
  h.editing.pasteClipboard();
  const pasted = h.diagram.elements.slice(2);
  assert.equal(pasted.length, 2);
  assert.notEqual(pasted[0].modelId, 'model-o', '인스턴스 복사본은 새 모델을 받습니다');
  assert.notEqual(pasted[1].modelId, 'model-n');
  h.state.models[pasted[0].modelId].name = 'RENAMED';
  assert.equal(h.state.models['model-o'].name, 'canvasView', '복사본을 고쳐도 원본 인스턴스는 그대로입니다');
  assert.equal(h.state.models[pasted[0].modelId].classifierModelId, 'model-c',
    '인스턴스가 가리키는 Class는 계속 공유해야 합니다');
  assert.equal(Object.values(h.state.models).filter(model => model.kind === 'class').length, 1);
  assert.match(h.log.status.at(-1), /^인스턴스 2개를 독립 모델로 붙여넣었습니다$/,
    '라벨이 같은 종류는 하나로 합쳐 세야 합니다');
}
{
  /* 배치·컴포넌트 다이어그램의 물리적 요소도 복사하면 별개의 것이 된다 */
  const h = harness({
    diagram: {
      id: 'd1', type: 'deployment', name: 'D', relations: [],
      elements: [
        view('n', 'node', { x: 0, y: 0 }),
        view('a', 'artifact', { x: 200, y: 0 }),
      ],
    },
    models: {
      'model-n': { id: 'model-n', kind: 'node', name: 'Client PC', stereotype: 'device' },
      'model-a': { id: 'model-a', kind: 'artifact', name: 'app.war' },
    },
  });
  h.state.selection = ['n', 'a'];
  h.editing.copySelection();
  h.editing.pasteClipboard();
  const pasted = h.diagram.elements.slice(2);
  assert.notEqual(pasted[0].modelId, 'model-n', 'Node 복사본은 새 모델을 받습니다');
  h.state.models[pasted[0].modelId].name = 'Server PC';
  assert.equal(h.state.models['model-n'].name, 'Client PC', '복사본 이름을 바꿔도 원본 Node는 그대로입니다');
  assert.equal(h.state.models[pasted[0].modelId].stereotype, 'device', '나머지 속성은 그대로 복제됩니다');
  assert.match(h.log.status.at(-1), /^노드 1개, 아티팩트 1개를 독립 모델로 붙여넣었습니다$/,
    '라벨이 다른 종류는 각각 세어 알려야 합니다');
}
{
  /* Class 같은 추상 분류자는 여전히 같은 모델의 두 번째 뷰다 */
  const h = harness({
    diagram: {
      id: 'd1', type: 'class', name: 'C', relations: [],
      elements: [view('c', 'class', { x: 0, y: 0 })],
    },
    models: { 'model-c': { id: 'model-c', kind: 'class', name: 'CanvasView' } },
  });
  h.state.selection = ['c'];
  h.editing.copySelection();
  h.editing.pasteClipboard();
  assert.equal(h.diagram.elements[1].modelId, 'model-c',
    '두 다이어그램에 보이는 Class는 하나의 Class여야 합니다');
  assert.doesNotMatch(h.log.status.at(-1) || '', /독립 모델/);
}
{
  /* 부모-자식 관계는 붙여넣은 사본 안에서 다시 연결된다 */
  const h = harness({
    diagram: {
      id: 'd1', type: 'class', name: 'D', relations: [],
      elements: [
        view('p', 'class', { x: 0, y: 0 }),
        view('c', 'part', { x: 10, y: 10, parentId: 'p' }),
        view('lonely', 'part', { x: 500, y: 0, parentId: 'missing' }),
      ],
    },
  });
  h.state.selection = ['p'];
  h.editing.copySelection();
  h.editing.pasteClipboard();
  const [newParent, newChild] = h.diagram.elements.slice(3);
  assert.equal(newChild.parentId, newParent.id);

  h.state.selection = ['lonely'];
  h.editing.copySelection();
  h.editing.pasteClipboard();
  assert.equal(h.diagram.elements.at(-1).parentId, undefined, '없는 부모 참조는 떨어뜨립니다');
}
{
  /* 이 다이어그램에 맞지 않는 종류는 걸러진다 */
  const h = harness({
    diagram: {
      id: 'd1', type: 'class', name: 'D', relations: [],
      elements: [view('a', 'class'), view('l', 'lifeline')],
    },
    models: {
      'model-a': { id: 'model-a', kind: 'class', name: 'A' },
      'model-l': { id: 'model-l', kind: 'lifeline', name: 'L' },
    },
  });
  h.state.selection = ['a', 'l'];
  h.editing.copySelection();
  h.editing.pasteClipboard();
  assert.equal(h.diagram.elements.length, 3, '맞지 않는 요소는 제외하고 붙여넣습니다');
  assert.ok(h.log.status.some(m => /일부 요소는 이 다이어그램 타입에 맞지 않아 제외되었습니다/.test(m)));
}
{
  const h = harness({
    diagram: { id: 'd1', type: 'class', name: 'D', relations: [], elements: [view('l', 'lifeline')] },
    models: { 'model-l': { id: 'model-l', kind: 'lifeline', name: 'L' } },
    deps: { diagramAllowsElementKind: () => false },
  });
  h.state.selection = ['l'];
  h.editing.copySelection();
  h.editing.pasteClipboard();
  assert.equal(h.log.status.at(-1), '복사한 요소를 이 다이어그램에 붙여넣을 수 없습니다');
  assert.equal(h.diagram.elements.length, 1);
}

/* ── 잘라내기 / 복제 ────────────────────────────────────────── */
{
  const h = harness({
    diagram: {
      id: 'd1', type: 'class', name: 'D', relations: [],
      elements: [view('a', 'class'), view('b', 'class', { x: 200 })],
    },
  });
  h.state.selection = ['a'];
  h.editing.cutSelection();
  assert.equal(h.diagram.elements.length, 1);
  assert.equal(h.diagram.elements[0].id, 'b');
  assert.match(h.log.status.at(-1), /잘라내기 완료 — Ctrl\+V로 붙여넣기/);
  h.editing.pasteClipboard();
  assert.equal(h.diagram.elements.length, 2, '잘라낸 요소를 다시 붙여넣을 수 있습니다');
}
{
  /* Ctrl+D는 클립보드를 건드리지 않는다 */
  const h = harness({
    diagram: {
      id: 'd1', type: 'class', name: 'D', relations: [],
      elements: [view('a', 'class'), view('b', 'class', { x: 200 })],
    },
    models: {
      'model-a': { id: 'model-a', kind: 'class', name: 'A' },
      'model-b': { id: 'model-b', kind: 'class', name: 'B' },
    },
  });
  h.state.selection = ['a'];
  h.editing.copySelection();
  h.state.selection = ['b'];
  h.editing.duplicateSelection();
  assert.equal(h.diagram.elements.length, 3);
  h.editing.pasteClipboard();
  const restored = h.diagram.elements.at(-1);
  assert.equal(restored.modelId, 'model-a', '클립보드에는 여전히 a가 들어 있어야 합니다');
}

/* ── 삭제 ───────────────────────────────────────────────────── */
{
  const h = harness({
    diagram: {
      id: 'd1', type: 'class', name: 'D',
      elements: [
        view('p', 'class'), view('c', 'part', { parentId: 'p' }), view('keep', 'class', { x: 400 }),
      ],
      relations: [{ id: 'r1', kind: 'association', modelId: 'model-r1', from: 'p', to: 'keep' }],
    },
  });
  h.editing.deleteSelection();
  assert.equal(h.diagram.elements.length, 3, '선택이 없으면 아무것도 지우지 않습니다');
  h.state.selection = ['p'];
  h.editing.deleteSelection();
  assert.deepEqual(h.diagram.elements.map(e => e.id), ['keep'], '자손도 함께 삭제합니다');
  assert.deepEqual(h.diagram.relations, [], '끊어진 관계도 삭제합니다');
  assert.deepEqual(h.state.selection, []);
}
{
  /* Communication Connector를 지우면 그 위의 메시지도 사라진다 */
  const h = harness({
    diagram: {
      id: 'd1', type: 'communication', name: 'C',
      elements: [view('l1', 'lifeline'), view('l2', 'lifeline', { x: 200 })],
      relations: [
        { id: 'conn', kind: 'commconnector', modelId: 'model-conn', from: 'l1', to: 'l2' },
        { id: 'msg', kind: 'comm-forward', modelId: 'model-msg', from: 'l1', to: 'l2', connectorId: 'conn' },
      ],
    },
  });
  h.state.selection = ['conn'];
  h.editing.deleteSelection();
  assert.deepEqual(h.diagram.relations, []);
}
{
  /* Time Constraint는 대상이 사라지면 같이 사라진다 */
  const h = harness({
    diagram: {
      id: 'd1', type: 'timing', name: 'T', relations: [],
      elements: [view('seg', 'timesegment'), view('tc', 'timeconstraint', { constrainedViewId: 'seg' })],
    },
  });
  h.state.selection = ['seg'];
  h.editing.deleteSelection();
  assert.deepEqual(h.diagram.elements, []);
}
{
  /* 모델 삭제는 모든 다이어그램의 뷰를 함께 지운다 */
  const other = {
    id: 'd2', type: 'class', name: 'Other',
    elements: [{ id: 'a2', kind: 'class', modelId: 'model-a', x: 0, y: 0, w: 80, h: 40, name: 'a' }],
    relations: [],
  };
  const h = harness({
    diagram: {
      id: 'd1', type: 'class', name: 'D',
      elements: [view('a', 'class'), view('b', 'class', { x: 200 })],
      relations: [{ id: 'r1', kind: 'association', modelId: 'model-r1', from: 'a', to: 'b' }],
    },
    extraDiagrams: [other],
    models: {
      'model-a': { id: 'model-a', kind: 'class', name: 'A' },
      'model-b': { id: 'model-b', kind: 'class', name: 'B' },
      'model-r1': { id: 'model-r1', kind: 'association', name: '' },
    },
  });
  h.editing.deleteFromModel();
  assert.equal(h.diagram.elements.length, 2, '선택이 없으면 아무것도 지우지 않습니다');
  h.state.selection = ['a'];
  h.editing.deleteFromModel();
  assert.deepEqual(h.diagram.elements.map(e => e.id), ['b']);
  assert.deepEqual(other.elements, [], '다른 다이어그램의 뷰도 지웁니다');
  assert.equal(h.state.models['model-a'], undefined);
  assert.equal(h.state.models['model-r1'], undefined, '끊어진 관계의 모델도 정리합니다');
  assert.equal(h.state.models['model-b'].name, 'B');
  assert.match(h.log.status.at(-1), /모델 1개와 모든 다이어그램의 연결된 뷰를 삭제했습니다/);
}

/* ── 자동 크기 ──────────────────────────────────────────────── */
{
  const h = harness({
    diagram: { id: 'd1', type: 'class', name: 'D', relations: [], elements: [view('a', 'class', { w: 400, h: 300 })] },
  });
  h.editing.autoSizeSelection();
  assert.equal(h.log.status.at(-1), '자동 크기를 적용할 요소를 선택하세요');
  h.state.selection = ['a'];
  h.editing.autoSizeSelection();
  assert.equal(h.byId('a').w, 0, '측정값이 다시 계산되도록 0으로 초기화합니다');
  assert.equal(h.byId('a').h, 0);
}

/* ── z-순서 ─────────────────────────────────────────────────── */
{
  const h = harness({
    diagram: {
      id: 'd1', type: 'class', name: 'D', relations: [],
      elements: [view('a', 'class'), view('b', 'class'), view('c', 'class')],
    },
  });
  h.state.selection = ['a'];
  h.editing.reorderSelection(true);
  assert.deepEqual(h.diagram.elements.map(e => e.id), ['b', 'c', 'a'], '맨 앞으로 보내면 마지막에 그립니다');
  h.editing.reorderSelection(false);
  assert.deepEqual(h.diagram.elements.map(e => e.id), ['a', 'b', 'c']);
  assert.equal(h.editing.canReorderSelection(true), true);
  h.state.selection = [];
  h.state.selectedId = null;
  assert.equal(h.editing.canReorderSelection(true), false);
  h.editing.reorderSelection(true);
  assert.match(h.log.status.at(-1), /순서를 변경할 요소 또는 Binding Connector를 선택하세요/);
}
{
  const h = harness({
    diagram: {
      id: 'd1', type: 'parametric', name: 'P', elements: [],
      relations: [
        { id: 'b1', kind: 'bindingconnector', modelId: 'm1', from: 'x', to: 'y' },
        { id: 'note', kind: 'notelink', modelId: 'm2', from: 'x', to: 'y' },
        { id: 'b2', kind: 'bindingconnector', modelId: 'm3', from: 'x', to: 'y' },
      ],
    },
  });
  const stack = h.editing.bindingConnectorStackInfo({ id: 'b1' });
  assert.equal(stack.total, 2);
  assert.equal(stack.index, 0);
  assert.equal(h.editing.bindingConnectorStackInfo({ id: 'note' }).index, -1);

  h.state.selection = ['b1'];
  h.state.selectedId = 'b1';
  assert.equal(h.editing.canReorderSelection(true), true);
  assert.equal(h.editing.canReorderSelection(false), false, '이미 맨 뒤입니다');
  h.editing.reorderSelection(true);
  assert.deepEqual(h.diagram.relations.map(r => r.id), ['b2', 'note', 'b1'],
    'Binding Connector 자리만 서로 바꾸고 다른 관계는 그대로 둡니다');
  assert.match(h.log.status.at(-1), /Binding Connector 순서를 2\/2\(으\)로 변경했습니다/);

  assert.equal(h.editing.reorderBindingConnector({ id: 'b1' }, 'forward'), false, '더 앞이 없으면 실패합니다');
  assert.equal(h.editing.reorderBindingConnector({ id: 'b1' }, 'backward'), true);
  assert.deepEqual(h.diagram.relations.map(r => r.id), ['b1', 'note', 'b2']);
  assert.equal(h.editing.reorderBindingConnector({ id: 'note' }, 'front'), false,
    'Binding Connector가 아니면 순서를 바꾸지 않습니다');
}
{
  const h = harness({
    diagram: {
      id: 'd1', type: 'parametric', name: 'P', elements: [],
      relations: [{ id: 'b1', kind: 'bindingconnector', modelId: 'm1', from: 'x', to: 'y' }],
    },
  });
  h.state.selection = ['b1'];
  h.state.selectedId = 'b1';
  h.editing.reorderSelection(true);
  assert.equal(h.log.status.at(-1), '이미 맨 앞의 커넥터입니다');
  h.editing.reorderSelection(false);
  assert.equal(h.log.status.at(-1), '이미 맨 뒤의 커넥터입니다');
}

console.log('selection editing tests: ok');
