'use strict';

const assert = require('node:assert/strict');
const {
  REQUIRED_FUNCTIONS,
  REQUIRED_VALUES,
  KIND_SETS,
  create,
} = require('../relation-rules.js');
const { KIND_META } = require('../presentation-registry.js');

/* app.js가 쓰는 것과 같은 종류 집합 */
const COMPOSITE_CONNECTABLE_KINDS = new Set(['part', 'port']);
const BDD_CLASSIFIER_KINDS = new Set(['block', 'valuetype', 'interfaceblock', 'constraintblock']);
const BDD_RELATION_KINDS = new Set([
  'generalization', 'composition', 'aggregation', 'association', 'directed', 'dependency',
  'connector', 'notelink',
]);
const IBD_CONNECTABLE_KINDS = new Set(['part', 'reference', 'port']);
const PARAMETRIC_CONNECTABLE_KINDS = new Set(['constraintparameter', 'value']);
const PACKAGE_CONTAINER_KINDS = new Set(['package', 'model', 'subsystem']);
const ACTIVITY_ACTION_KINDS = new Set(['action', 'sendsignal', 'acceptsignal', 'timeevent']);
const ACTIVITY_OBJECT_KINDS = new Set([
  'objectnode', 'centralbuffer', 'activitydatastore', 'activityparameter',
  'inputpin', 'outputpin', 'expansioninput', 'expansionoutput',
]);
const ACTIVITY_VERTEX_KINDS = new Set([
  ...ACTIVITY_ACTION_KINDS, 'initial', 'final', 'flowfinal', 'decision', 'merge', 'forkbar', 'joinbar',
  'structuredactivity', 'interactionuse', 'interactioninline', ...ACTIVITY_OBJECT_KINDS,
]);
const INFORMATION_FLOW_ENDPOINT_KINDS = new Set([
  'class', 'interface', 'component', 'artifact', 'node', 'actor', 'usecase', 'informationitem',
]);
const REQUIREMENT_RELATION_KINDS = new Set([
  'reqcontainment', 'reqcopy', 'derivereqt', 'satisfy', 'verify', 'refine', 'trace',
]);
const REQUIREMENT_MODEL_ELEMENT_KINDS = new Set([
  'requirement', 'class', 'component', 'usecase', 'artifact', 'interface', 'node', 'actor',
]);

function harness(diagram, models = {}) {
  const active = diagram || { id: 'd1', type: 'class', name: 'D', elements: [], relations: [] };
  const state = { diagrams: [active], activeId: active.id, models };
  const dg = () => state.diagrams.find(d => d.id === state.activeId);
  const parentOf = view => active.elements.find(e => e.id === view.parentId);
  const deps = {
    activityAncestor: (view, kind) => {
      let current = view;
      const seen = new Set();
      while (current && current.parentId && !seen.has(current.parentId)) {
        seen.add(current.parentId);
        current = parentOf(current);
        if (current && current.kind === kind) return current;
      }
      return null;
    },
    bindingTypeCompatibility: (a, b) => (a && b && a !== b
      ? { status: 'error', message: '연결한 두 끝의 Type이 다릅니다' }
      : { status: 'ok', message: '' }),
    dg,
    isViewAncestor: (ancestor, view) => {
      let current = view;
      const seen = new Set();
      while (current && current.parentId && !seen.has(current.parentId)) {
        seen.add(current.parentId);
        current = parentOf(current);
        if (current && current.id === ancestor.id) return true;
      }
      return false;
    },
    state,
    ACTIVITY_ACTION_KINDS,
    ACTIVITY_OBJECT_KINDS,
    ACTIVITY_VERTEX_KINDS,
    BDD_CLASSIFIER_KINDS,
    BDD_RELATION_KINDS,
    COMPOSITE_CONNECTABLE_KINDS,
    IBD_CONNECTABLE_KINDS,
    INFORMATION_FLOW_ENDPOINT_KINDS,
    KIND_META,
    PACKAGE_CONTAINER_KINDS,
    PARAMETRIC_CONNECTABLE_KINDS,
    REQUIREMENT_MODEL_ELEMENT_KINDS,
    REQUIREMENT_RELATION_KINDS,
  };
  return { deps, state, diagram: active, rules: create(deps) };
}

const v = (id, kind, extra = {}) => ({ id, kind, ...extra });

assert.ok(Object.isFrozen(REQUIRED_FUNCTIONS));
assert.ok(Object.isFrozen(REQUIRED_VALUES));
assert.ok(Object.isFrozen(KIND_SETS));

/* ── 의존성 검증 ────────────────────────────────────────────── */
assert.throws(() => create(), /Relation Rules 의존성이 없습니다/);
assert.throws(() => create({}), /dg/);
{
  const { deps } = harness();
  const { state: _state, ...withoutState } = deps;
  assert.throws(() => create(withoutState), /state/);
  assert.throws(() => create({ ...deps, BDD_RELATION_KINDS: ['connector'] }), /BDD_RELATION_KINDS\.has/);
  assert.throws(() => create({ ...deps, KIND_META: null }), /KIND_META/);
}
{
  const { rules } = harness();
  assert.ok(Object.isFrozen(rules));
}

/* ── Transition 방향 ────────────────────────────────────────── */
{
  const { rules } = harness();
  const t = rules.transitionDirectionError;
  assert.equal(t(v('a', 'state'), v('b', 'state')), '');
  assert.equal(t(null, v('b', 'state')), '', '끝점이 없으면 판정하지 않습니다');
  assert.match(t(v('a', 'statefinal'), v('b', 'state')), /나가는 Transition을 만들 수 없습니다/);
  assert.match(t(v('a', 'exitpoint'), v('b', 'state')), /나가는 Transition을 만들 수 없습니다/);
  assert.match(t(v('a', 'terminate'), v('b', 'state')), /나가는 Transition을 만들 수 없습니다/);
  assert.equal(t(v('a', 'connectionpointref'), v('b', 'state')),
    'Entry Connection Point Reference에서는 나가는 Transition을 만들 수 없습니다');
  assert.equal(t(v('a', 'connectionpointref', { referenceKind: 'exit' }), v('b', 'state')), '',
    'Exit 참조에서는 나갈 수 있습니다');
  assert.equal(t(v('a', 'state'), v('b', 'entrypoint')), 'Entry Point에는 들어오는 Transition을 만들 수 없습니다');
  assert.equal(t(v('a', 'state'), v('b', 'connectionpointref', { referenceKind: 'exit' })),
    'Exit Connection Point Reference에는 들어오는 Transition을 만들 수 없습니다');
  assert.equal(t(v('a', 'state'), v('b', 'connectionpointref')), '');
}

/* ── Composite Structure ────────────────────────────────────── */
{
  const { rules } = harness();
  const c = rules.compositeRelationError;
  assert.equal(c('csconnector', v('a', 'part'), v('b', 'port')), '');
  assert.match(c('csconnector', v('a', 'class'), v('b', 'port')), /Part 또는 Port 사이에만/);
  assert.match(c('csconnector', null, v('b', 'port')), /Part 또는 Port 사이에만/);
  assert.equal(c('rolebinding', v('a', 'collaborationuse'), v('b', 'part')), '');
  assert.match(c('rolebinding', v('a', 'part'), v('b', 'collaborationuse')),
    /Collaboration Use에서 Part 방향으로/);
  assert.equal(c('association', v('a', 'class'), v('b', 'class')), '', '다른 관계는 통과시킵니다');
}

/* ── Activity ───────────────────────────────────────────────── */
{
  const h = harness({
    id: 'd1', type: 'activity', name: 'A', relations: [],
    elements: [
      v('region', 'interruptibleregion'),
      v('inside', 'action', { parentId: 'region' }),
      v('inside2', 'action', { parentId: 'region' }),
      v('outside', 'action'),
      v('outside2', 'action'),
    ],
  });
  const el = id => h.diagram.elements.find(e => e.id === id);
  const a = h.rules.activityRelationError;
  assert.equal(a('association', v('a', 'action'), v('b', 'action')), '', 'Activity 관계가 아니면 통과');
  assert.equal(a('controlflow', v('a', 'action'), v('b', 'decision')), '');
  assert.match(a('controlflow', v('a', 'class'), v('b', 'action')), /Activity Node 사이에만/);
  assert.match(a('controlflow', v('a', 'action'), v('a', 'action')), /같은 요소에 다시 연결할 수 없습니다/);
  assert.match(a('controlflow', v('a', 'final'), v('b', 'action')), /나가는 흐름을 만들 수 없습니다/);
  assert.match(a('controlflow', v('a', 'flowfinal'), v('b', 'action')), /나가는 흐름을 만들 수 없습니다/);
  assert.equal(a('controlflow', v('a', 'action'), v('b', 'initial')), 'Initial Node에는 들어오는 흐름을 만들 수 없습니다');
  assert.equal(a('controlflow', v('a', 'objectnode'), v('b', 'action')), 'Object Node와 Pin에는 Object Flow를 사용하세요');

  assert.equal(a('objectflow', v('a', 'action'), v('b', 'objectnode')), '');
  assert.match(a('objectflow', v('a', 'decision'), v('b', 'objectnode')), /Action, Object Node, Pin 또는 Expansion Node/);
  assert.match(a('objectflow', v('a', 'inputpin'), v('b', 'objectnode')), /외부 Object Flow의 도착점으로/);
  assert.match(a('objectflow', v('a', 'objectnode'), v('b', 'outputpin')), /외부 Object Flow의 시작점으로/);
  assert.equal(a('objectflow', v('a', 'outputpin'), v('b', 'inputpin')), '');

  assert.equal(a('exceptionhandler', v('a', 'action'), v('b', 'structuredactivity')), '');
  assert.match(a('exceptionhandler', v('a', 'action'), v('b', 'decision')), /Action 또는 Structured Activity Node/);

  assert.match(a('activityinterrupt', el('outside'), el('outside2')),
    /Interruptible Activity Region 내부의 노드에서 시작해야 합니다/);
  assert.match(a('activityinterrupt', el('inside'), el('inside2')),
    /같은 Interruptible Activity Region 밖에 있어야 합니다/);
  assert.equal(a('activityinterrupt', el('inside'), el('outside')), '');
}

/* ── Package ────────────────────────────────────────────────── */
{
  const h = harness({
    id: 'd1', type: 'package', name: 'P', relations: [],
    elements: [
      v('outer', 'model'),
      v('inner', 'package', { parentId: 'outer' }),
    ],
  });
  const p = h.rules.packageRelationError;
  assert.equal(p('containment', v('a', 'package'), v('b', 'model')), '');
  assert.match(p('containment', v('a', 'note'), v('b', 'model')), /Package, Model 또는 Subsystem에서 컨테이너 방향으로/);
  assert.equal(p('containment', v('a', 'package'), v('a', 'package')), 'Package 포함 관계가 순환할 수 없습니다');
  assert.equal(p('containment', h.diagram.elements[0], h.diagram.elements[1]),
    'Package 포함 관계가 순환할 수 없습니다', '자손을 컨테이너로 삼을 수 없습니다');
  assert.equal(p('dependency', v('a', 'package'), v('b', 'subsystem')), '');
  assert.match(p('dependency', v('a', 'class'), v('b', 'package')), /Package, Model 또는 Subsystem 사이에/);
}
{
  /* Package Diagram이 아니면 Dependency 제약이 없다 */
  const h = harness();
  assert.equal(h.rules.packageRelationError('dependency', v('a', 'class'), v('b', 'class')), '');
}

/* ── Profile ────────────────────────────────────────────────── */
{
  const h = harness({
    id: 'd1', type: 'profile', name: 'P',
    elements: [],
    relations: [
      { id: 'x1', kind: 'extension', from: 's1', to: 'm1' },
      { id: 'g1', kind: 'generalization', from: 's2', to: 's1' },
    ],
  });
  const f = h.rules.profileRelationError;
  assert.equal(f('extension', v('s3', 'stereotype'), v('m1', 'metaclass')), '');
  assert.match(f('extension', v('s1', 'metaclass'), v('m1', 'stereotype')), /Stereotype에서 MetaClass 방향으로/);
  assert.equal(f('extension', v('s1', 'stereotype'), v('m1', 'metaclass')),
    '같은 Stereotype과 MetaClass 사이에 Extension이 이미 있습니다');
  assert.equal(f('extension', v('s1', 'stereotype'), v('m1', 'metaclass'), 'x1'), '',
    '자기 자신을 편집할 때는 중복으로 보지 않습니다');

  assert.equal(f('generalization', v('s3', 'stereotype'), v('s1', 'stereotype')), '');
  assert.match(f('generalization', v('s1', 'stereotype'), v('m1', 'metaclass')), /Stereotype 사이에만/);
  assert.equal(f('generalization', v('s1', 'stereotype'), v('s1', 'stereotype')),
    'Stereotype은 자기 자신을 일반화할 수 없습니다');
  assert.equal(f('generalization', v('s1', 'stereotype'), v('s2', 'stereotype')),
    'Stereotype Generalization이 순환할 수 없습니다');
  assert.equal(f('generalization', v('s1', 'stereotype'), v('s2', 'stereotype'), 'g1'), '');
}
{
  const h = harness();
  assert.equal(h.rules.profileRelationError('extension', v('a', 'class'), v('b', 'class')), '',
    'Profile Diagram이 아니면 검사하지 않습니다');
}

/* ── Information Flow ───────────────────────────────────────── */
{
  const { rules } = harness();
  const i = rules.informationFlowRelationError;
  assert.equal(i('dependency', v('a', 'note'), v('b', 'note')), '');
  assert.equal(i('informationflow', v('a', 'component'), v('b', 'class')), '');
  assert.match(i('informationflow', v('a', 'note'), v('b', 'class')), /정보 송수신 주체 사이에/);
  assert.equal(i('informationflow', v('a', 'class'), v('a', 'class')),
    'Information Flow는 같은 요소에 다시 연결할 수 없습니다');
}

/* ── Requirement ────────────────────────────────────────────── */
{
  const { rules } = harness();
  const r = rules.requirementRelationError;
  assert.equal(r('association', v('a', 'class'), v('b', 'class')), '');
  assert.equal(r('trace', v('a', 'artifact'), v('b', 'requirement')), '');
  assert.match(r('trace', v('a', 'note'), v('b', 'requirement')), /추적 가능한 모델 요소 사이에/);
  assert.equal(r('trace', v('a', 'requirement'), v('a', 'requirement')),
    'Requirement 관계는 같은 요소로 되돌아갈 수 없습니다');
  for (const kind of ['reqcontainment', 'reqcopy', 'derivereqt']) {
    assert.equal(r(kind, v('a', 'requirement'), v('b', 'requirement')), '');
    assert.match(r(kind, v('a', 'class'), v('b', 'requirement')), /Requirement 사이에만/);
  }
  for (const kind of ['verify', 'satisfy', 'refine']) {
    assert.equal(r(kind, v('a', 'class'), v('b', 'requirement')), '');
    assert.match(r(kind, v('a', 'requirement'), v('b', 'class')), /Requirement 방향으로/);
  }
}

/* ── BDD ────────────────────────────────────────────────────── */
{
  const h = harness({
    id: 'd1', type: 'bdd', name: 'B',
    elements: [],
    relations: [
      { id: 'g1', kind: 'generalization', from: 'b2', to: 'b1' },
      { id: 'c1', kind: 'composition', from: 'b3', to: 'b1' },
    ],
  });
  const b = h.rules.bddRelationError;
  assert.equal(b('rolebinding', v('a', 'block'), v('b', 'block')), '', 'BDD 관계 종류가 아니면 통과');
  assert.equal(b('generalization', null, v('b', 'block')), 'BDD 관계의 연결 대상을 찾을 수 없습니다');
  assert.equal(b('notelink', v('a', 'note'), v('b', 'block')), '');
  assert.equal(b('notelink', v('a', 'block'), v('b', 'block')), 'Note Link의 한쪽 끝은 Note여야 합니다');
  assert.match(b('association', v('a', 'block'), v('a', 'block')), /같은 요소로 되돌아갈 수 없습니다/);
  assert.equal(b('connector', v('a', 'port'), v('b', 'port')), '');
  assert.equal(b('connector', v('a', 'block'), v('b', 'port')), 'BDD Connector는 Port 사이에 연결하세요');
  assert.equal(b('generalization', v('a', 'block'), v('b', 'block')), '');
  assert.match(b('generalization', v('a', 'block'), v('b', 'valuetype')), /같은 종류의 Block Classifier 사이에/);
  assert.match(b('composition', v('a', 'block'), v('b', 'object')), /Block Classifier 사이에 연결하세요/);
  assert.equal(b('association', v('a', 'block'), v('b', 'object')), '');
  assert.match(b('association', v('a', 'block'), v('b', 'note')), /Block Classifier 또는 Object 사이에/);
  assert.equal(b('generalization', v('b1', 'block'), v('b2', 'block')), 'BDD Generalization이 순환할 수 없습니다');
  assert.equal(b('generalization', v('b1', 'block'), v('b2', 'block'), 'g1'), '');
  assert.equal(b('composition', v('b1', 'block'), v('b3', 'block')), 'Block Composition 계층이 순환할 수 없습니다');
}
{
  const h = harness();
  assert.equal(h.rules.bddRelationError('connector', v('a', 'block'), v('b', 'block')), '',
    'BDD가 아니면 검사하지 않습니다');
}

/* ── IBD ────────────────────────────────────────────────────── */
{
  const h = harness({
    id: 'd1', type: 'ibd', name: 'I',
    elements: [],
    relations: [{ id: 'c1', kind: 'connector', from: 'p1', to: 'p2' }],
  });
  const i = h.rules.ibdRelationError;
  assert.equal(i('connector', null, v('b', 'port')), 'IBD 관계의 연결 대상을 찾을 수 없습니다');
  assert.equal(i('notelink', v('a', 'note'), v('b', 'part')), '');
  assert.equal(i('notelink', v('a', 'part'), v('b', 'part')), 'Note Link의 한쪽 끝은 Note여야 합니다');
  assert.equal(i('association', v('a', 'part'), v('b', 'part')),
    'Internal Block Diagram에서는 Connector와 Note Link만 사용할 수 있습니다');
  assert.equal(i('connector', v('a', 'part'), v('b', 'port')), '');
  assert.match(i('connector', v('a', 'class'), v('b', 'port')), /Part, Reference 또는 Port 사이에/);
  assert.equal(i('connector', v('a', 'part'), v('a', 'part')), 'IBD Connector는 같은 요소로 되돌아갈 수 없습니다');
  assert.equal(i('connector', v('p1', 'port'), v('p2', 'port')), '같은 IBD 요소 사이에 Connector가 이미 있습니다');
  assert.equal(i('connector', v('p2', 'port'), v('p1', 'port')),
    '같은 IBD 요소 사이에 Connector가 이미 있습니다', '방향이 반대여도 중복입니다');
  assert.equal(i('connector', v('p1', 'port'), v('p2', 'port'), 'c1'), '');
}

/* ── Parametric ─────────────────────────────────────────────── */
{
  const h = harness({
    id: 'd1', type: 'parametric', name: 'P',
    elements: [],
    relations: [{ id: 'b1', kind: 'bindingconnector', from: 'v1', to: 'v2' }],
  }, { ms: { id: 'ms', kind: 'valuetype', name: 'Milliseconds' } });
  const p = h.rules.parametricRelationError;
  assert.equal(p('bindingconnector', null, v('b', 'value')), 'Parametric 관계의 연결 대상을 찾을 수 없습니다');
  assert.equal(p('notelink', v('a', 'note'), v('b', 'value')), '');
  assert.equal(p('notelink', v('a', 'value'), v('b', 'value')), 'Note Link의 한쪽 끝은 Note여야 합니다');
  assert.equal(p('connector', v('a', 'value'), v('b', 'value')),
    'Parametric Diagram에서는 Binding Connector와 Note Link만 사용할 수 있습니다');
  assert.match(p('bindingconnector', v('a', 'part'), v('b', 'value')),
    /Constraint Parameter 또는 Value Property 사이에/);
  assert.equal(p('bindingconnector', v('a', 'value'), v('a', 'value')),
    'Binding Connector는 같은 요소로 되돌아갈 수 없습니다');
  assert.equal(
    p('bindingconnector',
      v('a', 'value', { classifierModelId: 'ms' }),
      v('b', 'constraintparameter', { classifierModelId: 'other' })),
    '연결한 두 끝의 Type이 다릅니다',
    'Type 비호환은 Validation의 판정을 그대로 씁니다',
  );
  assert.equal(p('bindingconnector', v('v1', 'value'), v('v2', 'constraintparameter')),
    '같은 Parameter/Value 사이에 Binding Connector가 이미 있습니다');
  assert.equal(p('bindingconnector', v('v2', 'value'), v('v1', 'constraintparameter')),
    '같은 Parameter/Value 사이에 Binding Connector가 이미 있습니다');
  assert.equal(p('bindingconnector', v('v1', 'value'), v('v2', 'constraintparameter'), 'b1'), '');
}

/* ── relationError는 아홉 규칙을 순서대로 적용한다 ──────────── */
{
  const h = harness({
    id: 'd1', type: 'activity', name: 'A', relations: [], elements: [],
  });
  assert.equal(h.rules.relationError('controlflow', v('a', 'action'), v('b', 'decision')), '');
  assert.match(h.rules.relationError('controlflow', v('a', 'class'), v('b', 'action')),
    /Activity Node 사이에만/);
  /* Composite 규칙이 Activity 규칙보다 먼저 판정된다 */
  assert.match(h.rules.relationError('rolebinding', v('a', 'part'), v('b', 'collaborationuse')),
    /Collaboration Use에서 Part 방향으로/);
}
{
  const h = harness({ id: 'd1', type: 'ibd', name: 'I', relations: [], elements: [] });
  assert.match(h.rules.relationError('association', v('a', 'part'), v('b', 'part')),
    /Connector와 Note Link만 사용할 수 있습니다/);
  assert.equal(h.rules.relationError('connector', v('a', 'part'), v('b', 'port')), '');
  assert.equal(h.rules.relationError('connector', v('a', 'part'), v('b', 'port'), 'ignored'), '');
}
{
  /* 규칙과 무관한 다이어그램에서는 아무 메시지도 나오지 않는다 */
  const h = harness();
  assert.equal(h.rules.relationError('association', v('a', 'class'), v('b', 'class')), '');
  assert.equal(h.rules.relationError('notelink', v('a', 'note'), v('b', 'class')), '');
}

console.log('relation rules tests: ok');
