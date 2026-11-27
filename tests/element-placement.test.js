'use strict';

const assert = require('node:assert/strict');
const { create, REQUIRED_FUNCTIONS, REQUIRED_VALUES } = require('../dist/browser/canvas/element-placement.js');

const GRID = 8;
let idSeq = 0;
const calls = [];
const statuses = [];

function harness(overrides = {}) {
  idSeq = 0;
  calls.length = 0;
  statuses.length = 0;
  const diagram = {
    id: 'd1', type: 'class', name: 'Class Diagram', elements: [], relations: [],
    ...(overrides.diagram || {}),
  };
  const state = {
    activeId: diagram.id, tool: 'class', selection: [], selectedId: null,
    diagrams: [diagram], models: {},
  };
  const record = name => (...args) => { calls.push([name, ...args]); };
  const deps = {
    ...Object.fromEntries(REQUIRED_FUNCTIONS.map(name => [name, record(name)])),
    activityAttachmentOwnerAtPoint: () => null,
    adoptView: view => view,
    borderAnchorFrac: () => 0.25,
    childViews: () => [],
    compositeAtPoint: () => null,
    compositeContainerAtPoint: () => null,
    compositePortOwnerAtPoint: () => null,
    createElement: (kind, x, y) => ({ id: `v${++idSeq}`, kind, x, y, w: 120, h: 60 }),
    dg: () => state.diagrams.find(item => item.id === state.activeId),
    flashStatus: message => { statuses.push(message); },
    ibdContainerAtPoint: () => null,
    lifelineAt: () => null,
    normalizeSize: view => { calls.push(['normalizeSize', view]); return view; },
    packageContainerAtPoint: () => null,
    parametricContainerAtPoint: () => null,
    relationAt: () => null,
    renderAll: record('renderAll'),
    setSelection: ids => { state.selection = ids; state.selectedId = ids[0] || null; },
    snap: value => Math.round(value / GRID) * GRID,
    snapshot: record('snapshot'),
    timingLifelineAtPoint: () => null,
    timingStateAtPoint: () => null,
    uid: () => `u${++idSeq}`,
    state,
    ACTIVITY_PIN_KINDS: new Set(['inputpin', 'outputpin']),
    FILL_DEFAULT: '#fffbd8',
    IBD_TYPED_KINDS: new Set(['part', 'reference']),
    KIND_META: {
      class: { label: 'Class' }, port: { label: 'Port' }, region: { label: 'Region' },
      compositestate: { label: 'Composite State' }, state: { label: 'State' },
      package: { label: 'Package' }, inputpin: { label: 'Input Pin' },
      connectionpointref: { label: 'Connection Point Reference' },
      execution: { label: 'Execution' }, interactioninline: { label: 'Inline Interaction' },
      part: { label: 'Part' }, reference: { label: 'Reference' },
      constraintproperty: { label: 'Constraint Property' },
      constraintparameter: { label: 'Constraint Parameter' },
      timingstate: { label: 'State / Condition' }, timesegment: { label: 'Time Segment' },
      timeconstraint: { label: 'Time Constraint' },
    },
    PACKAGE_CONTAINER_KINDS: new Set(['package']),
    STATE_VERTEX_KINDS: new Set(['state', 'compositestate']),
    ...overrides.deps,
  };
  return { deps, state, diagram, placement: create(deps) };
}

const called = name => calls.filter(entry => entry[0] === name);

assert.ok(Object.isFrozen(REQUIRED_FUNCTIONS) && Object.isFrozen(REQUIRED_VALUES));
assert.throws(() => create(), /요소 배치 의존성이 없습니다/);
assert.throws(() => create({ ...harness().deps, dg: undefined }), /dg/);
assert.throws(() => create({ ...harness().deps, state: undefined }), /state/);

{
  const { placement } = harness();
  assert.ok(Object.isFrozen(placement));
  assert.deepEqual(Object.keys(placement), ['placeElementForTool']);
}

{
  const { placement, state, diagram } = harness();
  placement.placeElementForTool({ x: 131, y: 74 }, 'class', null);
  assert.equal(called('snapshot').length, 1, '배치는 한 번의 Undo 스냅샷을 남깁니다');
  assert.equal(diagram.elements.length, 1);
  const [view] = diagram.elements;
  assert.deepEqual([view.x, view.y], [128, 72], '새 요소는 그리드에 맞춰 놓입니다');
  assert.deepEqual(state.selection, [view.id]);
  assert.equal(state.tool, 'select', '배치 후에는 선택 도구로 돌아갑니다');
  assert.equal(called('renderAll').length, 1);
}

{
  const { placement, diagram } = harness({ diagram: { type: 'state' } });
  placement.placeElementForTool({ x: 40, y: 40 }, 'state', null);
  assert.equal(called('attachToContainingRegion').length, 1,
    'State Diagram의 정점은 놓인 Region에 붙어야 합니다');
  assert.equal(called('attachToActivityContainer').length, 0);
  assert.equal(diagram.elements.length, 1);
}
{
  const { placement } = harness({ diagram: { type: 'activity' } });
  placement.placeElementForTool({ x: 40, y: 40 }, 'class', null);
  assert.equal(called('attachToActivityContainer').length, 1);
}
{
  const owner = { id: 'pkg', kind: 'package' };
  const { placement, diagram } = harness({
    diagram: { type: 'package' },
    deps: { packageContainerAtPoint: () => owner },
  });
  placement.placeElementForTool({ x: 40, y: 40 }, 'package', null);
  assert.equal(diagram.elements[0].parentId, 'pkg', '패키지 안에 놓으면 부모가 됩니다');
}

{
  const { placement, diagram, state } = harness({ diagram: { type: 'state' } });
  placement.placeElementForTool({ x: 40, y: 40 }, 'compositestate', null);
  assert.deepEqual(diagram.elements.map(view => view.kind), ['compositestate', 'region']);
  const [composite, region] = diagram.elements;
  assert.equal(region.parentId, composite.id);
  assert.equal(region.regionOrder, 0);
  assert.deepEqual(state.selection, [composite.id], '선택은 Region이 아니라 Composite State입니다');
}

{
  const { placement, diagram, state } = harness();
  placement.placeElementForTool({ x: 40, y: 40 }, 'execution', null);
  assert.equal(diagram.elements.length, 0);
  assert.equal(called('snapshot').length, 0, '거절된 배치는 Undo 스냅샷을 남기지 않습니다');
  assert.equal(state.tool, 'class', '도구도 그대로 둡니다');
  assert.match(statuses.at(-1), /라이프라인의 점선을 클릭/);
}
{
  const life = { id: 'life-1', x: 100, y: 40, w: 80, h: 30 };
  const { placement, diagram } = harness({ deps: { lifelineAt: () => life } });
  placement.placeElementForTool({ x: 40, y: 200 }, 'execution', null);
  assert.equal(diagram.elements.length, 1);
  const [box] = diagram.elements;
  assert.equal(box.kind, 'execution');
  assert.equal(box.lifeId, 'life-1');
  assert.equal(box.x, life.x + life.w / 2 - 6, '실행 박스는 라이프라인 중심선에 붙습니다');
  assert.equal(box.y, 200, '클릭 위치가 라이프라인 머리보다 아래면 그대로 씁니다');
}
{
  const { placement, diagram } = harness();
  placement.placeElementForTool({ x: 40, y: 40 }, 'connectionpointref', null);
  assert.equal(diagram.elements.length, 0);
  assert.match(statuses.at(-1), /하위 상태 머신의 테두리/);
}
{
  const owner = { id: 'sub', kind: 'submachinestate' };
  const { placement, diagram } = harness();
  placement.placeElementForTool({ x: 40, y: 40 }, 'connectionpointref', owner);
  assert.equal(diagram.elements.length, 1);
  assert.equal(diagram.elements[0].parentId, 'sub');
  assert.equal(diagram.elements[0].borderAnchor, 0.25);
}

const owner = (kind, extra = {}) => ({ id: `${kind}-owner`, kind, x: 40, y: 60, w: 200, h: 120, ...extra });

[
  { tool: 'part', type: 'class', dep: 'compositeContainerAtPoint', hostKind: 'class',
    reject: /클래스 또는 협업 안/, attach: 'attachPartToCompositeContainer' },
  { tool: 'part', type: 'ibd', dep: 'ibdContainerAtPoint', hostKind: 'ibdframe',
    reject: /내부 블록 프레임, 파트 또는 참조 안/, attach: 'attachToInternalBlockContainer' },
  { tool: 'constraintproperty', type: 'parametric', dep: 'parametricContainerAtPoint',
    hostKind: 'parametricframe', reject: /파라메트릭 프레임 안/, attach: 'attachToParametricContainer' },
].forEach(({ tool, type, dep, hostKind, reject, attach }) => {
  {
    const { placement, diagram, state } = harness({ diagram: { type } });
    placement.placeElementForTool({ x: 120, y: 90 }, tool, null);
    assert.equal(diagram.elements.length, 0, `${tool}: 호스트가 없으면 아무것도 만들지 않습니다`);
    assert.equal(called('snapshot').length, 0);
    assert.equal(state.tool, 'class');
    assert.match(statuses.at(-1), reject);
  }
  {
    const host = owner(hostKind);
    const { placement, diagram } = harness({ diagram: { type }, deps: { [dep]: () => host } });
    placement.placeElementForTool({ x: 120, y: 90 }, tool, null);
    assert.equal(diagram.elements.length, 1);
    assert.equal(diagram.elements[0].parentId, host.id, `${tool}: 클릭한 컨테이너의 자식이 됩니다`);
    assert.equal(called(attach).length, 1, `${tool}: ${attach}로 크기·위치를 맞춥니다`);
    assert.equal(called('normalizeSize').length, 1);
  }
});

[
  { tool: 'port', dep: 'compositePortOwnerAtPoint', type: 'class', reject: /클래스, 협업 또는 파트의 테두리/ },
  { tool: 'constraintparameter', dep: 'parametricContainerAtPoint', type: 'parametric',
    reject: /파라메트릭 프레임 또는 제약 속성의 테두리/ },
  { tool: 'inputpin', dep: 'activityAttachmentOwnerAtPoint', type: 'activity',
    reject: /동작 또는 신호·시간 이벤트 동작의 테두리/ },
].forEach(({ tool, dep, type, reject }) => {
  {
    const { placement, diagram } = harness({ diagram: { type } });
    placement.placeElementForTool({ x: 120, y: 90 }, tool, null);
    assert.equal(diagram.elements.length, 0);
    assert.match(statuses.at(-1), reject);
  }
  {
    const host = owner('class');
    const { placement, diagram } = harness({ diagram: { type }, deps: { [dep]: () => host } });
    placement.placeElementForTool({ x: 120, y: 90 }, tool, null);
    assert.equal(diagram.elements[0].parentId, host.id);
    assert.equal(diagram.elements[0].borderAnchor, 0.25, `${tool}: 테두리 위치를 비율로 기록합니다`);
  }
});

['bdd', 'ibd'].forEach(type => {
  const { placement } = harness({ diagram: { type } });
  placement.placeElementForTool({ x: 10, y: 10 }, 'port', null);
  assert.match(statuses.at(-1), type === 'bdd' ? /블록, 인터페이스 블록/ : /내부 블록 프레임, 파트 또는 참조/);
});

{
  const { placement, diagram } = harness({ diagram: { type: 'timing' } });
  placement.placeElementForTool({ x: 10, y: 10 }, 'timingstate', null);
  assert.equal(diagram.elements.length, 0);
  assert.match(statuses.at(-1), /타이밍 라이프라인 내부/);
}
{
  const life = owner('timinglifeline');
  const existing = [{ id: 'ts1', kind: 'timingstate' }, { id: 'ts2', kind: 'timingstate' }];
  const { placement, diagram } = harness({
    diagram: { type: 'timing' },
    deps: { timingLifelineAtPoint: () => life, childViews: () => existing },
  });
  placement.placeElementForTool({ x: 10, y: 10 }, 'timingstate', null);
  assert.equal(diagram.elements[0].parentId, life.id);
  assert.equal(diagram.elements[0].stateOrder, 2, '행 순서는 기존 State 개수를 잇습니다');
}
{
  const { placement, diagram } = harness({ diagram: { type: 'timing' } });
  placement.placeElementForTool({ x: 10, y: 10 }, 'timesegment', null);
  assert.equal(diagram.elements.length, 0);
  assert.match(statuses.at(-1), /상태·조건 행을 클릭/);
}
{
  const row = owner('timingstate', { x: 30, y: 90, w: 400 });
  const { placement, diagram } = harness({
    diagram: { type: 'timing' }, deps: { timingStateAtPoint: () => row },
  });
  placement.placeElementForTool({ x: 200, y: 95 }, 'timesegment', null);
  assert.equal(diagram.elements[0].parentId, row.id);
  assert.equal(diagram.elements[0].y, row.y, 'Time Segment는 State 행 높이에 맞춥니다');
}
{
  const { placement, diagram } = harness({ diagram: { type: 'timing' } });
  placement.placeElementForTool({ x: 10, y: 10 }, 'timeconstraint', null);
  assert.equal(diagram.elements.length, 0);
  assert.match(statuses.at(-1), /시간 구간 또는 메시지를 클릭/);
}
{
  const segment = { id: 'seg-1', kind: 'timesegment', x: 100, y: 90, w: 200, h: 20 };
  const { placement, diagram } = harness({ diagram: { type: 'timing' } });
  placement.placeElementForTool({ x: 150, y: 95 }, 'timeconstraint', segment);
  assert.equal(diagram.elements[0].constrainedViewId, 'seg-1');
  assert.equal(diagram.elements[0].anchorRatio, 0.25, '세그먼트 위 상대 위치를 비율로 기록합니다');
}
{
  const message = { id: 'msg-1', kind: 'timingmessage' };
  const { placement, diagram } = harness({
    diagram: { type: 'timing' }, deps: { relationAt: () => message },
  });
  placement.placeElementForTool({ x: 150, y: 95 }, 'timeconstraint', null);
  assert.equal(diagram.elements[0].constrainedViewId, 'msg-1');
  assert.equal(diagram.elements[0].anchorRatio, 0.5, '메시지에는 가운데로 붙습니다');
}

{
  const { placement, diagram } = harness({ diagram: { type: 'state' } });
  placement.placeElementForTool({ x: 10, y: 10 }, 'region', null);
  assert.equal(diagram.elements.length, 0);
  assert.match(statuses.at(-1), /복합 상태 내부/);
}
{
  const { placement, diagram } = harness({
    diagram: { type: 'state' }, deps: { compositeAtPoint: () => owner('state') },
  });
  placement.placeElementForTool({ x: 10, y: 10 }, 'region', null);
  assert.equal(diagram.elements.length, 0, 'Composite State가 아니면 거절합니다');
}
{
  const composite = owner('compositestate');
  const { placement, diagram } = harness({
    diagram: { type: 'state' },
    deps: {
      compositeAtPoint: () => composite,
      childViews: () => [{ id: 'r1', kind: 'region' }],
    },
  });
  placement.placeElementForTool({ x: 10, y: 10 }, 'region', null);
  assert.equal(diagram.elements[0].parentId, composite.id);
  assert.equal(diagram.elements[0].regionOrder, 1, '기존 Region 다음 순서를 받습니다');
}

{
  const { placement, state, diagram } = harness();
  placement.placeElementForTool({ x: 40, y: 40 }, 'interactioninline', null);
  assert.equal(state.diagrams.length, 2);
  const sequence = state.diagrams[1];
  assert.equal(sequence.type, 'sequence');
  assert.equal(sequence.name, 'Inline Sequence 1');
  assert.equal(state.activeId, diagram.id, '만든 뒤에도 원래 다이어그램에 머뭅니다');
  const [frame] = diagram.elements;
  assert.equal(frame.interactionDiagramId, sequence.id);
  assert.equal(frame.name, sequence.name);
  assert.match(statuses.at(-1), /인라인 시퀀스 다이어그램을 만들었습니다/);
}

{
  const boundary = { id: 'scope', modelId: 'system-model', kind: 'c4system', c4Boundary: true,
    x: 100, y: 100, w: 500, h: 320 };
  const { placement, diagram, state } = harness({ diagram: { type: 'c4container', elements: [boundary] } });
  placement.placeElementForTool({ x: 10, y: 10 }, 'c4container', null);
  assert.equal(diagram.elements.length, 1);
  assert.equal(called('snapshot').length, 0, 'Rejected placements must not create history');
  assert.match(statuses.at(-1), /시스템 경계 안/);

  placement.placeElementForTool({ x: 175, y: 200 }, 'c4container', null);
  const container = diagram.elements[1];
  assert.equal(container.parentId, boundary.id);
  assert.equal(container.c4OwnerModelId, boundary.modelId);
  assert.deepEqual(state.selection, [container.id]);
}
{
  const { placement, diagram } = harness({ diagram: { type: 'c4context' } });
  placement.placeElementForTool({ x: 160, y: 120 }, 'c4system', null);
  placement.placeElementForTool({ x: 460, y: 120 }, 'c4system', null);
  assert.equal(diagram.elements[0].c4ContextFocus, true);
  assert.equal(diagram.elements[1].c4ContextFocus, undefined);
}

console.log('element placement tests: ok');
