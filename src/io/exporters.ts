// @ts-nocheck
'use strict';

/*
 * Text exporters for UML Studio.
 *
 * Mermaid uses native diagram syntax where it can preserve UML semantics
 * (Class, Sequence and State) and an editable flowchart fallback elsewhere.
 * draw.io output is uncompressed mxGraph XML: every view and relationship is
 * emitted as a native mxCell so the result remains individually editable.
 */
(function initExporters(root, factory) {
  const commonJs = typeof module !== 'undefined' && module.exports;
  const api = factory(
    commonJs ? require('../model/erd-cardinality.js') : root.UMLErdCardinality,
    commonJs ? require('../model/erd-column.js') : root.UMLErdColumn,
    commonJs ? require('../model/erd-schema.js') : root.UMLErdSchema,
  );
  if (commonJs) module.exports = api;
  else root.UMLExporters = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createExporters(erdCardinalityApi, erdColumnApi, erdSchemaApi) {
  const {
    erdDefaultCardinality, erdMermaidMarker, erdDrawioArrow,
  } = erdCardinalityApi;
  const { parseColumn: parseErdColumn } = erdColumnApi;
  const { validateEntitySchema, validateReferentialActions, safeSqlFragment } = erdSchemaApi;
  const ERD_DDL_DIALECTS = Object.freeze({
    postgresql: Object.freeze({ id: 'postgresql', label: 'PostgreSQL', fileTag: 'postgresql', quote: '"' }),
    mysql: Object.freeze({ id: 'mysql', label: 'MySQL', fileTag: 'mysql', quote: '`' }),
    sqlite: Object.freeze({ id: 'sqlite', label: 'SQLite', fileTag: 'sqlite', quote: '"' }),
  });
  const messageKinds = new Set([
    'msg-sync', 'msg-async', 'msg-reply', 'msg-create', 'msg-destroy',
    'comm-forward', 'comm-reverse', 'timingmessage',
  ]);

  const xmlEscape = value => String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

  const htmlEscape = value => String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const mermaidText = value => String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/\r?\n/g, '<br/>');

  const mermaidLineText = value => mermaidText(value)
    .replace(/\|/g, '/')
    .replace(/:/g, '：');

  function makeIdMap(views, prefix) {
    const used = new Set();
    const map = new Map();
    views.forEach((view, index) => {
      let id = `${prefix}_${String(view.id || index + 1).replace(/[^A-Za-z0-9_]/g, '_')}`;
      if (!/^[A-Za-z_]/.test(id)) id = `${prefix}_${id}`;
      let unique = id;
      let suffix = 2;
      while (used.has(unique)) unique = `${id}_${suffix++}`;
      used.add(unique);
      map.set(view.id, unique);
    });
    return map;
  }

  function classifierName(view, models) {
    const classifier = view && view.classifierModelId && models && models[view.classifierModelId];
    return classifier && classifier.name ? classifier.name : '';
  }

  function displayName(view, models) {
    if (!view) return '?';
    const name = String(view.name || '').trim();
    if (['package', 'model', 'subsystem'].includes(view.kind)) {
      const symbol = ({ public: '+', protected: '#', private: '-', package: '~' })[view.visibility || 'public'] || '';
      return `${symbol} ${name || view.kind}`.trim();
    }
    if (view.kind === 'metaclass' || view.kind === 'stereotype'
      || view.kind === 'informationitem' || view.kind === 'requirement'
      || ['block', 'valuetype', 'interfaceblock', 'constraintblock'].includes(view.kind)) {
      const symbol = ({ public: '+', protected: '#', private: '-', package: '~' })[view.visibility || 'public'] || '';
      return `${symbol} ${name || view.kind}`.trim();
    }
    if (view.kind === 'lifeline') {
      const type = classifierName(view, models);
      return type ? `${name || 'lifeline'}: ${type}` : (name || 'lifeline');
    }
    if (['part', 'reference', 'value', 'port'].includes(view.kind)) {
      const type = classifierName(view, models);
      const typed = type ? `${name || view.kind}: ${type}` : (name || view.kind);
      return view.kind === 'value' && view.defaultValue
        ? `${typed} = ${view.defaultValue}`
        : typed;
    }
    if (view.kind === 'ibdframe') {
      const type = classifierName(view, models);
      return `ibd [${type || name || 'Untyped Block'}]`;
    }
    if (view.kind === 'parametricframe') {
      const type = classifierName(view, models);
      return `par [${type || name || 'Untyped Constraint Block'}]`;
    }
    if (['constraintproperty', 'constraintparameter'].includes(view.kind)) {
      const type = classifierName(view, models);
      return type ? `${name || view.kind}: ${type}` : (name || view.kind);
    }
    if (view.kind === 'timesegment') {
      const time = [view.startTime, view.endTime].filter(value => value != null && value !== '').join('–');
      return time || 'Time Segment';
    }
    if (view.kind === 'timeconstraint' || view.kind === 'durationconstraint') {
      return view.constraint || name || view.kind;
    }
    return name || view.text || view.logicalName || view.kind || 'Element';
  }

  function relationLabel(relation, models) {
    const base = String(relation.name || '').trim();
    const sequence = String(relation.seqNo || '').trim();
    if (messageKinds.has(relation.kind)) return [sequence, base].filter(Boolean).join(' ');
    if (relation.kind === 'extension') return [base, relation.isRequired ? '{required}' : ''].filter(Boolean).join(' ');
    if (relation.kind === 'informationflow') {
      const conveyed = (relation.conveyedModelIds || [])
        .map(id => models && models[id] && models[id].name)
        .filter(Boolean)
        .join(', ');
      const detail = [base, conveyed].filter(Boolean).join(' : ');
      return ['«flow»', detail].filter(Boolean).join(' ');
    }
    if (relation.kind === 'connector' && Array.isArray(relation.itemFlowModelIds)) {
      const itemFlows = relation.itemFlowModelIds
        .map(id => models && models[id] && models[id].name)
        .filter(Boolean)
        .join(', ');
      return [base, itemFlows ? `«itemFlow» ${itemFlows}` : ''].filter(Boolean).join(' : ');
    }
    const requirementLabel = ({
      reqcopy: '«copy»',
      derivereqt: '«deriveReqt»',
      verify: '«verify»',
      satisfy: '«satisfy»',
      refine: '«refine»',
      trace: '«trace»',
    })[relation.kind];
    if (requirementLabel) return [requirementLabel, base].filter(Boolean).join(' ');
    return base;
  }

  const RELATION_END_KINDS = new Set([
    'association', 'directed', 'aggregation', 'composition',
    'link', 'directedlink', 'erd-11', 'erd-1n', 'erd-nm',
  ]);
  const ER_RELATION_KINDS = new Set(['erd-11', 'erd-1n', 'erd-nm']);

  function exportEndAggregation(relation, end) {
    const field = `${end}Aggregation`;
    if (relation[field] !== undefined) return relation[field] || 'none';
    if (end === 'target' && relation.kind === 'aggregation') return 'shared';
    if (end === 'target' && relation.kind === 'composition') return 'composite';
    return 'none';
  }

  function exportEndNavigability(relation, end) {
    const field = `${end}Navigability`;
    if (relation[field] !== undefined) return relation[field] || 'unspecified';
    return end === 'target' && ['directed', 'directedlink'].includes(relation.kind)
      ? 'navigable' : 'unspecified';
  }

  function exportEndExpression(relation, end) {
    const stereotype = relation[`${end}EndStereotype`];
    const visibility = ({ public: '+', protected: '#', private: '-', package: '~' })[
      relation[`${end}EndVisibility`]
    ] || '';
    const name = relation[`${end}EndName`] || '';
    const qualifiers = relation[`${end}Qualifiers`];
    const qualifierText = Array.isArray(qualifiers) && qualifiers.length ? `[${qualifiers.join(', ')}]` : '';
    return [stereotype ? `«${stereotype}»` : '', visibility, name, qualifierText].filter(Boolean).join(' ');
  }

  function relationLabelWithEnds(relation, models) {
    const base = relationLabel(relation, models);
    if (!RELATION_END_KINDS.has(relation.kind)) return base;
    const source = exportEndExpression(relation, 'source');
    const target = exportEndExpression(relation, 'target');
    const ends = [source ? `source ${source}` : '', target ? `target ${target}` : ''].filter(Boolean).join(' / ');
    return [base, ends].filter(Boolean).join(' · ');
  }

  function classRelationArrow(relation) {
    const kind = typeof relation === 'string' ? relation : relation.kind;
    if (typeof relation === 'object' && relation && RELATION_END_KINDS.has(kind)
      && !ER_RELATION_KINDS.has(kind)) {
      const sourceAggregation = exportEndAggregation(relation, 'source');
      const targetAggregation = exportEndAggregation(relation, 'target');
      const left = sourceAggregation === 'shared' ? 'o'
        : sourceAggregation === 'composite' ? '*'
          : exportEndNavigability(relation, 'source') === 'navigable' ? '<' : '';
      const right = targetAggregation === 'shared' ? 'o'
        : targetAggregation === 'composite' ? '*'
          : exportEndNavigability(relation, 'target') === 'navigable' ? '>' : '';
      return `${left}--${right}`;
    }
    return ({
      association: '--',
      directed: '-->',
      generalization: '--|>',
      realization: '..|>',
      dependency: '..>',
      aggregation: '--o',
      composition: '--*',
      connector: '--',
      link: '--',
      directedlink: '-->',
    })[kind] || '..>';
  }

  function normalizeClassMember(value) {
    const member = String(value).replace(/[{}\r\n]/g, ' ').trim();
    const operation = member.match(/^([+#~-]?)\s*([^(:]+)\s*\((.*)\)\s*(?::\s*(.+))?$/);
    if (operation) {
      const [, visibility, name, parameters, returnType] = operation;
      return `${visibility}${name.trim()}(${parameters.trim()})${returnType ? ` ${returnType.trim()}` : ''}`;
    }
    const attribute = member.match(/^([+#~-]?)\s*([^:]+)\s*:\s*(.+)$/);
    if (attribute) {
      const [, visibility, name, type] = attribute;
      return `${visibility}${type.trim()} ${name.trim()}`;
    }
    return member;
  }

  function exportClassMermaid(diagram, models) {
    const elements = diagram.elements.filter(element =>
      ['class', 'interface', 'enumeration', 'package', 'component', 'artifact', 'node'].includes(element.kind));
    const ids = makeIdMap(elements, 'c');
    const lines = [`%% ${String(diagram.name || 'Class Diagram').replace(/\r?\n/g, ' ')}`, 'classDiagram', '  direction LR'];
    elements.forEach(element => {
      const id = ids.get(element.id);
      const name = mermaidText(displayName(element, models));
      const attributes = Array.isArray(element.attributes) ? element.attributes : [];
      const operations = Array.isArray(element.operations) ? element.operations : [];
      const literals = Array.isArray(element.literals) ? element.literals : [];
      const members = [...attributes, ...literals, ...operations]
        .map(normalizeClassMember)
        .filter(Boolean);
      lines.push(`  class ${id}["${name}"]${members.length || element.kind !== 'class' ? ' {' : ''}`);
      if (element.kind !== 'class') lines.push(`    <<${element.kind}>>`);
      members.forEach(member => lines.push(`    ${member}`));
      if (members.length || element.kind !== 'class') lines.push('  }');
    });
    diagram.relations.forEach(relation => {
      const from = ids.get(relation.from), to = ids.get(relation.to);
      if (!from || !to || relation.kind === 'notelink') return;
      const sourceMultiplicity = relation.sourceLabel ? ` "${mermaidLineText(relation.sourceLabel)}"` : '';
      const targetMultiplicity = relation.targetLabel ? `"${mermaidLineText(relation.targetLabel)}" ` : '';
      const label = relationLabelWithEnds(relation, models);
      lines.push(`  ${from}${sourceMultiplicity} ${classRelationArrow(relation)} ${targetMultiplicity}${to}${label ? ` : ${mermaidLineText(label)}` : ''}`);
    });
    diagram.elements.filter(element => element.kind === 'note').forEach(note => {
      const link = diagram.relations.find(relation =>
        relation.kind === 'notelink' && (relation.from === note.id || relation.to === note.id));
      const targetId = link && ids.get(link.from === note.id ? link.to : link.from);
      const noteText = mermaidText(note.text || note.name || 'Note');
      lines.push(targetId ? `  note for ${targetId} "${noteText}"` : `  note "${noteText}"`);
    });
    return lines.join('\n') + '\n';
  }

  function exportBlockDefinitionMermaid(diagram, models) {
    const elements = diagram.elements.filter(element => element.kind !== 'note');
    const ids = makeIdMap(elements, 'b');
    const safeMember = (category, value) => {
      const clean = String(value || '')
        .replace(/[{}<>\r\n]/g, ' ')
        .replace(/^\s*[+\-#~]\s*/, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!clean) return '';
      const token = input => String(input || '')
        .replace(/[^A-Za-z0-9_]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '') || 'value';
      const colon = clean.indexOf(':');
      if (colon >= 0) {
        return `+${category}_${token(clean.slice(0, colon))} ${token(clean.slice(colon + 1))}`;
      }
      return `+${category}_${token(clean)}`;
    };
    const lines = [
      `%% ${String(diagram.name || 'Block Definition Diagram').replace(/\r?\n/g, ' ')}`,
      'classDiagram',
      '  direction LR',
    ];
    elements.forEach(element => {
      const id = ids.get(element.id);
      const kindLabel = ({
        block: 'block', valuetype: 'valueType', interfaceblock: 'interfaceBlock',
        constraintblock: 'constraintBlock', port: 'port', object: 'object',
      })[element.kind] || element.kind;
      const members = [];
      if (element.kind === 'block' || element.kind === 'interfaceblock') {
        [
          ['constraint', element.constraints], ['part', element.parts],
          ['reference', element.references], ['value', element.values],
          ['flow', element.flowProperties], ['constraintProperty', element.constraintProperties],
          ['property', element.properties],
        ].forEach(([category, values]) =>
          (values || []).forEach(value => members.push(safeMember(category, value))));
        (element.operations || []).forEach(value => members.push(normalizeClassMember(value)));
        (element.receptions || []).forEach(value => members.push(safeMember('reception', value)));
      } else if (element.kind === 'valuetype') {
        if (element.valueTypeUnit) members.push(safeMember('unit', element.valueTypeUnit));
        if (element.quantityKind) members.push(safeMember('quantityKind', element.quantityKind));
        (element.constraints || []).forEach(value => members.push(safeMember('constraint', value)));
        (element.properties || []).forEach(value => members.push(safeMember('attribute', value)));
        (element.operations || []).forEach(value => members.push(normalizeClassMember(value)));
      } else if (element.kind === 'constraintblock') {
        (element.constraints || []).forEach(value => members.push(safeMember('constraint', value)));
        (element.constraintParameters || []).forEach(value => members.push(safeMember('parameter', value)));
        (element.properties || []).forEach(value => members.push(safeMember('property', value)));
        (element.operations || []).forEach(value => members.push(normalizeClassMember(value)));
      } else if (element.kind === 'port') {
        const type = classifierName(element, models);
        if (type) members.push(safeMember('type', type));
      } else if (element.kind === 'object') {
        (element.slots || []).forEach(value => members.push(safeMember('slot', value)));
      }
      lines.push(`  class ${id}["${mermaidText(displayName(element, models))}"] {`);
      lines.push(`    <<${kindLabel}>>`);
      members.filter(Boolean).forEach(member => lines.push(`    ${member}`));
      lines.push('  }');
    });
    diagram.relations.forEach(relation => {
      if (relation.kind === 'notelink') return;
      const from = ids.get(relation.from), to = ids.get(relation.to);
      if (!from || !to) return;
      const sourceMultiplicity = relation.sourceLabel ? ` "${mermaidLineText(relation.sourceLabel)}"` : '';
      const targetMultiplicity = relation.targetLabel ? `"${mermaidLineText(relation.targetLabel)}" ` : '';
      const label = relationLabelWithEnds(relation, models);
      lines.push(`  ${from}${sourceMultiplicity} ${classRelationArrow(relation)} ${targetMultiplicity}${to}${label ? ` : ${mermaidLineText(label)}` : ''}`);
    });
    diagram.elements.filter(element => element.kind === 'note').forEach(note => {
      const link = diagram.relations.find(relation =>
        relation.kind === 'notelink' && (relation.from === note.id || relation.to === note.id));
      const targetId = link && ids.get(link.from === note.id ? link.to : link.from);
      const noteText = mermaidText(note.text || note.name || 'Note');
      lines.push(targetId ? `  note for ${targetId} "${noteText}"` : `  note "${noteText}"`);
    });
    return lines.join('\n') + '\n';
  }

  function sequenceArrow(kind) {
    return ({
      'msg-sync': '->>',
      'msg-async': '-)',
      'msg-reply': '-->>',
      'msg-create': '->>',
      'msg-destroy': '-x',
    })[kind] || '->>';
  }

  function exportSequenceMermaid(diagram, models) {
    const participants = diagram.elements.filter(element => ['lifeline', 'seqactor'].includes(element.kind));
    const ids = makeIdMap(participants, 'p');
    const lines = [`%% ${String(diagram.name || 'Sequence Diagram').replace(/\r?\n/g, ' ')}`, 'sequenceDiagram'];
    participants.slice().sort((a, b) => a.x - b.x).forEach(participant => {
      const keyword = participant.kind === 'seqactor' || participant.isActor ? 'actor' : 'participant';
      lines.push(`  ${keyword} ${ids.get(participant.id)} as ${mermaidText(displayName(participant, models))}`);
    });
    diagram.relations.slice().sort((a, b) => (a.y || 0) - (b.y || 0)).forEach(relation => {
      if (!relation.kind.startsWith('msg-')) return;
      const from = ids.get(relation.from), to = ids.get(relation.to);
      if (!from || !to) return;
      lines.push(`  ${from}${sequenceArrow(relation.kind)}${to}: ${mermaidLineText(relationLabel(relation, models) || relation.kind)}`);
    });
    diagram.elements.filter(element => element.kind === 'note').forEach(note => {
      const linked = diagram.relations.find(relation =>
        relation.kind === 'notelink' && (relation.from === note.id || relation.to === note.id));
      const participant = linked && ids.get(linked.from === note.id ? linked.to : linked.from);
      if (participant) lines.push(`  Note right of ${participant}: ${mermaidLineText(note.text || note.name || 'Note')}`);
    });
    return lines.join('\n') + '\n';
  }

  function stateTransitionLabel(relation) {
    if (relation.name) return relation.name;
    const trigger = String(relation.trigger || '').trim();
    const guard = String(relation.guard || '').trim();
    const effect = String(relation.effect || '').trim();
    return `${trigger}${guard ? ` [${guard}]` : ''}${effect ? ` / ${effect}` : ''}`.trim();
  }

  function exportStateMermaid(diagram, models) {
    const states = diagram.elements.filter(element =>
      !['stateinitial', 'statefinal', 'note', 'region', 'connectionpointref'].includes(element.kind));
    const ids = makeIdMap(states, 's');
    const elementById = new Map(diagram.elements.map(element => [element.id, element]));
    const lines = [`%% ${String(diagram.name || 'State Diagram').replace(/\r?\n/g, ' ')}`, 'stateDiagram-v2', '  direction LR'];
    states.forEach(element => {
      const id = ids.get(element.id);
      if (element.kind === 'choice') {
        lines.push(`  state ${id} <<choice>>`);
      } else if (element.kind === 'junction') {
        lines.push(`  state ${id} <<junction>>`);
      } else if (element.kind === 'statefork') {
        lines.push(`  state ${id} <<fork>>`);
      } else {
        lines.push(`  state "${mermaidText(displayName(element, models))}" as ${id}`);
      }
    });
    diagram.relations.filter(relation => relation.kind === 'transition').forEach(relation => {
      const fromElement = elementById.get(relation.from);
      const toElement = elementById.get(relation.to);
      const from = fromElement && fromElement.kind === 'stateinitial' ? '[*]' : ids.get(relation.from);
      const to = toElement && toElement.kind === 'statefinal' ? '[*]' : ids.get(relation.to);
      if (!from || !to) return;
      const label = stateTransitionLabel(relation);
      lines.push(`  ${from} --> ${to}${label ? `: ${mermaidLineText(label)}` : ''}`);
    });
    diagram.elements.filter(element => element.kind === 'note').forEach(note => {
      lines.push(`  %% Note: ${String(note.text || note.name || 'Note').replace(/\r?\n/g, ' ')}`);
    });
    return lines.join('\n') + '\n';
  }

  const mermaidRequirementValue = value => `"${String(value == null ? '' : value)
    .replace(/\\/g, '/')
    .replace(/"/g, "'")
    .replace(/\r?\n/g, ' ')}"`;

  function makeRequirementNameMap(elements) {
    const used = new Set();
    const map = new Map();
    elements.forEach((element, index) => {
      const source = String(element.name || `${element.kind}_${index + 1}`)
        .normalize('NFKD')
        .replace(/[^A-Za-z0-9_]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');
      const base = /^[A-Za-z_]/.test(source) && source ? source : `r_${source || index + 1}`;
      let name = base;
      let suffix = 2;
      while (used.has(name)) name = `${base}_${suffix++}`;
      used.add(name);
      map.set(element.id, name);
    });
    return map;
  }

  /* every export*Mermaid takes (diagram, models) so exportMermaid can dispatch
     uniformly; requirement fields are MODEL_FIELDS, so the hydrated view's
     getters already read them from the model and the map itself is unused */
  function exportRequirementMermaid(diagram, _models) {
    const elements = diagram.elements.filter(element => element.kind !== 'note');
    const ids = makeRequirementNameMap(elements);
    const lines = [
      `%% ${String(diagram.name || 'Requirement Diagram').replace(/\r?\n/g, ' ')}`,
      'requirementDiagram',
      '  direction LR',
    ];
    elements.forEach(element => {
      const id = ids.get(element.id);
      if (element.kind === 'requirement') {
        const type = [
          'requirement', 'functionalRequirement', 'interfaceRequirement',
          'performanceRequirement', 'physicalRequirement', 'designConstraint',
        ].includes(element.requirementType) ? element.requirementType : 'requirement';
        const risk = ['Low', 'Medium', 'High'].includes(element.risk) ? element.risk : 'Medium';
        const method = ['Analysis', 'Inspection', 'Test', 'Demonstration'].includes(element.verificationMethod)
          ? element.verificationMethod : 'Analysis';
        lines.push(
          `  ${type} ${id} {`,
          `    id: ${mermaidRequirementValue(element.requirementId || id)}`,
          `    text: ${mermaidRequirementValue(element.requirementText || element.name || '')}`,
          `    risk: ${risk}`,
          `    verifymethod: ${method}`,
          '  }',
        );
      } else {
        lines.push(
          `  element ${id} {`,
          `    type: ${mermaidRequirementValue(element.kind || 'element')}`,
          `    docref: ${mermaidRequirementValue(`model:${element.modelId || element.id}`)}`,
          '  }',
        );
      }
    });
    const relationType = {
      reqcontainment: 'contains',
      reqcopy: 'copies',
      derivereqt: 'derives',
      satisfy: 'satisfies',
      verify: 'verifies',
      refine: 'refines',
      trace: 'traces',
    };
    diagram.relations.forEach(relation => {
      const from = ids.get(relation.from), to = ids.get(relation.to);
      const keyword = relationType[relation.kind];
      if (!from || !to || !keyword) return;
      if (relation.kind === 'reqcontainment') lines.push(`  ${to} - contains -> ${from}`);
      else lines.push(`  ${from} - ${keyword} -> ${to}`);
    });
    diagram.elements.filter(element => element.kind === 'note').forEach(note => {
      lines.push(`  %% Note: ${String(note.text || note.name || 'Note').replace(/\r?\n/g, ' ')}`);
    });
    return lines.join('\n') + '\n';
  }

  function flowNode(id, element, models) {
    const label = mermaidText(displayName(element, models));
    if (element.kind === 'informationitem') {
      const members = [
        ...(element.attributes || []),
        ...(element.operations || []),
        ...(element.receptions || []).map(value => `«signal» ${value}`),
      ].map(mermaidLineText);
      return `${id}[["«${mermaidText(element.stereotype || 'information')}»<br/>${label}${members.length ? `<br/>${members.join('<br/>')}` : ''}"]]`;
    }
    if (element.kind === 'metaclass' || element.kind === 'stereotype') {
      const members = element.kind === 'stereotype'
        ? [...(element.attributes || []), ...(element.operations || [])].map(mermaidLineText)
        : [];
      const kindLabel = element.kind === 'metaclass' ? '«metaclass»' : '«stereotype»';
      return `${id}["${kindLabel}<br/>${label}${members.length ? `<br/>${members.join('<br/>')}` : ''}"]`;
    }
    if (['initial', 'stateinitial'].includes(element.kind)) return `${id}((" "))`;
    if (['final', 'statefinal', 'terminate'].includes(element.kind)) return `${id}((("${label}")))`;
    if (element.kind === 'flowfinal') return `${id}(("✕"))`;
    if (['decision', 'merge', 'choice'].includes(element.kind)) return `${id}{"${label}"}`;
    if (['action', 'sendsignal', 'acceptsignal', 'timeevent', 'usecase', 'process', 'mindnode', 'structuredactivity'].includes(element.kind)) {
      return `${id}(["${label}"])`;
    }
    if (['forkbar', 'joinbar'].includes(element.kind)) return `${id}["━━━━"]`;
    if (element.kind === 'interactionuse') return `${id}[["ref · ${label}"]]`;
    if (element.kind === 'interactioninline') return `${id}[["sd · ${label}<br/>inline sequence"]]`;
    if (['datastore', 'activitydatastore', 'centralbuffer', 'entity'].includes(element.kind)) return `${id}[("${label}")]`;
    if (['objectnode', 'activityparameter'].includes(element.kind)) return `${id}["${label}"]`;
    if (['inputpin', 'outputpin', 'expansioninput', 'expansionoutput'].includes(element.kind)) return `${id}["${label}"]`;
    if (element.kind === 'note') return `${id}[/"${mermaidText(element.text || label)}"/]`;
    if (['package', 'model', 'subsystem'].includes(element.kind)) return `${id}[["${label}"]]`;
    return `${id}["${label}"]`;
  }

  function flowArrow(kind) {
    if (['association', 'aggregation', 'composition', 'link', 'commconnector', 'csconnector', 'commpath'].includes(kind)) return '---';
    if (['dependency', 'realization', 'include', 'extend', 'notelink', 'rolebinding', 'deploy', 'msg-reply', 'exceptionhandler', 'informationflow'].includes(kind)) return '-.->';
    if (kind === 'extension') return '-->';
    if (kind === 'activityinterrupt') return '==>';
    return '-->';
  }

  function exportFlowchartMermaid(diagram, models) {
    const elements = diagram.elements.slice();
    const ids = makeIdMap(elements, 'n');
    const lines = [`%% ${String(diagram.name || 'Diagram').replace(/\r?\n/g, ' ')}`, 'flowchart LR'];
    const byParent = new Map();
    elements.forEach(element => {
      const parent = element.parentId || '';
      if (!byParent.has(parent)) byParent.set(parent, []);
      byParent.get(parent).push(element);
    });
    const activityContainers = new Set(['swimlanev', 'swimlaneh', 'interruptibleregion', 'structuredactivity', 'expansionregion']);
    const packageContainers = new Set(['package', 'model', 'subsystem']);
    const isContainer = element =>
      (diagram.type === 'activity' && activityContainers.has(element.kind))
      || (diagram.type === 'package' && packageContainers.has(element.kind));
    const emitted = new Set();
    const emitElement = (element, depth) => {
      if (emitted.has(element.id)) return;
      emitted.add(element.id);
      const indent = '  '.repeat(depth);
      if (isContainer(element)) {
        const clusterId = `cluster_${ids.get(element.id)}`;
        const prefix = ({
          interruptibleregion: 'interruptible · ',
          structuredactivity: 'structured · ',
          expansionregion: `${element.expansionMode || 'parallel'} · `,
          model: 'model · ',
          subsystem: 'subsystem · ',
        })[element.kind] || '';
        lines.push(`${indent}subgraph ${clusterId}["${mermaidText(prefix + displayName(element, models))}"]`);
        lines.push(`${indent}  direction TB`);
        if (element.kind === 'structuredactivity' || diagram.type === 'package') {
          lines.push(`${indent}  ${flowNode(ids.get(element.id), element, models)}`);
        }
        (byParent.get(element.id) || []).forEach(child => emitElement(child, depth + 1));
        lines.push(`${indent}end`);
        return;
      }
      lines.push(`${indent}${flowNode(ids.get(element.id), element, models)}`);
      (byParent.get(element.id) || []).forEach(child => emitElement(child, depth));
    };
    elements.filter(element => !element.parentId || !elements.some(parent => parent.id === element.parentId))
      .forEach(element => emitElement(element, 1));
    elements.forEach(element => emitElement(element, 1));
    diagram.relations.forEach(relation => {
      if (diagram.type === 'package' && relation.kind === 'containment') return;
      const from = ids.get(relation.from), to = ids.get(relation.to);
      if (!from || !to) return;
      const label = relation.kind === 'extension'
        ? ['«extension»', relationLabel(relation, models)].filter(Boolean).join(' ')
        : relationLabel(relation, models)
        || (['include', 'extend', 'extension', 'exceptionhandler', 'activityinterrupt'].includes(relation.kind) ? `«${relation.kind}»` : '');
      lines.push(`  ${from} ${flowArrow(relation.kind)}${label ? `|${mermaidLineText(label)}|` : ''} ${to}`);
    });
    elements.filter(element =>
      !activityContainers.has(element.kind)
      || element.kind === 'structuredactivity'
      || diagram.type === 'package').forEach(element => {
      const fill = /^#[0-9a-f]{6}$/i.test(element.fill || '') ? element.fill : '#fffbd8';
      lines.push(`  style ${ids.get(element.id)} fill:${fill},stroke:#3f4148,color:#202124`);
    });
    return lines.join('\n') + '\n';
  }

  function exportInternalBlockMermaid(diagram, models) {
    const elements = diagram.elements.slice();
    const ids = makeIdMap(elements, 'ibd');
    const frame = elements.find(element => element.kind === 'ibdframe');
    const lines = [
      `%% ${String(diagram.name || 'Internal Block Diagram').replace(/\r?\n/g, ' ')}`,
      'flowchart LR',
    ];
    if (frame) {
      lines.push(`  subgraph ${ids.get(frame.id)}["${mermaidText(displayName(frame, models))}"]`);
      lines.push('    direction LR');
    }
    elements.filter(element => element !== frame).forEach(element => {
      const id = ids.get(element.id);
      const label = mermaidText(displayName(element, models));
      const node = ({
        part: `${id}["«part»<br/>${label}"]`,
        reference: `${id}["«reference»<br/>${label}"]`,
        value: `${id}["«value»<br/>${label}"]`,
        port: `${id}(("${label}"))`,
        note: `${id}[/"${mermaidText(element.text || label)}"/]`,
      })[element.kind] || `${id}["${label}"]`;
      lines.push(`${frame ? '    ' : '  '}${node}`);
    });
    if (frame) lines.push('  end');
    diagram.relations.forEach(relation => {
      const from = ids.get(relation.from), to = ids.get(relation.to);
      if (!from || !to) return;
      const label = relationLabel(relation, models);
      const arrow = relation.kind === 'notelink' ? '-.->' : '---';
      lines.push(`  ${from} ${arrow}${label ? `|${mermaidLineText(label)}|` : ''} ${to}`);
    });
    elements.filter(element => element !== frame).forEach(element => {
      const id = ids.get(element.id);
      const fill = /^#[0-9a-f]{6}$/i.test(element.fill || '') ? element.fill : '#eef6f8';
      const dashed = element.kind === 'reference' || element.kind === 'note' ? ',stroke-dasharray:6 3' : '';
      lines.push(`  style ${id} fill:${fill},stroke:#3f4148,color:#202124${dashed}`);
    });
    return lines.join('\n') + '\n';
  }

  function exportParametricMermaid(diagram, models) {
    const elements = diagram.elements.slice();
    const ids = makeIdMap(elements, 'par');
    const frame = elements.find(element => element.kind === 'parametricframe');
    const lines = [
      `%% ${String(diagram.name || 'Parametric Diagram').replace(/\r?\n/g, ' ')}`,
      'flowchart LR',
    ];
    if (frame) {
      lines.push(`  subgraph ${ids.get(frame.id)}["${mermaidText(displayName(frame, models))}"]`);
      lines.push('    direction LR');
    }
    elements.filter(element => element !== frame).forEach(element => {
      const id = ids.get(element.id);
      const label = mermaidText(displayName(element, models));
      let node;
      if (element.kind === 'constraintproperty') {
        const classifier = element.classifierModelId && models && models[element.classifierModelId];
        const equations = classifier && Array.isArray(classifier.constraints)
          ? classifier.constraints.filter(Boolean).map(mermaidLineText)
          : [];
        node = `${id}[["«constraint property»<br/>${label}${equations.length ? `<br/>${equations.join('<br/>')}` : ''}"]]`;
      } else {
        node = ({
          constraintparameter: `${id}(("${label}"))`,
          value: `${id}["«value»<br/>${label}"]`,
          note: `${id}[/"${mermaidText(element.text || label)}"/]`,
        })[element.kind] || `${id}["${label}"]`;
      }
      lines.push(`${frame ? '    ' : '  '}${node}`);
    });
    if (frame) lines.push('  end');
    diagram.relations.forEach(relation => {
      const from = ids.get(relation.from), to = ids.get(relation.to);
      if (!from || !to) return;
      const label = relationLabel(relation, models);
      const arrow = relation.kind === 'notelink' ? '-.->' : '---';
      lines.push(`  ${from} ${arrow}${label ? `|${mermaidLineText(label)}|` : ''} ${to}`);
    });
    elements.filter(element => element !== frame).forEach(element => {
      const id = ids.get(element.id);
      const fill = /^#[0-9a-f]{6}$/i.test(element.fill || '') ? element.fill : '#f3edf8';
      const dashed = element.kind === 'note' ? ',stroke-dasharray:6 3' : '';
      lines.push(`  style ${id} fill:${fill},stroke:#3f4148,color:#202124${dashed}`);
    });
    return lines.join('\n') + '\n';
  }

  function exportErdMermaid(diagram, models) {
    const entities = diagram.elements.filter(element => element.kind === 'entity');
    const ids = makeIdMap(entities, 'e');
    const safeToken = (value, fallback) => {
      let token = String(value || fallback || '').trim().replace(/[^A-Za-z0-9_()\[\]-]/g, '_');
      if (!/^[A-Za-z]/.test(token)) token = `T_${token}`;
      return token || fallback;
    };
    const safeComment = value => String(value || '').replace(/"/g, "'").replace(/\r?\n/g, ' ').trim();
    const lines = [
      `%% ${String(diagram.name || 'ER Diagram').replace(/\r?\n/g, ' ')}`,
      'erDiagram',
      '  direction LR',
    ];
    entities.forEach(entity => {
      const id = ids.get(entity.id);
      const title = mermaidText(entity.logicalName || displayName(entity, models));
      const columns = Array.isArray(entity.columns) ? entity.columns : [];
      if (!columns.length) {
        lines.push(`  ${id}["${title}"]`);
        return;
      }
      lines.push(`  ${id}["${title}"] {`);
      columns.forEach(raw => {
        const column = parseErdColumn(raw);
        const type = safeToken(column.type, 'string');
        const name = safeToken(column.phys, 'column');
        const keys = column.flags.filter(flag => flag === 'PK' || flag === 'FK' || flag === 'UQ')
          .map(flag => flag === 'UQ' ? 'UK' : flag);
        const comment = safeComment(column.logical);
        lines.push(`    ${type} ${name}${keys.length ? ` ${keys.join(',')}` : ''}${comment ? ` "${comment}"` : ''}`);
      });
      lines.push('  }');
    });
    diagram.relations.filter(relation => ER_RELATION_KINDS.has(relation.kind)).forEach(relation => {
      const from = ids.get(relation.from), to = ids.get(relation.to);
      if (!from || !to) return;
      const sourceFallback = erdDefaultCardinality(relation.kind, 'source');
      const targetFallback = erdDefaultCardinality(relation.kind, 'target');
      const left = erdMermaidMarker(relation.sourceLabel, sourceFallback, 'left');
      const right = erdMermaidMarker(relation.targetLabel, targetFallback, 'right');
      const label = mermaidLineText(relation.name || 'relates');
      lines.push(`  ${from} ${left}..${right} ${to} : "${label}"`);
    });
    return lines.join('\n') + '\n';
  }

  function ddlIdentifier(value, dialect, description) {
    const identifier = String(value || '').trim();
    if (!identifier) throw new Error(`${description} 물리명이 없습니다.`);
    if (/[\0\r\n]/.test(identifier)) throw new Error(`${description} 물리명에 제어 문자를 사용할 수 없습니다.`);
    const quote = dialect.quote;
    return `${quote}${identifier.replaceAll(quote, quote + quote)}${quote}`;
  }

  function ddlComment(value) {
    return String(value || '').replace(/[\0\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function erdDdlType(rawType, dialect) {
    const source = String(rawType || '').trim() || 'TEXT';
    if (/[;\0\r\n]|--|\/\*|\*\//.test(source)) {
      throw new Error(`데이터 타입에 SQL 문장 구분자나 주석을 사용할 수 없습니다: ${source}`);
    }
    const simple = source.match(/^([A-Za-z][A-Za-z0-9_]*)(\s*\([^)]*\))?$/);
    if (!simple) return source;
    const base = simple[1].toUpperCase();
    const args = simple[2] || '';
    const mapped = {
      postgresql: {
        BLOB: 'BYTEA', CLOB: 'TEXT', NCLOB: 'TEXT', NUMBER: 'NUMERIC',
        NVARCHAR2: 'VARCHAR', RAW: 'BYTEA', VARCHAR2: 'VARCHAR',
      },
      mysql: {
        CLOB: 'LONGTEXT', NCLOB: 'LONGTEXT', NUMBER: 'DECIMAL',
        NVARCHAR2: 'VARCHAR', RAW: 'VARBINARY', VARCHAR2: 'VARCHAR',
      },
      sqlite: {
        CLOB: 'TEXT', NCLOB: 'TEXT', NUMBER: 'NUMERIC', NVARCHAR2: 'TEXT',
        RAW: 'BLOB', VARCHAR2: 'TEXT',
      },
    }[dialect.id][base];
    if (!mapped) return source;
    if ((mapped === 'BYTEA' || mapped === 'BLOB' || mapped === 'TEXT' || mapped === 'LONGTEXT')
      && !['NUMBER', 'VARCHAR2', 'NVARCHAR2'].includes(base)) return mapped;
    return `${mapped}${mapped === 'TEXT' ? '' : args}`;
  }

  function exportErdDdl(diagram, models, dialectId = 'postgresql') {
    if (!diagram || diagram.type !== 'erd' || !Array.isArray(diagram.elements)) {
      throw new Error('ER Diagram만 DDL로 내보낼 수 있습니다.');
    }
    const dialect = ERD_DDL_DIALECTS[dialectId];
    if (!dialect) throw new Error(`지원하지 않는 DDL 방언입니다: ${dialectId}`);
    const modelOf = view => view?.modelId && models && models[view.modelId];
    const valueOf = (view, field) => view?.[field] !== undefined ? view[field] : modelOf(view)?.[field];
    const entityViews = diagram.elements.filter(element => (valueOf(element, 'kind')) === 'entity');
    if (!entityViews.length) throw new Error('DDL로 내보낼 Entity가 없습니다.');

    const tableByModel = new Map();
    const tableByViewId = new Map();
    const seenTables = new Set();
    const tables = [];
    entityViews.forEach((entity, entityIndex) => {
      const modelKey = entity.modelId || entity.id;
      if (tableByModel.has(modelKey)) {
        tableByViewId.set(entity.id, tableByModel.get(modelKey));
        return;
      }
      const tableName = String(valueOf(entity, 'name') || '').trim();
      const tableKey = tableName.toLocaleLowerCase();
      if (seenTables.has(tableKey)) throw new Error(`중복된 Entity 물리명이 있습니다: ${tableName}`);
      seenTables.add(tableKey);
      const quotedTable = ddlIdentifier(tableName, dialect, `Entity ${entityIndex + 1}`);
      const rawColumns = Array.isArray(valueOf(entity, 'columns')) ? valueOf(entity, 'columns') : [];
      if (!rawColumns.length) throw new Error(`'${tableName}' Entity에 내보낼 컬럼이 없습니다.`);
      const seenColumns = new Set();
      const columns = rawColumns.map((raw, columnIndex) => {
        const column = parseErdColumn(raw);
        const columnName = String(column.phys || '').trim();
        const columnKey = columnName.toLocaleLowerCase();
        if (seenColumns.has(columnKey)) {
          throw new Error(`'${tableName}' Entity에 중복된 컬럼이 있습니다: ${columnName}`);
        }
        seenColumns.add(columnKey);
        const flags = new Set(column.flags);
        return {
          isForeignKey: flags.has('FK'),
          isNotNull: flags.has('NN'),
          isPrimaryKey: flags.has('PK'),
          isUnique: flags.has('UQ'),
          name: columnName,
          logicalName: column.logical,
          type: column.type,
          columnIndex,
        };
      });
      const schema = validateEntitySchema({
        erdColumnDetails: valueOf(entity, 'erdColumnDetails'),
        erdChecks: valueOf(entity, 'erdChecks'),
        erdIndexes: valueOf(entity, 'erdIndexes'),
      }, columns.map(column => column.name));
      columns.forEach(column => {
        const detailsKey = Object.keys(schema.columnDetails).find(name =>
          name.toLocaleLowerCase() === column.name.toLocaleLowerCase());
        const details = detailsKey ? schema.columnDetails[detailsKey] : {};
        column.details = details;
        column.definition = `${ddlIdentifier(column.name, dialect, `'${tableName}' 컬럼 ${column.columnIndex + 1}`)}`
          + ` ${erdDdlType(column.type, dialect)}`
          + `${column.isPrimaryKey || column.isNotNull ? ' NOT NULL' : ''}`
          + `${details.defaultValue ? ` DEFAULT ${safeSqlFragment(details.defaultValue, `'${tableName}.${column.name}' DEFAULT`)}` : ''}`
          + `${column.isUnique && !details.uniqueName ? ' UNIQUE' : ''}`;
      });
      const table = {
        columns,
        columnByName: new Map(columns.map(column => [column.name.toLocaleLowerCase(), column])),
        foreignKeys: [],
        key: modelKey,
        linkedForeignKeyColumns: new Set(),
        logicalName: valueOf(entity, 'logicalName'),
        quotedTable,
        schema,
        tableName,
      };
      tables.push(table);
      tableByModel.set(modelKey, table);
      tableByViewId.set(entity.id, table);
    });

    const seenRelationModels = new Set();
    const seenConstraints = new Map();
    (diagram.relations || []).forEach(relation => {
      if (!ER_RELATION_KINDS.has(valueOf(relation, 'kind'))) return;
      const relationKey = relation.modelId || relation.id;
      if (seenRelationModels.has(relationKey)) return;
      seenRelationModels.add(relationKey);
      const foreignKeyEnd = String(valueOf(relation, 'foreignKeyEnd') || '');
      const sourceColumnName = String(valueOf(relation, 'sourceColumnName') || '').trim();
      const targetColumnName = String(valueOf(relation, 'targetColumnName') || '').trim();
      const actions = validateReferentialActions({
        foreignKeyOnDelete: valueOf(relation, 'foreignKeyOnDelete'),
        foreignKeyOnUpdate: valueOf(relation, 'foreignKeyOnUpdate'),
      });
      if (!foreignKeyEnd && !sourceColumnName && !targetColumnName && !actions.onDelete && !actions.onUpdate) return;
      if (!['source', 'target'].includes(foreignKeyEnd) || !sourceColumnName || !targetColumnName) {
        throw new Error(`'${valueOf(relation, 'name') || relation.id}' 관계의 FK 연결이 완성되지 않았습니다.`);
      }
      const sourceTable = tableByViewId.get(relation.from);
      const targetTable = tableByViewId.get(relation.to);
      if (!sourceTable || !targetTable) {
        throw new Error(`'${valueOf(relation, 'name') || relation.id}' 관계의 Entity 연결을 찾을 수 없습니다.`);
      }
      const sourceColumn = sourceTable.columnByName.get(sourceColumnName.toLocaleLowerCase());
      const targetColumn = targetTable.columnByName.get(targetColumnName.toLocaleLowerCase());
      if (!sourceColumn) throw new Error(`'${sourceTable.tableName}' Entity에서 FK 연결 컬럼을 찾을 수 없습니다: ${sourceColumnName}`);
      if (!targetColumn) throw new Error(`'${targetTable.tableName}' Entity에서 FK 연결 컬럼을 찾을 수 없습니다: ${targetColumnName}`);
      const foreignKeyTable = foreignKeyEnd === 'source' ? sourceTable : targetTable;
      const referencedTable = foreignKeyEnd === 'source' ? targetTable : sourceTable;
      const foreignKeyColumn = foreignKeyEnd === 'source' ? sourceColumn : targetColumn;
      const referencedColumn = foreignKeyEnd === 'source' ? targetColumn : sourceColumn;
      const referencedPrimaryKeys = referencedTable.columns.filter(column => column.isPrimaryKey);
      if (!referencedColumn.isPrimaryKey || referencedPrimaryKeys.length !== 1) {
        throw new Error(`단일 컬럼 FK의 참조 대상은 단일 PK여야 합니다: ${referencedTable.tableName}.${referencedColumn.name}`);
      }
      const signature = [foreignKeyTable.key, foreignKeyColumn.name.toLocaleLowerCase(),
        referencedTable.key, referencedColumn.name.toLocaleLowerCase()].join('\u0000');
      const actionSignature = `${actions.onDelete}\u0000${actions.onUpdate}`;
      if (seenConstraints.has(signature)) {
        if (seenConstraints.get(signature) !== actionSignature) {
          throw new Error(`같은 FK 연결에 서로 다른 참조 동작이 지정되었습니다: ${foreignKeyTable.tableName}.${foreignKeyColumn.name}`);
        }
        return;
      }
      seenConstraints.set(signature, actionSignature);
      if (dialect.id === 'mysql' && (actions.onDelete === 'SET DEFAULT' || actions.onUpdate === 'SET DEFAULT')) {
        throw new Error(`MySQL InnoDB는 SET DEFAULT FK 참조 동작을 지원하지 않습니다: ${foreignKeyTable.tableName}.${foreignKeyColumn.name}`);
      }
      if ((actions.onDelete === 'SET NULL' || actions.onUpdate === 'SET NULL') && foreignKeyColumn.isNotNull) {
        throw new Error(`SET NULL FK 참조 동작에는 nullable FK 컬럼이 필요합니다: ${foreignKeyTable.tableName}.${foreignKeyColumn.name}`);
      }
      if ((actions.onDelete === 'SET DEFAULT' || actions.onUpdate === 'SET DEFAULT')
        && foreignKeyColumn.isNotNull && !foreignKeyColumn.details.defaultValue) {
        throw new Error(`SET DEFAULT FK 참조 동작의 NOT NULL FK 컬럼에는 DEFAULT가 필요합니다: ${foreignKeyTable.tableName}.${foreignKeyColumn.name}`);
      }
      const actionClause = `${actions.onDelete ? ` ON DELETE ${actions.onDelete}` : ''}`
        + `${actions.onUpdate ? ` ON UPDATE ${actions.onUpdate}` : ''}`;
      foreignKeyTable.linkedForeignKeyColumns.add(foreignKeyColumn.name.toLocaleLowerCase());
      foreignKeyTable.foreignKeys.push({
        referencedTable,
        text: `FOREIGN KEY (${ddlIdentifier(foreignKeyColumn.name, dialect, 'FK 컬럼')}) REFERENCES ${referencedTable.quotedTable} (${ddlIdentifier(referencedColumn.name, dialect, '참조 컬럼')})${actionClause}`,
      });
    });

    const tableSource = table => {
      const definitions = table.columns.map(column => {
        const notes = [];
        if (column.logicalName) notes.push(`logical: ${ddlComment(column.logicalName)}`);
        if (column.isForeignKey
          && !table.linkedForeignKeyColumns.has(column.name.toLocaleLowerCase())) notes.push('FK target not linked');
        return { text: column.definition, note: notes.join(' · ') };
      });
      const primaryKeys = table.columns.filter(column => column.isPrimaryKey);
      if (primaryKeys.length) {
        definitions.push({
          text: `PRIMARY KEY (${primaryKeys.map(column => ddlIdentifier(column.name, dialect, 'Primary Key 컬럼')).join(', ')})`,
          note: '',
        });
      }
      table.columns.filter(column => column.isUnique && column.details.uniqueName).forEach(column => {
        definitions.push({
          text: `CONSTRAINT ${ddlIdentifier(column.details.uniqueName, dialect, 'UNIQUE 제약')} UNIQUE (${ddlIdentifier(column.name, dialect, 'UNIQUE 컬럼')})`,
          note: '',
        });
      });
      table.schema.indexes.filter(index => index.kind === 'unique' && !index.where).forEach(index => {
        const columns = index.columns.map(column =>
          ddlIdentifier(column.name, dialect, `UNIQUE '${index.name || table.tableName}' 컬럼`)).join(', ');
        definitions.push({
          text: `${index.name ? `CONSTRAINT ${ddlIdentifier(index.name, dialect, 'UNIQUE 제약')} ` : ''}UNIQUE (${columns})`,
          note: '',
        });
      });
      table.schema.checks.forEach(check => {
        definitions.push({
          text: `${check.name ? `CONSTRAINT ${ddlIdentifier(check.name, dialect, 'CHECK 제약')} ` : ''}`
            + `CHECK (${safeSqlFragment(check.expression, `CHECK '${check.name || table.tableName}'`)})`,
          note: check.column ? `column: ${ddlComment(check.column)}` : '',
        });
      });
      table.foreignKeys.forEach(foreignKey => definitions.push({ text: foreignKey.text, note: '' }));
      const lines = [];
      const logicalName = ddlComment(table.logicalName);
      if (logicalName) lines.push(`-- Logical table name: ${logicalName}`);
      lines.push(`CREATE TABLE IF NOT EXISTS ${table.quotedTable} (`);
      definitions.forEach((definition, index) => {
        const comma = index < definitions.length - 1 ? ',' : '';
        lines.push(`  ${definition.text}${comma}${definition.note ? ` -- ${definition.note}` : ''}`);
      });
      lines.push(');');
      return lines.join('\n');
    };

    const emittedIndexNames = new Set();
    const indexSources = [];
    tables.forEach(table => {
      table.schema.indexes.filter(index => index.kind === 'index' || index.where).forEach((index, position) => {
        if (dialect.id === 'mysql' && index.where) {
          throw new Error(`MySQL은 부분 인덱스 WHERE를 지원하지 않습니다: ${index.name || table.tableName}`);
        }
        const fallback = `${table.tableName}_${index.columns.map(column => column.name).join('_')}_${index.unique ? 'uq' : 'idx'}${position + 1}`;
        const name = index.name || fallback;
        const key = name.toLocaleLowerCase();
        if (emittedIndexNames.has(key)) throw new Error(`중복된 인덱스 이름입니다: ${name}`);
        emittedIndexNames.add(key);
        const columns = index.columns.map(column =>
          `${ddlIdentifier(column.name, dialect, `인덱스 '${name}' 컬럼`)}${column.order ? ` ${column.order}` : ''}`).join(', ');
        indexSources.push(`CREATE ${index.unique ? 'UNIQUE ' : ''}INDEX ${ddlIdentifier(name, dialect, '인덱스')}`
          + ` ON ${table.quotedTable} (${columns})${index.where ? ` WHERE ${safeSqlFragment(index.where, `인덱스 '${name}' WHERE`)}` : ''};`);
      });
    });

    const pendingTables = new Set(tables);
    const orderedTables = [];
    while (pendingTables.size) {
      const ready = [...pendingTables].filter(table => table.foreignKeys.every(foreignKey =>
        foreignKey.referencedTable === table || !pendingTables.has(foreignKey.referencedTable)));
      if (!ready.length) {
        if (dialect.id !== 'sqlite') {
          throw new Error('순환 FK 관계는 PostgreSQL/MySQL CREATE TABLE DDL로 내보낼 수 없습니다.');
        }
        orderedTables.push(...pendingTables);
        break;
      }
      ready.forEach(table => {
        orderedTables.push(table);
        pendingTables.delete(table);
      });
    }

    const lines = [
      '-- Generated by UML Studio V7 Professional',
      `-- Dialect: ${dialect.label}`,
    ];
    if (tables.some(table => table.columns.some(column => column.isForeignKey
      && !table.linkedForeignKeyColumns.has(column.name.toLocaleLowerCase())))) {
      lines.push('-- FK flags are not emitted as constraints until target columns are linked.');
    }
    if (dialect.id === 'sqlite') lines.push('PRAGMA foreign_keys = ON;');
    lines.push('', ...orderedTables.flatMap((table, index) => [
      tableSource(table), ...(index < orderedTables.length - 1 ? [''] : []),
    ]));
    if (indexSources.length) lines.push('', ...indexSources);
    return lines.join('\n') + '\n';
  }

  function exportMermaid(diagram, models) {
    if (!diagram || !Array.isArray(diagram.elements) || !Array.isArray(diagram.relations)) {
      throw new Error('내보낼 다이어그램 데이터가 올바르지 않습니다.');
    }
    if (diagram.type === 'class') return exportClassMermaid(diagram, models);
    if (diagram.type === 'sequence') return exportSequenceMermaid(diagram, models);
    if (diagram.type === 'state') return exportStateMermaid(diagram, models);
    if (diagram.type === 'requirement') return exportRequirementMermaid(diagram, models);
    if (diagram.type === 'bdd') return exportBlockDefinitionMermaid(diagram, models);
    if (diagram.type === 'ibd') return exportInternalBlockMermaid(diagram, models);
    if (diagram.type === 'parametric') return exportParametricMermaid(diagram, models);
    if (diagram.type === 'erd') return exportErdMermaid(diagram, models);
    return exportFlowchartMermaid(diagram, models);
  }

  function drawioElementHtml(element, models) {
    const name = htmlEscape(displayName(element, models));
    const implicitStereotype = ({
      model: 'model', subsystem: 'subsystem', metaclass: 'metaclass', stereotype: 'stereotype',
      informationitem: 'information', requirement: element.requirementType || 'requirement',
      block: 'block', valuetype: 'valueType', interfaceblock: 'interfaceBlock',
      constraintblock: 'constraintBlock', part: 'part', reference: 'reference',
      value: 'value', port: 'port', constraintproperty: 'constraint property',
      constraintparameter: 'constraint parameter',
    })[element.kind] || '';
    const stereotypeName = element.stereotype || implicitStereotype;
    const stereotype = stereotypeName ? `<div>«${htmlEscape(stereotypeName)}»</div>` : '';
    let members = [];
    if (element.kind === 'entity') members = element.columns || [];
    else if (element.kind === 'object') members = element.slots || [];
    else if (element.kind === 'enumeration') members = [...(element.literals || []), ...(element.operations || [])];
    else members = [
      ...(element.attributes || []),
      ...(element.operations || []),
      ...(element.kind === 'informationitem'
        ? (element.receptions || []).map(value => `«signal» ${value}`)
        : []),
    ];
    if (element.kind === 'note') return htmlEscape(element.text || element.name || 'Note').replace(/\r?\n/g, '<br/>');
    if (element.kind === 'interactionuse') return `<div style="text-align:left"><b>ref</b></div><div><b>${name}</b></div>`;
    if (element.kind === 'interactioninline') return `<div style="text-align:left"><b>sd</b></div><div><b>${name}</b></div><div>inline sequence</div>`;
    if (element.kind === 'ibdframe') return `<div style="text-align:left"><b>${name}</b></div>`;
    if (element.kind === 'parametricframe') return `<div style="text-align:left"><b>${name}</b></div>`;
    if (element.kind === 'constraintproperty') {
      const classifier = element.classifierModelId && models && models[element.classifierModelId];
      const equations = classifier && Array.isArray(classifier.constraints)
        ? classifier.constraints.filter(Boolean)
        : [];
      return `${stereotype}<div><b>${name}</b></div>`
        + (equations.length
          ? `<hr/>${equations.map(value => `<div style="text-align:left">${htmlEscape(value)}</div>`).join('')}`
          : '');
    }
    if (element.kind === 'requirement') {
      const property = (label, value) =>
        `<div style="text-align:left"><b>${label}</b> = ${htmlEscape(value == null ? '' : value).replace(/\r?\n/g, '<br/>')}</div>`;
      return `${stereotype}<div><b>${name}</b></div><hr/>`
        + property('id', element.requirementId)
        + property('text', element.requirementText)
        + property('risk', element.risk || 'Medium')
        + property('verifyMethod', element.verificationMethod || 'Analysis');
    }
    if (['block', 'valuetype', 'interfaceblock', 'constraintblock'].includes(element.kind)) {
      const sections = [];
      const section = (label, values) => {
        const items = (values || []).filter(value => String(value).trim());
        if (!items.length) return;
        sections.push(
          '<hr/>',
          `<div style="text-align:left;font-style:italic;color:#5c6670">${htmlEscape(label)}</div>`,
          ...items.map(value => `<div style="text-align:left">${htmlEscape(value)}</div>`),
        );
      };
      if (element.kind === 'valuetype') {
        section('definition', [
          element.valueTypeUnit ? `unit = ${element.valueTypeUnit}` : '',
          element.quantityKind ? `quantityKind = ${element.quantityKind}` : '',
        ]);
        section('constraints', element.constraints);
        section('attributes', element.properties);
      } else if (element.kind === 'constraintblock') {
        section('constraints', element.constraints);
        section('parameters', element.constraintParameters);
        section('properties', element.properties);
      } else {
        section('constraints', element.constraints);
        section('parts', element.parts);
        section('references', element.references);
        section('values', element.values);
        section('flow properties', element.flowProperties);
        section('constraint properties', element.constraintProperties);
        section('properties', element.properties);
      }
      section('operations', element.operations);
      if (element.kind !== 'constraintblock') {
        section('receptions', (element.receptions || []).map(value => `«signal» ${value}`));
      }
      return `${stereotype}<div><b>${name}</b></div>${sections.join('')}`;
    }
    const memberHtml = members.length
      ? `<hr/>${members.map(member => `<div style="text-align:left">${htmlEscape(member)}</div>`).join('')}`
      : '';
    return `${stereotype}<div><b>${name}</b></div>${memberHtml}`;
  }

  function drawioVertexStyle(element, hasChildren) {
    const base = ['whiteSpace=wrap', 'html=1', 'rounded=0', 'strokeColor=#3f4148', 'fontColor=#202124'];
    const fill = element.fill === 'transparent' ? 'none' : (element.fill || '#fffbd8');
    base.push(`fillColor=${fill}`);
    if (hasChildren) base.push('container=1', 'recursiveResize=0');
    const additions = {
      actor: ['shape=umlActor', 'verticalLabelPosition=bottom', 'verticalAlign=top'],
      seqactor: ['shape=umlActor', 'verticalLabelPosition=bottom', 'verticalAlign=top'],
      usecase: ['ellipse', 'perimeter=ellipsePerimeter'],
      initial: ['ellipse', 'aspect=fixed', 'fillColor=#3f4148'],
      stateinitial: ['ellipse', 'aspect=fixed', 'fillColor=#3f4148'],
      final: ['ellipse', 'aspect=fixed', 'shape=doubleEllipse'],
      flowfinal: ['ellipse', 'aspect=fixed'],
      statefinal: ['ellipse', 'aspect=fixed', 'shape=doubleEllipse'],
      decision: ['rhombus', 'perimeter=rhombusPerimeter'],
      merge: ['rhombus', 'perimeter=rhombusPerimeter'],
      choice: ['rhombus', 'perimeter=rhombusPerimeter'],
      note: ['shape=note'],
      package: ['shape=folder', 'tabWidth=40', 'tabHeight=14'],
      model: ['shape=folder', 'tabWidth=40', 'tabHeight=14'],
      subsystem: ['shape=component'],
      metaclass: ['rounded=0'],
      stereotype: ['rounded=0'],
      informationitem: ['rounded=0'],
      requirement: ['rounded=0'],
      block: ['rounded=0'],
      valuetype: ['rounded=0'],
      interfaceblock: ['rounded=0'],
      constraintblock: ['rounded=0'],
      ibdframe: ['swimlane', 'horizontal=1', 'startSize=28', 'container=1', 'recursiveResize=0'],
      parametricframe: ['swimlane', 'horizontal=1', 'startSize=28', 'container=1', 'recursiveResize=0'],
      part: ['rounded=0'],
      reference: ['rounded=0', 'dashed=1'],
      value: ['rounded=0'],
      constraintproperty: ['rounded=0'],
      constraintparameter: ['aspect=fixed'],
      component: ['shape=component'],
      componentinstance: ['shape=component'],
      artifact: ['shape=document'],
      artifactinstance: ['shape=document'],
      node: ['shape=cube', 'size=12'],
      nodeinstance: ['shape=cube', 'size=12'],
      lifeline: ['shape=umlLifeline', 'perimeter=lifelinePerimeter'],
      process: ['ellipse', 'perimeter=ellipsePerimeter'],
      datastore: ['shape=datastore'],
      mindnode: ['rounded=1', 'arcSize=50'],
      action: ['rounded=1', 'arcSize=30'],
      sendsignal: ['shape=hexagon', 'direction=east'],
      acceptsignal: ['shape=hexagon', 'direction=west'],
      timeevent: ['shape=hexagon', 'direction=west'],
      forkbar: ['shape=line', 'strokeWidth=6', 'fillColor=none'],
      joinbar: ['shape=line', 'strokeWidth=6', 'fillColor=none'],
      swimlanev: ['swimlane', 'horizontal=1', 'startSize=32'],
      swimlaneh: ['swimlane', 'horizontal=0', 'startSize=40'],
      interruptibleregion: ['rounded=1', 'dashed=1', 'container=1'],
      structuredactivity: ['rounded=1', 'arcSize=20', 'container=1'],
      expansionregion: ['rounded=1', 'dashed=1', 'container=1'],
      inputpin: ['aspect=fixed'],
      outputpin: ['aspect=fixed'],
      expansioninput: ['aspect=fixed'],
      expansionoutput: ['aspect=fixed'],
      objectnode: ['rounded=0'],
      activityparameter: ['rounded=0'],
      centralbuffer: ['shape=datastore'],
      activitydatastore: ['shape=datastore'],
      interactionuse: ['swimlane', 'horizontal=1', 'startSize=24'],
      interactioninline: ['swimlane', 'horizontal=1', 'startSize=28'],
      state: ['rounded=1', 'arcSize=20'],
      compositestate: ['rounded=1', 'arcSize=20'],
      submachinestate: ['rounded=1', 'arcSize=20', 'double=1'],
      collaboration: ['ellipse', 'dashed=1'],
      collaborationuse: ['ellipse', 'dashed=1'],
      port: ['aspect=fixed'],
      timingstate: ['swimlane', 'horizontal=0', 'startSize=34'],
      timesegment: ['shape=line', 'strokeWidth=4', 'fillColor=none'],
      timetick: ['shape=line', 'dashed=1', 'fillColor=none'],
      timeconstraint: ['shape=note', 'fillColor=none'],
      durationconstraint: ['shape=line', 'fillColor=none'],
    }[element.kind] || [];
    return [...base, ...additions].join(';') + ';';
  }

  function drawioEdgeStyle(relation, from, to) {
    const style = ['edgeStyle=orthogonalEdgeStyle', 'rounded=0', 'html=1', 'strokeColor=#3f4148'];
    const kind = relation.kind;
    if (kind === 'bindingconnector') {
      style.push('orthogonalLoop=1', 'jettySize=auto');
      const jumpStyle = relation.jumpStyle || 'arc';
      if (jumpStyle !== 'none') style.push(`jumpStyle=${jumpStyle}`, 'jumpSize=6');
    }
    if (['association', 'connector', 'bindingconnector', 'link', 'commconnector', 'csconnector', 'commpath', 'mindbranch'].includes(kind)) {
      style.push('endArrow=none');
    } else if (kind === 'containment' || kind === 'reqcontainment') {
      style.push('endArrow=circlePlus', 'endFill=0');
    } else if (kind === 'extension') {
      style.push('endArrow=block', 'endFill=1');
    } else if (kind === 'generalization') {
      style.push('endArrow=block', 'endFill=0');
    } else if (kind === 'realization') {
      style.push('dashed=1', 'endArrow=block', 'endFill=0');
    } else if ([
      'dependency', 'include', 'extend', 'deploy', 'notelink', 'rolebinding',
      'exceptionhandler', 'informationflow', 'reqcopy', 'derivereqt',
      'verify', 'satisfy', 'refine', 'trace',
    ].includes(kind)) {
      style.push('dashed=1', 'endArrow=open', 'endFill=0');
    } else if (['controlflow', 'objectflow', 'activityinterrupt'].includes(kind)) {
      style.push('endArrow=open', 'endFill=0');
    } else if (kind === 'aggregation') {
      style.push('endArrow=diamondThin', 'endFill=0');
    } else if (kind === 'composition') {
      style.push('endArrow=diamondThin', 'endFill=1');
    } else if (['msg-async', 'comm-forward', 'comm-reverse'].includes(kind)) {
      style.push('endArrow=open', 'endFill=0');
    } else if (kind === 'msg-reply') {
      style.push('dashed=1', 'endArrow=open', 'endFill=0');
    } else if (kind === 'msg-destroy') {
      style.push('endArrow=cross');
    } else {
      style.push('endArrow=block', 'endFill=1');
    }
    if (RELATION_END_KINDS.has(kind) && !ER_RELATION_KINDS.has(kind)) {
      const appendEnd = (end, mxPrefix) => {
        const aggregation = exportEndAggregation(relation, end);
        const navigability = exportEndNavigability(relation, end);
        if (aggregation !== 'none') {
          style.push(`${mxPrefix}Arrow=diamondThin`, `${mxPrefix}Fill=${aggregation === 'composite' ? 1 : 0}`);
        } else if (navigability === 'navigable') {
          style.push(`${mxPrefix}Arrow=open`, `${mxPrefix}Fill=0`);
        } else if (navigability === 'notNavigable') {
          style.push(`${mxPrefix}Arrow=cross`, `${mxPrefix}Fill=0`);
        } else {
          style.push(`${mxPrefix}Arrow=none`);
        }
      };
      appendEnd('source', 'start');
      appendEnd('target', 'end');
    } else if (ER_RELATION_KINDS.has(kind)) {
      style.push(
        `startArrow=${erdDrawioArrow(relation.sourceLabel, erdDefaultCardinality(kind, 'source'))}`,
        `endArrow=${erdDrawioArrow(relation.targetLabel, erdDefaultCardinality(kind, 'target'))}`,
        'startFill=1', 'endFill=1',
      );
    }
    if (Number.isFinite(relation.y) && from && to) {
      const fromRatio = Math.max(0, Math.min(1, (relation.y - from.y) / Math.max(1, from.h)));
      const toRatio = Math.max(0, Math.min(1, (relation.y - to.y) / Math.max(1, to.h)));
      style.push('exitX=0.5', `exitY=${fromRatio.toFixed(4)}`, 'entryX=0.5', `entryY=${toRatio.toFixed(4)}`);
    }
    return style.join(';') + ';';
  }

  function elementDepth(element, byId) {
    let depth = 0;
    let current = element;
    const seen = new Set();
    while (current && current.parentId && !seen.has(current.parentId)) {
      seen.add(current.parentId);
      current = byId.get(current.parentId);
      if (current) depth++;
    }
    return depth;
  }

  function exportDrawio(diagram, models) {
    if (!diagram || !Array.isArray(diagram.elements) || !Array.isArray(diagram.relations)) {
      throw new Error('내보낼 다이어그램 데이터가 올바르지 않습니다.');
    }
    const allViews = [...diagram.elements, ...diagram.relations];
    const ids = makeIdMap(allViews, 'cell');
    const byId = new Map(diagram.elements.map(element => [element.id, element]));
    const childParents = new Set(diagram.elements.map(element => element.parentId).filter(Boolean));
    const cells = [];
    diagram.elements.slice().sort((a, b) => elementDepth(a, byId) - elementDepth(b, byId)).forEach(element => {
      const parent = element.parentId && byId.has(element.parentId) ? byId.get(element.parentId) : null;
      const x = Number.isFinite(element.x) ? element.x - (parent ? parent.x : 0) : 0;
      const y = Number.isFinite(element.y) ? element.y - (parent ? parent.y : 0) : 0;
      const width = Math.max(8, Number.isFinite(element.w) ? element.w : 120);
      const height = Math.max(8, Number.isFinite(element.h) ? element.h : 48);
      const commonMetadata = [
        ['umlName', element.name], ['umlStereotype', element.stereotype],
        ['umlText', element.text], ['umlLogicalName', element.logicalName],
        ['umlFill', element.fill],
      ].map(([name, value]) => ` ${name}="${xmlEscape(value || '')}"`).join('')
        + ` umlIsActor="${element.isActor ? 'true' : 'false'}"`
        + ` umlVisibility="${xmlEscape(element.visibility || 'public')}"`
        + ` umlAbstract="${element.isAbstract ? 'true' : 'false'}"`
        + [
          ['umlAttributes', element.attributes], ['umlOperations', element.operations],
          ['umlReceptions', element.receptions], ['umlLiterals', element.literals],
          ['umlColumns', element.columns],
        ].map(([name, values]) =>
          ` ${name}="${xmlEscape(JSON.stringify(Array.isArray(values) ? values : []))}"`).join('')
        + (element.kind === 'entity'
          ? [
            ['umlErdColumnDetails', element.erdColumnDetails || {}],
            ['umlErdChecks', Array.isArray(element.erdChecks) ? element.erdChecks : []],
            ['umlErdIndexes', Array.isArray(element.erdIndexes) ? element.erdIndexes : []],
          ].map(([name, value]) => ` ${name}="${xmlEscape(JSON.stringify(value))}"`).join('')
          : '');
      const iconScript = element.kind === 'stereotype' && element.iconContent
        ? ` umlIconScript="${xmlEscape(element.iconContent).replace(/\n/g, '&#10;')}"`
        : '';
      const interactionReference = (element.kind === 'interactionuse' || element.kind === 'interactioninline')
        ? ` umlInteractionDiagramId="${xmlEscape(element.interactionDiagramId || '')}"`
        : '';
      const requirementProperties = element.kind === 'requirement'
        ? ` umlRequirementType="${xmlEscape(element.requirementType || 'requirement')}"`
          + ` umlRequirementId="${xmlEscape(element.requirementId || '')}"`
          + ` umlRequirementText="${xmlEscape(element.requirementText || '')}"`
          + ` umlRisk="${xmlEscape(element.risk || 'Medium')}"`
          + ` umlVerificationMethod="${xmlEscape(element.verificationMethod || 'Analysis')}"`
        : '';
      const bddProperties = ['block', 'valuetype', 'interfaceblock', 'constraintblock'].includes(element.kind)
        ? [
          ['umlParts', element.parts], ['umlReferences', element.references],
          ['umlValues', element.values], ['umlFlowProperties', element.flowProperties],
          ['umlConstraintProperties', element.constraintProperties],
          ['umlProperties', element.properties], ['umlConstraints', element.constraints],
          ['umlConstraintParameters', element.constraintParameters],
        ].map(([name, values]) =>
          ` ${name}="${xmlEscape(JSON.stringify(Array.isArray(values) ? values : []))}"`).join('')
          + ` umlValueTypeUnit="${xmlEscape(element.valueTypeUnit || '')}"`
          + ` umlQuantityKind="${xmlEscape(element.quantityKind || '')}"`
        : '';
      const classifierReference = element.classifierModelId
        ? ` umlClassifierModelId="${xmlEscape(element.classifierModelId)}"`
        : '';
      const portReferences = element.kind === 'port'
        ? ` umlProvidedInterfaceModelId="${xmlEscape(element.providedInterfaceModelId || '')}"`
          + ` umlRequiredInterfaceModelId="${xmlEscape(element.requiredInterfaceModelId || '')}"`
        : '';
      const parametricProperties = element.kind === 'value'
        ? ` umlDefaultValue="${xmlEscape(element.defaultValue || '')}"`
        : '';
      cells.push(
        `        <mxCell id="${xmlEscape(ids.get(element.id))}" value="${xmlEscape(drawioElementHtml(element, models))}" style="${xmlEscape(drawioVertexStyle(element, childParents.has(element.id)))}" vertex="1" parent="${xmlEscape(parent ? ids.get(parent.id) : '1')}" umlKind="${xmlEscape(element.kind)}" umlModelId="${xmlEscape(element.modelId || '')}"${commonMetadata}${iconScript}${interactionReference}${requirementProperties}${bddProperties}${classifierReference}${portReferences}${parametricProperties}>`,
        `          <mxGeometry x="${x}" y="${y}" width="${width}" height="${height}" as="geometry"/>`,
        '        </mxCell>',
      );
    });
    diagram.relations.forEach(relation => {
      const from = byId.get(relation.from), to = byId.get(relation.to);
      if (!from || !to) return;
      const edgeLabel = relationLabel(relation, models);
      const required = relation.kind === 'extension' ? ` umlRequired="${relation.isRequired ? 'true' : 'false'}"` : '';
      const conveyed = relation.kind === 'informationflow'
        ? ` umlConveyedModelIds="${xmlEscape((relation.conveyedModelIds || []).join(','))}"`
        : '';
      const itemFlows = relation.kind === 'connector' && Array.isArray(relation.itemFlowModelIds)
        ? ` umlItemFlowModelIds="${xmlEscape(relation.itemFlowModelIds.join(','))}"`
        : '';
      const manualPoints = relation.kind === 'bindingconnector'
        && relation.routeMode === 'manual'
        && Array.isArray(relation.manualPoints)
        ? relation.manualPoints.filter(point => Number.isFinite(point?.x) && Number.isFinite(point?.y))
        : [];
      const routing = relation.kind === 'bindingconnector'
        ? ` umlRouteMode="${manualPoints.length || relation.routeMode === 'manual' ? 'manual' : 'auto'}"`
          + ` umlJumpStyle="${xmlEscape(relation.jumpStyle || 'arc')}"`
        : '';
      const relationEnds = RELATION_END_KINDS.has(relation.kind)
        ? [
          ['umlSourceEndName', relation.sourceEndName],
          ['umlSourceEndVisibility', relation.sourceEndVisibility],
          ['umlSourceEndStereotype', relation.sourceEndStereotype],
          ['umlSourceMultiplicity', relation.sourceLabel],
          ['umlSourceNavigability', relation.sourceNavigability],
          ['umlSourceAggregation', relation.sourceAggregation],
          ['umlSourceQualifiers', Array.isArray(relation.sourceQualifiers) ? relation.sourceQualifiers.join('\n') : ''],
          ['umlTargetEndName', relation.targetEndName],
          ['umlTargetEndVisibility', relation.targetEndVisibility],
          ['umlTargetEndStereotype', relation.targetEndStereotype],
          ['umlTargetMultiplicity', relation.targetLabel],
          ['umlTargetNavigability', relation.targetNavigability],
          ['umlTargetAggregation', relation.targetAggregation],
          ['umlTargetQualifiers', Array.isArray(relation.targetQualifiers) ? relation.targetQualifiers.join('\n') : ''],
          ['umlForeignKeyEnd', relation.foreignKeyEnd],
          ['umlSourceColumnName', relation.sourceColumnName],
          ['umlTargetColumnName', relation.targetColumnName],
          ['umlForeignKeyOnDelete', relation.foreignKeyOnDelete],
          ['umlForeignKeyOnUpdate', relation.foreignKeyOnUpdate],
        ].map(([key, value]) => ` ${key}="${xmlEscape(value || '')}"`).join('')
        : '';
      const relationMetadata = ` umlName="${xmlEscape(relation.name || '')}"`;
      const geometry = manualPoints.length
        ? [
          '          <mxGeometry relative="1" as="geometry">',
          '            <Array as="points">',
          ...manualPoints.map(point =>
            `              <mxPoint x="${point.x}" y="${point.y}"/>`),
          '            </Array>',
          '          </mxGeometry>',
        ]
        : ['          <mxGeometry relative="1" as="geometry"/>'];
      cells.push(
        `        <mxCell id="${xmlEscape(ids.get(relation.id))}" value="${xmlEscape(edgeLabel)}" style="${xmlEscape(drawioEdgeStyle(relation, from, to))}" edge="1" parent="1" source="${xmlEscape(ids.get(relation.from))}" target="${xmlEscape(ids.get(relation.to))}" umlKind="${xmlEscape(relation.kind)}" umlModelId="${xmlEscape(relation.modelId || '')}"${relationMetadata}${required}${conveyed}${itemFlows}${routing}${relationEnds}>`,
        ...geometry,
        '        </mxCell>',
      );
    });
    const pageWidth = Math.max(850, ...diagram.elements.map(element => (element.x || 0) + (element.w || 120) + 80));
    const pageHeight = Math.max(1100, ...diagram.elements.map(element => (element.y || 0) + (element.h || 48) + 80));
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<mxfile host="app.diagrams.net" agent="UML Studio V7 Professional" version="24.7.17" compressed="false">',
      `  <diagram id="${xmlEscape(`diagram_${diagram.id || '1'}`)}" name="${xmlEscape(diagram.name || 'Diagram')}" umlDiagramType="${xmlEscape(diagram.type || 'class')}">`,
      `    <mxGraphModel dx="0" dy="0" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${pageWidth}" pageHeight="${pageHeight}" math="0" shadow="0">`,
      '      <root>',
      '        <mxCell id="0"/>',
      '        <mxCell id="1" parent="0"/>',
      ...cells,
      '      </root>',
      '    </mxGraphModel>',
      '  </diagram>',
      '</mxfile>',
      '',
    ].join('\n');
  }

  return {
    ERD_DDL_DIALECTS,
    exportErdDdl,
    exportMermaid,
    exportDrawio,
    exportClassMermaid,
    exportSequenceMermaid,
    exportStateMermaid,
    exportRequirementMermaid,
    exportBlockDefinitionMermaid,
    exportFlowchartMermaid,
    xmlEscape,
  };
});
