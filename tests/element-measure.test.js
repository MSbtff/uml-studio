'use strict';

const assert = require('node:assert/strict');
const {
  REQUIRED_FUNCTIONS,
  REQUIRED_VALUES,
  VISIBILITY_SYMBOLS,
  create,
} = require('../element-measure.js');
const { parseColumn } = require('../erd-column.js');
const { parseIconScript } = require('../icon-script.js');
const { snapUp } = require('../canvas-geometry.js');

const FONT_FAMILY = 'Helvetica, Arial, "Apple SD Gothic Neo", sans-serif';
const FONT12 = `12px ${FONT_FAMILY}`;
const FONT13B = `600 13px ${FONT_FAMILY}`;
const LINE_H = 15;
const TIMING_ROW_HEIGHT = 44;

/* 폰트 폭은 브라우저 Canvas가 재는 값이므로, 테스트에서는 결정적인
   근사치(글자당 고정 폭, 굵은 글꼴은 조금 더 넓게)를 쓴다. */
function measureText(text, font) {
  const perChar = font === FONT13B ? 7.5 : 6.5;
  return String(text || '').length * perChar;
}

function harness(overrides = {}) {
  const state = { models: {}, diagrams: [], activeId: null, ...overrides.state };
  const diagram = overrides.diagram || { id: 'd1', type: 'class', name: 'Class Diagram', elements: [], relations: [] };
  if (!state.diagrams.length) state.diagrams = [diagram];
  if (!state.activeId) state.activeId = state.diagrams[0].id;
  const dg = () => state.diagrams.find(d => d.id === state.activeId);
  const deps = {
    childViews: (parentId, d = dg()) => d.elements.filter(e => e.parentId === parentId),
    dg,
    parseColumn,
    parseIconScript,
    snapUp,
    tw: measureText,
    state,
    FONT12,
    FONT13B,
    FONT_FAMILY,
    LINE_H,
    TIMING_ROW_HEIGHT,
    ...overrides.deps,
  };
  return { deps, state, dg, measurer: create(deps) };
}

assert.ok(Object.isFrozen(REQUIRED_FUNCTIONS));
assert.ok(Object.isFrozen(REQUIRED_VALUES));
assert.ok(Object.isFrozen(VISIBILITY_SYMBOLS));

/* ── 의존성 검증 ────────────────────────────────────────────── */
assert.throws(() => create(), /Element Measure 의존성이 없습니다/);
assert.throws(() => create({}), /tw/);
{
  const { deps } = harness();
  const { state: _state, ...withoutState } = deps;
  assert.throws(() => create(withoutState), /state/);
  assert.throws(() => create({ ...deps, state: { models: null } }), /state\.models/);
  assert.throws(() => create({ ...deps, LINE_H: null }), /LINE_H/);
}

const { measurer } = harness();
assert.ok(Object.isFrozen(measurer));

/* ── 가시성 · 이름 조합 ─────────────────────────────────────── */
assert.equal(measurer.visibilitySymbol('public'), '+');
assert.equal(measurer.visibilitySymbol('protected'), '#');
assert.equal(measurer.visibilitySymbol('private'), '-');
assert.equal(measurer.visibilitySymbol('package'), '~');
assert.equal(measurer.visibilitySymbol('nonsense'), '');
assert.equal(measurer.visibilitySymbol(undefined), '');
assert.equal(measurer.packageElementTitle({ visibility: 'private', name: 'infra' }), '- infra');
assert.equal(measurer.packageElementTitle({ name: 'infra' }), 'infra', '가시성이 없으면 접두어도 없습니다');
assert.equal(measurer.profileElementTitle({ name: 'Entity' }), '+ Entity', 'Profile 요소는 public이 기본입니다');
assert.equal(measurer.profileElementTitle({ visibility: 'protected', name: 'Generated' }), '# Generated');

/* ── 상태 머신 라벨 ─────────────────────────────────────────── */
assert.deepEqual(
  measurer.stateBehaviorLines({
    entry: 'showProgress()', doActivity: 'validate()', exit: '',
    internalTransitions: ['cancel / clearForm()'],
  }),
  ['entry / showProgress()', 'do / validate()', 'cancel / clearForm()'],
);
assert.deepEqual(measurer.stateBehaviorLines({}), []);

/* ── 모델 참조 라벨 ─────────────────────────────────────────── */
{
  const h = harness({
    state: {
      models: { m1: { id: 'm1', kind: 'class', name: 'CanvasView' } },
      diagrams: [
        { id: 'd1', type: 'state', name: 'Class Diagram', elements: [], relations: [] },
        { id: 'sm', type: 'state', name: 'Payment Submachine', elements: [], relations: [] },
        { id: 'sq', type: 'sequence', name: 'Authorize Payment', elements: [], relations: [] },
      ],
    },
  });
  const m = h.measurer;
  assert.equal(m.referencedStateMachineName({ submachineDiagramId: 'sm' }), 'Payment Submachine');
  assert.equal(m.referencedStateMachineName({ submachineDiagramId: 'missing' }), '(unassigned)');
  assert.equal(m.referencedInteraction({ interactionDiagramId: 'sq' }).name, 'Authorize Payment');
  assert.equal(m.referencedInteraction({ interactionDiagramId: 'sm' }), null, 'Sequence가 아니면 참조하지 않습니다');
  assert.equal(m.referencedInteractionName({ interactionDiagramId: 'sq' }), 'Authorize Payment');
  assert.equal(m.referencedInteractionName({ interactionDiagramId: '', name: 'Fallback' }), 'Fallback');
  assert.equal(m.referencedInteractionName({}), '(unassigned)');

  assert.equal(m.instanceClassifier({ classifierModelId: 'm1' }).name, 'CanvasView');
  assert.equal(m.instanceClassifier({}), null);
  assert.equal(m.instanceTitle({ name: 'canvasView', classifierModelId: 'm1' }), 'canvasView: CanvasView');
  assert.equal(m.instanceTitle({ name: 'lonely' }), 'lonely');
  assert.equal(m.instanceTitle({}), ': (untyped)');
  assert.equal(m.lifelineTitle({ name: 'canvas', classifierModelId: 'm1' }), 'canvas: CanvasView');
  assert.equal(m.lifelineTitle({ name: 'canvas' }), 'canvas');
  assert.equal(m.typedElementTitle({ name: 'part', classifierModelId: 'm1' }), 'part: CanvasView');
  assert.equal(m.ibdFrameTitle({ classifierModelId: 'm1' }), 'ibd [CanvasView]');
  assert.equal(m.ibdFrameTitle({}), 'ibd [Untyped Block]');
  assert.equal(m.parametricFrameTitle({ classifierModelId: 'm1' }), 'par [CanvasView]');
  assert.equal(m.parametricFrameTitle({}), 'par [Untyped Constraint Block]');
  assert.equal(m.collaborationUseTitle({ name: 'rendering', collaborationModelId: 'm1' }), 'rendering: CanvasView');
  assert.equal(m.collaborationUseTitle({ name: 'rendering' }), 'rendering');
}
{
  const h = harness({
    state: {
      models: {
        cb: { id: 'cb', kind: 'constraintblock', name: 'Render Budget', constraints: ['{ a <= b }', '  '] },
        blk: { id: 'blk', kind: 'block', name: 'Engine', constraints: ['{ x }'] },
      },
    },
  });
  assert.deepEqual(h.measurer.constraintPropertyEquations({ classifierModelId: 'cb' }), ['{ a <= b }']);
  assert.deepEqual(h.measurer.constraintPropertyEquations({ classifierModelId: 'blk' }), [],
    'Constraint Block이 아니면 수식을 읽지 않습니다');
  assert.deepEqual(h.measurer.constraintPropertyEquations({}), []);
}

/* ── Constraint Parameter 선언 파싱 ─────────────────────────── */
assert.deepEqual(measurer.parseConstraintParameterDefinition('renderTime: Milliseconds'),
  { name: 'renderTime', typeName: 'Milliseconds' });
assert.deepEqual(measurer.parseConstraintParameterDefinition('+ frameBudget : Milliseconds [1] = 100'),
  { name: 'frameBudget', typeName: 'Milliseconds' });
assert.deepEqual(measurer.parseConstraintParameterDefinition('bare'), { name: 'bare', typeName: '' });
assert.equal(measurer.parseConstraintParameterDefinition('   '), null);
assert.equal(measurer.parseConstraintParameterDefinition('a b: C'), null, '이름에 공백이 있으면 거부합니다');

/* ── BDD 컴파트먼트 ─────────────────────────────────────────── */
{
  const block = measurer.bddCompartments({
    kind: 'block', constraints: ['{ c }'], parts: ['canvas: Canvas'], references: [], values: ['v: Real'],
    flowProperties: ['in doc: Doc'], constraintProperties: ['budget: Budget'], properties: [],
    operations: ['+ render(): void'], receptions: ['renderRequested'],
  });
  assert.deepEqual(block.map(s => s.label),
    ['constraints', 'parts', 'values', 'flow properties', 'constraint properties', 'operations', 'receptions']);
  assert.deepEqual(block.at(-1).items, ['«signal» renderRequested']);

  const valueType = measurer.bddCompartments({
    kind: 'valuetype', valueTypeUnit: 'ms', quantityKind: 'Time',
    constraints: ['{ value >= 0 }'], properties: ['+ value: Real'], operations: [], receptions: [],
  });
  assert.deepEqual(valueType[0], { label: 'definition', items: ['unit = ms', 'quantityKind = Time'] });
  assert.deepEqual(valueType.map(s => s.label), ['definition', 'constraints', 'attributes']);

  const constraintBlock = measurer.bddCompartments({
    kind: 'constraintblock', constraints: ['{ r <= b }'],
    constraintParameters: ['r: ms', 'b: ms'], properties: [], operations: [],
  });
  assert.deepEqual(constraintBlock.map(s => s.label), ['constraints', 'parameters']);
  assert.deepEqual(measurer.bddCompartments({ kind: 'block' }), [], '빈 컴파트먼트는 생략합니다');
}

/* ── Requirement 본문 줄바꿈 ────────────────────────────────── */
{
  assert.deepEqual(measurer.wrapRequirementText(''), ['']);
  assert.deepEqual(measurer.wrapRequirementText('short text'), ['short text']);
  const wrapped = measurer.wrapRequirementText('The system shall render editable diagrams reliably across formats.');
  assert.ok(wrapped.length > 1, '긴 문장은 여러 줄로 나눕니다');
  wrapped.forEach(line => assert.ok(measureText(line, FONT12) <= 248 || !line.includes(' ')));
  assert.deepEqual(measurer.wrapRequirementText('a\n\nb'), ['a', '', 'b'], '빈 줄을 보존합니다');
  const narrow = measurer.wrapRequirementText('alpha beta gamma', 20);
  assert.deepEqual(narrow, ['alpha', 'beta', 'gamma']);
}

/* ── measure(): 고정 크기 요소 ──────────────────────────────── */
for (const [kind, minW, minH] of [
  ['initial', 24, 24], ['final', 28, 28], ['flowfinal', 26, 26],
  ['forkbar', 96, 8], ['joinbar', 96, 8], ['statefork', 96, 8],
  ['inputpin', 16, 16], ['outputpin', 16, 16], ['expansioninput', 16, 16], ['expansionoutput', 16, 16],
  ['fragment', 136, 88], ['execution', 12, 20], ['frame', 240, 160],
  ['timesegment', 64, 10], ['timetick', 8, 120], ['timingstate', 760, TIMING_ROW_HEIGHT],
  ['interfaceball', 20, 20], ['region', 160, 72],
  ['stateinitial', 20, 20], ['statefinal', 24, 24], ['choice', 32, 32], ['junction', 14, 14],
  ['shallowhistory', 30, 30], ['deephistory', 30, 30],
  ['entrypoint', 20, 20], ['exitpoint', 20, 20], ['connectionpointref', 20, 20], ['terminate', 24, 24],
  ['ibdframe', 640, 440], ['parametricframe', 640, 440],
  ['port', 18, 18], ['constraintparameter', 18, 18],
]) {
  const m = measurer.measure({ kind, name: 'x' });
  assert.equal(m.minW, minW, `${kind} minW`);
  assert.equal(m.minH, minH, `${kind} minH`);
}

/* ── measure(): 이름 길이에 따라 넓어지는 요소 ──────────────── */
{
  const short = measurer.measure({ kind: 'usecase', name: 'Go' });
  const long = measurer.measure({ kind: 'usecase', name: 'A very long use case name indeed' });
  assert.equal(short.minW, 112, '짧은 이름은 최소 폭을 지킵니다');
  assert.ok(long.minW > short.minW, '긴 이름은 최소 폭보다 넓어집니다');
  assert.equal(long.minW % 8, 0, 'snapUp으로 그리드에 맞춥니다');
  assert.equal(long.minH, 48);
}

/* ── measure(): note ────────────────────────────────────────── */
{
  const m = measurer.measure({ kind: 'note', text: 'first line\nsecond line' });
  assert.deepEqual(m.lines, ['first line', 'second line']);
  assert.equal(m.minH, snapUp(2 * LINE_H + 18));
  assert.equal(measurer.measure({ kind: 'note', text: '' }).minH, 40, '빈 노트도 최소 높이를 지킵니다');
}

/* ── measure(): 분류자(class/interface/…) ───────────────────── */
{
  const m = measurer.measure({
    kind: 'class', name: 'Shape', stereotype: '',
    attributes: ['# x: number', '# y: number'],
    operations: ['+ draw(): void'],
  });
  assert.equal(m.stereo, null);
  assert.equal(m.title, 'Shape');
  assert.deepEqual(m.attrs, ['# x: number', '# y: number']);
  assert.deepEqual(m.ops, ['+ draw(): void']);
  assert.equal(m.showAttrs, true);
  assert.equal(m.showOps, true);
  assert.equal(m.showReceptions, false);
  assert.equal(m.hasIcon, false);
  assert.equal(m.aH, 2 * LINE_H + 9);
  assert.equal(m.oH, 1 * LINE_H + 9);
  assert.equal(m.minH, m.headH + m.aH + m.oH);

  const iface = measurer.measure({ kind: 'interface', name: 'Drawable', operations: [] });
  assert.equal(iface.stereo, '«interface»');
  const enumeration = measurer.measure({ kind: 'enumeration', name: 'Color', literals: ['RED', 'GREEN'] });
  assert.equal(enumeration.stereo, '«enumeration»');
  assert.deepEqual(enumeration.attrs, ['RED', 'GREEN'], 'enumeration은 literals를 속성 칸에 그립니다');

  const info = measurer.measure({
    kind: 'informationitem', name: 'DiagramDocument', visibility: 'public',
    attributes: ['+ diagrams: Diagram[*]'], operations: [], receptions: ['documentLoaded'],
  });
  assert.equal(info.stereo, '«information»');
  assert.equal(info.title, '+ DiagramDocument');
  assert.equal(info.showReceptions, true);
  assert.equal(info.rH, LINE_H + 9);

  const stereotypeWithIcon = measurer.measure({
    kind: 'stereotype', name: 'Entity', visibility: 'public',
    attributes: [], operations: [],
    iconContent: '!icon 40 40\n%l #76508f\n%w 2\ne 6 8 34 30\nl 11 34 29 34',
  });
  assert.equal(stereotypeWithIcon.stereo, '«stereotype»');
  assert.equal(stereotypeWithIcon.hasIcon, true);
  assert.equal(stereotypeWithIcon.headH, 64, '아이콘이 있으면 머리글이 커집니다');
  const stereotypeNoIcon = measurer.measure({
    kind: 'stereotype', name: 'Audited', visibility: 'public', attributes: [], operations: [], iconContent: '',
  });
  assert.equal(stereotypeNoIcon.hasIcon, false);
  assert.ok(stereotypeNoIcon.headH < 64);
}

/* ── measure(): SysML 블록 ──────────────────────────────────── */
{
  const m = measurer.measure({
    kind: 'block', name: 'Rendering Engine', visibility: 'public',
    constraints: ['{ deterministic }'], parts: [], references: [], values: ['t: ms'],
    flowProperties: [], constraintProperties: [], properties: [], operations: [], receptions: [],
  });
  assert.equal(m.stereo, '«block»');
  assert.equal(m.title, '+ Rendering Engine');
  assert.equal(m.headH, 44);
  assert.deepEqual(m.compartments.map(s => s.label), ['constraints', 'values']);
  m.compartments.forEach(section => assert.equal(section.h, 20 + section.items.length * LINE_H + 4));
  assert.equal(m.minH, Math.max(72, m.headH + m.compartments.reduce((sum, s) => sum + s.h, 0)));
  assert.equal(measurer.measure({ kind: 'valuetype', name: 'ms' }).stereo, '«valueType»');
  assert.equal(measurer.measure({ kind: 'interfaceblock', name: 'IR' }).stereo, '«interfaceBlock»');
  assert.equal(measurer.measure({ kind: 'constraintblock', name: 'B' }).stereo, '«constraintBlock»');
}

/* ── measure(): Requirement ─────────────────────────────────── */
{
  const m = measurer.measure({
    kind: 'requirement', name: 'Render Within Budget', visibility: 'public',
    requirementType: 'performanceRequirement', requirementId: 'REQ-RND-020',
    requirementText: 'The system shall render the active diagram within 100 milliseconds.',
    risk: 'Medium', verificationMethod: 'Analysis',
  });
  assert.equal(m.stereo, '«performanceRequirement»');
  assert.equal(m.title, '+ Render Within Budget');
  assert.equal(m.headH, 48);
  assert.ok(m.textLines.length >= 1);
  assert.equal(m.bodyH, 10 + (4 + m.textLines.length) * LINE_H);
  assert.equal(m.minH, m.headH + m.bodyH);
  assert.ok(m.minW >= 272);
  assert.equal(measurer.measure({ kind: 'requirement', name: 'R' }).stereo, '«requirement»');
}

/* ── measure(): 다이어그램 타입에 따라 달라지는 요소 ────────── */
{
  const h = harness({ diagram: { id: 'd1', type: 'package', name: 'P', elements: [], relations: [] } });
  const inPackage = h.measurer.measure({ kind: 'package', name: 'domain', visibility: 'public' });
  assert.equal(inPackage.minH, 152, 'Package Diagram의 Package는 컨테이너 크기입니다');
  const classDiagram = harness();
  const inClass = classDiagram.measurer.measure({ kind: 'package', name: 'domain', visibility: 'public' });
  assert.equal(inClass.minH, 64);
  assert.ok(inClass.minW < inPackage.minW);
}
{
  const parametric = harness({ diagram: { id: 'd1', type: 'parametric', name: 'P', elements: [], relations: [] } });
  const withDefault = parametric.measurer.measure({ kind: 'value', name: 'actualRenderTime', defaultValue: '42 ms' });
  assert.equal(withDefault.title, 'actualRenderTime = 42 ms');
  const ibd = harness({ diagram: { id: 'd1', type: 'ibd', name: 'I', elements: [], relations: [] } });
  assert.equal(ibd.measurer.measure({ kind: 'value', name: 'frameBudget', defaultValue: '42 ms' }).title, 'frameBudget');
}

/* ── measure(): lifeline은 다이어그램 종류마다 다르다 ───────── */
{
  const sequence = harness();
  const actor = sequence.measurer.measure({ kind: 'lifeline', isActor: true, name: 'User' });
  assert.equal(actor.minH, 52);
  const withStereo = sequence.measurer.measure({ kind: 'lifeline', name: ':CanvasView', stereotype: 'control' });
  assert.equal(withStereo.stereo, '«control»');
  assert.equal(withStereo.minH, 40 + 14, '스테레오타입이 있으면 머리글이 커집니다');
  assert.equal(sequence.measurer.measure({ kind: 'lifeline', name: ':CanvasView' }).minH, 40);

  const timing = harness({
    diagram: {
      id: 'd1', type: 'timing', name: 'T',
      elements: [
        { id: 'l1', kind: 'lifeline', name: 'editor' },
        { id: 's1', kind: 'timingstate', parentId: 'l1' },
        { id: 's2', kind: 'timingstate', parentId: 'l1' },
      ],
      relations: [],
    },
  });
  const timingLifeline = timing.measurer.measure({ id: 'l1', kind: 'lifeline', name: 'editor' });
  assert.equal(timingLifeline.minW, 760);
  assert.equal(timingLifeline.minH, 44 + 2 * TIMING_ROW_HEIGHT, '상태 행 수만큼 높아집니다');
  const emptyLifeline = timing.measurer.measure({ id: 'none', kind: 'lifeline', name: 'x' });
  assert.equal(emptyLifeline.minH, Math.max(120, 44 + TIMING_ROW_HEIGHT), '상태가 없어도 한 행은 확보합니다');
}

/* ── measure(): ERD entity는 표시 모드에 따라 열이 바뀐다 ───── */
{
  const columns = ['PK id <회원번호>: VARCHAR2(50)', 'NN name <이름>: VARCHAR2(50)'];
  const entity = { kind: 'entity', name: 'TB_USER', logicalName: '회원', columns };
  const make = mode => harness({
    diagram: { id: 'd1', type: 'erd', name: 'E', erdMode: mode, elements: [], relations: [] },
  }).measurer.measure(entity);

  const physical = make('physical');
  assert.equal(physical.showLog, false);
  assert.equal(physical.showType, true);
  assert.equal(physical.showPhys, true);
  assert.equal(physical.primaryTitle, 'TB_USER');
  assert.equal(physical.secondaryTitle, '');
  assert.equal(physical.cols.length, 2);
  assert.equal(physical.RH, 17);
  assert.equal(physical.headH, 24);
  assert.equal(physical.aH, 2 * 17 + 6);

  const logical = make('logical');
  assert.equal(logical.showLog, true);
  assert.equal(logical.showType, false);
  assert.equal(logical.showPhys, false);
  assert.equal(logical.primaryTitle, '회원');

  const both = make('both');
  assert.equal(both.showLog, true);
  assert.equal(both.showPhys, true);
  assert.equal(both.primaryTitle, '회원');
  assert.equal(both.secondaryTitle, 'TB_USER');
  assert.ok(both.minW >= physical.minW, '두 이름을 모두 보이면 더 넓어집니다');

  const defaultMode = harness({
    diagram: { id: 'd1', type: 'erd', name: 'E', elements: [], relations: [] },
  }).measurer;
  assert.equal(defaultMode.erdMode(), 'physical', 'erdMode 기본값은 physical입니다');
  assert.equal(defaultMode.measure(entity).primaryTitle, 'TB_USER');

  /* PK와 FK를 함께 가진 열이 있으면 배지 칸이 넓어진다 */
  const wideFlags = harness({
    diagram: { id: 'd1', type: 'erd', name: 'E', elements: [], relations: [] },
  }).measurer.measure({
    kind: 'entity', name: 'TB_MAP', columns: ['PK FK a: VARCHAR2(10)'],
  });
  assert.equal(wideFlags.flagWidth, 45);
  assert.equal(physical.flagWidth, 26);
}

/* ── measure(): 상태 ────────────────────────────────────────── */
{
  const simple = measurer.measure({ kind: 'state', name: 'Checking', entry: 'showProgress()' });
  assert.equal(simple.headH, 28);
  assert.deepEqual(simple.behaviors, ['entry / showProgress()']);
  assert.equal(simple.minH, 28 + LINE_H + 10);
  assert.equal(measurer.measure({ kind: 'state', name: 'Idle' }).minH, 28 + 20);

  const composite = measurer.measure({ kind: 'compositestate', name: 'Order', entry: 'open()' });
  assert.equal(composite.minH, 220);
  assert.equal(composite.contentTop, 28 + LINE_H + 8);

  const h = harness({
    state: {
      models: {},
      diagrams: [
        { id: 'd1', type: 'state', name: 'Checkout', elements: [], relations: [] },
        { id: 'sm', type: 'state', name: 'Payment Submachine', elements: [], relations: [] },
      ],
    },
  });
  const submachine = h.measurer.measure({ kind: 'submachinestate', name: 'Process Payment', submachineDiagramId: 'sm' });
  assert.equal(submachine.ref, 'Payment Submachine');
  assert.equal(submachine.headH, 48);
}

/* ── measure(): 인스턴스 · 구조 요소 ────────────────────────── */
{
  const h = harness({ state: { models: { m1: { id: 'm1', kind: 'class', name: 'Layer' } } } });
  const object = h.measurer.measure({
    kind: 'object', name: 'mainLayer', classifierModelId: 'm1',
    slots: ['+ name: string = "Main"', '+ visible: boolean = true'],
  });
  assert.equal(object.title, 'mainLayer: Layer');
  assert.equal(object.headH, 32);
  assert.equal(object.slotH, 2 * LINE_H + 10);
  assert.equal(object.minH, object.headH + object.slotH);
  assert.equal(h.measurer.measure({ kind: 'object', name: 'empty' }).slotH, 18);

  assert.equal(h.measurer.measure({ kind: 'artifactinstance', name: 'bundle', classifierModelId: 'm1' }).title, 'bundle: Layer');
  assert.equal(h.measurer.measure({ kind: 'componentinstance', name: 'r', classifierModelId: 'm1' }).minH, 64);
  assert.equal(h.measurer.measure({ kind: 'nodeinstance', name: 's', classifierModelId: 'm1' }).minH, 88);
  assert.equal(h.measurer.measure({ kind: 'part', name: 'canvas', classifierModelId: 'm1' }).title, 'canvas: Layer');
  assert.equal(h.measurer.measure({ kind: 'collaborationuse', name: 'rendering', collaborationModelId: 'm1' }).title, 'rendering: Layer');
  assert.equal(h.measurer.measure({ kind: 'collaboration', name: 'Rendering Collaboration' }).minH, 200);
}
{
  const h = harness({
    state: {
      models: {
        cb: { id: 'cb', kind: 'constraintblock', name: 'Render Budget', constraints: ['{ renderTime <= frameBudget }'] },
      },
    },
  });
  const constraint = h.measurer.measure({ kind: 'constraintproperty', name: 'budget', classifierModelId: 'cb' });
  assert.equal(constraint.title, 'budget: Render Budget');
  assert.deepEqual(constraint.equations, ['{ renderTime <= frameBudget }']);
  assert.equal(constraint.minH, Math.max(88, 54 + LINE_H));
}

/* ── measure(): Interaction Use / Inline ────────────────────── */
{
  const h = harness({
    state: {
      models: {},
      diagrams: [
        { id: 'd1', type: 'interactionoverview', name: 'O', elements: [], relations: [] },
        { id: 'sq', type: 'sequence', name: 'Authorize Payment', elements: [], relations: [] },
      ],
    },
  });
  assert.ok(h.measurer.measure({ kind: 'interactionuse', interactionDiagramId: 'sq' }).minW >= 140);
  assert.equal(h.measurer.measure({ kind: 'interactionuse', interactionDiagramId: 'sq' }).minH, 56);
  assert.equal(h.measurer.measure({ kind: 'interactioninline', interactionDiagramId: 'sq' }).minH, 224);
}

/* ── normalizeSize는 측정값을 캐시하고 크기를 넓히기만 한다 ── */
{
  const view = { kind: 'usecase', name: 'Draw Diagram', w: 0, h: 0 };
  measurer.normalizeSize(view);
  assert.ok(view._m, '측정 결과를 _m에 캐시합니다');
  assert.equal(view.w, view._m.minW);
  assert.equal(view.h, view._m.minH);

  const bigger = { kind: 'usecase', name: 'Draw Diagram', w: 400, h: 300 };
  measurer.normalizeSize(bigger);
  assert.equal(bigger.w, 400, '사용자가 키운 크기는 줄이지 않습니다');
  assert.equal(bigger.h, 300);

  const missing = { kind: 'usecase', name: 'Draw Diagram' };
  measurer.normalizeSize(missing);
  assert.equal(missing.w, missing._m.minW);
}

/* ── 알 수 없는 kind도 분류자 기본값으로 측정된다 ───────────── */
{
  const m = measurer.measure({ kind: 'unknown-kind', name: 'Mystery' });
  assert.ok(m.minW > 0 && m.minH > 0);
  assert.equal(m.showAttrs, false);
  assert.deepEqual(m.attrs, []);
}

console.log('element measure tests: ok');
