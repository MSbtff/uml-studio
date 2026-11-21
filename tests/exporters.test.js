'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const {
  ERD_DDL_DIALECTS,
  exportErdDdl,
  exportMermaid,
  exportDrawio,
} = require('../dist/browser/io/exporters.js');

const element = (id, kind, name, extra) => ({
  id, modelId: `m_${id}`, kind, name, x: 0, y: 0, w: 160, h: 72, ...(extra || {}),
});
const relation = (id, kind, from, to, extra) => ({
  id, modelId: `m_${id}`, kind, from, to, name: '', ...(extra || {}),
});

{
  const diagram = {
    id: 'class-diagram', type: 'class', name: 'Domain Model',
    elements: [
      element('shape', 'class', 'Shape', { attributes: ['+ color: Color'], operations: ['+ draw(): void'] }),
      element('circle', 'class', 'Circle', { x: 280, attributes: ['+ radius: number'], operations: [] }),
      element('api', 'interface', 'Drawable', { x: 560, operations: ['+ draw(): void'] }),
      element('note', 'note', 'Note', { text: 'Rendering contract' }),
    ],
    relations: [
      relation('inherit', 'generalization', 'circle', 'shape'),
      relation('realize', 'realization', 'shape', 'api', { name: 'implements' }),
      relation('note-link', 'notelink', 'note', 'api'),
    ],
  };
  const output = exportMermaid(diagram, {});
  assert.match(output, /^%% Domain Model\nclassDiagram/m);
  assert.match(output, /class c_shape\["Shape"\]/);
  assert.match(output, /\+draw\(\) void/);
  assert.match(output, /c_circle --\|> c_shape/);
  assert.match(output, /c_shape \.\.\|> c_api : implements/);
  assert.match(output, /note for c_api "Rendering contract"/);
}

{
  const diagram = {
    id: 'sequence', type: 'sequence', name: 'Login Sequence',
    elements: [
      element('client', 'seqactor', 'Client', { x: 20 }),
      element('server', 'lifeline', 'server', { x: 280, classifierModelId: 'serverType' }),
    ],
    relations: [
      relation('request', 'msg-sync', 'client', 'server', { name: 'login()', y: 100 }),
      relation('reply', 'msg-reply', 'server', 'client', { name: 'ok', y: 160 }),
    ],
  };
  const output = exportMermaid(diagram, { serverType: { id: 'serverType', kind: 'component', name: 'AuthService' } });
  assert.match(output, /sequenceDiagram/);
  assert.match(output, /actor p_client as Client/);
  assert.match(output, /participant p_server as server: AuthService/);
  assert.match(output, /p_client->>p_server: login\(\)/);
  assert.match(output, /p_server-->>p_client: ok/);
}

{
  const diagram = {
    id: 'state', type: 'state', name: 'Order State',
    elements: [
      element('initial', 'stateinitial', 'Initial'),
      element('pending', 'state', 'Pending', { x: 160 }),
      element('final', 'statefinal', 'Final', { x: 360 }),
    ],
    relations: [
      relation('start', 'transition', 'initial', 'pending'),
      relation('finish', 'transition', 'pending', 'final', { trigger: 'complete', guard: 'paid', effect: 'notify()' }),
    ],
  };
  const output = exportMermaid(diagram, {});
  assert.match(output, /stateDiagram-v2/);
  assert.match(output, /\[\*\] --> s_pending/);
  assert.match(output, /s_pending --> \[\*\]: complete \[paid\] \/ notify\(\)/);
}

{
  const diagram = {
    id: 'activity', type: 'activity', name: 'Checkout Activity',
    elements: [
      element('start', 'initial', 'Start'),
      element('work', 'action', 'Charge card', { x: 200 }),
      element('decision', 'decision', 'Approved?', { x: 400 }),
    ],
    relations: [
      relation('flow1', 'controlflow', 'start', 'work'),
      relation('flow2', 'controlflow', 'work', 'decision', { name: 'result' }),
    ],
  };
  const output = exportMermaid(diagram, {});
  assert.match(output, /flowchart LR/);
  assert.match(output, /n_work\(\["Charge card"\]\)/);
  assert.match(output, /n_work -->\|result\| n_decision/);
}

{
  const diagram = {
    id: 'deployment', type: 'deployment', name: 'Deployment Diagram',
    elements: [element('client', 'node', 'Client'), element('server', 'node', 'Server', { x: 280 })],
    relations: [],
  };
  const cases = [
    [{}, 'n_client ---|HTTPS| n_server', []],
    [{ sourceNavigability: 'navigable' }, 'n_server -->|HTTPS| n_client', []],
    [{ targetNavigability: 'navigable' }, 'n_client -->|HTTPS| n_server', []],
    [{ sourceNavigability: 'navigable', targetNavigability: 'navigable' }, 'n_client <-->|HTTPS| n_server', []],
    [{ sourceNavigability: 'notNavigable' }, 'n_server --x|HTTPS| n_client', []],
    [{ targetNavigability: 'notNavigable' }, 'n_client --x|HTTPS| n_server', []],
    [{ sourceNavigability: 'notNavigable', targetNavigability: 'notNavigable' }, 'n_client x--x|HTTPS| n_server', []],
    [{ sourceNavigability: 'notNavigable', targetNavigability: 'navigable' }, 'n_client -->|HTTPS| n_server', ['source cross']],
    [{ sourceNavigability: 'navigable', targetNavigability: 'notNavigable' }, 'n_server -->|HTTPS| n_client', ['target cross']],
    [{ sourceAggregation: 'shared', sourceNavigability: 'navigable', targetNavigability: 'notNavigable' },
      'n_client --x|HTTPS| n_server', ['source open diamond']],
    [{ sourceAggregation: 'shared', targetAggregation: 'composite' }, 'n_client ---|HTTPS| n_server',
      ['source open diamond', 'target filled diamond']],
  ];
  for (const [settings, edge, omitted] of cases) {
    diagram.relations = [relation('path', 'commpath', 'client', 'server', { name: 'HTTPS', ...settings })];
    const warnings = [];
    const output = exportMermaid(diagram, {}, count => warnings.push(count));
    const lines = output.split('\n');
    const edgeIndex = lines.indexOf(`  ${edge}`);
    assert.ok(edgeIndex >= 0, output);
    assert.deepEqual(warnings, omitted.length ? [omitted.length] : []);
    if (omitted.length) {
      assert.equal(lines[edgeIndex - 1], `  %% UML Studio omitted ${omitted.join(' and ')} on the communication path from n_client to n_server.`);
    } else {
      assert.doesNotMatch(output, /UML Studio omitted/);
    }
  }
}

{
  const diagram = {
    id: 'interaction-overview', type: 'interactionoverview', name: 'Checkout Overview',
    elements: [
      element('start', 'initial', 'Start'),
      element('authorize', 'interactioninline', 'Authorize Payment', {
        x: 160, w: 400, h: 240, interactionDiagramId: 'authorize-sequence',
      }),
      element('publish', 'interactionuse', 'Publish Result', {
        x: 640, interactionDiagramId: 'publish-sequence',
      }),
      element('finish', 'final', 'Done', { x: 880 }),
    ],
    relations: [
      relation('flow1', 'controlflow', 'start', 'authorize'),
      relation('flow2', 'controlflow', 'authorize', 'publish'),
      relation('flow3', 'controlflow', 'publish', 'finish'),
    ],
  };
  const mermaid = exportMermaid(diagram, {});
  assert.match(mermaid, /flowchart LR/);
  assert.match(mermaid, /n_authorize\[\["sd · Authorize Payment<br\/>inline sequence"\]\]/);
  assert.match(mermaid, /n_publish\[\["ref · Publish Result"\]\]/);

  const drawio = exportDrawio(diagram, {});
  assert.match(drawio, /umlKind="interactioninline"/);
  assert.match(drawio, /umlInteractionDiagramId="authorize-sequence"/);
  assert.match(drawio, /inline sequence/);
  assert.match(drawio, /umlKind="interactionuse"/);
  assert.match(drawio, /umlInteractionDiagramId="publish-sequence"/);
}

{
  const diagram = {
    id: 'advanced-activity', type: 'activity', name: 'Advanced Checkout',
    elements: [
      element('lane', 'swimlanev', 'Order Service', { x: 40, y: 40, w: 600, h: 500 }),
      element('region', 'interruptibleregion', 'Payment Window', { parentId: 'lane', x: 80, y: 100, w: 480, h: 220 }),
      element('timeout', 'timeevent', '30s Timeout', { parentId: 'region', x: 120, y: 160 }),
      element('stop', 'flowfinal', 'Cancelled', { parentId: 'lane', x: 560, y: 360, w: 26, h: 26 }),
      element('object', 'objectnode', 'Order', { parentId: 'lane', x: 120, y: 380 }),
    ],
    relations: [
      relation('interrupt', 'activityinterrupt', 'timeout', 'stop'),
    ],
  };
  const mermaid = exportMermaid(diagram, {});
  assert.match(mermaid, /subgraph cluster_n_lane\["Order Service"\]/);
  assert.match(mermaid, /subgraph cluster_n_region\["interruptible · Payment Window"\]/);
  assert.match(mermaid, /n_timeout\(\["30s Timeout"\]\)/);
  assert.match(mermaid, /n_timeout ==>\|«activityinterrupt»\| n_stop/);

  const drawio = exportDrawio(diagram, {});
  assert.match(drawio, /umlKind="interruptibleregion"/);
  assert.match(drawio, /vertex="1" parent="cell_lane"/);
  assert.match(drawio, /umlKind="activityinterrupt"/);
  assert.match(drawio, /endArrow=open/);
}

{
  const diagram = {
    id: 'packages', type: 'package', name: 'Architecture Packages',
    elements: [
      element('root', 'model', 'UML Studio', { x: 40, y: 40, w: 720, h: 520, visibility: 'public' }),
      element('app', 'package', 'application', { parentId: 'root', x: 80, y: 120, w: 560, h: 320, visibility: 'protected' }),
      element('render', 'subsystem', 'Rendering Engine', { parentId: 'app', x: 120, y: 200, w: 220, h: 120, visibility: 'private' }),
      element('export', 'package', 'export', { parentId: 'app', x: 400, y: 200, w: 180, h: 120, visibility: 'public' }),
    ],
    relations: [
      relation('own-app', 'containment', 'app', 'root'),
      relation('own-render', 'containment', 'render', 'app'),
      relation('own-export', 'containment', 'export', 'app'),
      relation('uses', 'dependency', 'export', 'render', { name: 'uses' }),
    ],
  };
  const mermaid = exportMermaid(diagram, {});
  assert.match(mermaid, /subgraph cluster_n_root\["model · \+ UML Studio"\]/);
  assert.match(mermaid, /subgraph cluster_n_app\["# application"\]/);
  assert.match(mermaid, /subgraph cluster_n_render\["subsystem · - Rendering Engine"\]/);
  assert.match(mermaid, /n_export -\.->\|uses\| n_render/);
  assert.doesNotMatch(mermaid, /own-app|containment/);

  const drawio = exportDrawio(diagram, {});
  assert.match(drawio, /umlKind="model"/);
  assert.match(drawio, /«model»/);
  assert.match(drawio, /umlKind="subsystem"/);
  assert.match(drawio, /vertex="1" parent="cell_root"/);
  assert.match(drawio, /vertex="1" parent="cell_app"/);
  assert.match(drawio, /umlKind="containment"/);
  assert.match(drawio, /endArrow=circlePlus/);
}

{
  const diagram = {
    id: 'profile', type: 'profile', name: 'UML Studio Profile',
    elements: [
      element('entity', 'stereotype', 'Entity', {
        x: 40, y: 80, w: 260, h: 160, visibility: 'public',
        attributes: ['+ tableName: String'], operations: [],
        iconContent: '!icon 40 40\n%l #76508f\ne 6 8 34 30',
      }),
      element('class', 'metaclass', 'Class', {
        x: 520, y: 80, w: 220, h: 72, visibility: 'public',
      }),
      element('audited', 'stereotype', 'Audited', {
        x: 40, y: 360, w: 240, h: 120, visibility: 'protected',
        attributes: [], operations: [],
      }),
    ],
    relations: [
      relation('entity-extension', 'extension', 'entity', 'class', { isRequired: true }),
      relation('specializes', 'generalization', 'entity', 'audited'),
    ],
  };
  const mermaid = exportMermaid(diagram, {});
  assert.match(mermaid, /«stereotype»<br\/>\+ Entity/);
  assert.match(mermaid, /«metaclass»<br\/>\+ Class/);
  assert.match(mermaid, /n_entity -->\|«extension» \{required\}\| n_class/);

  const drawio = exportDrawio(diagram, {});
  assert.match(drawio, /umlKind="stereotype"/);
  assert.match(drawio, /«stereotype»/);
  assert.match(drawio, /umlIconScript="!icon 40 40&#10;%l #76508f&#10;e 6 8 34 30"/);
  assert.match(drawio, /umlKind="extension"/);
  assert.match(drawio, /endArrow=block;endFill=1/);
  assert.match(drawio, /umlRequired="true"/);
}

{
  const diagram = {
    id: 'drawio', type: 'composite', name: 'Editable Structure',
    elements: [
      element('owner', 'class', 'Owner <Root>', { x: 100, y: 80, w: 500, h: 360 }),
      element('part', 'part', 'editor', { parentId: 'owner', x: 180, y: 180, w: 180, h: 72 }),
      element('port', 'port', 'output', { parentId: 'part', x: 351, y: 205, w: 18, h: 18 }),
    ],
    relations: [
      relation('connector', 'csconnector', 'part', 'port', { name: 'draw' }),
    ],
  };
  const output = exportDrawio(diagram, {});
  assert.match(output, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(output, /<mxfile[^>]+compressed="false">/);
  assert.match(output, /<mxCell id="0"\/>/);
  assert.match(output, /<mxCell id="1" parent="0"\/>/);
  assert.match(output, /vertex="1" parent="cell_owner"/);
  assert.match(output, /edge="1" parent="1" source="cell_part" target="cell_port"/);
  assert.match(output, /umlKind="csconnector"/);
  assert.match(output, /Owner &amp;lt;Root&amp;gt;/);
  assert.doesNotMatch(output, /<!--/);
}

{
  const diagram = {
    id: 'information-flow', type: 'informationflow', name: 'Rendering Information Flow',
    elements: [
      element('editor', 'component', 'DiagramEditor', { x: 40 }),
      element('canvas', 'class', 'CanvasView', { x: 520, attributes: [], operations: [] }),
      element('document', 'informationitem', 'DiagramDocument', {
        x: 280, y: 240, visibility: 'public', stereotype: 'information',
        attributes: ['+ diagrams: Diagram[*]'], operations: ['+ validate(): Boolean'],
        receptions: ['documentLoaded'],
      }),
    ],
    relations: [
      relation('load', 'informationflow', 'editor', 'canvas', {
        name: 'load', conveyedModelIds: ['documentModel'],
      }),
    ],
  };
  const models = {
    documentModel: { id: 'documentModel', kind: 'informationitem', name: 'DiagramDocument' },
  };
  const mermaid = exportMermaid(diagram, models);
  assert.match(mermaid, /flowchart LR/);
  assert.match(mermaid, /n_document\[\["«information»<br\/>\+ DiagramDocument/);
  assert.match(mermaid, /«signal» documentLoaded/);
  assert.match(mermaid, /n_editor -\.->\|«flow» load ： DiagramDocument\| n_canvas/);

  const drawio = exportDrawio(diagram, models);
  assert.match(drawio, /umlKind="informationitem"/);
  assert.match(drawio, /«information»/);
  assert.match(drawio, /«signal» documentLoaded/);
  assert.match(drawio, /umlKind="informationflow"/);
  assert.match(drawio, /dashed=1;endArrow=open;endFill=0/);
  assert.match(drawio, /umlConveyedModelIds="documentModel"/);
  assert.match(drawio, /«flow» load : DiagramDocument/);
}

{
  const diagram = {
    id: 'requirements', type: 'requirement', name: 'Rendering Requirements',
    elements: [
      element('root', 'requirement', 'Reliable Rendering', {
        x: 320, y: 40, w: 320, h: 160, visibility: 'public',
        requirementType: 'functionalRequirement', requirementId: 'REQ-001',
        requirementText: 'The system shall render diagrams reliably.',
        risk: 'High', verificationMethod: 'Demonstration',
      }),
      element('child', 'requirement', 'Render Within Budget', {
        x: 40, y: 320, w: 320, h: 160, visibility: 'public',
        requirementType: 'performanceRequirement', requirementId: 'REQ-002',
        requirementText: 'The system shall render within 100 milliseconds.',
        risk: 'Medium', verificationMethod: 'Analysis',
      }),
      element('copy', 'requirement', 'Budget Copy', {
        x: 480, y: 320, w: 320, h: 160, visibility: 'public',
        requirementType: 'performanceRequirement', requirementId: 'REQ-002-COPY',
        requirementText: 'The system shall render within 100 milliseconds.',
        risk: 'Medium', verificationMethod: 'Inspection',
      }),
      element('renderer', 'component', 'Render Engine', { x: 40, y: 600 }),
      element('bundle', 'artifact', 'uml-studio.js', { x: 480, y: 600 }),
    ],
    relations: [
      relation('containment', 'reqcontainment', 'child', 'root'),
      relation('copy-relation', 'reqcopy', 'copy', 'child'),
      relation('satisfy', 'satisfy', 'renderer', 'child'),
      relation('trace', 'trace', 'bundle', 'root'),
    ],
  };
  const mermaid = exportMermaid(diagram, {});
  assert.match(mermaid, /^%% Rendering Requirements\nrequirementDiagram/m);
  assert.match(mermaid, /functionalRequirement Reliable_Rendering \{/);
  assert.match(mermaid, /performanceRequirement Render_Within_Budget \{/);
  assert.match(mermaid, /id: "REQ-002"/);
  assert.match(mermaid, /text: "The system shall render within 100 milliseconds\."/);
  assert.match(mermaid, /risk: Medium/);
  assert.match(mermaid, /verifymethod: Analysis/);
  assert.match(mermaid, /element Render_Engine \{/);
  assert.match(mermaid, /Reliable_Rendering - contains -> Render_Within_Budget/);
  assert.match(mermaid, /Budget_Copy - copies -> Render_Within_Budget/);
  assert.match(mermaid, /Render_Engine - satisfies -> Render_Within_Budget/);
  assert.match(mermaid, /uml_studio_js - traces -> Reliable_Rendering/);

  const drawio = exportDrawio(diagram, {});
  assert.match(drawio, /umlKind="requirement"/);
  assert.match(drawio, /umlRequirementType="performanceRequirement"/);
  assert.match(drawio, /umlRequirementId="REQ-002"/);
  assert.match(drawio, /umlRequirementText="The system shall render within 100 milliseconds\."/);
  assert.match(drawio, /umlRisk="Medium"/);
  assert.match(drawio, /umlVerificationMethod="Analysis"/);
  assert.match(drawio, /umlKind="reqcontainment"/);
  assert.match(drawio, /endArrow=circlePlus;endFill=0/);
  assert.match(drawio, /umlKind="satisfy"/);
  assert.match(drawio, /«satisfy»/);
  assert.match(drawio, /dashed=1;endArrow=open;endFill=0/);
}

{
  const diagram = {
    id: 'bdd', type: 'bdd', name: 'Rendering System Block Definition',
    elements: [
      element('system', 'block', 'Rendering System', {
        x: 40, y: 40, w: 320, h: 240, visibility: 'public',
        parts: ['canvas: Canvas Subsystem [1]'], references: ['metrics: Metrics Service [0..1]'],
        values: ['frameBudget: Milliseconds = 100'],
        flowProperties: ['in document: DiagramDocument'],
        constraintProperties: ['budget: Render Budget'], properties: [],
        constraints: ['{ renderTime <= frameBudget }'],
        operations: ['+ render(): RenderedFrame'], receptions: [],
      }),
      element('engine', 'block', 'Rendering Engine', {
        x: 40, y: 400, visibility: 'public',
        parts: [], references: [], values: [], flowProperties: [],
        constraintProperties: [], properties: [], constraints: [], operations: [], receptions: [],
      }),
      element('value', 'valuetype', 'Milliseconds', {
        x: 440, y: 400, visibility: 'public', valueTypeUnit: 'ms', quantityKind: 'Time',
        constraints: ['{ value >= 0 }'], properties: ['+ value: Real'], operations: [], receptions: [],
      }),
      element('api', 'interfaceblock', 'IRendering', {
        x: 560, y: 40, visibility: 'public',
        parts: [], references: [], values: [], flowProperties: ['out frame: RenderedFrame'],
        constraintProperties: [], properties: [], constraints: [], operations: ['+ render(): RenderedFrame'], receptions: [],
      }),
      element('portA', 'port', 'render', {
        x: 351, y: 120, w: 18, h: 18, parentId: 'system',
        classifierModelId: 'apiModel', requiredInterfaceModelId: 'apiModel',
      }),
      element('portB', 'port', 'api', {
        x: 551, y: 120, w: 18, h: 18, parentId: 'api',
        classifierModelId: 'apiModel', providedInterfaceModelId: 'apiModel',
      }),
      element('note', 'note', 'Guide', { x: 800, y: 400, text: 'Block hierarchy and typed ports' }),
    ],
    relations: [
      relation('composition', 'composition', 'engine', 'system', { name: 'renderer' }),
      relation('association', 'association', 'engine', 'value', { name: 'performance unit' }),
      relation('connector', 'connector', 'portA', 'portB', { name: 'render channel' }),
      relation('noteLink', 'notelink', 'note', 'api'),
    ],
  };
  const models = {
    apiModel: { id: 'apiModel', kind: 'interfaceblock', name: 'IRendering' },
  };
  const mermaid = exportMermaid(diagram, models);
  assert.match(mermaid, /^%% Rendering System Block Definition\nclassDiagram/m);
  assert.match(mermaid, /class b_system\["\+ Rendering System"\] \{/);
  assert.match(mermaid, /<<block>>/);
  assert.match(mermaid, /part_canvas/);
  assert.match(mermaid, /flow_in_document DiagramDocument/);
  assert.match(mermaid, /<<valueType>>/);
  assert.match(mermaid, /quantityKind_Time/);
  assert.match(mermaid, /b_engine --\* b_system : renderer/);
  assert.match(mermaid, /b_portA -- b_portB : render channel/);
  assert.match(mermaid, /note for b_api "Block hierarchy and typed ports"/);

  const drawio = exportDrawio(diagram, models);
  assert.match(drawio, /umlKind="block"/);
  assert.match(drawio, /umlParts="\[&quot;canvas: Canvas Subsystem \[1\]&quot;\]"/);
  assert.match(drawio, /umlFlowProperties="\[&quot;in document: DiagramDocument&quot;\]"/);
  assert.match(drawio, /umlValueTypeUnit="ms"/);
  assert.match(drawio, /umlQuantityKind="Time"/);
  assert.match(drawio, /umlClassifierModelId="apiModel"/);
  assert.match(drawio, /umlProvidedInterfaceModelId="apiModel"/);
  assert.match(drawio, /umlKind="connector"/);
  assert.match(drawio, /endArrow=none/);
}

{
  const diagram = {
    id: 'ibd', type: 'ibd', name: 'Rendering System Internal Structure',
    elements: [
      element('frame', 'ibdframe', 'Internal Structure', {
        x: 40, y: 40, w: 1000, h: 680, classifierModelId: 'systemType',
      }),
      element('renderer', 'part', 'renderer', {
        x: 160, y: 180, parentId: 'frame', classifierModelId: 'engineType',
      }),
      element('exporter', 'reference', 'exporter', {
        x: 560, y: 180, parentId: 'frame', classifierModelId: 'adapterType',
      }),
      element('out', 'port', 'frame', {
        x: 311, y: 205, w: 18, h: 18, parentId: 'renderer', classifierModelId: 'apiType',
      }),
      element('in', 'port', 'frameIn', {
        x: 551, y: 205, w: 18, h: 18, parentId: 'exporter', classifierModelId: 'apiType',
      }),
    ],
    relations: [
      relation('flow', 'connector', 'out', 'in', {
        name: 'rendered image', itemFlowModelIds: ['frameType'],
      }),
    ],
  };
  const models = {
    systemType: { id: 'systemType', kind: 'block', name: 'Rendering System' },
    engineType: { id: 'engineType', kind: 'block', name: 'Rendering Engine' },
    adapterType: { id: 'adapterType', kind: 'block', name: 'Export Adapter' },
    apiType: { id: 'apiType', kind: 'interfaceblock', name: 'IRendering' },
    frameType: { id: 'frameType', kind: 'informationitem', name: 'RenderedFrame' },
  };
  const mermaid = exportMermaid(diagram, models);
  assert.match(mermaid, /^%% Rendering System Internal Structure\nflowchart LR/m);
  assert.match(mermaid, /subgraph ibd_frame\["ibd \[Rendering System\]"\]/);
  assert.match(mermaid, /«part»<br\/>renderer: Rendering Engine/);
  assert.match(mermaid, /«reference»<br\/>exporter: Export Adapter/);
  assert.match(mermaid, /rendered image ： «itemFlow» RenderedFrame/);

  const drawio = exportDrawio(diagram, models);
  assert.match(drawio, /umlKind="ibdframe"/);
  assert.match(drawio, /swimlane;horizontal=1;startSize=28;container=1/);
  assert.match(drawio, /umlKind="reference"/);
  assert.match(drawio, /dashed=1/);
  assert.match(drawio, /umlItemFlowModelIds="frameType"/);
  assert.match(drawio, /«itemFlow» RenderedFrame/);
}

{
  const diagram = {
    id: 'parametric', type: 'parametric', name: 'Render Budget Parametric Analysis',
    elements: [
      element('frame', 'parametricframe', 'Render Analysis', {
        x: 40, y: 40, w: 1000, h: 680, classifierModelId: 'ruleType',
      }),
      element('rule', 'constraintproperty', 'budget', {
        x: 360, y: 200, w: 320, h: 160, parentId: 'frame', classifierModelId: 'ruleType',
      }),
      element('parameter', 'constraintparameter', 'renderTime', {
        x: 351, y: 260, w: 18, h: 18, parentId: 'rule', classifierModelId: 'milliseconds',
      }),
      element('value', 'value', 'actualRenderTime', {
        x: 80, y: 240, w: 220, h: 80, parentId: 'frame',
        classifierModelId: 'milliseconds', defaultValue: '42 ms',
      }),
    ],
    relations: [
      relation('binding', 'bindingconnector', 'value', 'parameter', {
        routeMode: 'manual',
        manualPoints: [{ x: 320, y: 360 }, { x: 352, y: 360 }],
        jumpStyle: 'gap',
      }),
    ],
  };
  const models = {
    ruleType: {
      id: 'ruleType', kind: 'constraintblock', name: 'Render Budget',
      constraints: ['{ renderTime <= frameBudget }'],
    },
    milliseconds: { id: 'milliseconds', kind: 'valuetype', name: 'Milliseconds' },
  };
  const mermaid = exportMermaid(diagram, models);
  assert.match(mermaid, /^%% Render Budget Parametric Analysis\nflowchart LR/m);
  assert.match(mermaid, /subgraph par_frame\["par \[Render Budget\]"\]/);
  assert.match(mermaid, /«constraint property»<br\/>budget: Render Budget/);
  assert.match(mermaid, /\{ renderTime <= frameBudget \}/);
  assert.match(mermaid, /actualRenderTime: Milliseconds = 42 ms/);
  assert.match(mermaid, /par_value --- par_parameter/);

  const drawio = exportDrawio(diagram, models);
  assert.match(drawio, /umlKind="parametricframe"/);
  assert.match(drawio, /umlKind="constraintproperty"/);
  assert.match(drawio, /umlKind="constraintparameter"/);
  assert.match(drawio, /umlDefaultValue="42 ms"/);
  assert.match(drawio, /umlKind="bindingconnector"/);
  assert.match(drawio, /umlRouteMode="manual"/);
  assert.match(drawio, /umlJumpStyle="gap"/);
  assert.match(drawio, /<Array as="points">/);
  assert.match(drawio, /<mxPoint x="320" y="360"\/>/);
  assert.match(drawio, /orthogonalLoop=1/);
  assert.match(drawio, /jettySize=auto/);
  assert.match(drawio, /jumpStyle=gap/);
  assert.match(drawio, /jumpSize=6/);
  assert.match(drawio, /endArrow=none/);
  assert.match(drawio, /renderTime &amp;lt;= frameBudget/);
}

{
  const diagram = {
    id: 'binding-order', type: 'parametric', name: 'Binding Connector Order',
    elements: [
      element('source', 'value', 'source'),
      element('middle', 'constraintparameter', 'middle', { x: 280 }),
      element('target', 'value', 'target', { x: 560 }),
    ],
    relations: [
      relation('bindingBack', 'bindingconnector', 'source', 'middle'),
      relation('bindingFront', 'bindingconnector', 'middle', 'target'),
    ],
  };
  const drawio = exportDrawio(diagram, {});
  const backIndex = drawio.indexOf('umlModelId="m_bindingBack"');
  const frontIndex = drawio.indexOf('umlModelId="m_bindingFront"');
  assert.ok(backIndex >= 0 && frontIndex > backIndex,
    'draw.io must preserve Binding Connector z-order');
}

{
  const diagram = {
    id: 'relationship-ends', type: 'class', name: 'Relationship Ends',
    elements: [
      element('customer', 'class', 'Customer'),
      element('order', 'class', 'Order', { x: 320 }),
    ],
    relations: [
      relation('owns', 'association', 'customer', 'order', {
        name: 'owns', sourceLabel: '1', targetLabel: '0..*',
        sourceEndName: 'customer', sourceEndVisibility: 'public',
        sourceNavigability: 'notNavigable', sourceAggregation: 'none',
        targetEndName: 'orders', targetEndVisibility: 'private',
        targetEndStereotype: 'collection', targetNavigability: 'navigable',
        targetAggregation: 'composite', targetQualifiers: ['id: UUID'],
      }),
    ],
  };
  const mermaid = exportMermaid(diagram, {});
  assert.match(mermaid, /c_customer "1" --\* "0\.\.\*" c_order/);
  assert.match(mermaid, /owns · source \+ customer \/ target «collection» - orders \[id： UUID\]/);

  const drawio = exportDrawio(diagram, {});
  assert.match(drawio, /startArrow=cross;startFill=0;endArrow=diamondThin;endFill=1/);
  assert.match(drawio, /umlSourceEndName="customer"/);
  assert.match(drawio, /umlSourceMultiplicity="1"/);
  assert.match(drawio, /umlTargetEndName="orders"/);
  assert.match(drawio, /umlTargetAggregation="composite"/);
  assert.match(drawio, /umlTargetQualifiers="id: UUID"/);
}

{
  const diagram = {
    id: 'erd-ends', type: 'erd', name: 'ER Relationship Ends',
    elements: [element('user', 'entity', 'User'), element('post', 'entity', 'Post', { x: 320 })],
    relations: [relation('writes', 'erd-11', 'user', 'post', {
      name: 'writes', sourceEndName: 'author', targetEndName: 'posts', sourceLabel: '1', targetLabel: '0..N',
      foreignKeyEnd: 'target', sourceColumnName: 'id', targetColumnName: 'user_id',
      foreignKeyOnDelete: 'CASCADE', foreignKeyOnUpdate: 'SET NULL',
    })],
  };
  const drawio = exportDrawio(diagram, {});
  assert.match(drawio, /startArrow=ERmandOne;endArrow=ERzeroToMany/);
  assert.match(drawio, /startFill=1;endFill=1/);
  assert.match(drawio, /umlTargetMultiplicity="0\.\.N"/);
  assert.match(drawio, /umlForeignKeyEnd="target"/);
  assert.match(drawio, /umlSourceColumnName="id"/);
  assert.match(drawio, /umlTargetColumnName="user_id"/);
  assert.match(drawio, /umlForeignKeyOnDelete="CASCADE"/);
  assert.match(drawio, /umlForeignKeyOnUpdate="SET NULL"/);

  const mermaid = exportMermaid(diagram, {});
  assert.match(mermaid, /^%% ER Relationship Ends\nerDiagram/m);
  assert.match(mermaid, /e_user \|\|\.\.o\{ e_post : "writes"/);
}

/* ERD CREATE TABLE DDL */
{
  assert.ok(Object.isFrozen(ERD_DDL_DIALECTS));
  assert.ok(Object.values(ERD_DDL_DIALECTS).every(Object.isFrozen));
  assert.deepEqual(Object.keys(ERD_DDL_DIALECTS), ['postgresql', 'mysql', 'sqlite']);

  const models = {
    account: {
      id: 'account', kind: 'entity', name: 'account', logicalName: '계정',
      columns: [
        'PK tenant_id <테넌트번호>: NUMBER(19)',
        'PK account_id <계정번호>: NUMBER(19)',
        'NN display_name <표시 이름>: VARCHAR2(100)',
        'FK NN owner_id <소유자>: NUMBER(19)',
        'payload: CLOB',
        'binary_data: BLOB',
        'memo',
      ],
    },
  };
  const diagram = {
    id: 'erd-ddl', type: 'erd', name: 'Account ERD', relations: [],
    elements: [
      { id: 'account-view-1', modelId: 'account', x: 0, y: 0 },
      { id: 'account-view-2', modelId: 'account', x: 320, y: 0 },
    ],
  };

  const postgres = exportErdDdl(diagram, models, 'postgresql');
  assert.match(postgres, /^-- Generated by UML Studio\n-- Dialect: PostgreSQL/m);
  assert.equal((postgres.match(/CREATE TABLE/g) || []).length, 1, '같은 의미 모델의 중복 뷰는 한 번만 내보냅니다');
  assert.match(postgres, /CREATE TABLE IF NOT EXISTS "account" \(/);
  assert.match(postgres, /"tenant_id" NUMERIC\(19\) NOT NULL/);
  assert.match(postgres, /"display_name" VARCHAR\(100\) NOT NULL/);
  assert.match(postgres, /"payload" TEXT/);
  assert.match(postgres, /"binary_data" BYTEA/);
  assert.match(postgres, /"memo" TEXT/);
  assert.match(postgres, /PRIMARY KEY \("tenant_id", "account_id"\)/);
  assert.match(postgres, /FK target not linked/);

  const mysql = exportErdDdl(diagram, models, 'mysql');
  assert.match(mysql, /-- Dialect: MySQL/);
  assert.match(mysql, /CREATE TABLE IF NOT EXISTS `account` \(/);
  assert.match(mysql, /`tenant_id` DECIMAL\(19\) NOT NULL/);
  assert.match(mysql, /`display_name` VARCHAR\(100\) NOT NULL/);
  assert.match(mysql, /`payload` LONGTEXT/);
  assert.match(mysql, /`binary_data` BLOB/);
  assert.match(mysql, /PRIMARY KEY \(`tenant_id`, `account_id`\)/);

  const sqlite = exportErdDdl(diagram, models, 'sqlite');
  assert.match(sqlite, /-- Dialect: SQLite/);
  assert.match(sqlite, /"tenant_id" NUMERIC\(19\) NOT NULL/);
  assert.match(sqlite, /"display_name" TEXT NOT NULL/);
  assert.match(sqlite, /"payload" TEXT/);
  assert.match(sqlite, /"binary_data" BLOB/);
  const sqliteCheck = spawnSync('python3', ['-c', [
    'import sqlite3, sys',
    'db = sqlite3.connect(":memory:")',
    'db.executescript(sys.stdin.read())',
    'print(db.execute("SELECT name FROM sqlite_schema WHERE type = \'table\'").fetchone()[0])',
    'db.close()',
  ].join('; ')], { input: sqlite, encoding: 'utf8' });
  assert.equal(sqliteCheck.status, 0, sqliteCheck.stderr || 'SQLite가 생성한 DDL을 실행하지 못했습니다');
  assert.equal(sqliteCheck.stdout.trim(), 'account');
}

{
  const models = {
    posts: {
      id: 'posts', kind: 'entity', name: 'posts',
      columns: ['PK id: BIGINT', 'FK NN user_id <작성자>: BIGINT'],
    },
    users: { id: 'users', kind: 'entity', name: 'users', columns: ['PK id <사용자 번호>: BIGINT'] },
    writes: {
      id: 'writes', kind: 'erd-1n', name: 'writes',
      foreignKeyEnd: 'source', sourceColumnName: 'user_id', targetColumnName: 'id',
      foreignKeyOnDelete: 'CASCADE', foreignKeyOnUpdate: 'RESTRICT',
    },
  };
  const diagram = {
    id: 'fk-ddl', type: 'erd', name: 'FK DDL',
    elements: [
      { id: 'postsView', modelId: 'posts' },
      { id: 'usersView', modelId: 'users' },
    ],
    relations: [{ id: 'writesView', modelId: 'writes', from: 'postsView', to: 'usersView' }],
  };
  const postgres = exportErdDdl(diagram, models, 'postgresql');
  assert.ok(postgres.indexOf('CREATE TABLE IF NOT EXISTS "users"')
    < postgres.indexOf('CREATE TABLE IF NOT EXISTS "posts"'), '참조되는 부모 테이블을 먼저 생성해야 합니다');
  assert.match(postgres, /FOREIGN KEY \("user_id"\) REFERENCES "users" \("id"\) ON DELETE CASCADE ON UPDATE RESTRICT/);
  assert.doesNotMatch(postgres, /FK target not linked/);
  const mysql = exportErdDdl(diagram, models, 'mysql');
  assert.match(mysql, /FOREIGN KEY \(`user_id`\) REFERENCES `users` \(`id`\) ON DELETE CASCADE ON UPDATE RESTRICT/);
  const sqlite = exportErdDdl(diagram, models, 'sqlite');
  assert.match(sqlite, /PRAGMA foreign_keys = ON;/);
  const sqliteCheck = spawnSync('python3', ['-c', [
    'import sqlite3, sys',
    'db = sqlite3.connect(":memory:")',
    'db.executescript(sys.stdin.read())',
    'db.execute("INSERT INTO users(id) VALUES (1)")',
    'db.execute("INSERT INTO posts(id, user_id) VALUES (10, 1)")',
    'db.execute("DELETE FROM users WHERE id = 1")',
    'cascade_ok = db.execute("SELECT COUNT(*) FROM posts WHERE id = 10").fetchone()[0] == 0',
    'db.execute("INSERT INTO users(id) VALUES (1)")',
    'try:\n db.execute("INSERT INTO posts(id, user_id) VALUES (11, 999)")\nexcept sqlite3.IntegrityError:\n print("foreign-key-ok" if cascade_ok else "cascade-failed")',
    'db.close()',
  ].join('\n')], { input: sqlite, encoding: 'utf8' });
  assert.equal(sqliteCheck.status, 0, sqliteCheck.stderr);
  assert.equal(sqliteCheck.stdout.trim(), 'foreign-key-ok');

  models.writes.targetColumnName = '';
  assert.throws(() => exportErdDdl(diagram, models, 'postgresql'), /FK 연결이 완성되지/);
  models.writes.targetColumnName = 'id';
  models.users.columns = ['id: BIGINT'];
  assert.throws(() => exportErdDdl(diagram, models, 'postgresql'), /참조 대상은 단일 PK/);
  models.users.columns = ['PK tenant_id: BIGINT', 'PK id: BIGINT'];
  assert.throws(() => exportErdDdl(diagram, models, 'postgresql'), /참조 대상은 단일 PK/);
  models.users.columns = ['PK id: BIGINT'];
  models.writes.foreignKeyOnDelete = 'SET DEFAULT';
  assert.throws(() => exportErdDdl(diagram, models, 'mysql'), /MySQL InnoDB.*SET DEFAULT/);
  models.writes.foreignKeyOnDelete = 'SET NULL';
  assert.throws(() => exportErdDdl(diagram, models, 'sqlite'), /nullable FK 컬럼/);
  models.writes.foreignKeyOnDelete = 'CASCADE';
  models.writes2 = {
    ...models.writes, id: 'writes2', name: 'writes conflict', foreignKeyOnDelete: 'RESTRICT',
  };
  diagram.relations.push({
    id: 'writesView2', modelId: 'writes2', from: 'postsView', to: 'usersView',
  });
  assert.throws(() => exportErdDdl(diagram, models, 'postgresql'), /서로 다른 참조 동작/);
}

{
  const models = {
    products: {
      id: 'products', kind: 'entity', name: 'products',
      columns: ['PK id: INTEGER', 'UQ NN sku: TEXT', 'price: NUMERIC', 'active: INTEGER'],
      erdColumnDetails: {
        sku: { defaultValue: "'unknown'", uniqueName: 'products_sku_uq' },
        active: { defaultValue: '1' },
      },
      erdChecks: [
        { name: 'price_positive', expression: 'price >= 0', column: 'price' },
        { name: '', expression: 'active IN (0, 1)', column: '' },
      ],
      erdIndexes: [
        { kind: 'unique', name: 'products_price_active_uq', columns: ['price', 'active'] },
        { kind: 'index', name: 'products_active_idx', unique: false, columns: [{ name: 'active', order: 'DESC' }], where: 'active = 1' },
      ],
    },
  };
  const diagram = {
    id: 'schema-ddl', type: 'erd', name: 'Schema DDL', relations: [],
    elements: [{ id: 'products-view', modelId: 'products' }],
  };
  const sqlite = exportErdDdl(diagram, models, 'sqlite');
  assert.match(sqlite, /"sku" TEXT NOT NULL DEFAULT 'unknown'/);
  assert.match(sqlite, /CONSTRAINT "products_sku_uq" UNIQUE \("sku"\)/);
  assert.match(sqlite, /CONSTRAINT "products_price_active_uq" UNIQUE \("price", "active"\)/);
  assert.match(sqlite, /CONSTRAINT "price_positive" CHECK \(price >= 0\)/);
  assert.match(sqlite, /CREATE INDEX "products_active_idx" ON "products" \("active" DESC\) WHERE active = 1;/);
  const sqliteCheck = spawnSync('python3', ['-c', [
    'import sqlite3, sys',
    'db = sqlite3.connect(":memory:")',
    'db.executescript(sys.stdin.read())',
    'db.execute("INSERT INTO products(id, price) VALUES (1, 10)")',
    'failed = 0',
    'for sql in ["INSERT INTO products(id, sku, price) VALUES (2, \'unknown\', 11)", "INSERT INTO products(id, sku, price) VALUES (3, \'ok\', -1)"]:\n try:\n  db.execute(sql)\n except sqlite3.IntegrityError:\n  failed += 1',
    'print("schema-ok" if failed == 2 else "failed")',
    'db.close()',
  ].join('\n')], { input: sqlite, encoding: 'utf8' });
  assert.equal(sqliteCheck.status, 0, sqliteCheck.stderr);
  assert.equal(sqliteCheck.stdout.trim(), 'schema-ok');
  const postgres = exportErdDdl(diagram, models, 'postgresql');
  assert.match(postgres, /CREATE INDEX "products_active_idx" ON "products" \("active" DESC\) WHERE active = 1;/);
  assert.throws(() => exportErdDdl(diagram, models, 'mysql'), /부분 인덱스 WHERE/);
  models.products.erdIndexes[1].where = '';
  const mysql = exportErdDdl(diagram, models, 'mysql');
  assert.match(mysql, /`sku` TEXT NOT NULL DEFAULT 'unknown'/);
  assert.match(mysql, /CONSTRAINT `products_sku_uq` UNIQUE \(`sku`\)/);
  assert.match(mysql, /CONSTRAINT `price_positive` CHECK \(price >= 0\)/);
  assert.match(mysql, /CREATE INDEX `products_active_idx` ON `products` \(`active` DESC\);/);
}

{
  const ddlDiagram = (elements) => ({ id: 'ddl', type: 'erd', name: 'DDL', elements, relations: [] });
  assert.throws(() => exportErdDdl({ type: 'class', elements: [] }, {}, 'postgresql'), /ER Diagram만/);
  assert.throws(() => exportErdDdl(ddlDiagram([]), {}, 'postgresql'), /Entity가 없습니다/);
  assert.throws(
    () => exportErdDdl(ddlDiagram([element('empty', 'entity', 'empty', { columns: [] })]), {}, 'postgresql'),
    /내보낼 컬럼이 없습니다/,
  );
  assert.throws(
    () => exportErdDdl(ddlDiagram([
      element('one', 'entity', 'users', { columns: ['PK id: BIGINT'] }),
      element('two', 'entity', 'USERS', { columns: ['PK id: BIGINT'] }),
    ]), {}, 'postgresql'),
    /중복된 Entity 물리명/,
  );
  assert.throws(
    () => exportErdDdl(ddlDiagram([
      element('dup-column', 'entity', 'users', { columns: ['id: BIGINT', 'ID: BIGINT'] }),
    ]), {}, 'postgresql'),
    /중복된 컬럼/,
  );
  assert.throws(
    () => exportErdDdl(ddlDiagram([
      element('unsafe', 'entity', 'users', { columns: ['id: TEXT; DROP TABLE users'] }),
    ]), {}, 'postgresql'),
    /SQL 문장 구분자/,
  );
  assert.throws(
    () => exportErdDdl(ddlDiagram([element('one', 'entity', 'users', { columns: ['id: BIGINT'] })]), {}, 'oracle'),
    /지원하지 않는 DDL 방언/,
  );
}

console.log('exporter tests: ok');
