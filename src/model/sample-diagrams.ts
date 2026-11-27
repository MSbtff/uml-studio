'use strict';

type SampleDiagramsApi = ReturnType<typeof createSampleDiagramsModule>;
declare var UMLSampleDiagrams: SampleDiagramsApi;

(function initSampleDiagramsModule(root: typeof globalThis & { UMLSampleDiagrams?: SampleDiagramsApi }, factory: () => SampleDiagramsApi) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UMLSampleDiagrams = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, createSampleDiagramsModule);

function createSampleDiagramsModule() {
  const { text: uiText } = globalThis.UMLLanguage
    ?? require('../editor/language.js') as typeof UMLLanguage;

  const REQUIRED_FUNCTIONS = Object.freeze([
    'cleanProjectName',
    'hydrateCurrentProject',
    'projectUid',
    'setSelection',
    'syncRelationModel',
    'uid',
  ] as const);
  const REQUIRED_VALUES = Object.freeze([
    'state',
    'BDD_CLASSIFIER_KINDS',
    'FILL_DEFAULT',
  ] as const);

  interface SampleRelation extends DiagramRelation {
    conveyedNames?: string[];
    itemFlowNames?: string[];
  }
  interface SampleDiagram extends EditorDiagram { relations: SampleRelation[] }
  type SampleElementInput = Omit<DiagramElement, 'id' | 'w' | 'h'> & Partial<Pick<DiagramElement, 'w' | 'h'>>;
  interface SampleDependencies {
    cleanProjectName(value: string): string;
    hydrateCurrentProject(models: DiagramModels): void;
    projectUid(): string;
    setSelection(ids: string[]): void;
    syncRelationModel(relation: DiagramRelation, diagram: EditorDiagram): void;
    uid(): string;
    state: { projectId: string; projectName: string; activeId: string | null; diagrams: SampleDiagram[]; models: DiagramModels };
    BDD_CLASSIFIER_KINDS: ReadonlySet<string>;
    FILL_DEFAULT: string;
  }

  function create(dependencies?: SampleDependencies) {
    const deps: Partial<SampleDependencies> = dependencies || {};
    const missing: string[] = REQUIRED_FUNCTIONS.filter(name => typeof deps[name] !== 'function');
    REQUIRED_VALUES.forEach(name => {
      if (deps[name] == null) missing.push(name);
    });
    if (deps.state && !Array.isArray(deps.state.diagrams)) missing.push('state.diagrams');
    if (deps.BDD_CLASSIFIER_KINDS && typeof deps.BDD_CLASSIFIER_KINDS.has !== 'function') {
      missing.push('BDD_CLASSIFIER_KINDS.has');
    }
    if (missing.length) {
      throw new TypeError(`Sample Diagrams 의존성이 없습니다: ${[...new Set(missing)].join(', ')}`);
    }

    const {
      cleanProjectName,
      hydrateCurrentProject,
      projectUid,
      setSelection,
      syncRelationModel,
      uid,
      state,
      BDD_CLASSIFIER_KINDS,
      FILL_DEFAULT,
    } = deps as SampleDependencies;

    const NE = (props: SampleElementInput): DiagramElement => ({ id: uid(), fill: FILL_DEFAULT, w: 0, h: 0, ...props });
    const NR = (kind: string, from: { id: string }, to: { id: string }, extra?: Partial<SampleRelation>): SampleRelation => ({ id: uid(), kind, from: from.id, to: to.id, name: '', sourceLabel: '', targetLabel: '', ...extra });

    function sampleClass() {
      const drawable = NE({ kind: 'interface', name: 'Drawable', x: 520, y: 64, operations: ['+ draw(ctx: Context): void'] });
      const note = NE({ kind: 'note', name: 'Note1', x: 856, y: 64, text: uiText(
        'Realization and dependency relationships use dashed lines.',
        'Realization / Dependency 관계는\n점선(dashed line)으로 그려집니다.',
      ) });
      const shape = NE({
        kind: 'class', name: 'Shape', x: 496, y: 240, isAbstract: true, stereotype: '',
        attributes: ['# x: number', '# y: number', '+ style: Style'],
        operations: ['+ move(dx: number, dy: number): void', '+ draw(ctx: Context): void {abstract}'],
      });
      const rect = NE({ kind: 'class', name: 'Rectangle', x: 328, y: 488, stereotype: '', attributes: ['+ width: number', '+ height: number'], operations: ['+ draw(ctx: Context): void'] });
      const circle = NE({ kind: 'class', name: 'Circle', x: 632, y: 488, stereotype: '', attributes: ['+ radius: number'], operations: ['+ draw(ctx: Context): void'] });
      const style = NE({ kind: 'class', name: 'Style', x: 824, y: 248, stereotype: '', attributes: ['+ fill: Color', '+ stroke: Color', '+ lineWidth: number'], operations: [] });
      const color = NE({ kind: 'enumeration', name: 'Color', x: 1056, y: 248, literals: ['RED', 'GREEN', 'BLUE', 'BLACK'] });
      const view = NE({ kind: 'class', name: 'CanvasView', x: 136, y: 64, stereotype: 'view', attributes: [], operations: ['+ render(): void', '+ addLayer(layer: Layer): void'] });
      const layer = NE({ kind: 'class', name: 'Layer', x: 160, y: 264, stereotype: '', attributes: ['+ name: string', '+ visible: boolean'], operations: [] });
      const pkg = NE({ kind: 'package', name: 'graphics.core', x: 96, y: 488, w: 160, h: 88 });
      return {
        id: uid(), type: 'class', name: 'Class Diagram',
        elements: [pkg, view, layer, drawable, note, shape, rect, circle, style, color],
        relations: [
          NR('realization', shape, drawable),
          NR('generalization', rect, shape),
          NR('generalization', circle, shape),
          NR('dependency', view, drawable, { name: '«use»' }),
          NR('composition', layer, view, { sourceLabel: '0..*', targetLabel: '1' }),
          NR('aggregation', shape, layer, { sourceLabel: '0..*' }),
          NR('directed', shape, style, { name: 'style', targetLabel: '1' }),
          NR('directed', style, color),
          NR('notelink', note, drawable),
        ],
      };
    }

    function samplePackage() {
      const studio = NE({
        kind: 'model', name: 'UML Studio', visibility: 'public',
        x: 64, y: 48, w: 1040, h: 704, fill: '#fff5d6',
      });
      const domain = NE({
        kind: 'package', name: 'domain', visibility: 'public', parentId: studio.id,
        x: 104, y: 144, w: 272, h: 208, fill: '#fff8df',
      });
      const application = NE({
        kind: 'package', name: 'application', visibility: 'public', parentId: studio.id,
        x: 424, y: 144, w: 600, h: 432, fill: '#fff8df',
      });
      const infrastructure = NE({
        kind: 'package', name: 'infrastructure', visibility: 'private', parentId: studio.id,
        x: 104, y: 432, w: 272, h: 208, fill: '#fff8df',
      });
      const rendering = NE({
        kind: 'subsystem', name: 'Rendering Engine', visibility: 'public', parentId: application.id,
        x: 464, y: 240, w: 224, h: 152, fill: '#fffdf0',
      });
      const exporters = NE({
        kind: 'package', name: 'export', visibility: 'protected', parentId: application.id,
        x: 744, y: 240, w: 224, h: 152, fill: '#fffdf0',
      });
      const note = NE({
        kind: 'note', name: 'Package Note', x: 1160, y: 192, w: 272, h: 112,
        text: uiText(
          'Containment shows model ownership.\nDragging a child package to another container changes its owner.',
          'Containment는 실제 모델 소유 관계를 표시합니다.\n자식 Package를 다른 컨테이너로 끌면 소유 관계도 함께 바뀝니다.',
        ),
      });
      return {
        id: uid(), type: 'package', name: 'Architecture Packages',
        elements: [studio, domain, application, infrastructure, rendering, exporters, note],
        relations: [
          NR('containment', domain, studio),
          NR('containment', application, studio),
          NR('containment', infrastructure, studio),
          NR('containment', rendering, application),
          NR('containment', exporters, application),
          NR('dependency', application, domain, { name: 'uses' }),
          NR('dependency', infrastructure, domain, { name: 'implements' }),
          NR('dependency', exporters, rendering, { name: 'renders through' }),
          NR('notelink', note, application),
        ],
      };
    }

    function sampleProfile() {
      const classMeta = NE({
        kind: 'metaclass', name: 'Class', visibility: 'public',
        x: 760, y: 88, w: 224, h: 72, fill: '#f5effa',
      });
      const componentMeta = NE({
        kind: 'metaclass', name: 'Component', visibility: 'public',
        x: 760, y: 312, w: 224, h: 72, fill: '#f5effa',
      });
      const artifactMeta = NE({
        kind: 'metaclass', name: 'Artifact', visibility: 'public',
        x: 760, y: 544, w: 224, h: 72, fill: '#f5effa',
      });
      const elementMeta = NE({
        kind: 'metaclass', name: 'Element', visibility: 'public',
        x: 1120, y: 312, w: 224, h: 72, fill: '#f5effa',
      });
      const entity = NE({
        kind: 'stereotype', name: 'Entity', visibility: 'public',
        x: 104, y: 56, w: 288, h: 176, fill: '#f8f1fc',
        attributes: ['+ tableName: String', '+ persistent: Boolean = true'],
        operations: [],
        iconContent: '!icon 40 40\n%l #76508f\n%w 2\nr 7 9 33 31\nl 7 17 33 17\nl 15 17 15 31',
      });
      const audited = NE({
        kind: 'stereotype', name: 'Audited', visibility: 'public',
        x: 424, y: 280, w: 248, h: 144, fill: '#f8f1fc',
        attributes: ['+ auditLevel: Integer'],
        operations: [],
        iconContent: '',
      });
      const service = NE({
        kind: 'stereotype', name: 'Service', visibility: 'public',
        x: 104, y: 280, w: 248, h: 176, fill: '#f8f1fc',
        attributes: ['+ protocol: String'],
        operations: ['+ healthCheck(): Boolean'],
        iconContent: '!icon 40 40\n%l #76508f\n%w 2\npg 20 5 34 14 34 27 20 35 6 27 6 14\npl 12 21 17 21 20 15 23 25 28 21',
      });
      const generated = NE({
        kind: 'stereotype', name: 'GeneratedArtifact', visibility: 'protected',
        x: 104, y: 536, w: 288, h: 144, fill: '#f8f1fc',
        attributes: ['+ generator: String'],
        operations: [],
        iconContent: '',
      });
      const note = NE({
        kind: 'note', name: 'Profile Note', x: 1088, y: 520, w: 320, h: 112,
        text: uiText(
          'Connect extension from a stereotype to a UML metaclass.\nA required extension shows {required}.',
          'Extension은 Stereotype에서 UML MetaClass 방향으로 연결합니다.\nRequired Extension은 {required}로 표시됩니다.',
        ),
      });
      return {
        id: uid(), type: 'profile', name: 'UML Studio Profile',
        elements: [entity, service, audited, generated, classMeta, componentMeta, artifactMeta, elementMeta, note],
        relations: [
          NR('extension', entity, classMeta, { isRequired: true, targetLabel: '1' }),
          NR('extension', service, componentMeta),
          NR('extension', audited, elementMeta),
          NR('extension', generated, artifactMeta),
          NR('generalization', service, audited),
          NR('notelink', note, artifactMeta),
        ],
      };
    }

    function sampleSequence() {
      const user = NE({ kind: 'lifeline', isActor: true, name: 'User', x: 96, y: 32 });
      const view = NE({ kind: 'lifeline', name: ':CanvasView', x: 320, y: 32 });
      const layer = NE({ kind: 'lifeline', name: ':Layer', x: 560, y: 32 });
      const shape = NE({ kind: 'lifeline', name: ':Shape', x: 792, y: 32 });
      const frame = NE({ kind: 'frame', name: 'Render Sequence', x: 48, y: 8, w: 936, h: 640, fill: '#ffffff' });
      const frag = NE({ kind: 'fragment', name: 'Fragment1', x: 288, y: 176, w: 624, h: 208, operator: 'alt', condition: '', operands: ['[layer.visible]', '[else]'] });
      const sinv = NE({ kind: 'stateinvariant', name: 'layer.visible == true', x: 512, y: 96 });
      const iuse = NE({ kind: 'interactionuse', name: 'Load Layers', x: 288, y: 420, w: 300, h: 52 });
      const cont = NE({ kind: 'continuation', name: 'done', x: 792, y: 500, w: 120, h: 30 });
      return {
        id: uid(), type: 'sequence', name: 'Render Sequence',
        elements: [frame, user, view, layer, shape, frag, sinv, iuse, cont],
        relations: [
          NR('msg-sync', user, view, { name: 'render()', y: 128 }),
          NR('msg-sync', view, layer, { name: 'draw(ctx)', y: 216 }),
          NR('msg-sync', layer, shape, { name: 'draw(ctx)', y: 264 }),
          NR('msg-reply', shape, layer, { y: 320 }),
          NR('msg-reply', layer, view, { y: 360 }),
          NR('msg-sync', view, view, { name: 'flush()', y: 500 }),
          NR('msg-async', view, user, { name: 'rendered', y: 560 }),
        ],
      };
    }

    function sampleInteractionOverviewPair(referencedSequence?: EditorDiagram) {
      const client = NE({ kind: 'lifeline', isActor: true, name: 'Client', x: 80, y: 32 });
      const controller = NE({ kind: 'lifeline', name: ':CheckoutController', x: 336, y: 32 });
      const gateway = NE({ kind: 'lifeline', name: ':PaymentGateway', x: 608, y: 32 });
      const inlineFrame = NE({
        kind: 'frame', name: 'Authorize Payment', x: 40, y: 8, w: 760, h: 520, fill: '#ffffff',
      });
      const inlineSequence = {
        id: uid(), type: 'sequence', name: 'Authorize Payment',
        elements: [inlineFrame, client, controller, gateway],
        relations: [
          NR('msg-sync', client, controller, { name: 'checkout(order)', y: 128 }),
          NR('msg-sync', controller, gateway, { name: 'authorize(total)', y: 216 }),
          NR('msg-reply', gateway, controller, { name: 'approved', y: 304 }),
          NR('msg-async', controller, client, { name: 'receipt', y: 392 }),
        ],
      };
      const fallbackSequence = referencedSequence || inlineSequence;
      const start = NE({ kind: 'initial', name: 'Start', x: 64, y: 336 });
      const prepare = NE({
        kind: 'interactionuse', name: fallbackSequence.name, interactionDiagramId: fallbackSequence.id,
        x: 144, y: 316, w: 224, h: 64,
      });
      const fork = NE({ kind: 'forkbar', name: 'Parallel', x: 424, y: 344, w: 120, h: 8 });
      const authorize = NE({
        kind: 'interactioninline', name: inlineSequence.name, interactionDiagramId: inlineSequence.id,
        x: 608, y: 80, w: 400, h: 240, fill: '#ffffff',
      });
      const audit = NE({
        kind: 'interactionuse', name: fallbackSequence.name, interactionDiagramId: fallbackSequence.id,
        x: 648, y: 424, w: 280, h: 64,
      });
      const join = NE({ kind: 'joinbar', name: 'Synchronized', x: 1064, y: 344, w: 120, h: 8 });
      const approved = NE({ kind: 'decision', name: 'approved?', x: 1240, y: 324, w: 96, h: 48 });
      const publish = NE({
        kind: 'interactionuse', name: fallbackSequence.name, interactionDiagramId: fallbackSequence.id,
        x: 1400, y: 216, w: 240, h: 64,
      });
      const recover = NE({
        kind: 'interactionuse', name: inlineSequence.name, interactionDiagramId: inlineSequence.id,
        x: 1400, y: 424, w: 240, h: 64,
      });
      const merge = NE({ kind: 'merge', name: 'complete', x: 1704, y: 324, w: 96, h: 48 });
      const finish = NE({ kind: 'final', name: 'Done', x: 1864, y: 334 });
      const note = NE({
        kind: 'note', name: 'Overview Note', x: 1104, y: 72, w: 304, h: 96,
        text: uiText(
          'An interaction use references an existing sequence.\nDouble-click an inline interaction frame to edit it.',
          'Interaction Use는 기존 Sequence를 참조합니다.\nInteraction (inline)은 프레임을 더블클릭해 편집합니다.',
        ),
      });
      const overview = {
        id: uid(), type: 'interactionoverview', name: 'Checkout Interaction Overview',
        elements: [start, prepare, fork, authorize, audit, join, approved, publish, recover, merge, finish, note],
        relations: [
          NR('controlflow', start, prepare),
          NR('controlflow', prepare, fork),
          NR('controlflow', fork, authorize),
          NR('controlflow', fork, audit),
          NR('controlflow', authorize, join),
          NR('controlflow', audit, join),
          NR('controlflow', join, approved),
          NR('controlflow', approved, publish, { name: '[yes]' }),
          NR('controlflow', approved, recover, { name: '[retry]' }),
          NR('controlflow', publish, merge),
          NR('controlflow', recover, merge),
          NR('controlflow', merge, finish),
          NR('notelink', note, authorize),
        ],
      };
      return [overview, inlineSequence];
    }

    function sampleUseCase() {
      const boundary = NE({ kind: 'boundary', name: 'UML Studio', x: 344, y: 64, w: 400, h: 384 });
      const actor = NE({ kind: 'actor', name: 'User', x: 136, y: 176 });
      const draw = NE({ kind: 'usecase', name: 'Draw Diagram', x: 384, y: 112 });
      const exportImg = NE({ kind: 'usecase', name: 'Export Image', x: 384, y: 336 });
      const renderUc = NE({ kind: 'usecase', name: 'Render Canvas', x: 560, y: 216 });
      return {
        id: uid(), type: 'usecase', name: 'Use Case Diagram',
        elements: [boundary, actor, draw, exportImg, renderUc],
        relations: [
          NR('association', actor, draw),
          NR('association', actor, exportImg),
          NR('include', draw, renderUc),
          NR('include', exportImg, renderUc),
        ],
      };
    }

    function sampleActivity(name = 'Activity Diagram') {
      const customerLane = NE({ kind: 'swimlanev', name: 'Customer', x: 48, y: 48, w: 360, h: 760, fill: '#fffdf2' });
      const serviceLane = NE({ kind: 'swimlanev', name: 'Order Service', x: 408, y: 48, w: 720, h: 760, fill: '#fffdf2' });

      const start = NE({ kind: 'initial', name: 'Start', parentId: customerLane.id, x: 88, y: 104 });
      const request = NE({ kind: 'sendsignal', name: 'Submit Order', parentId: customerLane.id, x: 176, y: 96, w: 160, h: 48 });
      const receive = NE({ kind: 'acceptsignal', name: 'Order Received', parentId: serviceLane.id, x: 456, y: 96, w: 168, h: 48 });
      const decision = NE({ kind: 'decision', name: 'available?', parentId: serviceLane.id, x: 680, y: 96, w: 104, h: 48 });
      const rejected = NE({ kind: 'sendsignal', name: 'Reject Order', parentId: serviceLane.id, x: 864, y: 80, w: 160, h: 48 });
      const rejectedEnd = NE({ kind: 'flowfinal', name: 'Rejected Flow', parentId: serviceLane.id, x: 1064, y: 92, w: 26, h: 26 });

      const payment = NE({
        kind: 'interruptibleregion', name: 'Payment Window', parentId: serviceLane.id,
        x: 456, y: 200, w: 600, h: 224, fill: '#fffdf6',
      });
      const parameter = NE({ kind: 'activityparameter', name: 'PaymentRequest', parentId: payment.id, x: 480, y: 280, w: 136, h: 40 });
      const authorize = NE({ kind: 'action', name: 'Authorize Payment', parentId: payment.id, x: 680, y: 272, w: 184, h: 56 });
      const authInput = NE({
        kind: 'inputpin', name: 'request', parentId: authorize.id, borderAnchor: { fx: 0, fy: 0.5 },
        x: 672, y: 292, w: 16, h: 16, fill: '#ffffff',
      });
      const authOutput = NE({
        kind: 'outputpin', name: 'receipt', parentId: authorize.id, borderAnchor: { fx: 1, fy: 0.5 },
        x: 856, y: 292, w: 16, h: 16, fill: '#ffffff',
      });
      const timeout = NE({ kind: 'timeevent', name: '30s Timeout', parentId: payment.id, x: 888, y: 272, w: 144, h: 56 });
      const cancelled = NE({ kind: 'flowfinal', name: 'Cancelled Flow', parentId: serviceLane.id, x: 1080, y: 288, w: 26, h: 26 });

      const fulfillment = NE({
        kind: 'structuredactivity', name: 'Fulfill Order', parentId: serviceLane.id,
        x: 456, y: 464, w: 600, h: 240, fill: '#fff7ed',
      });
      const orderObject = NE({ kind: 'objectnode', name: 'Order', parentId: fulfillment.id, x: 480, y: 536, w: 112, h: 40 });
      const expansion = NE({
        kind: 'expansionregion', name: 'Process Items', parentId: fulfillment.id,
        expansionMode: 'parallel', x: 640, y: 512, w: 256, h: 144, fill: '#fff8ef',
      });
      const expansionIn = NE({
        kind: 'expansioninput', name: 'items', parentId: expansion.id, borderAnchor: { fx: 0, fy: 0.5 },
        x: 632, y: 576, w: 16, h: 16, fill: '#ffffff',
      });
      const expansionOut = NE({
        kind: 'expansionoutput', name: 'processed', parentId: expansion.id, borderAnchor: { fx: 1, fy: 0.5 },
        x: 888, y: 576, w: 16, h: 16, fill: '#ffffff',
      });
      const store = NE({ kind: 'activitydatastore', name: 'Orders', parentId: fulfillment.id, x: 928, y: 552, w: 112, h: 56 });
      const end = NE({ kind: 'final', name: 'Completed', parentId: serviceLane.id, x: 1072, y: 744, w: 28, h: 28 });

      return {
        id: uid(), type: 'activity', name,
        elements: [
          customerLane, serviceLane, payment, fulfillment, expansion,
          start, request, receive, decision, rejected, rejectedEnd,
          parameter, authorize, authInput, authOutput, timeout, cancelled,
          orderObject, expansionIn, expansionOut, store, end,
        ],
        relations: [
          NR('controlflow', start, request),
          NR('controlflow', request, receive),
          NR('controlflow', receive, decision),
          NR('controlflow', decision, authorize, { name: '[yes]' }),
          NR('controlflow', decision, rejected, { name: '[no]' }),
          NR('controlflow', rejected, rejectedEnd),
          NR('objectflow', parameter, authInput, { name: 'request' }),
          NR('objectflow', authOutput, orderObject, { name: 'receipt' }),
          NR('controlflow', authorize, fulfillment),
          NR('objectflow', orderObject, expansionIn, { name: 'items' }),
          NR('objectflow', expansionOut, store, { name: 'processed' }),
          NR('controlflow', fulfillment, end),
          NR('exceptionhandler', authorize, rejected),
          NR('activityinterrupt', timeout, cancelled),
        ],
      };
    }

    function sampleState() {
      const initial = NE({ kind: 'stateinitial', name: 'Initial', x: 104, y: 168 });
      const idle = NE({ kind: 'state', name: 'Idle', x: 216, y: 136, entry: 'resetTimer()', doActivity: '', exit: '', internalTransitions: [] });
      const checking = NE({ kind: 'state', name: 'Checking', x: 456, y: 128, entry: 'showProgress()', doActivity: 'validate()', exit: '', internalTransitions: ['cancel / clearForm()'] });
      const choice = NE({ kind: 'choice', name: 'Valid?', x: 704, y: 152 });
      const saved = NE({ kind: 'state', name: 'Saved', x: 848, y: 88, entry: 'notifyUser()', doActivity: '', exit: '', internalTransitions: [] });
      const error = NE({ kind: 'state', name: 'Error', x: 848, y: 264, entry: 'showError()', doActivity: '', exit: '', internalTransitions: ['retry / focusFirstField()'] });
      const final = NE({ kind: 'statefinal', name: 'Final', x: 1080, y: 120 });
      const history = NE({ kind: 'shallowhistory', name: 'LastState', x: 464, y: 360 });
      return {
        id: uid(), type: 'state', name: 'Form State Machine',
        elements: [initial, idle, checking, choice, saved, error, final, history],
        relations: [
          NR('transition', initial, idle),
          NR('transition', idle, checking, { trigger: 'submit', guard: '', effect: 'lockForm()' }),
          NR('transition', checking, choice, { trigger: 'validated' }),
          NR('transition', choice, saved, { guard: 'valid' }),
          NR('transition', choice, error, { guard: 'else' }),
          NR('transition', saved, final, { trigger: 'close' }),
          NR('transition', error, checking, { trigger: 'retry', effect: 'clearErrors()' }),
          NR('transition', checking, checking, { trigger: 'tick', guard: 'pending', effect: 'poll()' }),
          NR('transition', history, checking, { trigger: 'resume' }),
        ],
      };
    }

    function sampleCompositeState() {
      const start = NE({ kind: 'stateinitial', name: 'Start', x: 96, y: 112 });
      const order = NE({
        kind: 'compositestate', name: 'Order Fulfillment', x: 240, y: 72, w: 720, h: 504,
        fill: '#f2f4ff', entry: 'openOrder()', doActivity: '', exit: 'archiveOrder()', internalTransitions: [],
      });
      const payment = NE({ kind: 'region', name: 'Payment', parentId: order.id, regionOrder: 0, x: 0, y: 0, w: 0, h: 0, fill: 'transparent' });
      const delivery = NE({ kind: 'region', name: 'Delivery', parentId: order.id, regionOrder: 1, x: 0, y: 0, w: 0, h: 0, fill: 'transparent' });

      const payStart = NE({ kind: 'stateinitial', name: 'PaymentStart', parentId: payment.id, x: 304, y: 208 });
      const pending = NE({ kind: 'state', name: 'Payment Pending', parentId: payment.id, x: 416, y: 176, entry: '', doActivity: 'authorize()', exit: '', internalTransitions: [] });
      const paid = NE({ kind: 'state', name: 'Paid', parentId: payment.id, x: 720, y: 176, entry: 'capture()', doActivity: '', exit: '', internalTransitions: [] });

      const deliveryStart = NE({ kind: 'stateinitial', name: 'DeliveryStart', parentId: delivery.id, x: 304, y: 432 });
      const waiting = NE({ kind: 'state', name: 'Waiting Stock', parentId: delivery.id, x: 416, y: 400, entry: '', doActivity: 'reserve()', exit: '', internalTransitions: [] });
      const shipping = NE({ kind: 'state', name: 'Shipping', parentId: delivery.id, x: 720, y: 400, entry: 'dispatch()', doActivity: '', exit: '', internalTransitions: [] });
      const done = NE({ kind: 'statefinal', name: 'Done', x: 1056, y: 112 });

      return {
        id: uid(), type: 'state', name: 'Concurrent Order State',
        elements: [order, payment, delivery, payStart, pending, paid, deliveryStart, waiting, shipping, start, done],
        relations: [
          NR('transition', start, order),
          NR('transition', order, done, { trigger: 'close' }),
          NR('transition', payStart, pending),
          NR('transition', pending, paid, { trigger: 'approved', effect: 'capture()' }),
          NR('transition', deliveryStart, waiting),
          NR('transition', waiting, shipping, { trigger: 'stockReady', effect: 'createShipment()' }),
        ],
      };
    }

    function sampleSubmachineStatePair() {
      const paymentId = uid();
      const paymentEntry = NE({ kind: 'entrypoint', name: 'paymentEntry', x: 120, y: 200, w: 20, h: 20, fill: '#ffffff' });
      const processing = NE({
        kind: 'state', name: 'Processing Payment', x: 320, y: 160, w: 232, h: 88,
        fill: '#eef1ff', entry: 'openGateway()', doActivity: 'authorize()', exit: '', internalTransitions: [],
      });
      const paymentExit = NE({ kind: 'exitpoint', name: 'paymentExit', x: 720, y: 136, w: 20, h: 20, fill: '#ffffff' });
      const failed = NE({ kind: 'terminate', name: 'fatalFailure', x: 720, y: 296, w: 24, h: 24, fill: 'transparent' });
      const payment = {
        id: paymentId, type: 'state', name: 'Payment Submachine',
        elements: [paymentEntry, processing, paymentExit, failed],
        relations: [
          NR('transition', paymentEntry, processing),
          NR('transition', processing, paymentExit, { trigger: 'approved', effect: 'capture()' }),
          NR('transition', processing, failed, { trigger: 'gatewayFatal', effect: 'abortOrder()' }),
        ],
      };

      const start = NE({ kind: 'stateinitial', name: 'CheckoutStart', x: 104, y: 208 });
      const paymentState = NE({
        kind: 'submachinestate', name: 'Process Payment', x: 336, y: 160, w: 304, h: 112,
        fill: '#eef1ff', entry: 'preparePayment()', doActivity: '', exit: '', internalTransitions: [],
        submachineDiagramId: paymentId,
      });
      const entryRef = NE({
        kind: 'connectionpointref', name: 'paymentEntry', parentId: paymentState.id,
        borderAnchor: { fx: 0, fy: 0.5 }, referenceKind: 'entry', x: 326, y: 206, w: 20, h: 20, fill: '#ffffff',
      });
      const exitRef = NE({
        kind: 'connectionpointref', name: 'paymentExit', parentId: paymentState.id,
        borderAnchor: { fx: 1, fy: 0.5 }, referenceKind: 'exit', x: 630, y: 206, w: 20, h: 20, fill: '#ffffff',
      });
      const done = NE({ kind: 'statefinal', name: 'CheckoutDone', x: 856, y: 208 });
      const checkout = {
        id: uid(), type: 'state', name: 'Checkout State Machine',
        elements: [start, paymentState, entryRef, exitRef, done],
        relations: [
          NR('transition', start, entryRef, { trigger: '', guard: '', effect: 'createPayment()' }),
          NR('transition', exitRef, done, { trigger: 'completed', effect: 'confirmOrder()' }),
        ],
      };
      return [checkout, payment];
    }

    function sampleComponent() {
      const editor = NE({ kind: 'component', name: 'DiagramEditor', x: 112, y: 112 });
      const ball = NE({ kind: 'interfaceball', name: 'IRenderer', x: 368, y: 128 });
      const engine = NE({ kind: 'component', name: 'RenderEngine', x: 480, y: 112 });
      const art = NE({ kind: 'artifact', name: 'uml-studio.js', x: 128, y: 296 });
      const note = NE({ kind: 'note', name: 'Note1', x: 480, y: 280, text: uiText(
        'Assembly connector:\nRenderEngine provides IRenderer.\nDiagramEditor uses it.',
        'Assembly connector:\nRenderEngine이 IRenderer를 제공하고\nDiagramEditor가 이를 사용합니다.',
      ) });
      return {
        id: uid(), type: 'component', name: 'Component Diagram',
        elements: [editor, ball, engine, art, note],
        relations: [
          NR('connector', engine, ball),
          NR('dependency', editor, ball, { name: '«use»' }),
          NR('dependency', art, editor, { name: '«manifest»' }),
          NR('notelink', note, ball),
        ],
      };
    }

    function sampleInformationFlow() {
      const editor = NE({
        kind: 'component', name: 'DiagramEditor',
        x: 80, y: 120, w: 224, h: 88, fill: '#eef8f8',
      });
      const canvas = NE({
        kind: 'class', name: 'CanvasView', stereotype: 'view',
        x: 480, y: 88, w: 240, h: 120, fill: '#eef8f8',
        attributes: [], operations: ['+ render(): void', '+ load(document): void'],
      });
      const renderer = NE({
        kind: 'component', name: 'RenderEngine',
        x: 896, y: 120, w: 224, h: 88, fill: '#eef8f8',
      });
      const bundle = NE({
        kind: 'artifact', name: 'uml-studio.js',
        x: 80, y: 424, w: 224, h: 72, fill: '#eef8f8',
      });
      const document = NE({
        kind: 'informationitem', name: 'DiagramDocument', visibility: 'public', stereotype: 'information',
        x: 368, y: 352, w: 232, h: 112, fill: '#eef8f8',
        attributes: ['+ diagrams: Diagram[*]'], operations: ['+ validate(): Boolean'], receptions: ['documentLoaded'],
      });
      const command = NE({
        kind: 'informationitem', name: 'RenderCommand', visibility: 'public', stereotype: 'information',
        x: 648, y: 352, w: 224, h: 96, fill: '#eef8f8',
        attributes: ['+ viewport: Bounds'], operations: [], receptions: ['renderRequested'],
      });
      const frame = NE({
        kind: 'informationitem', name: 'RenderedFrame', visibility: 'public', stereotype: 'information',
        x: 928, y: 352, w: 224, h: 96, fill: '#eef8f8',
        attributes: ['+ image: ImageData'], operations: [], receptions: ['frameReady'],
      });
      const note = NE({
        kind: 'note', name: 'Information Flow Note', x: 408, y: 560, w: 448, h: 88,
        text: uiText(
          'Dashed arrows show information flow.\nUnder Conveyed Information, choose the items carried by the flow.',
          '점선 화살표는 정보 전달 가능성을 나타냅니다.\n선택한 Flow의 Conveyed Information에서 전달 항목을 지정합니다.',
        ),
      });
      return {
        id: uid(), type: 'informationflow', name: 'Rendering Information Flow',
        elements: [editor, canvas, renderer, bundle, document, command, frame, note],
        relations: [
          NR('informationflow', editor, canvas, {
            name: 'load', conveyedNames: ['DiagramDocument'],
            srcAnchor: { fx: 1, fy: 0.3 }, dstAnchor: { fx: 0, fy: 0.3 },
          }),
          NR('informationflow', canvas, renderer, {
            name: 'render', conveyedNames: ['RenderCommand'],
            srcAnchor: { fx: 1, fy: 0.25 }, dstAnchor: { fx: 0, fy: 0.25 },
          }),
          NR('informationflow', renderer, canvas, {
            name: 'frame', conveyedNames: ['RenderedFrame'],
            srcAnchor: { fx: 0, fy: 0.75 }, dstAnchor: { fx: 1, fy: 0.75 },
          }),
          NR('informationflow', bundle, editor, { name: 'bootstrap', conveyedNames: ['DiagramDocument'] }),
          NR('notelink', note, document),
        ],
      };
    }

    function upgradeSampleInformationFlowLayout() {
      const sample = state.diagrams.find(diagram =>
        diagram.type === 'informationflow' && diagram.name === 'Rendering Information Flow');
      if (!sample) return;
      const anchors: Record<string, [DiagramAnchor, DiagramAnchor]> = {
        load: [{ fx: 1, fy: 0.3 }, { fx: 0, fy: 0.3 }],
        render: [{ fx: 1, fy: 0.25 }, { fx: 0, fy: 0.25 }],
        frame: [{ fx: 0, fy: 0.75 }, { fx: 1, fy: 0.75 }],
      };
      sample.relations.filter(relation => relation.kind === 'informationflow').forEach(relation => {
        const pair = anchors[relation.name ?? ''];
        if (!pair || relation.srcAnchor || relation.dstAnchor) return;
        [relation.srcAnchor, relation.dstAnchor] = pair;
      });
    }

    function linkSampleInformationFlowModels() {
      const sample = state.diagrams.find(diagram =>
        diagram.type === 'informationflow' && diagram.name === 'Rendering Information Flow');
      if (!sample) return;

      const reusable = new Set(['component', 'class', 'artifact']);
      sample.elements.filter(element => reusable.has(element.kind)).forEach(element => {
        const oldModelId = element.modelId;
        const shared = Object.values(state.models).find(model =>
          model.id !== oldModelId && model.kind === element.kind && model.name === element.name
          && state.diagrams.some(diagram =>
            diagram.id !== sample.id && diagram.elements.some(view => view.modelId === model.id)));
        if (!shared) return;
        element.modelId = shared.id;
        const oldStillUsed = state.diagrams.some(diagram =>
          diagram.elements.some(view => view.modelId === oldModelId)
          || diagram.relations.some(view => view.modelId === oldModelId));
        if (oldModelId && !oldStillUsed) delete state.models[oldModelId];
      });

      const conveyedByName = new Map(sample.elements
        .filter(element => element.kind === 'informationitem')
        .map(element => [element.name, element.modelId]));
      sample.relations.filter(relation => relation.kind === 'informationflow').forEach(relation => {
        if (Array.isArray(relation.conveyedNames)) {
          relation.conveyedModelIds = relation.conveyedNames.map(name => conveyedByName.get(name)).filter((id): id is string => !!id);
          delete relation.conveyedNames;
        }
        if (!Array.isArray(relation.conveyedModelIds)) relation.conveyedModelIds = [];
        syncRelationModel(relation, sample);
      });
    }

    function sampleRequirement() {
      const makeRequirement = (name: string, requirementId: string, requirementText: string, requirementType: string, x: number, y: number, risk: string, verificationMethod: string) =>
        NE({
          kind: 'requirement', name, requirementId, requirementText, requirementType,
          x, y, w: 320, h: 160, fill: '#edf4fa', visibility: 'public',
          risk, verificationMethod,
        });
      const root = makeRequirement(
        'Reliable Diagram Rendering', 'REQ-RND-001',
        'The system shall render editable diagrams reliably across supported export formats.',
        'functionalRequirement', 488, 48, 'High', 'Demonstration',
      );
      const editability = makeRequirement(
        'Preserve Editable Model', 'REQ-RND-010',
        'The system shall preserve model identity and editable properties across diagram views.',
        'functionalRequirement', 72, 304, 'High', 'Test',
      );
      const performance = makeRequirement(
        'Render Within Budget', 'REQ-RND-020',
        'The system shall render the active diagram within 100 milliseconds for 500 views.',
        'performanceRequirement', 488, 304, 'Medium', 'Analysis',
      );
      const compatibilityText =
        'The system shall export a Requirement Diagram that remains editable in supported external tools.';
      const compatibility = makeRequirement(
        'Export Compatibility', 'REQ-RND-030', compatibilityText,
        'interfaceRequirement', 904, 304, 'Medium', 'Test',
      );
      const compatibilityCopy = makeRequirement(
        'Export Compatibility Copy', 'REQ-RND-030-COPY', compatibilityText,
        'interfaceRequirement', 904, 560, 'Medium', 'Inspection',
      );
      const canvas = NE({
        kind: 'class', name: 'CanvasView', stereotype: 'view',
        x: 72, y: 616, w: 240, h: 120, fill: '#eef8f8',
        attributes: [], operations: ['+ render(): void', '+ addLayer(layer: Layer): void'],
      });
      const renderer = NE({
        kind: 'component', name: 'RenderEngine',
        x: 488, y: 616, w: 224, h: 88, fill: '#eef8f8',
      });
      const renderUseCase = NE({
        kind: 'usecase', name: 'Render Canvas',
        x: 520, y: 792, w: 176, h: 64, fill: '#eef8f8',
      });
      const bundle = NE({
        kind: 'artifact', name: 'uml-studio.js',
        x: 944, y: 792, w: 224, h: 72, fill: '#eef8f8',
      });
      const note = NE({
        kind: 'note', name: 'Requirement Traceability Guide',
        x: 72, y: 824, w: 344, h: 88,
        text: uiText(
          'Containment organizes requirements in a hierarchy.\nSatisfy, Verify, Refine, and Trace link models to requirements.',
          'Containment는 요구사항 계층을 나타냅니다.\nSatisfy · Verify · Refine · Trace는 기존 모델을 Requirement와 연결합니다.',
        ),
      });
      return {
        id: uid(), type: 'requirement', name: 'Rendering Requirements',
        elements: [
          root, editability, performance, compatibility, compatibilityCopy,
          canvas, renderer, renderUseCase, bundle, note,
        ],
        relations: [
          NR('reqcontainment', editability, root, {
            srcAnchor: { fx: 0.5, fy: 0 }, dstAnchor: { fx: 0.2, fy: 1 },
          }),
          NR('reqcontainment', performance, root, {
            srcAnchor: { fx: 0.5, fy: 0 }, dstAnchor: { fx: 0.5, fy: 1 },
          }),
          NR('reqcontainment', compatibility, root, {
            srcAnchor: { fx: 0.5, fy: 0 }, dstAnchor: { fx: 0.8, fy: 1 },
          }),
          NR('derivereqt', compatibility, performance, {
            srcAnchor: { fx: 0, fy: 0.45 }, dstAnchor: { fx: 1, fy: 0.45 },
          }),
          NR('reqcopy', compatibilityCopy, compatibility, {
            srcAnchor: { fx: 0.35, fy: 0 }, dstAnchor: { fx: 0.35, fy: 1 },
          }),
          NR('refine', canvas, editability, {
            srcAnchor: { fx: 0.45, fy: 0 }, dstAnchor: { fx: 0.45, fy: 1 },
          }),
          NR('satisfy', renderer, performance, {
            srcAnchor: { fx: 0.35, fy: 0 }, dstAnchor: { fx: 0.35, fy: 1 },
          }),
          NR('verify', renderUseCase, performance, {
            srcAnchor: { fx: 0.75, fy: 0 }, dstAnchor: { fx: 0.75, fy: 1 },
          }),
          NR('trace', bundle, compatibility, {
            srcAnchor: { fx: 0.75, fy: 0 }, dstAnchor: { fx: 0.75, fy: 1 },
          }),
          NR('notelink', note, canvas),
        ],
      };
    }

    function linkSampleRequirementModels() {
      const sample = state.diagrams.find(diagram =>
        diagram.type === 'requirement' && diagram.name === 'Rendering Requirements');
      if (!sample) return;
      const reusable = new Set(['class', 'component', 'usecase', 'artifact']);
      sample.elements.filter(element => reusable.has(element.kind)).forEach(element => {
        const oldModelId = element.modelId;
        const shared = Object.values(state.models).find(model =>
          model.id !== oldModelId && model.kind === element.kind && model.name === element.name
          && state.diagrams.some(diagram =>
            diagram.id !== sample.id && diagram.elements.some(view => view.modelId === model.id)));
        if (!shared) return;
        element.modelId = shared.id;
        const oldStillUsed = state.diagrams.some(diagram =>
          diagram.elements.some(view => view.modelId === oldModelId)
          || diagram.relations.some(view => view.modelId === oldModelId));
        if (oldModelId && !oldStillUsed) delete state.models[oldModelId];
      });
      sample.relations.forEach(relation => syncRelationModel(relation, sample));
    }

    function sampleBlockDefinition() {
      const system = NE({
        kind: 'block', name: 'Diagram Rendering System', x: 456, y: 48, w: 360, h: 248,
        fill: '#edf4f7', visibility: 'public', isAbstract: false,
        constraints: ['{ renderTime <= frameBudget }'],
        parts: ['canvas: Canvas Subsystem [1]', 'renderer: Rendering Engine [1]'],
        references: ['metrics: Metrics Service [0..1]'],
        values: ['frameBudget: Milliseconds = 100'],
        flowProperties: ['in document: DiagramDocument', 'out frame: RenderedFrame'],
        constraintProperties: ['budget: Render Budget'],
        properties: [], operations: ['+ render(document: DiagramDocument): RenderedFrame'], receptions: [],
      });
      const canvas = NE({
        kind: 'block', name: 'Canvas Subsystem', x: 64, y: 448, w: 304, h: 176,
        fill: '#edf4f7', visibility: 'public', isAbstract: false,
        constraints: [], parts: [], references: ['renderer: Rendering Engine [1]'],
        values: ['zoom: Real = 1.0'],
        flowProperties: ['in editCommand: EditCommand', 'out scene: SceneGraph'],
        constraintProperties: [], properties: [],
        operations: ['+ apply(command: EditCommand): void'], receptions: [],
      });
      const engine = NE({
        kind: 'block', name: 'Rendering Engine', x: 456, y: 448, w: 328, h: 192,
        fill: '#edf4f7', visibility: 'public', isAbstract: true,
        constraints: ['{ deterministic = true }'], parts: [],
        references: ['adapter: Export Adapter [1]'],
        values: ['lastRenderTime: Milliseconds'],
        flowProperties: ['in scene: SceneGraph', 'out frame: RenderedFrame'],
        constraintProperties: ['budget: Render Budget'], properties: [],
        operations: ['+ render(scene: SceneGraph): RenderedFrame'], receptions: ['renderRequested'],
      });
      const adapter = NE({
        kind: 'block', name: 'Export Adapter', x: 880, y: 448, w: 296, h: 176,
        fill: '#edf4f7', visibility: 'public', isAbstract: false,
        constraints: [], parts: [], references: [],
        values: ['format: ExportFormat'],
        flowProperties: ['in frame: RenderedFrame', 'out file: BinaryFile'],
        constraintProperties: [], properties: [],
        operations: ['+ export(frame: RenderedFrame): BinaryFile'], receptions: [],
      });
      const gpu = NE({
        kind: 'block', name: 'GPU Rendering Engine', x: 456, y: 784, w: 328, h: 160,
        fill: '#edf4f7', visibility: 'public', isAbstract: false,
        constraints: ['{ gpuAvailable = true }'], parts: [], references: [],
        values: ['textureMemory: Megabytes'],
        flowProperties: [], constraintProperties: [], properties: [],
        operations: ['+ render(scene: SceneGraph): RenderedFrame'], receptions: [],
      });
      const milliseconds = NE({
        kind: 'valuetype', name: 'Milliseconds', x: 64, y: 784, w: 280, h: 136,
        fill: '#edf4f7', visibility: 'public', isAbstract: false,
        valueTypeUnit: 'ms', quantityKind: 'Time', constraints: ['{ value >= 0 }'],
        properties: ['+ value: Real'], operations: [], receptions: [],
        parts: [], references: [], values: [], flowProperties: [], constraintProperties: [], constraintParameters: [],
      });
      const renderingApi = NE({
        kind: 'interfaceblock', name: 'IRendering', x: 920, y: 48, w: 304, h: 184,
        fill: '#edf4f7', visibility: 'public', isAbstract: false,
        constraints: [], parts: [], references: [], values: [],
        flowProperties: ['in document: DiagramDocument', 'out frame: RenderedFrame'],
        constraintProperties: [], properties: [],
        operations: ['+ render(document: DiagramDocument): RenderedFrame'],
        receptions: ['renderRequested'], constraintParameters: [], valueTypeUnit: '', quantityKind: '',
      });
      const renderBudget = NE({
        kind: 'constraintblock', name: 'Render Budget', x: 880, y: 784, w: 320, h: 176,
        fill: '#edf4f7', visibility: 'public', isAbstract: false,
        constraints: ['{ renderTime <= frameBudget }'],
        constraintParameters: ['renderTime: Milliseconds', 'frameBudget: Milliseconds'],
        properties: [], operations: [], parts: [], references: [], values: [],
        flowProperties: [], constraintProperties: [], receptions: [], valueTypeUnit: '', quantityKind: '',
      });
      const rendererInstance = NE({
        kind: 'object', name: 'renderer', x: 456, y: 1040, w: 328, h: 88,
        fill: '#f3f0f7', classifierModelId: '',
        slots: ['+ lastRenderTime: Milliseconds = 42'],
      });
      const systemPort = NE({
        kind: 'port', name: 'render', x: 0, y: 0, w: 18, h: 18, fill: '#ffffff',
        parentId: system.id, borderAnchor: { fx: 1, fy: 0.48 },
        classifierModelId: '', providedInterfaceModelId: '', requiredInterfaceModelId: '',
      });
      const apiPort = NE({
        kind: 'port', name: 'api', x: 0, y: 0, w: 18, h: 18, fill: '#ffffff',
        parentId: renderingApi.id, borderAnchor: { fx: 0, fy: 0.48 },
        classifierModelId: '', providedInterfaceModelId: '', requiredInterfaceModelId: '',
      });
      const note = NE({
        kind: 'note', name: 'BDD Guide', x: 880, y: 1040, w: 344, h: 88,
        text: uiText(
          'Blocks define the system types and composition hierarchy.\nPorts reference interface blocks and are joined by connectors.',
          'Block은 시스템 분류와 합성 계층을 정의합니다.\nPort는 Interface Block 타입을 참조하고 Connector로 연결됩니다.',
        ),
      });
      return {
        id: uid(), type: 'bdd', name: 'Rendering System Block Definition',
        elements: [
          system, canvas, engine, adapter, gpu, milliseconds, renderingApi,
          renderBudget, rendererInstance, systemPort, apiPort, note,
        ],
        relations: [
          NR('composition', canvas, system, {
            name: 'canvas', sourceLabel: '1', targetLabel: '1',
            srcAnchor: { fx: 0.5, fy: 0 }, dstAnchor: { fx: 0.18, fy: 1 },
          }),
          NR('composition', engine, system, {
            name: 'renderer', sourceLabel: '1', targetLabel: '1',
            srcAnchor: { fx: 0.5, fy: 0 }, dstAnchor: { fx: 0.5, fy: 1 },
          }),
          NR('aggregation', adapter, system, {
            name: 'exporter', sourceLabel: '0..*', targetLabel: '1',
            srcAnchor: { fx: 0.5, fy: 0 }, dstAnchor: { fx: 0.82, fy: 1 },
          }),
          NR('generalization', gpu, engine, {
            srcAnchor: { fx: 0.5, fy: 0 }, dstAnchor: { fx: 0.5, fy: 1 },
          }),
          NR('association', engine, milliseconds, {
            name: 'performance unit', sourceLabel: '1', targetLabel: '1',
          }),
          NR('dependency', system, renderBudget, { name: 'budget rule' }),
          NR('connector', systemPort, apiPort, { name: 'render channel' }),
          NR('notelink', note, renderBudget),
        ],
      };
    }

    function linkSampleBlockDefinitionModels() {
      const sample = state.diagrams.find(diagram =>
        diagram.type === 'bdd' && diagram.name === 'Rendering System Block Definition');
      if (!sample) return;
      const byName = new Map(sample.elements.map(element => [element.name, element]));
      const interfaceBlock = byName.get('IRendering');
      const gpu = byName.get('GPU Rendering Engine');
      const systemPort = byName.get('render');
      const apiPort = byName.get('api');
      if (interfaceBlock) {
        [systemPort, apiPort].forEach(port => {
          if (!port) return;
          port.classifierModelId = interfaceBlock.modelId;
        });
        if (systemPort) systemPort.requiredInterfaceModelId = interfaceBlock.modelId;
        if (apiPort) apiPort.providedInterfaceModelId = interfaceBlock.modelId;
      }
      const rendererInstance = byName.get('renderer');
      if (rendererInstance && gpu) rendererInstance.classifierModelId = gpu.modelId;
      sample.relations.forEach(relation => syncRelationModel(relation, sample));
    }

    function sampleInternalBlock() {
      const frame = NE({
        kind: 'ibdframe', name: 'Internal Structure', x: 48, y: 48, w: 1280, h: 840,
        fill: '#f8fbfc', classifierModelId: '',
      });
      const canvas = NE({
        kind: 'part', name: 'canvas', x: 120, y: 192, w: 248, h: 112,
        fill: '#eaf2f5', parentId: frame.id, classifierModelId: '',
      });
      const renderer = NE({
        kind: 'part', name: 'renderer', x: 520, y: 192, w: 264, h: 112,
        fill: '#eaf2f5', parentId: frame.id, classifierModelId: '',
      });
      const exporter = NE({
        kind: 'reference', name: 'exporter', x: 936, y: 192, w: 248, h: 112,
        fill: '#eef6f8', parentId: frame.id, classifierModelId: '',
      });
      const budget = NE({
        kind: 'value', name: 'frameBudget', x: 520, y: 560, w: 264, h: 88,
        fill: '#f7f4ec', parentId: frame.id, classifierModelId: '',
      });
      const canvasOut = NE({
        kind: 'port', name: 'scene', x: 0, y: 0, w: 18, h: 18, fill: '#ffffff',
        parentId: canvas.id, borderAnchor: { fx: 1, fy: 0.5 },
        classifierModelId: '', providedInterfaceModelId: '', requiredInterfaceModelId: '',
      });
      const rendererIn = NE({
        kind: 'port', name: 'sceneIn', x: 0, y: 0, w: 18, h: 18, fill: '#ffffff',
        parentId: renderer.id, borderAnchor: { fx: 0, fy: 0.5 },
        classifierModelId: '', providedInterfaceModelId: '', requiredInterfaceModelId: '',
      });
      const rendererOut = NE({
        kind: 'port', name: 'frame', x: 0, y: 0, w: 18, h: 18, fill: '#ffffff',
        parentId: renderer.id, borderAnchor: { fx: 1, fy: 0.5 },
        classifierModelId: '', providedInterfaceModelId: '', requiredInterfaceModelId: '',
      });
      const exporterIn = NE({
        kind: 'port', name: 'frameIn', x: 0, y: 0, w: 18, h: 18, fill: '#ffffff',
        parentId: exporter.id, borderAnchor: { fx: 0, fy: 0.5 },
        classifierModelId: '', providedInterfaceModelId: '', requiredInterfaceModelId: '',
      });
      const exporterOut = NE({
        kind: 'port', name: 'file', x: 0, y: 0, w: 18, h: 18, fill: '#ffffff',
        parentId: exporter.id, borderAnchor: { fx: 1, fy: 0.5 },
        classifierModelId: '', providedInterfaceModelId: '', requiredInterfaceModelId: '',
      });
      const systemPort = NE({
        kind: 'port', name: 'download', x: 0, y: 0, w: 18, h: 18, fill: '#ffffff',
        parentId: frame.id, borderAnchor: { fx: 1, fy: 0.55 },
        classifierModelId: '', providedInterfaceModelId: '', requiredInterfaceModelId: '',
      });
      const note = NE({
        kind: 'note', name: 'IBD Guide', x: 120, y: 712, w: 448, h: 88,
        text: uiText(
          'Parts, references, and values use types defined in the BDD.\nSelect a connector to choose its item flows.',
          'Part·Reference·Value는 BDD의 실제 Type을 참조합니다.\nConnector를 선택해 전달되는 Item Flow를 지정할 수 있습니다.',
        ),
      });
      return {
        id: uid(), type: 'ibd', name: 'Rendering System Internal Structure',
        elements: [
          frame, canvas, renderer, exporter, budget,
          canvasOut, rendererIn, rendererOut, exporterIn, exporterOut, systemPort, note,
        ],
        relations: [
          NR('connector', canvasOut, rendererIn, {
            name: 'render request', itemFlowNames: ['RenderCommand'],
            lblOff: { name: { dx: 0, dy: -72 } },
          }),
          NR('connector', rendererOut, exporterIn, {
            name: 'rendered image', itemFlowNames: ['RenderedFrame'],
            lblOff: { name: { dx: 0, dy: -72 } },
          }),
          NR('connector', exporterOut, systemPort, {
            name: 'download channel', itemFlowNames: ['DiagramDocument'],
            lblOff: { name: { dx: -12, dy: 32 } },
          }),
          NR('notelink', note, budget),
        ],
      };
    }

    function linkSampleInternalBlockModels() {
      const sample = state.diagrams.find(diagram =>
        diagram.type === 'ibd' && diagram.name === 'Rendering System Internal Structure');
      if (!sample) return;
      const bdd = state.diagrams.find(diagram =>
        diagram.type === 'bdd' && diagram.name === 'Rendering System Block Definition');
      const bddModels = new Map((bdd?.elements || [])
        .filter(element => BDD_CLASSIFIER_KINDS.has(element.kind))
        .map(element => [element.name, element.modelId]));
      const elements = new Map(sample.elements.map(element => [element.name, element]));
      const assignments = [
        ['Internal Structure', 'Diagram Rendering System'],
        ['canvas', 'Canvas Subsystem'],
        ['renderer', 'Rendering Engine'],
        ['exporter', 'Export Adapter'],
        ['frameBudget', 'Milliseconds'],
      ];
      assignments.forEach(([viewName, typeName]) => {
        const view = elements.get(viewName), modelId = bddModels.get(typeName);
        if (view && modelId) view.classifierModelId = modelId;
      });
      const interfaceModelId = bddModels.get('IRendering') || '';
      sample.elements.filter(element => element.kind === 'port').forEach(port => {
        port.classifierModelId = interfaceModelId;
      });
      const systemPort = elements.get('download');
      const exporterOut = elements.get('file');
      if (systemPort) systemPort.providedInterfaceModelId = interfaceModelId;
      if (exporterOut) exporterOut.requiredInterfaceModelId = interfaceModelId;

      const itemModels = new Map(Object.values(state.models)
        .filter(model => ['informationitem', 'block', 'valuetype', 'interfaceblock'].includes(model.kind))
        .map(model => [model.name, model.id]));
      sample.relations.filter(relation => relation.kind === 'connector').forEach(relation => {
        relation.itemFlowModelIds = (relation.itemFlowNames || [])
          .map(name => itemModels.get(name))
          .filter((id): id is string => !!id);
        delete relation.itemFlowNames;
        syncRelationModel(relation, sample);
      });
      sample.relations.filter(relation => relation.kind !== 'connector')
        .forEach(relation => syncRelationModel(relation, sample));
    }

    function sampleParametric() {
      const frame = NE({
        kind: 'parametricframe', name: 'Render Performance Analysis',
        x: 48, y: 48, w: 1200, h: 760, fill: '#fbf9fd', classifierModelId: '',
      });
      const budgetConstraint = NE({
        kind: 'constraintproperty', name: 'budget',
        x: 432, y: 240, w: 376, h: 192, fill: '#f3edf8',
        parentId: frame.id, classifierModelId: '', visibility: 'public',
      });
      const renderTimeParameter = NE({
        kind: 'constraintparameter', name: 'renderTime',
        x: 0, y: 0, w: 18, h: 18, fill: '#ffffff',
        parentId: budgetConstraint.id, borderAnchor: { fx: 0, fy: 0.5 },
        classifierModelId: '', visibility: 'public',
      });
      const frameBudgetParameter = NE({
        kind: 'constraintparameter', name: 'frameBudget',
        x: 0, y: 0, w: 18, h: 18, fill: '#ffffff',
        parentId: budgetConstraint.id, borderAnchor: { fx: 1, fy: 0.5 },
        classifierModelId: '', visibility: 'public',
      });
      const actualRenderTime = NE({
        kind: 'value', name: 'actualRenderTime',
        x: 112, y: 288, w: 232, h: 88, fill: '#f7f4ec',
        parentId: frame.id, classifierModelId: '', defaultValue: '42 ms',
      });
      const allowedFrameBudget = NE({
        kind: 'value', name: 'allowedFrameBudget',
        x: 896, y: 288, w: 240, h: 88, fill: '#f7f4ec',
        parentId: frame.id, classifierModelId: '', defaultValue: '100 ms',
      });
      const note = NE({
        kind: 'note', name: 'Parametric Guide',
        x: 384, y: 584, w: 472, h: 88,
        text: uiText(
          'A binding connector shows equality between values.\nThe BDD defines reusable constraint equations and parameters.',
          'Binding Connector는 값 사이의 등가 관계를 나타냅니다.\nConstraint Block의 수식과 Parameter 정의를 BDD에서 재사용합니다.',
        ),
      });
      return {
        id: uid(), type: 'parametric', name: 'Render Budget Parametric Analysis',
        elements: [
          frame, budgetConstraint, renderTimeParameter, frameBudgetParameter,
          actualRenderTime, allowedFrameBudget, note,
        ],
        relations: [
          NR('bindingconnector', actualRenderTime, renderTimeParameter),
          NR('bindingconnector', frameBudgetParameter, allowedFrameBudget),
          NR('notelink', note, budgetConstraint),
        ],
      };
    }

    function linkSampleParametricModels() {
      const sample = state.diagrams.find(diagram =>
        diagram.type === 'parametric' && diagram.name === 'Render Budget Parametric Analysis');
      if (!sample) return;
      const bdd = state.diagrams.find(diagram =>
        diagram.type === 'bdd' && diagram.name === 'Rendering System Block Definition');
      const bddModels = new Map((bdd?.elements || [])
        .filter(element => BDD_CLASSIFIER_KINDS.has(element.kind))
        .map(element => [element.name, element.modelId]));
      const constraintModelId = bddModels.get('Render Budget') || '';
      const millisecondsModelId = bddModels.get('Milliseconds') || '';
      const frame = sample.elements.find(element => element.kind === 'parametricframe');
      const constraint = sample.elements.find(element => element.kind === 'constraintproperty');
      if (frame) frame.classifierModelId = constraintModelId;
      if (constraint) constraint.classifierModelId = constraintModelId;
      sample.elements.filter(element =>
        element.kind === 'constraintparameter' || element.kind === 'value').forEach(element => {
        element.classifierModelId = millisecondsModelId;
      });
      sample.relations.forEach(relation => syncRelationModel(relation, sample));
    }

    function reconcileTraceabilitySampleModels() {
      const samples = state.diagrams.filter(diagram =>
        (diagram.type === 'informationflow' && diagram.name === 'Rendering Information Flow')
        || (diagram.type === 'requirement' && diagram.name === 'Rendering Requirements'));
      if (!samples.length) return;
      const sampleIds = new Set(samples.map(diagram => diagram.id));
      const reusable = new Set(['class', 'component', 'usecase', 'artifact']);
      samples.forEach(sample => {
        sample.elements.forEach(element => {
          const current = element.modelId === undefined ? undefined : state.models[element.modelId];
          if (!current || !reusable.has(current.kind)) return;
          const candidates = Object.values(state.models)
            .filter(model => model.id !== current.id && model.kind === current.kind && model.name === current.name)
            .map(model => ({
              model,
              externalViews: state.diagrams
                .filter(diagram => !sampleIds.has(diagram.id))
                .reduce((count, diagram) =>
                  count + diagram.elements.filter(view => view.modelId === model.id).length, 0),
            }))
            .filter(candidate => candidate.externalViews > 0)
            .sort((a, b) => b.externalViews - a.externalViews || a.model.id.localeCompare(b.model.id));
          if (!candidates.length) return;
          const oldModelId = element.modelId;
          element.modelId = candidates[0].model.id;
          const oldStillUsed = state.diagrams.some(diagram =>
            diagram.elements.some(view => view.modelId === oldModelId)
            || diagram.relations.some(view => view.modelId === oldModelId));
          if (oldModelId && !oldStillUsed) delete state.models[oldModelId];
        });
        sample.relations.forEach(relation => syncRelationModel(relation, sample));
      });
    }

    function sampleObject() {
      const canvasView = NE({
        kind: 'object', name: 'canvasView', x: 120, y: 120, fill: '#f8f0fb', classifierModelId: '',
        slots: ['+ zoom: number = 1.0', '+ activeLayer: Layer = mainLayer'],
      });
      const mainLayer = NE({
        kind: 'object', name: 'mainLayer', x: 456, y: 120, fill: '#f8f0fb', classifierModelId: '',
        slots: ['+ name: string = "Main"', '+ visible: boolean = true'],
      });
      const circle = NE({
        kind: 'object', name: 'circle1', x: 792, y: 120, fill: '#f8f0fb', classifierModelId: '',
        slots: ['# x: number = 120', '# y: number = 80', '+ radius: number = 32'],
      });
      const renderer = NE({ kind: 'componentinstance', name: 'renderer', x: 248, y: 376, w: 216, h: 72, fill: '#f5f1fb', classifierModelId: '' });
      const server = NE({ kind: 'nodeinstance', name: 'webServer', x: 584, y: 360, w: 224, h: 104, fill: '#f5f1fb', classifierModelId: '' });
      const bundle = NE({ kind: 'artifactinstance', name: 'bundle', x: 944, y: 376, w: 216, h: 72, fill: '#f5f1fb', classifierModelId: '' });
      return {
        id: uid(), type: 'object', name: 'Runtime Object Snapshot',
        elements: [canvasView, mainLayer, circle, renderer, server, bundle],
        relations: [
          NR('link', canvasView, mainLayer, { name: 'activeLayer', sourceLabel: '1', targetLabel: '1' }),
          NR('link', mainLayer, circle, { name: 'shapes', sourceLabel: '1', targetLabel: '0..*' }),
          NR('directedlink', renderer, canvasView, { name: 'renders' }),
          NR('link', server, renderer, { name: 'hosts' }),
          NR('directedlink', bundle, server, { name: 'deployedOn' }),
        ],
      };
    }

    function linkSampleObjectClassifiers() {
      const sample = state.diagrams.find(diagram => diagram.type === 'object' && diagram.name === 'Runtime Object Snapshot');
      if (!sample) return;
      const targets: Record<string, [string, string]> = {
        canvasView: ['class', 'CanvasView'], mainLayer: ['class', 'Layer'], circle1: ['class', 'Circle'],
        renderer: ['component', 'RenderEngine'], webServer: ['node', 'Web Server'], bundle: ['artifact', 'uml-studio.js'],
      };
      sample.elements.forEach(instance => {
        if (instance.classifierModelId || !targets[instance.name ?? '']) return;
        const [kind, name] = targets[instance.name ?? ''];
        const classifier = Object.values(state.models).find(model => model.kind === kind && model.name === name);
        if (classifier) instance.classifierModelId = classifier.id;
      });
    }

    function sampleCommunication() {
      const editor = NE({ kind: 'lifeline', name: 'editor', x: 128, y: 112, fill: '#eef8f8', classifierModelId: '', stereotype: 'control' });
      const canvas = NE({ kind: 'lifeline', name: 'canvas', x: 480, y: 88, fill: '#eef8f8', classifierModelId: '', stereotype: '' });
      const renderer = NE({ kind: 'lifeline', name: 'renderer', x: 824, y: 264, fill: '#eef8f8', classifierModelId: '', stereotype: 'service' });
      const layer = NE({ kind: 'lifeline', name: 'layer', x: 280, y: 432, fill: '#eef8f8', classifierModelId: '', stereotype: '' });
      const editorCanvas = NR('commconnector', editor, canvas);
      const canvasRenderer = NR('commconnector', canvas, renderer, { name: 'rendering' });
      const canvasLayer = NR('commconnector', canvas, layer);
      const canvasSelf = NR('commconnector', canvas, canvas);
      return {
        id: uid(), type: 'communication', name: 'Diagram Rendering Communication', seqNumbers: true,
        elements: [editor, canvas, renderer, layer],
        relations: [
          editorCanvas, canvasRenderer, canvasLayer, canvasSelf,
          NR('comm-forward', editor, canvas, { connectorId: editorCanvas.id, name: 'load(document)', seqNo: '1', messageSort: 'synchCall' }),
          NR('comm-forward', canvas, renderer, { connectorId: canvasRenderer.id, name: 'render()', seqNo: '1.1', messageSort: 'synchCall' }),
          NR('comm-forward', canvas, layer, { connectorId: canvasLayer.id, name: 'visibleShapes()', seqNo: '1.2', messageSort: 'synchCall' }),
          NR('comm-reverse', renderer, canvas, { connectorId: canvasRenderer.id, name: 'frameComplete()', seqNo: '1.3', messageSort: 'reply' }),
          NR('comm-reverse', canvas, editor, { connectorId: editorCanvas.id, name: 'ready', seqNo: '1.4', messageSort: 'asynchSignal' }),
          NR('comm-forward', canvas, canvas, { connectorId: canvasSelf.id, name: 'refresh()', seqNo: '2', messageSort: 'synchCall' }),
        ],
      };
    }

    function linkSampleCommunicationClassifiers() {
      const sample = state.diagrams.find(diagram => diagram.type === 'communication' && diagram.name === 'Diagram Rendering Communication');
      if (!sample) return;
      const targets: Record<string, [string, string]> = {
        editor: ['component', 'DiagramEditor'],
        canvas: ['class', 'CanvasView'],
        renderer: ['component', 'RenderEngine'],
        layer: ['class', 'Layer'],
      };
      sample.elements.forEach(lifeline => {
        if (lifeline.classifierModelId || !targets[lifeline.name ?? '']) return;
        const [kind, name] = targets[lifeline.name ?? ''];
        const classifier = Object.values(state.models).find(model => model.kind === kind && model.name === name);
        if (classifier) lifeline.classifierModelId = classifier.id;
      });
    }

    function sampleTiming() {
      const editor = NE({
        kind: 'lifeline', name: 'editor', x: 112, y: 96, w: 1040, h: 132,
        fill: '#f8eadf', classifierModelId: '', stereotype: 'control',
      });
      const renderer = NE({
        kind: 'lifeline', name: 'renderer', x: 112, y: 328, w: 1040, h: 132,
        fill: '#f8eadf', classifierModelId: '', stereotype: 'service',
      });
      const editorIdle = NE({ kind: 'timingstate', name: 'Editor Idle', parentId: editor.id, stateOrder: 0, x: 0, y: 0, w: 0, h: 0 });
      const editorDispatch = NE({ kind: 'timingstate', name: 'Editor Dispatching', parentId: editor.id, stateOrder: 1, x: 0, y: 0, w: 0, h: 0 });
      const rendererWait = NE({ kind: 'timingstate', name: 'Renderer Waiting', parentId: renderer.id, stateOrder: 0, x: 0, y: 0, w: 0, h: 0 });
      const rendererRender = NE({ kind: 'timingstate', name: 'Renderer Rendering', parentId: renderer.id, stateOrder: 1, x: 0, y: 0, w: 0, h: 0 });

      const editorIdleBefore = NE({
        kind: 'timesegment', name: '', parentId: editorIdle.id, x: 312, y: 0, w: 144, h: 10,
        fill: '#8b8f97', startTime: '0 ms', endTime: '10 ms',
      });
      const editorDispatching = NE({
        kind: 'timesegment', name: '', parentId: editorDispatch.id, x: 456, y: 0, w: 272, h: 10,
        fill: '#ad6b3d', startTime: '10 ms', endTime: '40 ms',
      });
      const editorIdleAfter = NE({
        kind: 'timesegment', name: '', parentId: editorIdle.id, x: 728, y: 0, w: 328, h: 10,
        fill: '#8b8f97', startTime: '40 ms', endTime: '80 ms',
      });
      const rendererWaitingBefore = NE({
        kind: 'timesegment', name: '', parentId: rendererWait.id, x: 312, y: 0, w: 232, h: 10,
        fill: '#8b8f97', startTime: '0 ms', endTime: '20 ms',
      });
      const rendererRendering = NE({
        kind: 'timesegment', name: '', parentId: rendererRender.id, x: 544, y: 0, w: 296, h: 10,
        fill: '#ad6b3d', startTime: '20 ms', endTime: '60 ms',
      });
      const rendererWaitingAfter = NE({
        kind: 'timesegment', name: '', parentId: rendererWait.id, x: 840, y: 0, w: 216, h: 10,
        fill: '#8b8f97', startTime: '60 ms', endTime: '80 ms',
      });

      const tickPositions: [string, string, number][] = [
        ['tick0', '0 ms', 312], ['tick10', '10 ms', 456], ['tick20', '20 ms', 544],
        ['tick40', '40 ms', 728], ['tick60', '60 ms', 840], ['tick80', '80 ms', 1056],
      ];
      const ticks = tickPositions.map(([name, timeValue, x]) => NE({
        kind: 'timetick', name, timeValue, x: x - 4, y: 0, w: 8, h: 0, fill: 'transparent',
      }));
      const atRender = NE({
        kind: 'timeconstraint', name: 'renderStart', constraint: '{t = 20 ms}',
        constrainedViewId: rendererRendering.id, anchorRatio: 0,
        x: 0, y: 0, w: 128, h: 28, fill: 'transparent',
      });
      const renderDuration = NE({
        kind: 'durationconstraint', name: 'renderDuration', constraint: '{20 ms..60 ms}',
        x: 544, y: 536, w: 296, h: 32, fill: 'transparent',
      });
      const note = NE({
        kind: 'note', name: 'TimingNote', x: 1200, y: 176,
        text: uiText(
          'Drag a time segment to move it or use the end handles to resize it.\nTime constraints attach to segments or messages.',
          'Time Segment를 좌우로 이동하고 양 끝 핸들로 기간을 조절합니다.\nTime Constraint는 Segment 또는 Message에 부착할 수 있습니다.',
        ),
      });
      return {
        id: uid(), type: 'timing', name: 'Frame Rendering Timing',
        elements: [
          editor, renderer, editorIdle, editorDispatch, rendererWait, rendererRender,
          editorIdleBefore, editorDispatching, editorIdleAfter,
          rendererWaitingBefore, rendererRendering, rendererWaitingAfter,
          ...ticks, atRender, renderDuration, note,
        ],
        relations: [
          NR('timingmessage', editorDispatching, rendererRendering, { name: 'render()', messageSort: 'synchCall' }),
          NR('timingmessage', rendererRendering, editorIdleAfter, { name: 'frameReady', messageSort: 'asynchSignal' }),
          NR('notelink', note, renderDuration),
        ],
      };
    }

    function linkSampleTimingClassifiers() {
      const sample = state.diagrams.find(diagram => diagram.type === 'timing' && diagram.name === 'Frame Rendering Timing');
      if (!sample) return;
      const targets: Record<string, [string, string]> = { editor: ['component', 'DiagramEditor'], renderer: ['component', 'RenderEngine'] };
      sample.elements.filter(element => element.kind === 'lifeline').forEach(lifeline => {
        if (lifeline.classifierModelId || !targets[lifeline.name ?? '']) return;
        const [kind, name] = targets[lifeline.name ?? ''];
        const classifier = Object.values(state.models).find(model => model.kind === kind && model.name === name);
        if (classifier) lifeline.classifierModelId = classifier.id;
      });
    }

    function upgradeSampleTimingLayout() {
      const sample = state.diagrams.find(diagram => diagram.type === 'timing' && diagram.name === 'Frame Rendering Timing');
      if (!sample) return;
      const renderStart = sample.elements.find(element =>
        element.kind === 'timeconstraint' && element.name === 'renderStart');
      if (renderStart && !Number.isFinite(renderStart.anchorRatio)) renderStart.anchorRatio = 0;
    }

    function sampleCompositeStructure() {
      const structure = NE({
        kind: 'class', name: 'DiagramEditorStructure', stereotype: 'structured',
        x: 96, y: 72, w: 800, h: 560, fill: '#f5f6ff', attributes: [], operations: [],
      });
      const canvas = NE({
        kind: 'part', name: 'canvas', parentId: structure.id, x: 160, y: 176, w: 184, h: 72,
        fill: '#eef1ff', classifierModelId: '',
      });
      const renderer = NE({
        kind: 'part', name: 'renderer', parentId: structure.id, x: 632, y: 176, w: 184, h: 72,
        fill: '#eef1ff', classifierModelId: '',
      });
      const layer = NE({
        kind: 'part', name: 'layer', parentId: structure.id, x: 400, y: 472, w: 184, h: 72,
        fill: '#eef1ff', classifierModelId: '',
      });
      const renderingUse = NE({
        kind: 'collaborationuse', name: 'rendering', parentId: structure.id,
        x: 376, y: 288, w: 224, h: 88, fill: '#f7f5ff', collaborationModelId: '',
      });
      const canvasOut = NE({
        kind: 'port', name: 'drawOut', parentId: canvas.id, borderAnchor: { fx: 1, fy: 0.5 },
        x: 335, y: 203, w: 18, h: 18, fill: '#ffffff', classifierModelId: '',
        providedInterfaceModelId: '', requiredInterfaceModelId: '',
      });
      const rendererIn = NE({
        kind: 'port', name: 'drawIn', parentId: renderer.id, borderAnchor: { fx: 0, fy: 0.5 },
        x: 623, y: 203, w: 18, h: 18, fill: '#ffffff', classifierModelId: '',
        providedInterfaceModelId: '', requiredInterfaceModelId: '',
      });
      const canvasLayer = NE({
        kind: 'port', name: 'layerOut', parentId: canvas.id, borderAnchor: { fx: 0.5, fy: 1 },
        x: 243, y: 239, w: 18, h: 18, fill: '#ffffff', classifierModelId: '',
        providedInterfaceModelId: '', requiredInterfaceModelId: '',
      });
      const layerIn = NE({
        kind: 'port', name: 'layerIn', parentId: layer.id, borderAnchor: { fx: 0.5, fy: 0 },
        x: 483, y: 463, w: 18, h: 18, fill: '#ffffff', classifierModelId: '',
        providedInterfaceModelId: '', requiredInterfaceModelId: '',
      });
      const collaboration = NE({
        kind: 'collaboration', name: 'Rendering Collaboration',
        x: 1000, y: 152, w: 400, h: 304, fill: '#f5f6ff',
      });
      const note = NE({
        kind: 'note', name: 'CompositeNote', x: 1016, y: 504,
        text: uiText(
          'Parts are nested in a structure and ports attach to their owner\'s border.\nConnectors join ports and parts. Role bindings map collaboration roles to parts.',
          'Part는 구조 내부에 포함되고 Port는 소유 요소의 테두리에 고정됩니다.\nConnector는 Port/Part를 연결하고 Role Binding은 Collaboration Use의 역할을 Part에 매핑합니다.',
        ),
      });
      return {
        id: uid(), type: 'composite', name: 'Rendering Composite Structure',
        elements: [
          structure, canvas, renderer, layer, renderingUse,
          canvasOut, rendererIn, canvasLayer, layerIn, collaboration, note,
        ],
        relations: [
          NR('csconnector', canvasOut, rendererIn, { name: 'render channel' }),
          NR('csconnector', canvasLayer, layerIn, { name: 'layer channel' }),
          NR('rolebinding', renderingUse, canvas, { name: 'canvasRole' }),
          NR('rolebinding', renderingUse, renderer, { name: 'rendererRole' }),
          NR('rolebinding', renderingUse, layer, { name: 'layerRole' }),
          NR('notelink', note, collaboration),
        ],
      };
    }

    function linkSampleCompositeStructureReferences() {
      const sample = state.diagrams.find(diagram => diagram.type === 'composite' && diagram.name === 'Rendering Composite Structure');
      if (!sample) return;
      const modelByKindAndName = (kind: string, name: string) => Object.values(state.models)
        .find(model => model.kind === kind && model.name === name);
      const typeTargets: Record<string, [string, string]> = {
        canvas: ['class', 'CanvasView'],
        renderer: ['component', 'RenderEngine'],
        layer: ['class', 'Layer'],
      };
      sample.elements.filter(element => element.kind === 'part').forEach(part => {
        const target = typeTargets[part.name ?? ''];
        if (!part.classifierModelId && target) {
          const classifier = modelByKindAndName(target[0], target[1]);
          if (classifier) part.classifierModelId = classifier.id;
        }
      });
      const drawable = modelByKindAndName('interface', 'Drawable');
      sample.elements.filter(element => element.kind === 'port').forEach(port => {
        if (drawable && !port.classifierModelId) port.classifierModelId = drawable.id;
        if (!drawable) return;
        const owner = sample.elements.find(element => element.id === port.parentId);
        if (owner && owner.name === 'canvas' && !port.requiredInterfaceModelId) port.requiredInterfaceModelId = drawable.id;
        if (owner && owner.name === 'renderer' && !port.providedInterfaceModelId) port.providedInterfaceModelId = drawable.id;
        if (owner && owner.name === 'layer' && !port.providedInterfaceModelId) port.providedInterfaceModelId = drawable.id;
      });
      const collaborationView = sample.elements.find(element => element.kind === 'collaboration' && element.name === 'Rendering Collaboration');
      const use = sample.elements.find(element => element.kind === 'collaborationuse' && element.name === 'rendering');
      if (collaborationView && use && !use.collaborationModelId) use.collaborationModelId = collaborationView.modelId;
    }

    function upgradeSampleCompositeStructureLayout() {
      const sample = state.diagrams.find(diagram => diagram.type === 'composite' && diagram.name === 'Rendering Composite Structure');
      if (!sample) return;
      sample.elements.filter(element => element.kind === 'port').forEach(port => {
        const owner = sample.elements.find(element => element.id === port.parentId);
        if (!owner) return;
        if (owner.name === 'renderer') port.name = 'drawIn';
        else if (owner.name === 'layer') port.name = 'layerIn';
        else if (owner.name === 'canvas') port.name = port.borderAnchor && port.borderAnchor.fy === 1 ? 'layerOut' : 'drawOut';
      });
      sample.relations.filter(relation => relation.kind === 'rolebinding' && relation.targetLabel && !relation.name).forEach(relation => {
        relation.name = relation.targetLabel;
        relation.targetLabel = '';
      });
    }

    function upgradeSampleCommunicationLayout() {
      const sample = state.diagrams.find(diagram => diagram.type === 'communication' && diagram.name === 'Diagram Rendering Communication');
      if (!sample) return;
      const layer = sample.elements.find(element => element.name === 'layer');
      if (layer && layer.x === 440 && layer.y === 432) layer.x = 280;
      const oldLabels = new Set(['commands', 'contents', 'refresh loop']);
      sample.relations.filter(relation => relation.kind === 'commconnector' && oldLabels.has(relation.name ?? '')).forEach(relation => {
        relation.name = '';
      });
    }

    function sampleDeployment() {
      const client = NE({ kind: 'node', name: 'Client PC', stereotype: 'device', x: 128, y: 96, w: 200, h: 112 });
      const server = NE({ kind: 'node', name: 'Web Server', stereotype: 'device', x: 512, y: 96, w: 200, h: 112 });
      const art = NE({ kind: 'artifact', name: 'uml-studio.js', x: 152, y: 312 });
      const art2 = NE({ kind: 'artifact', name: 'index.html', x: 536, y: 312 });
      return {
        id: uid(), type: 'deployment', name: 'Deployment Diagram',
        elements: [client, server, art, art2],
        relations: [
          NR('commpath', client, server, { name: 'HTTPS' }),
          NR('deploy', art, client),
          NR('deploy', art2, server),
        ],
      };
    }

    function sampleERD() {
      const user = NE({ kind: 'entity', name: 'TB_USER', logicalName: uiText('Member', '회원'), x: 96, y: 120, columns: [uiText(
        'PK id <Member ID>: VARCHAR2(50)',
        'PK id <회원번호>: VARCHAR2(50)',
      ), uiText(
        'NN name <Name>: VARCHAR2(50)',
        'NN name <이름>: VARCHAR2(50)',
      ), uiText(
        'NN email <Email>: VARCHAR2(100)',
        'NN email <이메일>: VARCHAR2(100)',
      ), uiText(
        'created_at <Joined At>: DATE',
        'created_at <가입일시>: DATE',
      )] });
      const post = NE({ kind: 'entity', name: 'TB_POST', logicalName: uiText('Post', '게시글'), x: 528, y: 120, columns: [uiText(
        'PK id <Post ID>: VARCHAR2(50)',
        'PK id <글번호>: VARCHAR2(50)',
      ), uiText(
        'FK NN user_id <Author ID>: VARCHAR2(50)',
        'FK NN user_id <작성자번호>: VARCHAR2(50)',
      ), uiText(
        'NN title <Title>: VARCHAR2(200)',
        'NN title <제목>: VARCHAR2(200)',
      ), uiText(
        'content <Content>: CLOB',
        'content <내용>: CLOB',
      )] });
      const tag = NE({ kind: 'entity', name: 'TB_TAG', logicalName: uiText('Tag', '태그'), x: 968, y: 128, columns: [uiText(
        'PK id <Tag ID>: VARCHAR2(50)',
        'PK id <태그번호>: VARCHAR2(50)',
      ), uiText(
        'NN name <Tag Name>: VARCHAR2(30)',
        'NN name <태그명>: VARCHAR2(30)',
      )] });
      const note = NE({ kind: 'note', name: 'Note1', x: 448, y: 328, text: uiText(
        'Crow\'s foot notation: || = 1 · |< = 1..N\n○| = 0..1 · ○< = 0..N\nSelect a relationship to set the cardinality at both ends.',
        '까마귀발(crow\'s foot): || = 1 · |< = 1..N\n○| = 0..1 · ○< = 0..N\n관계 선택 후 양쪽 참여 개수를 변경할 수 있습니다.',
      ) });
      return {
        id: uid(), type: 'erd', name: 'ER Diagram', erdMode: 'both',
        elements: [user, post, tag, note],
        relations: [
          NR('erd-1n', user, post, { name: 'writes', sourceLabel: '1', targetLabel: 'N' }),
          NR('erd-nm', post, tag, { name: 'tagged', sourceLabel: 'N', targetLabel: 'M' }),
          NR('notelink', note, post),
        ],
      };
    }

    function sampleDFD() {
      const userX = NE({ kind: 'external', name: 'User', x: 104, y: 152 });
      const p1 = NE({ kind: 'process', name: '1.0 Edit Diagram', x: 336, y: 128 });
      const p2 = NE({ kind: 'process', name: '2.0 Export Image', x: 344, y: 344 });
      const store = NE({ kind: 'datastore', name: 'D1 | Project Store', x: 656, y: 160 });
      return {
        id: uid(), type: 'dfd', name: 'Data Flow Diagram',
        elements: [userX, p1, p2, store],
        relations: [
          NR('dataflow', userX, p1, { name: 'edit commands' }),
          NR('dataflow', p1, store, { name: 'model data' }),
          NR('dataflow', store, p2, { name: 'model data' }),
          NR('dataflow', p2, userX, { name: 'PNG file' }),
        ],
      };
    }

    function sampleMindmap() {
      const root = NE({ kind: 'mindnode', name: 'UML Studio', x: 432, y: 264, fill: '#ffd9a0' });
      const d1 = NE({ kind: 'mindnode', name: 'Diagrams', x: 216, y: 152, fill: '#d7e6f7' });
      const d2 = NE({ kind: 'mindnode', name: 'Editing', x: 216, y: 384, fill: '#dff0d8' });
      const d3 = NE({ kind: 'mindnode', name: 'Export', x: 688, y: 152, fill: '#fce4ec' });
      const d4 = NE({ kind: 'mindnode', name: 'Persistence', x: 680, y: 384, fill: '#e8e0f7' });
      const c1 = NE({ kind: 'mindnode', name: 'Class / Sequence', x: 48, y: 88, fill: '#eef3fa' });
      const c2 = NE({ kind: 'mindnode', name: 'ERD / DFD', x: 48, y: 216, fill: '#eef3fa' });
      const c3 = NE({ kind: 'mindnode', name: 'SVG · PNG', x: 880, y: 96, fill: '#fdf0f4' });
      const c4 = NE({ kind: 'mindnode', name: 'All PNG', x: 888, y: 208, fill: '#fdf0f4' });
      return {
        id: uid(), type: 'mindmap', name: 'Mindmap',
        elements: [root, d1, d2, d3, d4, c1, c2, c3, c4],
        relations: [
          NR('mindbranch', root, d1), NR('mindbranch', root, d2),
          NR('mindbranch', root, d3), NR('mindbranch', root, d4),
          NR('mindbranch', d1, c1), NR('mindbranch', d1, c2),
          NR('mindbranch', d3, c3), NR('mindbranch', d3, c4),
        ],
      };
    }

    function sampleProject() {
      if (!state.projectId) state.projectId = projectUid();
      state.projectName = cleanProjectName(state.projectName || 'UML Studio Samples');
      const submachinePair = sampleSubmachineStatePair();
      const sequence = sampleSequence();
      const interactionOverviewPair = sampleInteractionOverviewPair(sequence);
      state.diagrams = [
        sampleClass(), samplePackage(), sampleProfile(), sampleUseCase(), sampleActivity(), sequence, ...interactionOverviewPair, sampleComponent(), sampleDeployment(),
        sampleERD(), sampleDFD(), sampleMindmap(), sampleState(), sampleCompositeState(), ...submachinePair,
        sampleObject(), sampleCommunication(), sampleCompositeStructure(), sampleTiming(), sampleInformationFlow(), sampleRequirement(), sampleBlockDefinition(), sampleInternalBlock(), sampleParametric(),
      ];
      state.activeId = state.diagrams[0].id;
      hydrateCurrentProject({});
      upgradeSampleInformationFlowLayout();
      linkSampleObjectClassifiers();
      linkSampleCommunicationClassifiers();
      linkSampleCompositeStructureReferences();
      linkSampleTimingClassifiers();
      linkSampleInformationFlowModels();
      linkSampleRequirementModels();
      linkSampleBlockDefinitionModels();
      linkSampleInternalBlockModels();
      linkSampleParametricModels();
      reconcileTraceabilitySampleModels();
    }
    function sampleEmpty() {
      if (!state.projectId) state.projectId = projectUid();
      state.projectName = cleanProjectName(state.projectName);
      state.models = {};
      state.diagrams = [{ id: uid(), type: 'class', name: 'Class Diagram', elements: [], relations: [] }];
      state.activeId = state.diagrams[0].id;
      setSelection([]);
    }

    return Object.freeze({
      sampleClass,
      samplePackage,
      sampleProfile,
      sampleSequence,
      sampleInteractionOverviewPair,
      sampleUseCase,
      sampleActivity,
      sampleState,
      sampleCompositeState,
      sampleSubmachineStatePair,
      sampleComponent,
      sampleInformationFlow,
      sampleRequirement,
      sampleBlockDefinition,
      sampleInternalBlock,
      sampleParametric,
      sampleObject,
      sampleCommunication,
      sampleTiming,
      sampleCompositeStructure,
      sampleDeployment,
      sampleERD,
      sampleDFD,
      sampleMindmap,
      sampleProject,
      sampleEmpty,
      upgradeSampleInformationFlowLayout,
      upgradeSampleTimingLayout,
      upgradeSampleCompositeStructureLayout,
      upgradeSampleCommunicationLayout,
      linkSampleInformationFlowModels,
      linkSampleRequirementModels,
      linkSampleBlockDefinitionModels,
      linkSampleInternalBlockModels,
      linkSampleParametricModels,
      linkSampleObjectClassifiers,
      linkSampleCommunicationClassifiers,
      linkSampleTimingClassifiers,
      linkSampleCompositeStructureReferences,
      reconcileTraceabilitySampleModels,
    });
  }

  return Object.freeze({ REQUIRED_FUNCTIONS, REQUIRED_VALUES, create });
}
