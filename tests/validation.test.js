'use strict';

const assert = require('node:assert/strict');
const {
  validateProject,
  bindingTypeCompatibility,
  defaultValueUnitCompatibility,
} = require('../dist/browser/model/validation.js');

const model = (id, kind, name, extra) => ({ id, kind, name, ...(extra || {}) });
const view = (id, modelId, extra) => ({ id, modelId, x: 0, y: 0, w: 80, h: 40, ...(extra || {}) });
const relation = (id, modelId, from, to, extra) => ({ id, modelId, from, to, ...(extra || {}) });

{
  const models = {
    milliseconds: model('milliseconds', 'valuetype', 'Milliseconds', {
      valueTypeUnit: 'ms', quantityKind: 'Time',
    }),
    millisecondsAlias: model('millisecondsAlias', 'valuetype', 'Milliseconds Alias', {
      valueTypeUnit: 'milliseconds', quantityKind: 'time',
    }),
    seconds: model('seconds', 'valuetype', 'Seconds', {
      valueTypeUnit: 's', quantityKind: 'Time',
    }),
    meters: model('meters', 'valuetype', 'Meters', {
      valueTypeUnit: 'm', quantityKind: 'Length',
    }),
    timeWithoutUnit: model('timeWithoutUnit', 'valuetype', 'Time Without Unit', {
      valueTypeUnit: '', quantityKind: 'Time',
    }),
    unknownA: model('unknownA', 'valuetype', 'Unknown A'),
    unknownB: model('unknownB', 'valuetype', 'Unknown B'),
  };
  assert.equal(bindingTypeCompatibility('milliseconds', 'millisecondsAlias', models).status, 'compatible');
  assert.deepEqual(
    bindingTypeCompatibility('milliseconds', 'seconds', models),
    {
      status: 'warning',
      code: 'PAR025',
      message: '호환 가능한 Quantity지만 Unit 환산이 필요합니다: Milliseconds (quantityKind=Time, unit=ms) ↔ Seconds (quantityKind=Time, unit=s)',
    },
  );
  assert.equal(bindingTypeCompatibility('milliseconds', 'meters', models).code, 'PAR024');
  assert.equal(bindingTypeCompatibility('milliseconds', 'timeWithoutUnit', models).code, 'PAR026');
  assert.equal(bindingTypeCompatibility('unknownA', 'unknownB', models).code, 'PAR021');
  assert.equal(defaultValueUnitCompatibility('42 ms', models.milliseconds).status, 'compatible');
  assert.equal(defaultValueUnitCompatibility('0.042 s', models.milliseconds).code, 'PAR028');
  assert.equal(defaultValueUnitCompatibility('42', models.milliseconds).code, 'PAR027');
  assert.equal(defaultValueUnitCompatibility('42 m', models.milliseconds).code, 'PAR029');
}

{
  const project = {
    models: { c1: model('c1', 'class', 'User') },
    diagrams: [{ id: 'd1', type: 'class', name: 'Class', elements: [view('v1', 'c1')], relations: [] }],
  };
  assert.deepEqual(validateProject(project), []);
}

{
  const project = {
    models: {
      ruleType: model('ruleType', 'constraintblock', 'Conversion Rule', {
        constraints: ['{ duration = distance }'],
        constraintParameters: ['duration: Milliseconds', 'seconds: Seconds', 'distance: Meters'],
      }),
      milliseconds: model('milliseconds', 'valuetype', 'Milliseconds', {
        valueTypeUnit: 'ms', quantityKind: 'Time',
      }),
      seconds: model('seconds', 'valuetype', 'Seconds', {
        valueTypeUnit: 's', quantityKind: 'Time',
      }),
      meters: model('meters', 'valuetype', 'Meters', {
        valueTypeUnit: 'm', quantityKind: 'Length',
      }),
      frame: model('frame', 'parametricframe', 'Analysis', { classifierModelId: 'ruleType' }),
      rule: model('rule', 'constraintproperty', 'conversion', { classifierModelId: 'ruleType' }),
      duration: model('duration', 'constraintparameter', 'duration', { classifierModelId: 'milliseconds' }),
      secondsParameter: model('secondsParameter', 'constraintparameter', 'seconds', { classifierModelId: 'seconds' }),
      distance: model('distance', 'constraintparameter', 'distance', { classifierModelId: 'meters' }),
      badDefault: model('badDefault', 'value', 'badDefault', {
        classifierModelId: 'milliseconds', defaultValue: '42 kg',
      }),
      convert: model('convert', 'bindingconnector', ''),
      incompatible: model('incompatible', 'bindingconnector', ''),
    },
    diagrams: [{
      id: 'unitCompatibility', type: 'parametric', name: 'Unit Compatibility',
      elements: [
        view('frameView', 'frame', { w: 1000, h: 680 }),
        view('ruleView', 'rule', { parentId: 'frameView', x: 360, y: 200, w: 320, h: 160 }),
        view('durationView', 'duration', {
          parentId: 'ruleView', borderAnchor: { fx: 0, fy: 0.25 }, w: 18, h: 18,
        }),
        view('secondsView', 'secondsParameter', {
          parentId: 'ruleView', borderAnchor: { fx: 1, fy: 0.25 }, w: 18, h: 18,
        }),
        view('distanceView', 'distance', {
          parentId: 'ruleView', borderAnchor: { fx: 1, fy: 0.75 }, w: 18, h: 18,
        }),
        view('badDefaultView', 'badDefault', {
          parentId: 'frameView', x: 80, y: 480, w: 220, h: 80,
        }),
      ],
      relations: [
        relation('convertView', 'convert', 'durationView', 'secondsView'),
        relation('incompatibleView', 'incompatible', 'durationView', 'distanceView'),
      ],
    }],
  };
  const issues = validateProject(project);
  assert.ok(issues.some(issue => issue.code === 'PAR025' && issue.severity === 'warning'));
  assert.ok(issues.some(issue => issue.code === 'PAR024' && issue.severity === 'error'));
  assert.ok(issues.some(issue => issue.code === 'PAR029' && issue.severity === 'error'));
}

{
  const project = {
    models: {
      c1: model('c1', 'class', 'A'), c2: model('c2', 'class', 'B'),
      g1: model('g1', 'generalization', ''), g2: model('g2', 'generalization', ''),
      g3: model('g3', 'generalization', ''),
      i1: model('i1', 'interface', 'PrivateAPI', { operations: ['- hidden(): void'] }),
    },
    diagrams: [{
      id: 'd1', type: 'class', name: 'Class',
      elements: [view('a', 'c1'), view('b', 'c2'), view('i', 'i1')],
      relations: [relation('r1', 'g1', 'a', 'b'), relation('r2', 'g2', 'a', 'b'), relation('r3', 'g3', 'b', 'a')],
    }],
  };
  const codes = validateProject(project).map(x => x.code);
  assert.ok(codes.includes('UML007'));
  assert.ok(codes.includes('UML008'));
  assert.ok(codes.includes('UML011'));
}

{
  const project = {
    models: {
      init: model('init', 'initial', ''), action: model('action', 'action', 'Work'), final: model('final', 'final', ''),
      f1: model('f1', 'controlflow', ''), f2: model('f2', 'controlflow', '[guard]'), f3: model('f3', 'controlflow', ''),
    },
    diagrams: [{
      id: 'd1', type: 'activity', name: 'Activity',
      elements: [view('vi', 'init'), view('va', 'action'), view('vf', 'final')],
      relations: [relation('r1', 'f1', 'vi', 'va'), relation('r2', 'f2', 'vi', 'vf'), relation('r3', 'f3', 'vf', 'va')],
    }],
  };
  const codes = validateProject(project).map(x => x.code);
  assert.ok(codes.includes('UML021'));
  assert.ok(codes.includes('UML022'));
  assert.ok(codes.includes('UML050'));
}

{
  const project = {
    models: {
      region: model('region', 'interruptibleregion', 'Payment Window'),
      action: model('action', 'action', 'Authorize'),
      pin: model('pin', 'inputpin', 'request'),
      object: model('object', 'objectnode', 'PaymentRequest'),
      timeout: model('timeout', 'timeevent', '30s Timeout'),
      stop: model('stop', 'flowfinal', 'Cancelled'),
      objectFlow: model('objectFlow', 'objectflow', ''),
      interrupt: model('interrupt', 'activityinterrupt', ''),
    },
    diagrams: [{
      id: 'advanced', type: 'activity', name: 'Advanced Activity',
      elements: [
        view('vr', 'region', { w: 400, h: 240 }),
        view('va', 'action', { parentId: 'vr' }),
        view('vp', 'pin', { parentId: 'va', borderAnchor: { fx: 0, fy: 0.5 }, w: 16, h: 16 }),
        view('vo', 'object'),
        view('vt', 'timeout', { parentId: 'vr' }),
        view('vs', 'stop'),
      ],
      relations: [
        relation('rof', 'objectFlow', 'vo', 'vp'),
        relation('ri', 'interrupt', 'vt', 'vs'),
      ],
    }],
  };
  assert.deepEqual(validateProject(project), []);
}

{
  const project = {
    models: {
      action: model('action', 'action', 'Work'),
      pin: model('pin', 'inputpin', 'orphan'),
      output: model('output', 'outputpin', 'result'),
      object: model('object', 'objectnode', 'Payload'),
      control: model('control', 'controlflow', ''),
      wrongDirection: model('wrongDirection', 'objectflow', ''),
      interrupt: model('interrupt', 'activityinterrupt', ''),
    },
    diagrams: [{
      id: 'broken-activity', type: 'activity', name: 'Broken Advanced Activity',
      elements: [
        view('va', 'action'),
        view('vp', 'pin'),
        view('vout', 'output', { parentId: 'va', borderAnchor: { fx: 1, fy: 0.5 }, w: 16, h: 16 }),
        view('vo', 'object'),
      ],
      relations: [
        relation('rc', 'control', 'vo', 'va'),
        relation('rod', 'wrongDirection', 'vo', 'vout'),
        relation('ri', 'interrupt', 'va', 'vo'),
      ],
    }],
  };
  const codes = validateProject(project).map(item => item.code);
  assert.ok(codes.includes('ACT002'));
  assert.ok(codes.includes('ACT003'));
  assert.ok(codes.includes('ACT010'));
  assert.ok(codes.includes('ACT013'));
  assert.ok(codes.includes('ACT016'));
}

{
  const project = {
    models: { e1: model('e1', 'entity', 'NO_KEY', { columns: ['name: VARCHAR', 'name: TEXT'] }) },
    diagrams: [{ id: 'd1', type: 'erd', name: 'ERD', elements: [view('v1', 'e1')], relations: [] }],
  };
  const codes = validateProject(project).map(x => x.code);
  assert.ok(codes.includes('ERD001'));
  assert.ok(codes.includes('ERD002'));
}

{
  const project = {
    models: {
      e1: model('e1', 'entity', 'MALFORMED_COLUMN', {
        columns: ['FK,PK account_id <계정번호>: BIGINT', 'NN <이름>: VARCHAR(100)'],
      }),
    },
    diagrams: [{ id: 'd1', type: 'erd', name: 'ERD', elements: [view('v1', 'e1')], relations: [] }],
  };
  const issues = validateProject(project);
  assert.ok(issues.some(item => item.code === 'ERD003' && /컬럼 2/.test(item.message)));
  assert.ok(!issues.some(item => item.code === 'ERD001'), 'PK가 첫 플래그가 아니어도 Primary Key로 인식해야 합니다');
}

{
  const project = {
    models: { e1: model('e1', 'entity', 'BROKEN_COLUMNS', { columns: 'PK id: INTEGER' }) },
    diagrams: [{ id: 'd1', type: 'erd', name: 'ERD', elements: [view('v1', 'e1')], relations: [] }],
  };
  const issues = validateProject(project);
  assert.ok(issues.some(item => item.code === 'ERD003' && /목록 형식/.test(item.message)));
}

{
  const project = {
    models: {
      e1: model('e1', 'entity', 'BROKEN_SCHEMA', {
        columns: ['PK id: INTEGER'],
        erdIndexes: [{ kind: 'index', name: 'missing_idx', columns: ['missing'] }],
      }),
    },
    diagrams: [{ id: 'd1', type: 'erd', name: 'ERD', elements: [view('v1', 'e1')], relations: [] }],
  };
  const issues = validateProject(project);
  assert.ok(issues.some(item => item.code === 'ERD009' && /컬럼을 찾을 수 없습니다/.test(item.message)));
}

{
  const connectedProject = {
    models: {
      posts: model('posts', 'entity', 'posts', {
        columns: ['PK id: BIGINT', 'FK NN user_id: BIGINT'],
      }),
      users: model('users', 'entity', 'users', { columns: ['PK id: BIGINT'] }),
      writes: model('writes', 'erd-1n', 'writes', {
        foreignKeyEnd: 'source', sourceColumnName: 'user_id', targetColumnName: 'id',
      }),
    },
    diagrams: [{
      id: 'fk', type: 'erd', name: 'FK 연결',
      elements: [view('postView', 'posts'), view('userView', 'users')],
      relations: [relation('writesView', 'writes', 'postView', 'userView')],
    }],
  };
  const semanticCodes = validateProject(connectedProject).map(item => item.code)
    .filter(code => /^ERD00[4-8]$/.test(code));
  assert.deepEqual(semanticCodes, []);

  connectedProject.models.writes.foreignKeyOnDelete = 'SET NULL';
  assert.ok(validateProject(connectedProject).some(item => item.code === 'ERD010' && /nullable/.test(item.message)));
  connectedProject.models.writes.foreignKeyOnDelete = 'SET DEFAULT';
  let actionIssues = validateProject(connectedProject);
  assert.ok(actionIssues.some(item => item.code === 'ERD010' && /DEFAULT/.test(item.message)));
  assert.ok(actionIssues.some(item => item.code === 'ERD011' && /MySQL/.test(item.message)));
  connectedProject.models.posts.erdColumnDetails = { user_id: { defaultValue: '0' } };
  actionIssues = validateProject(connectedProject);
  assert.ok(!actionIssues.some(item => item.code === 'ERD010'));
  assert.ok(actionIssues.some(item => item.code === 'ERD011'));
  connectedProject.models.writes.foreignKeyOnDelete = 'CASCADE';

  connectedProject.models.writes.targetColumnName = 'renamed_id';
  assert.ok(validateProject(connectedProject).some(item => item.code === 'ERD005'));
  connectedProject.models.writes.targetColumnName = 'id';
  connectedProject.models.posts.columns[1] = 'NN user_id: INTEGER';
  const mismatched = validateProject(connectedProject).map(item => item.code);
  assert.ok(mismatched.includes('ERD006'));
  assert.ok(mismatched.includes('ERD008'));
  connectedProject.models.users.columns[0] = 'id: INTEGER';
  assert.ok(validateProject(connectedProject).some(item => item.code === 'ERD007'));
  connectedProject.models.users.columns = ['PK tenant_id: INTEGER', 'PK id: INTEGER'];
  assert.ok(validateProject(connectedProject).some(item => item.code === 'ERD007'));
  connectedProject.models.writes.sourceColumnName = '';
  assert.ok(validateProject(connectedProject).some(item => item.code === 'ERD004'));
}

{
  const project = {
    models: {
      init: model('init', 'stateinitial', 'Initial'), state: model('state', 'state', 'Idle'), final: model('final', 'statefinal', 'Final'),
      t1: model('t1', 'transition', '', { trigger: '', guard: '', effect: '' }),
      t2: model('t2', 'transition', '', { trigger: 'finish', guard: '', effect: '' }),
    },
    diagrams: [{
      id: 'd1', type: 'state', name: 'State Machine',
      elements: [view('vi', 'init'), view('vs', 'state'), view('vf', 'final')],
      relations: [relation('r1', 't1', 'vi', 'vs'), relation('r2', 't2', 'vs', 'vf')],
    }],
  };
  assert.deepEqual(validateProject(project), []);
}

{
  const project = {
    models: {
      init: model('init', 'stateinitial', 'Initial'), final: model('final', 'statefinal', 'Final'), state: model('state', 'state', 'Work'),
      t1: model('t1', 'transition', '', { trigger: 'start', guard: 'ready' }),
      t2: model('t2', 'transition', ''), t3: model('t3', 'transition', ''), t4: model('t4', 'transition', ''),
    },
    diagrams: [{
      id: 'd1', type: 'state', name: 'Broken State Machine',
      elements: [view('vi', 'init'), view('vf', 'final'), view('vs', 'state')],
      relations: [
        relation('r1', 't1', 'vi', 'vs'), relation('r2', 't2', 'vi', 'vf'),
        relation('r3', 't3', 'vs', 'vi'), relation('r4', 't4', 'vf', 'vs'),
      ],
    }],
  };
  const codes = validateProject(project).map(x => x.code);
  assert.ok(codes.includes('STM001'));
  assert.ok(codes.includes('STM002'));
  assert.ok(codes.includes('STM003'));
  assert.ok(codes.includes('STM004'));
}

{
  const project = {
    models: {
      comp: model('comp', 'compositestate', 'Order'), reg: model('reg', 'region', 'Payment'),
      init: model('init', 'stateinitial', 'Start'), child: model('child', 'state', 'Pending'),
      t1: model('t1', 'transition', ''),
    },
    diagrams: [{
      id: 'd1', type: 'state', name: 'Composite',
      elements: [
        view('vc', 'comp'), view('vr', 'reg', { parentId: 'vc' }),
        view('vi', 'init', { parentId: 'vr' }), view('vs', 'child', { parentId: 'vr' }),
      ],
      relations: [relation('rt', 't1', 'vi', 'vs')],
    }],
  };
  assert.deepEqual(validateProject(project), []);
}

{
  const project = {
    models: {
      comp: model('comp', 'compositestate', 'EmptyComposite'), plain: model('plain', 'state', 'Plain'),
      reg: model('reg', 'region', 'BrokenRegion'), child: model('child', 'state', 'Child'),
      i1: model('i1', 'stateinitial', 'First'), i2: model('i2', 'stateinitial', 'Second'),
    },
    diagrams: [{
      id: 'd1', type: 'state', name: 'Broken Composite', relations: [],
      elements: [
        view('vc', 'comp'), view('vp', 'plain'), view('vr', 'reg', { parentId: 'vp' }),
        view('vs', 'child', { parentId: 'vc' }),
        view('vi1', 'i1', { parentId: 'vr' }), view('vi2', 'i2', { parentId: 'vr' }),
      ],
    }],
  };
  const codes = validateProject(project).map(x => x.code);
  assert.ok(codes.includes('STM011'));
  assert.ok(codes.includes('STM012'));
  assert.ok(codes.includes('STM013'));
  assert.ok(codes.includes('STM014'));
}

{
  const project = {
    models: {
      subState: model('subState', 'submachinestate', 'Process Payment', { submachineDiagramId: 'sub' }),
      entryRef: model('entryRef', 'connectionpointref', 'paymentEntry', { referenceKind: 'entry' }),
      exitRef: model('exitRef', 'connectionpointref', 'paymentExit', { referenceKind: 'exit' }),
      topInit: model('topInit', 'stateinitial', 'Start'), topFinal: model('topFinal', 'statefinal', 'Done'),
      entry: model('entry', 'entrypoint', 'paymentEntry'), exit: model('exit', 'exitpoint', 'paymentExit'),
      work: model('work', 'state', 'Authorize'), terminate: model('terminate', 'terminate', 'Fatal'),
      t1: model('t1', 'transition', ''), t2: model('t2', 'transition', ''),
      t3: model('t3', 'transition', ''), t4: model('t4', 'transition', ''), t5: model('t5', 'transition', ''),
    },
    diagrams: [
      {
        id: 'top', type: 'state', name: 'Checkout',
        elements: [
          view('vi', 'topInit'), view('vsub', 'subState'),
          view('ver', 'entryRef', { parentId: 'vsub' }), view('vxr', 'exitRef', { parentId: 'vsub' }),
          view('vf', 'topFinal'),
        ],
        relations: [relation('r1', 't1', 'vi', 'ver'), relation('r2', 't2', 'vxr', 'vf')],
      },
      {
        id: 'sub', type: 'state', name: 'Payment',
        elements: [view('ve', 'entry'), view('vw', 'work'), view('vx', 'exit'), view('vt', 'terminate')],
        relations: [
          relation('r3', 't3', 've', 'vw'), relation('r4', 't4', 'vw', 'vx'), relation('r5', 't5', 'vw', 'vt'),
        ],
      },
    ],
  };
  assert.deepEqual(validateProject(project), []);
}

{
  const project = {
    models: {
      plain: model('plain', 'state', 'Plain'),
      subState: model('subState', 'submachinestate', 'Valid Owner', { submachineDiagramId: 'sub' }),
      missingSub: model('missingSub', 'submachinestate', 'Missing Reference', { submachineDiagramId: '' }),
      entryRef: model('entryRef', 'connectionpointref', 'BadEntry', { referenceKind: 'entry' }),
      exitRef: model('exitRef', 'connectionpointref', 'BadExit', { referenceKind: 'exit' }),
      orphanRef: model('orphanRef', 'connectionpointref', 'Orphan', { referenceKind: 'entry' }),
      terminate: model('terminate', 'terminate', 'Stop'), target: model('target', 'state', 'Target'),
      entry: model('entry', 'entrypoint', 'Entry'), exit: model('exit', 'exitpoint', 'Exit'),
      subEntry: model('subEntry', 'entrypoint', 'SubEntry'), subExit: model('subExit', 'exitpoint', 'SubExit'),
      t1: model('t1', 'transition', ''), t2: model('t2', 'transition', ''),
      t3: model('t3', 'transition', ''), t4: model('t4', 'transition', ''),
    },
    diagrams: [
      {
        id: 'broken', type: 'state', name: 'Broken Connections',
        elements: [
          view('vp', 'plain'), view('vs', 'subState'), view('vmissing', 'missingSub'),
          view('vr', 'entryRef', { parentId: 'vs' }), view('vxr', 'exitRef', { parentId: 'vs' }),
          view('vorphan', 'orphanRef', { parentId: 'vp' }),
          view('vt', 'terminate'), view('vtarget', 'target'), view('ve', 'entry'), view('vx', 'exit'),
        ],
        relations: [
          relation('r1', 't1', 'vr', 'vtarget'), relation('r2', 't2', 'vtarget', 'vxr'),
          relation('r3', 't3', 'vt', 've'), relation('r4', 't4', 'vx', 'vtarget'),
        ],
      },
      {
        id: 'sub', type: 'state', name: 'Referenced', relations: [],
        elements: [view('vse', 'subEntry'), view('vsx', 'subExit')],
      },
    ],
  };
  const codes = validateProject(project).map(x => x.code);
  assert.ok(codes.includes('STM017'));
  assert.ok(codes.includes('STM018'));
  assert.ok(codes.includes('STM019'));
  assert.ok(codes.includes('STM020'));
  assert.ok(codes.includes('STM021'));
  assert.ok(codes.includes('STM025'));
  assert.ok(codes.includes('STM026'));
}

{
  const project = {
    models: {
      cls: model('cls', 'class', 'User'), artifact: model('artifact', 'artifact', 'app.js'),
      component: model('component', 'component', 'Renderer'), node: model('node', 'node', 'Server'),
      obj: model('obj', 'object', 'alice', { classifierModelId: 'cls', slots: ['+ id: Integer = 1'] }),
      ai: model('ai', 'artifactinstance', 'bundle', { classifierModelId: 'artifact' }),
      ci: model('ci', 'componentinstance', 'renderer', { classifierModelId: 'component' }),
      ni: model('ni', 'nodeinstance', 'server', { classifierModelId: 'node' }),
      link: model('link', 'link', ''), directed: model('directed', 'directedlink', ''),
    },
    diagrams: [{
      id: 'objects', type: 'object', name: 'Runtime',
      elements: [view('vo', 'obj'), view('va', 'ai'), view('vc', 'ci'), view('vn', 'ni')],
      relations: [relation('r1', 'link', 'vo', 'vc'), relation('r2', 'directed', 'va', 'vn')],
    }],
  };
  assert.deepEqual(validateProject(project), []);
}

{
  const project = {
    models: {
      cls: model('cls', 'class', 'WrongType'), note: model('note', 'note', 'Note'),
      untyped: model('untyped', 'object', 'untyped', { classifierModelId: '', slots: [] }),
      missing: model('missing', 'object', 'missing', { classifierModelId: 'no-model', slots: [] }),
      duplicate: model('duplicate', 'object', 'duplicate', { classifierModelId: 'cls', slots: ['+ id: Integer = 1', '- id: Integer = 2'] }),
      ai: model('ai', 'artifactinstance', 'artifact', { classifierModelId: 'cls' }),
      ci: model('ci', 'componentinstance', 'component', { classifierModelId: 'cls' }),
      ni: model('ni', 'nodeinstance', 'node', { classifierModelId: 'cls' }),
      link: model('link', 'link', ''),
    },
    diagrams: [{
      id: 'brokenObjects', type: 'object', name: 'Broken Runtime',
      elements: [
        view('vu', 'untyped'), view('vm', 'missing'), view('vd', 'duplicate'),
        view('va', 'ai'), view('vc', 'ci'), view('vn', 'ni'), view('vnote', 'note'),
      ],
      relations: [relation('r1', 'link', 'vd', 'vnote')],
    }],
  };
  const codes = validateProject(project).map(issue => issue.code);
  assert.ok(codes.includes('OBJ001'));
  assert.ok(codes.includes('OBJ002'));
  assert.ok(codes.includes('OBJ005'));
  assert.ok(codes.includes('OBJ006'));
  assert.ok(codes.includes('UML013'));
  assert.ok(codes.includes('UML014'));
  assert.ok(codes.includes('UML015'));
}

{
  const project = {
    models: {
      client: model('client', 'lifeline', 'client'),
      server: model('server', 'lifeline', 'server'),
      connector: model('connector', 'commconnector', ''),
      request: model('request', 'comm-forward', 'request()', { seqNo: '1', messageSort: 'synchCall' }),
      response: model('response', 'comm-reverse', 'response', { seqNo: '1.1', messageSort: 'reply' }),
    },
    diagrams: [{
      id: 'communication', type: 'communication', name: 'Client Server',
      elements: [view('vc', 'client'), view('vs', 'server')],
      relations: [
        relation('link', 'connector', 'vc', 'vs'),
        relation('requestView', 'request', 'vc', 'vs', { connectorId: 'link' }),
        relation('responseView', 'response', 'vs', 'vc', { connectorId: 'link' }),
      ],
    }],
  };
  assert.deepEqual(validateProject(project), []);
}

{
  const project = {
    models: {
      a: model('a', 'lifeline', 'a'), b: model('b', 'lifeline', 'b'), note: model('note', 'note', 'Note'),
      invalidConnector: model('invalidConnector', 'commconnector', ''),
      validConnector: model('validConnector', 'commconnector', ''),
      missing: model('missing', 'comm-forward', 'missing()', { seqNo: '', messageSort: 'synchCall' }),
      wrongDirection: model('wrongDirection', 'comm-forward', 'wrong()', { seqNo: '1', messageSort: 'synchCall' }),
      duplicate: model('duplicate', 'comm-reverse', '', { seqNo: '1', messageSort: 'unsupported' }),
    },
    diagrams: [{
      id: 'brokenCommunication', type: 'communication', name: 'Broken Communication',
      elements: [view('va', 'a'), view('vb', 'b'), view('vn', 'note')],
      relations: [
        relation('badConnector', 'invalidConnector', 'va', 'vn'),
        relation('connector', 'validConnector', 'va', 'vb'),
        relation('missingView', 'missing', 'va', 'vb', { connectorId: 'missingConnector' }),
        relation('directionView', 'wrongDirection', 'vb', 'va', { connectorId: 'connector' }),
        relation('duplicateView', 'duplicate', 'vb', 'va', { connectorId: 'connector' }),
      ],
    }],
  };
  const codes = validateProject(project).map(issue => issue.code);
  assert.ok(codes.includes('COM001'));
  assert.ok(codes.includes('COM002'));
  assert.ok(codes.includes('COM003'));
  assert.ok(codes.includes('COM004'));
  assert.ok(codes.includes('COM005'));
  assert.ok(codes.includes('UML001'));
}

{
  const project = {
    models: {
      owner: model('owner', 'class', 'Editor'),
      canvasType: model('canvasType', 'class', 'Canvas'),
      drawable: model('drawable', 'interface', 'Drawable'),
      collaboration: model('collaboration', 'collaboration', 'Rendering'),
      canvas: model('canvas', 'part', 'canvas', { classifierModelId: 'canvasType' }),
      output: model('output', 'port', 'output', {
        classifierModelId: 'drawable', providedInterfaceModelId: 'drawable', requiredInterfaceModelId: '',
      }),
      input: model('input', 'port', 'input', {
        classifierModelId: 'drawable', providedInterfaceModelId: '', requiredInterfaceModelId: 'drawable',
      }),
      use: model('use', 'collaborationuse', 'rendering', { collaborationModelId: 'collaboration' }),
      connector: model('connector', 'csconnector', ''),
      binding: model('binding', 'rolebinding', ''),
    },
    diagrams: [{
      id: 'composite', type: 'composite', name: 'Rendering Structure',
      elements: [
        view('ownerView', 'owner', { w: 700, h: 500 }),
        view('collaborationView', 'collaboration', { x: 800, w: 300, h: 240 }),
        view('canvasView', 'canvas', { parentId: 'ownerView', x: 100, y: 120 }),
        view('outputView', 'output', { parentId: 'canvasView', borderAnchor: { fx: 1, fy: 0.5 } }),
        view('inputView', 'input', { parentId: 'canvasView', borderAnchor: { fx: 0, fy: 0.5 } }),
        view('useView', 'use', { parentId: 'ownerView', x: 360, y: 160 }),
      ],
      relations: [
        relation('connectorView', 'connector', 'outputView', 'inputView'),
        relation('bindingView', 'binding', 'useView', 'canvasView'),
      ],
    }],
  };
  assert.deepEqual(validateProject(project), []);
}

{
  const project = {
    models: {
      ownerA: model('ownerA', 'class', 'A'), ownerB: model('ownerB', 'class', 'B'),
      note: model('note', 'note', 'Note'), collab: model('collab', 'collaboration', 'Roles'),
      orphanPart: model('orphanPart', 'part', 'orphan', { classifierModelId: '' }),
      partA: model('partA', 'part', 'a', { classifierModelId: 'ownerA' }),
      partB: model('partB', 'part', 'b', { classifierModelId: 'ownerB' }),
      badPort: model('badPort', 'port', 'bad', {
        classifierModelId: 'collab', providedInterfaceModelId: 'ownerA', requiredInterfaceModelId: '',
      }),
      badUse: model('badUse', 'collaborationuse', 'badUse', { collaborationModelId: 'ownerA' }),
      connector1: model('connector1', 'csconnector', ''),
      connector2: model('connector2', 'csconnector', ''),
      binding1: model('binding1', 'rolebinding', ''),
      binding2: model('binding2', 'rolebinding', ''),
    },
    diagrams: [{
      id: 'brokenComposite', type: 'composite', name: 'Broken Composite',
      elements: [
        view('aOwner', 'ownerA', { w: 500, h: 400 }), view('bOwner', 'ownerB', { x: 600, w: 500, h: 400 }),
        view('noteView', 'note'), view('collabView', 'collab', { x: 1200 }),
        view('orphanView', 'orphanPart', { parentId: 'noteView' }),
        view('aPart', 'partA', { parentId: 'aOwner' }), view('bPart', 'partB', { parentId: 'bOwner' }),
        view('portView', 'badPort', { parentId: 'noteView' }),
        view('useView', 'badUse', { parentId: 'noteView' }),
      ],
      relations: [
        relation('crossConnector', 'connector1', 'aPart', 'bPart'),
        relation('badConnector', 'connector2', 'aPart', 'noteView'),
        relation('badBinding', 'binding1', 'aPart', 'useView'),
        relation('crossBinding', 'binding2', 'useView', 'bPart'),
      ],
    }],
  };
  const codes = validateProject(project).map(issue => issue.code);
  for (const code of ['CS001', 'CS002', 'CS003', 'CS004', 'CS005', 'CS006', 'CS007', 'CS008', 'CS009', 'CS010', 'CS011']) {
    assert.ok(codes.includes(code), `${code} 검증 결과가 필요합니다`);
  }
}

{
  const project = {
    models: {
      root: model('root', 'model', 'UML Studio', { visibility: 'public' }),
      domain: model('domain', 'package', 'domain', { visibility: 'private' }),
      app: model('app', 'package', 'application', { visibility: 'protected' }),
      ownDomain: model('ownDomain', 'containment', ''),
      ownApp: model('ownApp', 'containment', ''),
      dependency: model('dependency', 'dependency', 'uses'),
    },
    diagrams: [{
      id: 'packages', type: 'package', name: 'Architecture Packages',
      elements: [
        view('rootView', 'root', { w: 720, h: 520 }),
        view('domainView', 'domain', { parentId: 'rootView', w: 220, h: 144 }),
        view('appView', 'app', { parentId: 'rootView', x: 280, w: 320, h: 240 }),
      ],
      relations: [
        relation('domainOwner', 'ownDomain', 'domainView', 'rootView'),
        relation('appOwner', 'ownApp', 'appView', 'rootView'),
        relation('uses', 'dependency', 'appView', 'domainView'),
      ],
    }],
  };
  assert.deepEqual(validateProject(project), []);
}

{
  const project = {
    models: {
      root: model('root', 'model', 'Root', { visibility: 'invalid' }),
      child: model('child', 'package', 'Child', { visibility: 'public' }),
      other: model('other', 'package', 'Other', { visibility: 'public' }),
      note: model('note', 'note', 'Note'),
      own1: model('own1', 'containment', ''),
      own2: model('own2', 'containment', ''),
      ownCycle: model('ownCycle', 'containment', ''),
      badDependency: model('badDependency', 'dependency', ''),
      selfDependency: model('selfDependency', 'dependency', ''),
    },
    diagrams: [{
      id: 'brokenPackages', type: 'package', name: 'Broken Packages',
      elements: [
        view('rootView', 'root', { parentId: 'childView', w: 640, h: 480 }),
        view('childView', 'child', { parentId: 'rootView', w: 220, h: 144 }),
        view('otherView', 'other', { w: 220, h: 144 }),
        view('noteView', 'note'),
      ],
      relations: [
        relation('owner1', 'own1', 'childView', 'rootView'),
        relation('owner2', 'own2', 'childView', 'otherView'),
        relation('ownerCycle', 'ownCycle', 'rootView', 'childView'),
        relation('badDependencyView', 'badDependency', 'childView', 'noteView'),
        relation('selfDependencyView', 'selfDependency', 'otherView', 'otherView'),
      ],
    }],
  };
  const codes = validateProject(project).map(issue => issue.code);
  for (const code of ['PKG002', 'PKG003', 'PKG004', 'PKG005', 'PKG006', 'PKG007']) {
    assert.ok(codes.includes(code), `${code} 검증 결과가 필요합니다`);
  }
}

{
  const project = {
    models: {
      meta: model('meta', 'metaclass', 'Class', { visibility: 'public' }),
      entity: model('entity', 'stereotype', 'Entity', {
        visibility: 'public', attributes: ['+ tableName: String'], operations: [],
        iconContent: '!icon 40 40\n%l #76508f\ne 6 8 34 30',
      }),
      audited: model('audited', 'stereotype', 'Audited', {
        visibility: 'protected', attributes: [], operations: [], iconContent: '',
      }),
      extension: model('extension', 'extension', '', { isRequired: true }),
      generalization: model('generalization', 'generalization', ''),
    },
    diagrams: [{
      id: 'profile', type: 'profile', name: 'Domain Profile',
      elements: [
        view('metaView', 'meta', { x: 520, w: 220, h: 72 }),
        view('entityView', 'entity', { w: 260, h: 160 }),
        view('auditedView', 'audited', { y: 280, w: 240, h: 120 }),
      ],
      relations: [
        relation('extensionView', 'extension', 'entityView', 'metaView'),
        relation('generalizationView', 'generalization', 'entityView', 'auditedView'),
      ],
    }],
  };
  assert.deepEqual(validateProject(project), []);
}

{
  const project = {
    models: {
      meta: model('meta', 'metaclass', 'Class', { visibility: 'public' }),
      broken: model('broken', 'stereotype', 'Broken', {
        visibility: 'invalid', attributes: [], operations: [], iconContent: '!icon 40 40\nscript alert(1)',
      }),
      other: model('other', 'stereotype', 'Other', {
        visibility: 'public', attributes: [], operations: [], iconContent: '',
      }),
      wrongExtension: model('wrongExtension', 'extension', ''),
      extension1: model('extension1', 'extension', '', { isRequired: 'yes' }),
      extension2: model('extension2', 'extension', '', { isRequired: false }),
      badGeneralization: model('badGeneralization', 'generalization', ''),
      cycle1: model('cycle1', 'generalization', ''),
      cycle2: model('cycle2', 'generalization', ''),
    },
    diagrams: [{
      id: 'brokenProfile', type: 'profile', name: 'Broken Profile',
      elements: [
        view('metaView', 'meta'), view('brokenView', 'broken'), view('otherView', 'other'),
      ],
      relations: [
        relation('wrongExtensionView', 'wrongExtension', 'metaView', 'brokenView'),
        relation('extensionView1', 'extension1', 'brokenView', 'metaView'),
        relation('extensionView2', 'extension2', 'brokenView', 'metaView'),
        relation('badGeneralizationView', 'badGeneralization', 'brokenView', 'metaView'),
        relation('cycleView1', 'cycle1', 'brokenView', 'otherView'),
        relation('cycleView2', 'cycle2', 'otherView', 'brokenView'),
      ],
    }],
  };
  const codes = validateProject(project).map(issue => issue.code);
  for (const code of ['PROF001', 'PROF002', 'PROF003', 'PROF004', 'PROF005', 'PROF006', 'PROF007']) {
    assert.ok(codes.includes(code), `${code} 검증 결과가 필요합니다`);
  }
}

{
  const project = {
    models: {
      renderer: model('renderer', 'component', 'Renderer'),
      lifeline: model('lifeline', 'lifeline', 'renderer', { classifierModelId: 'renderer' }),
      idle: model('idle', 'timingstate', 'Idle'),
      rendering: model('rendering', 'timingstate', 'Rendering'),
      before: model('before', 'timesegment', '', { startTime: '0 ms', endTime: '20 ms' }),
      active: model('active', 'timesegment', '', { startTime: '20 ms', endTime: '60 ms' }),
      tick: model('tick', 'timetick', 'tick20', { timeValue: '20 ms' }),
      time: model('time', 'timeconstraint', 'start', { constraint: '{t = 20 ms}' }),
      duration: model('duration', 'durationconstraint', 'renderDuration', { constraint: '{20 ms..60 ms}' }),
      message: model('message', 'timingmessage', 'render()', { messageSort: 'synchCall' }),
    },
    diagrams: [{
      id: 'timing', type: 'timing', name: 'Frame Timing',
      elements: [
        view('lifelineView', 'lifeline', { w: 900, h: 132 }),
        view('idleView', 'idle', { parentId: 'lifelineView', stateOrder: 0 }),
        view('renderingView', 'rendering', { parentId: 'lifelineView', stateOrder: 1 }),
        view('beforeView', 'before', { parentId: 'idleView', w: 180, h: 10 }),
        view('activeView', 'active', { parentId: 'renderingView', x: 180, w: 240, h: 10 }),
        view('tickView', 'tick', { w: 8, h: 180 }),
        view('timeView', 'time', { constrainedViewId: 'activeView', w: 120, h: 28 }),
        view('durationView', 'duration', { w: 240, h: 32 }),
      ],
      relations: [relation('messageView', 'message', 'beforeView', 'activeView')],
    }],
  };
  assert.deepEqual(validateProject(project), []);
}

{
  const project = {
    models: {
      badClassifier: model('badClassifier', 'note', 'Wrong'),
      noType: model('noType', 'lifeline', 'untyped', { classifierModelId: '' }),
      badType: model('badType', 'lifeline', 'badType', { classifierModelId: 'badClassifier' }),
      note: model('note', 'note', 'Note'),
      orphanState: model('orphanState', 'timingstate', 'Orphan'),
      badSegment: model('badSegment', 'timesegment', '', { startTime: '60 ms', endTime: '20 ms' }),
      tick: model('tick', 'timetick', 'tick', { timeValue: '' }),
      time: model('time', 'timeconstraint', 'time', { constraint: '' }),
      duration: model('duration', 'durationconstraint', 'duration', { constraint: '' }),
      message: model('message', 'timingmessage', '', { messageSort: 'unsupported' }),
    },
    diagrams: [{
      id: 'brokenTiming', type: 'timing', name: 'Broken Timing',
      elements: [
        view('untypedView', 'noType'), view('badTypeView', 'badType'), view('noteView', 'note'),
        view('orphanStateView', 'orphanState', { parentId: 'noteView' }),
        view('badSegmentView', 'badSegment', { parentId: 'untypedView', w: 180, h: 10 }),
        view('tickView', 'tick', { w: 8, h: 180 }),
        view('timeView', 'time', { constrainedViewId: 'noteView', w: 120, h: 28 }),
        view('durationView', 'duration', { w: 0, h: 32 }),
      ],
      relations: [relation('messageView', 'message', 'untypedView', 'noteView')],
    }],
  };
  const codes = validateProject(project).map(issue => issue.code);
  for (const code of [
    'TIM001', 'TIM002', 'TIM003', 'TIM004', 'TIM005', 'TIM006', 'TIM007',
    'TIM008', 'TIM009', 'TIM010', 'TIM011', 'TIM012', 'TIM013',
  ]) {
    assert.ok(codes.includes(code), `${code} 검증 결과가 필요합니다`);
  }
}

{
  const project = {
    models: {
      start: model('start', 'initial', 'Start'),
      use: model('use', 'interactionuse', 'Authorize', { interactionDiagramId: 'authorizeSequence' }),
      inline: model('inline', 'interactioninline', 'Authorize', { interactionDiagramId: 'authorizeSequence' }),
      finish: model('finish', 'final', 'Done'),
      f1: model('f1', 'controlflow', ''),
      f2: model('f2', 'controlflow', ''),
      f3: model('f3', 'controlflow', ''),
      life: model('life', 'lifeline', ':Gateway'),
    },
    diagrams: [
      {
        id: 'overview', type: 'interactionoverview', name: 'Checkout Overview',
        elements: [
          view('startView', 'start'), view('useView', 'use', { x: 120 }),
          view('inlineView', 'inline', { x: 360, w: 400, h: 240 }), view('finishView', 'finish', { x: 840 }),
        ],
        relations: [
          relation('flow1', 'f1', 'startView', 'useView'),
          relation('flow2', 'f2', 'useView', 'inlineView'),
          relation('flow3', 'f3', 'inlineView', 'finishView'),
        ],
      },
      {
        id: 'authorizeSequence', type: 'sequence', name: 'Authorize',
        elements: [view('lifeView', 'life')], relations: [],
      },
    ],
  };
  assert.deepEqual(validateProject(project), []);
}

{
  const project = {
    models: {
      brokenUse: model('brokenUse', 'interactionuse', 'Missing', { interactionDiagramId: 'missing' }),
      action: model('action', 'action', 'Unsupported'),
      dependency: model('dependency', 'dependency', ''),
    },
    diagrams: [{
      id: 'brokenOverview', type: 'interactionoverview', name: 'Broken Overview',
      elements: [view('useView', 'brokenUse'), view('actionView', 'action', { x: 240 })],
      relations: [relation('dependencyView', 'dependency', 'useView', 'actionView')],
    }],
  };
  const codes = validateProject(project).map(issue => issue.code);
  for (const code of ['IOV001', 'IOV002', 'IOV003']) {
    assert.ok(codes.includes(code), `${code} 검증 결과가 필요합니다`);
  }
}

{
  const project = {
    models: {
      editor: model('editor', 'component', 'DiagramEditor'),
      canvas: model('canvas', 'class', 'CanvasView'),
      document: model('document', 'informationitem', 'DiagramDocument', {
        visibility: 'public', attributes: ['+ diagrams: Diagram[*]'],
        operations: ['+ validate(): Boolean'], receptions: ['documentLoaded'],
      }),
      flow: model('flow', 'informationflow', 'load', { conveyedModelIds: ['document'] }),
    },
    diagrams: [{
      id: 'information', type: 'informationflow', name: 'Rendering Information Flow',
      elements: [
        view('editorView', 'editor'), view('canvasView', 'canvas', { x: 320 }),
        view('documentView', 'document', { x: 160, y: 240 }),
      ],
      relations: [relation('flowView', 'flow', 'editorView', 'canvasView')],
    }],
  };
  assert.deepEqual(validateProject(project), []);
}

{
  const project = {
    models: {
      brokenItem: model('brokenItem', 'informationitem', 'Broken Information', {
        visibility: 'internal', attributes: [], operations: [], receptions: 'not-an-array',
      }),
      lifeline: model('lifeline', 'lifeline', 'Unsupported Lifeline'),
      note: model('note', 'note', 'Note'),
      action: model('action', 'action', 'Work'),
      emptyFlow: model('emptyFlow', 'informationflow', '', { conveyedModelIds: [] }),
      invalidFlow: model('invalidFlow', 'informationflow', '', { conveyedModelIds: ['missing'] }),
      dependency: model('dependency', 'dependency', ''),
    },
    diagrams: [{
      id: 'brokenInformation', type: 'informationflow', name: 'Broken Information Flow',
      elements: [
        view('itemView', 'brokenItem'), view('lifelineView', 'lifeline', { x: 200 }),
        view('noteView', 'note', { x: 400 }), view('actionView', 'action', { x: 600 }),
      ],
      relations: [
        relation('emptyFlowView', 'emptyFlow', 'lifelineView', 'noteView'),
        relation('invalidFlowView', 'invalidFlow', 'actionView', 'actionView'),
        relation('dependencyView', 'dependency', 'actionView', 'noteView'),
      ],
    }],
  };
  const codes = validateProject(project).map(issue => issue.code);
  for (const code of ['INF001', 'INF002', 'INF003', 'INF004', 'INF005', 'INF007', 'INF008', 'INF009']) {
    assert.ok(codes.includes(code), `${code} 검증 결과가 필요합니다`);
  }
}

{
  const project = {
    models: {
      root: model('root', 'requirement', 'Reliable Rendering', {
        visibility: 'public', requirementType: 'functionalRequirement',
        requirementId: 'REQ-001', requirementText: 'The system shall render diagrams reliably.',
        risk: 'High', verificationMethod: 'Demonstration',
      }),
      child: model('child', 'requirement', 'Render Within Budget', {
        visibility: 'public', requirementType: 'performanceRequirement',
        requirementId: 'REQ-002', requirementText: 'The system shall render within 100 milliseconds.',
        risk: 'Medium', verificationMethod: 'Analysis',
      }),
      renderer: model('renderer', 'component', 'RenderEngine'),
      test: model('test', 'usecase', 'Render Canvas'),
      containment: model('containment', 'reqcontainment', ''),
      derive: model('derive', 'derivereqt', ''),
      satisfy: model('satisfy', 'satisfy', ''),
      verify: model('verify', 'verify', ''),
      trace: model('trace', 'trace', ''),
    },
    diagrams: [{
      id: 'requirements', type: 'requirement', name: 'Rendering Requirements',
      elements: [
        view('rootView', 'root'), view('childView', 'child', { x: 320 }),
        view('rendererView', 'renderer', { y: 240 }), view('testView', 'test', { x: 320, y: 240 }),
      ],
      relations: [
        relation('containmentView', 'containment', 'childView', 'rootView'),
        relation('deriveView', 'derive', 'childView', 'rootView'),
        relation('satisfyView', 'satisfy', 'rendererView', 'childView'),
        relation('verifyView', 'verify', 'testView', 'childView'),
        relation('traceView', 'trace', 'rendererView', 'rootView'),
      ],
    }],
  };
  assert.deepEqual(validateProject(project), []);
}

{
  const project = {
    models: {
      a: model('a', 'requirement', 'A', {
        visibility: 'internal', requirementType: 'unknownRequirement',
        requirementId: 'REQ-DUP', requirementText: '',
        risk: 'Critical', verificationMethod: 'Review',
      }),
      b: model('b', 'requirement', 'B', {
        visibility: 'public', requirementType: 'requirement',
        requirementId: 'REQ-DUP', requirementText: 'Different text',
        risk: 'Low', verificationMethod: 'Test',
      }),
      component: model('component', 'component', 'Renderer'),
      lifeline: model('lifeline', 'lifeline', 'Unsupported'),
      note: model('note', 'note', 'Note'),
      containmentAB: model('containmentAB', 'reqcontainment', ''),
      containmentBA: model('containmentBA', 'reqcontainment', ''),
      deriveAB: model('deriveAB', 'derivereqt', ''),
      deriveBA: model('deriveBA', 'derivereqt', ''),
      copy: model('copy', 'reqcopy', ''),
      copyDuplicate: model('copyDuplicate', 'reqcopy', ''),
      satisfy: model('satisfy', 'satisfy', ''),
      self: model('self', 'trace', ''),
      dependency: model('dependency', 'dependency', ''),
    },
    diagrams: [{
      id: 'brokenRequirements', type: 'requirement', name: 'Broken Requirements',
      elements: [
        view('aView', 'a'), view('bView', 'b', { x: 320 }),
        view('componentView', 'component', { y: 240 }),
        view('lifelineView', 'lifeline', { x: 320, y: 240 }),
        view('noteView', 'note', { x: 640 }),
      ],
      relations: [
        relation('containmentABView', 'containmentAB', 'aView', 'bView'),
        relation('containmentBAView', 'containmentBA', 'bView', 'aView'),
        relation('deriveABView', 'deriveAB', 'aView', 'bView'),
        relation('deriveBAView', 'deriveBA', 'bView', 'aView'),
        relation('copyView', 'copy', 'aView', 'bView'),
        relation('copyDuplicateView', 'copyDuplicate', 'aView', 'bView'),
        relation('satisfyView', 'satisfy', 'aView', 'componentView'),
        relation('selfView', 'self', 'componentView', 'componentView'),
        relation('dependencyView', 'dependency', 'componentView', 'noteView'),
      ],
    }],
  };
  const codes = validateProject(project).map(issue => issue.code);
  for (const code of [
    'REQ002', 'REQ003', 'REQ004', 'REQ005', 'REQ006', 'REQ007',
    'REQ008', 'REQ009', 'REQ011', 'REQ013', 'REQ014', 'REQ015', 'REQ016', 'REQ017',
  ]) {
    assert.ok(codes.includes(code), `${code} 검증 결과가 필요합니다`);
  }
}

{
  const project = {
    models: {
      system: model('system', 'block', 'Rendering System', {
        visibility: 'public', isAbstract: false,
        parts: ['renderer: Rendering Engine [1]'], references: [],
        values: ['frameBudget: Milliseconds = 100'],
        flowProperties: ['in document: DiagramDocument'],
        constraintProperties: ['budget: Render Budget'], properties: [],
        constraints: ['{ renderTime <= frameBudget }'], constraintParameters: [],
        operations: ['+ render(): void'], receptions: [],
      }),
      engine: model('engine', 'block', 'Rendering Engine', {
        visibility: 'public', parts: [], references: [], values: [],
        flowProperties: ['out frame: RenderedFrame'], constraintProperties: [],
        properties: [], constraints: [], constraintParameters: [],
        operations: [], receptions: [],
      }),
      value: model('value', 'valuetype', 'Milliseconds', {
        visibility: 'public', valueTypeUnit: 'ms', quantityKind: 'Time',
        properties: ['+ value: Real'], constraints: ['{ value >= 0 }'],
        operations: [], receptions: [],
      }),
      api: model('api', 'interfaceblock', 'IRendering', {
        visibility: 'public', parts: [], references: [], values: [],
        flowProperties: ['in document: DiagramDocument'], constraintProperties: [],
        properties: [], constraints: [], operations: [], receptions: [],
      }),
      budget: model('budget', 'constraintblock', 'Render Budget', {
        visibility: 'public', constraints: ['{ renderTime <= frameBudget }'],
        constraintParameters: ['renderTime: Milliseconds', 'frameBudget: Milliseconds'],
        properties: [], operations: [],
      }),
      portA: model('portA', 'port', 'render', {
        classifierModelId: 'api', providedInterfaceModelId: '', requiredInterfaceModelId: 'api',
      }),
      portB: model('portB', 'port', 'api', {
        classifierModelId: 'api', providedInterfaceModelId: 'api', requiredInterfaceModelId: '',
      }),
      composition: model('composition', 'composition', 'renderer'),
      association: model('association', 'association', 'unit'),
      dependency: model('dependency', 'dependency', 'budget rule'),
      connector: model('connector', 'connector', 'render channel'),
    },
    diagrams: [{
      id: 'bdd', type: 'bdd', name: 'Rendering System Block Definition',
      elements: [
        view('systemView', 'system', { w: 320, h: 240 }),
        view('engineView', 'engine', { x: 400, w: 280, h: 180 }),
        view('valueView', 'value', { y: 320, w: 240, h: 120 }),
        view('apiView', 'api', { x: 800, w: 280, h: 160 }),
        view('budgetView', 'budget', { x: 800, y: 320, w: 280, h: 160 }),
        view('portAView', 'portA', {
          parentId: 'systemView', borderAnchor: { fx: 1, fy: 0.5 }, x: 311, y: 100, w: 18, h: 18,
        }),
        view('portBView', 'portB', {
          parentId: 'apiView', borderAnchor: { fx: 0, fy: 0.5 }, x: 791, y: 100, w: 18, h: 18,
        }),
      ],
      relations: [
        relation('compositionView', 'composition', 'engineView', 'systemView'),
        relation('associationView', 'association', 'engineView', 'valueView'),
        relation('dependencyView', 'dependency', 'systemView', 'budgetView'),
        relation('connectorView', 'connector', 'portAView', 'portBView'),
      ],
    }],
  };
  assert.deepEqual(validateProject(project), []);
}

{
  const project = {
    models: {
      a: model('a', 'block', 'A', {
        visibility: 'internal', parts: ['same: B', ''], references: ['same: B'],
        values: [], flowProperties: 'invalid', constraintProperties: [], properties: [],
        constraints: [], constraintParameters: [], operations: [], receptions: [],
      }),
      b: model('b', 'block', 'B', {
        visibility: 'public', parts: [], references: [], values: [], flowProperties: [],
        constraintProperties: [], properties: [], constraints: [], constraintParameters: [],
        operations: [], receptions: [],
      }),
      value: model('value', 'valuetype', 'Unitless', {
        visibility: 'public', valueTypeUnit: '', quantityKind: '',
        properties: [], constraints: [], operations: [], receptions: [],
      }),
      port: model('port', 'port', 'orphan', {
        classifierModelId: 'missing', providedInterfaceModelId: 'b', requiredInterfaceModelId: '',
      }),
      object: model('object', 'object', 'instance', { classifierModelId: 'missing', slots: [] }),
      lifeline: model('lifeline', 'lifeline', 'Unsupported'),
      badNote: model('badNote', 'notelink', ''),
      self: model('self', 'association', ''),
      connector: model('connector', 'connector', ''),
      badGeneralization: model('badGeneralization', 'generalization', ''),
      genAB: model('genAB', 'generalization', ''),
      genBA: model('genBA', 'generalization', ''),
      badComposition: model('badComposition', 'composition', ''),
      compAB: model('compAB', 'composition', ''),
      compBA: model('compBA', 'composition', ''),
      badDependency: model('badDependency', 'dependency', ''),
      association1: model('association1', 'association', ''),
      association2: model('association2', 'association', ''),
      unsupported: model('unsupported', 'trace', ''),
    },
    diagrams: [{
      id: 'brokenBdd', type: 'bdd', name: 'Broken BDD',
      elements: [
        view('aView', 'a'), view('bView', 'b', { x: 320 }),
        view('valueView', 'value', { x: 640 }),
        view('portView', 'port', { x: 960, borderAnchor: { fx: 0.5, fy: 0.5 } }),
        view('objectView', 'object', { y: 240 }),
        view('lifelineView', 'lifeline', { x: 320, y: 240 }),
      ],
      relations: [
        relation('badNoteView', 'badNote', 'aView', 'bView'),
        relation('selfView', 'self', 'aView', 'aView'),
        relation('connectorView', 'connector', 'aView', 'bView'),
        relation('badGeneralizationView', 'badGeneralization', 'aView', 'valueView'),
        relation('genABView', 'genAB', 'aView', 'bView'),
        relation('genBAView', 'genBA', 'bView', 'aView'),
        relation('badCompositionView', 'badComposition', 'portView', 'aView'),
        relation('compABView', 'compAB', 'aView', 'bView'),
        relation('compBAView', 'compBA', 'bView', 'aView'),
        relation('badDependencyView', 'badDependency', 'portView', 'aView'),
        relation('association1View', 'association1', 'aView', 'bView'),
        relation('association2View', 'association2', 'aView', 'bView'),
        relation('unsupportedView', 'unsupported', 'aView', 'bView'),
      ],
    }],
  };
  const codes = validateProject(project).map(issue => issue.code);
  for (const code of [
    'BDD001', 'BDD002', 'BDD003', 'BDD004', 'BDD005', 'BDD007',
    'BDD008', 'BDD009', 'BDD011', 'BDD012', 'BDD014', 'BDD015',
    'BDD016', 'BDD017', 'BDD018', 'BDD019', 'BDD020', 'BDD021',
    'BDD022', 'BDD023', 'BDD024',
  ]) {
    assert.ok(codes.includes(code), `${code} 검증 결과가 필요합니다`);
  }
}

{
  const project = {
    models: {
      systemType: model('systemType', 'block', 'Rendering System'),
      engineType: model('engineType', 'block', 'Rendering Engine'),
      apiType: model('apiType', 'interfaceblock', 'IRendering'),
      frameType: model('frameType', 'informationitem', 'RenderedFrame'),
      frame: model('frame', 'ibdframe', 'Internal Structure', { classifierModelId: 'systemType' }),
      renderer: model('renderer', 'part', 'renderer', { classifierModelId: 'engineType' }),
      exporter: model('exporter', 'reference', 'exporter', { classifierModelId: 'engineType' }),
      out: model('out', 'port', 'frame', {
        classifierModelId: 'apiType', providedInterfaceModelId: 'apiType', requiredInterfaceModelId: '',
      }),
      input: model('input', 'port', 'frameIn', {
        classifierModelId: 'apiType', providedInterfaceModelId: '', requiredInterfaceModelId: 'apiType',
      }),
      flow: model('flow', 'connector', 'rendered image', { itemFlowModelIds: ['frameType'] }),
    },
    diagrams: [{
      id: 'ibd', type: 'ibd', name: 'Rendering System Internal Structure',
      elements: [
        view('frameView', 'frame', { w: 1000, h: 680 }),
        view('rendererView', 'renderer', { parentId: 'frameView', x: 160, y: 180, w: 200, h: 80 }),
        view('exporterView', 'exporter', { parentId: 'frameView', x: 560, y: 180, w: 200, h: 80 }),
        view('outView', 'out', {
          parentId: 'rendererView', borderAnchor: { fx: 1, fy: 0.5 }, x: 351, y: 210, w: 18, h: 18,
        }),
        view('inputView', 'input', {
          parentId: 'exporterView', borderAnchor: { fx: 0, fy: 0.5 }, x: 551, y: 210, w: 18, h: 18,
        }),
      ],
      relations: [relation('flowView', 'flow', 'outView', 'inputView')],
    }],
  };
  assert.deepEqual(validateProject(project), []);
}

{
  const project = {
    models: {
      block: model('block', 'block', 'Block'),
      valueType: model('valueType', 'valuetype', 'ValueType'),
      info: model('info', 'informationitem', 'Item'),
      frameA: model('frameA', 'ibdframe', 'Frame A', { classifierModelId: 'valueType' }),
      frameB: model('frameB', 'ibdframe', 'Frame B', { classifierModelId: 'block' }),
      unsupported: model('unsupported', 'lifeline', 'Unsupported'),
      orphan: model('orphan', 'part', 'orphan', { classifierModelId: '' }),
      badValue: model('badValue', 'value', 'badValue', { classifierModelId: 'block' }),
      noTypePort: model('noTypePort', 'port', 'noType', { classifierModelId: '' }),
      badPort: model('badPort', 'port', 'badPort', {
        classifierModelId: 'info', providedInterfaceModelId: 'block', requiredInterfaceModelId: '',
      }),
      association: model('association', 'association', ''),
      noteLink: model('noteLink', 'notelink', ''),
      badEnds: model('badEnds', 'connector', '', { itemFlowModelIds: ['missing'] }),
      self: model('self', 'connector', '', { itemFlowModelIds: ['info'] }),
      duplicate: model('duplicate', 'connector', '', { itemFlowModelIds: [] }),
    },
    diagrams: [{
      id: 'brokenIbd', type: 'ibd', name: 'Broken IBD',
      elements: [
        view('frameAView', 'frameA', { parentId: 'frameBView', w: 900, h: 600 }),
        view('frameBView', 'frameB', { x: 960, w: 900, h: 600 }),
        view('unsupportedView', 'unsupported', { x: 40, y: 700 }),
        view('orphanView', 'orphan', { x: 240, y: 700 }),
        view('badValueView', 'badValue', { parentId: 'frameBView', x: 1200, y: 180 }),
        view('noTypePortView', 'noTypePort', {
          parentId: 'orphanView', x: 400, y: 700, borderAnchor: { fx: 0.5, fy: 0.5 },
        }),
        view('badPortView', 'badPort', {
          parentId: 'frameBView', x: 951, y: 220, borderAnchor: { fx: 0, fy: 0.5 },
        }),
      ],
      relations: [
        relation('associationView', 'association', 'orphanView', 'badPortView'),
        relation('noteLinkView', 'noteLink', 'orphanView', 'badPortView'),
        relation('badEndsView', 'badEnds', 'orphanView', 'badValueView'),
        relation('selfView', 'self', 'orphanView', 'orphanView'),
        relation('duplicateView', 'duplicate', 'orphanView', 'orphanView'),
      ],
    }],
  };
  const codes = validateProject(project).map(issue => issue.code);
  for (const code of [
    'IBD001', 'IBD002', 'IBD004', 'IBD005', 'IBD006', 'IBD007',
    'IBD008', 'IBD009', 'IBD010', 'IBD011', 'IBD012', 'IBD013',
    'IBD014', 'IBD015', 'IBD016', 'IBD017', 'IBD018', 'IBD019',
  ]) {
    assert.ok(codes.includes(code), `${code} 검증 결과가 필요합니다`);
  }
}

{
  const project = {
    models: {
      ruleType: model('ruleType', 'constraintblock', 'Render Budget', {
        constraints: ['{ renderTime <= frameBudget }'],
        constraintParameters: ['renderTime: Milliseconds', 'frameBudget: Milliseconds'],
      }),
      milliseconds: model('milliseconds', 'valuetype', 'Milliseconds', {
        valueTypeUnit: 'ms', quantityKind: 'Time',
      }),
      frame: model('frame', 'parametricframe', 'Analysis', { classifierModelId: 'ruleType' }),
      rule: model('rule', 'constraintproperty', 'budget', { classifierModelId: 'ruleType' }),
      renderTime: model('renderTime', 'constraintparameter', 'renderTime', { classifierModelId: 'milliseconds' }),
      frameBudget: model('frameBudget', 'constraintparameter', 'frameBudget', { classifierModelId: 'milliseconds' }),
      actual: model('actual', 'value', 'actualRenderTime', {
        classifierModelId: 'milliseconds', defaultValue: '42 ms',
      }),
      allowed: model('allowed', 'value', 'allowedFrameBudget', {
        classifierModelId: 'milliseconds', defaultValue: '100 ms',
      }),
      bindActual: model('bindActual', 'bindingconnector', ''),
      bindAllowed: model('bindAllowed', 'bindingconnector', ''),
    },
    diagrams: [{
      id: 'parametric', type: 'parametric', name: 'Render Budget Parametric Analysis',
      elements: [
        view('frameView', 'frame', { w: 1000, h: 680 }),
        view('ruleView', 'rule', { parentId: 'frameView', x: 360, y: 200, w: 320, h: 160 }),
        view('renderTimeView', 'renderTime', {
          parentId: 'ruleView', borderAnchor: { fx: 0, fy: 0.5 }, x: 351, y: 260, w: 18, h: 18,
        }),
        view('frameBudgetView', 'frameBudget', {
          parentId: 'ruleView', borderAnchor: { fx: 1, fy: 0.5 }, x: 671, y: 260, w: 18, h: 18,
        }),
        view('actualView', 'actual', { parentId: 'frameView', x: 80, y: 240, w: 220, h: 80 }),
        view('allowedView', 'allowed', { parentId: 'frameView', x: 760, y: 240, w: 220, h: 80 }),
      ],
      relations: [
        relation('bindActualView', 'bindActual', 'actualView', 'renderTimeView'),
        relation('bindAllowedView', 'bindAllowed', 'frameBudgetView', 'allowedView'),
      ],
    }],
  };
  assert.deepEqual(validateProject(project), []);
}

{
  const project = {
    models: {
      block: model('block', 'block', 'Block'),
      ruleType: model('ruleType', 'constraintblock', 'Rule', {
        constraints: ['{ a = b }'], constraintParameters: ['a: ValueType'],
      }),
      valueType: model('valueType', 'valuetype', 'ValueType'),
      otherType: model('otherType', 'valuetype', 'OtherType'),
      frameA: model('frameA', 'parametricframe', 'Frame A', { classifierModelId: '' }),
      frameB: model('frameB', 'parametricframe', 'Frame B', { classifierModelId: 'block' }),
      unsupported: model('unsupported', 'lifeline', 'Unsupported'),
      orphanRule: model('orphanRule', 'constraintproperty', 'orphanRule', { classifierModelId: '' }),
      badRule: model('badRule', 'constraintproperty', 'badRule', { classifierModelId: 'block' }),
      emptyRule: model('emptyRule', 'constraintproperty', 'emptyRule', { classifierModelId: 'ruleType' }),
      noParamRule: model('noParamRule', 'constraintproperty', 'noParamRule', { classifierModelId: 'ruleType' }),
      unknownParam: model('unknownParam', 'constraintparameter', 'unknown', { classifierModelId: 'valueType' }),
      orphanParam: model('orphanParam', 'constraintparameter', 'orphan', { classifierModelId: '' }),
      badParam: model('badParam', 'constraintparameter', 'badParam', { classifierModelId: 'ruleType' }),
      noTypeValue: model('noTypeValue', 'value', 'noTypeValue', { classifierModelId: '' }),
      badValue: model('badValue', 'value', 'badValue', { classifierModelId: 'ruleType' }),
      goodValue: model('goodValue', 'value', 'goodValue', { classifierModelId: 'otherType' }),
      association: model('association', 'association', ''),
      noteLink: model('noteLink', 'notelink', ''),
      badEnds: model('badEnds', 'bindingconnector', ''),
      self: model('self', 'bindingconnector', ''),
      mismatch: model('mismatch', 'bindingconnector', ''),
      duplicate: model('duplicate', 'bindingconnector', ''),
    },
    diagrams: [{
      id: 'brokenParametric', type: 'parametric', name: 'Broken Parametric',
      elements: [
        view('frameAView', 'frameA', { parentId: 'frameBView', w: 800, h: 560 }),
        view('frameBView', 'frameB', { x: 840, w: 800, h: 560 }),
        view('unsupportedView', 'unsupported', { y: 640 }),
        view('orphanRuleView', 'orphanRule', { x: 200, y: 640 }),
        view('badRuleView', 'badRule', { parentId: 'frameBView', x: 1040, y: 160 }),
        view('emptyRuleView', 'emptyRule', { parentId: 'frameBView', x: 1040, y: 360 }),
        view('noParamRuleView', 'noParamRule', { parentId: 'frameBView', x: 1360, y: 360 }),
        view('unknownParamView', 'unknownParam', {
          parentId: 'emptyRuleView', borderAnchor: { fx: 1, fy: 0.5 }, x: 1320, y: 400,
        }),
        view('orphanParamView', 'orphanParam', { x: 560, y: 640, borderAnchor: { fx: 0.5, fy: 0.5 } }),
        view('badParamView', 'badParam', {
          parentId: 'frameBView', borderAnchor: { fx: 0, fy: 0.5 }, x: 831, y: 260,
        }),
        view('noTypeValueView', 'noTypeValue', { parentId: 'frameBView', x: 880, y: 640 }),
        view('badValueView', 'badValue', { parentId: 'frameBView', x: 1120, y: 640 }),
        view('goodValueView', 'goodValue', { parentId: 'frameBView', x: 1360, y: 640 }),
      ],
      relations: [
        relation('associationView', 'association', 'noTypeValueView', 'badParamView'),
        relation('noteLinkView', 'noteLink', 'noTypeValueView', 'badParamView'),
        relation('badEndsView', 'badEnds', 'badRuleView', 'noTypeValueView'),
        relation('selfView', 'self', 'noTypeValueView', 'noTypeValueView'),
        relation('mismatchView', 'mismatch', 'goodValueView', 'unknownParamView'),
        relation('duplicateView', 'duplicate', 'goodValueView', 'unknownParamView'),
      ],
    }],
  };
  const codes = validateProject(project).map(issue => issue.code);
  for (const code of [
    'PAR001', 'PAR002', 'PAR003', 'PAR004', 'PAR005', 'PAR006',
    'PAR007', 'PAR008', 'PAR009', 'PAR010', 'PAR011', 'PAR012',
    'PAR013', 'PAR014', 'PAR015', 'PAR016', 'PAR017', 'PAR018',
    'PAR019', 'PAR020', 'PAR021', 'PAR022', 'PAR023',
  ]) {
    assert.ok(codes.includes(code), `${code} 검증 결과가 필요합니다`);
  }
}

console.log('validation tests: ok');
