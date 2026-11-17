'use strict';

/* Element measurement — the intrinsic minimum size of every view kind plus the
   label, stereotype and compartment text that size depends on.  measure() also
   returns the derived metrics (row offsets, compartment heights, wrapped text)
   that the renderers draw from, so the two never disagree. */
(function initElementMeasureModule(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UMLElementMeasure = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createElementMeasureModule() {
  const REQUIRED_FUNCTIONS = Object.freeze([
    'childViews',
    'dg',
    'parseColumn',
    'parseIconScript',
    'snapUp',
    'tw',
  ]);
  const REQUIRED_VALUES = Object.freeze([
    'state',
    'FONT12',
    'FONT13B',
    'FONT_FAMILY',
    'LINE_H',
    'TIMING_ROW_HEIGHT',
  ]);
  const VISIBILITY_SYMBOLS = Object.freeze({ public: '+', protected: '#', private: '-', package: '~' });

  function create(dependencies) {
    const deps = dependencies || {};
    const missing = REQUIRED_FUNCTIONS.filter(name => typeof deps[name] !== 'function');
    REQUIRED_VALUES.forEach(name => {
      if (deps[name] == null) missing.push(name);
    });
    if (deps.state && (deps.state.models == null || typeof deps.state.models !== 'object')) missing.push('state.models');
    if (missing.length) {
      throw new TypeError(`Element Measure 의존성이 없습니다: ${[...new Set(missing)].join(', ')}`);
    }

    const {
      childViews,
      dg,
      parseColumn,
      parseIconScript,
      snapUp,
      tw,
      state,
      FONT12,
      FONT13B,
      FONT_FAMILY,
      LINE_H,
      TIMING_ROW_HEIGHT,
    } = deps;

    const erdMode = () => dg().erdMode || 'physical';

    function stateBehaviorLines(e) {
      return [
        e.entry ? `entry / ${e.entry}` : '',
        e.doActivity ? `do / ${e.doActivity}` : '',
        e.exit ? `exit / ${e.exit}` : '',
        ...(e.internalTransitions || []),
      ].filter(Boolean);
    }

    function referencedStateMachineName(e) {
      const diagram = state.diagrams.find(d => d.id === e.submachineDiagramId);
      return diagram ? diagram.name : '(unassigned)';
    }

    function referencedInteraction(e) {
      return state.diagrams.find(d => d.id === e.interactionDiagramId && d.type === 'sequence') || null;
    }

    function referencedInteractionName(e) {
      const diagram = referencedInteraction(e);
      return diagram ? diagram.name : (e.name || '(unassigned)');
    }

    function instanceClassifier(e) {
      return e.classifierModelId ? state.models[e.classifierModelId] : null;
    }

    function instanceTitle(e) {
      const classifier = instanceClassifier(e);
      const typeName = classifier ? classifier.name : '';
      return typeName ? `${e.name || ''}: ${typeName}` : (e.name || ': (untyped)');
    }

    function lifelineTitle(e) {
      const classifier = instanceClassifier(e);
      return classifier && classifier.name ? `${e.name || ''}: ${classifier.name}` : (e.name || '');
    }

    function typedElementTitle(e) {
      const classifier = instanceClassifier(e);
      return classifier && classifier.name ? `${e.name || ''}: ${classifier.name}` : (e.name || '');
    }

    function ibdFrameTitle(e) {
      const classifier = instanceClassifier(e);
      return `ibd [${classifier?.name || e.name || 'Untyped Block'}]`;
    }

    function parametricFrameTitle(e) {
      const classifier = instanceClassifier(e);
      return `par [${classifier?.name || e.name || 'Untyped Constraint Block'}]`;
    }

    function constraintPropertyEquations(e) {
      const classifier = instanceClassifier(e);
      return classifier?.kind === 'constraintblock' && Array.isArray(classifier.constraints)
        ? classifier.constraints.filter(value => String(value).trim())
        : [];
    }

    function parseConstraintParameterDefinition(raw) {
      const normalized = String(raw || '')
        .trim()
        .replace(/^[+\-#~]\s*/, '')
        .split('=')[0]
        .trim();
      const match = normalized.match(/^([^:\s\[\]]+)\s*(?::\s*([^\[\]]+?))?\s*(?:\[[^\]]*\])?$/);
      if (!match) return null;
      return {
        name: match[1].trim(),
        typeName: String(match[2] || '').trim(),
      };
    }

    function collaborationUseTitle(e) {
      const collaboration = e.collaborationModelId ? state.models[e.collaborationModelId] : null;
      return collaboration && collaboration.name ? `${e.name || ''}: ${collaboration.name}` : (e.name || '');
    }

    function visibilitySymbol(value) {
      return VISIBILITY_SYMBOLS[value] || '';
    }

    function packageElementTitle(e) {
      const prefix = visibilitySymbol(e.visibility);
      return `${prefix}${prefix ? ' ' : ''}${e.name || ''}`;
    }

    function profileElementTitle(e) {
      const prefix = visibilitySymbol(e.visibility || 'public');
      return `${prefix}${prefix ? ' ' : ''}${e.name || ''}`;
    }

    function bddCompartments(e) {
      const sections = [];
      const add = (label, items) => {
        const values = (items || []).map(value => String(value)).filter(value => value.trim());
        if (values.length) sections.push({ label, items: values });
      };
      if (e.kind === 'valuetype') {
        add('definition', [
          e.valueTypeUnit ? `unit = ${e.valueTypeUnit}` : '',
          e.quantityKind ? `quantityKind = ${e.quantityKind}` : '',
        ]);
        add('constraints', e.constraints);
        add('attributes', e.properties);
        add('operations', e.operations);
        add('receptions', (e.receptions || []).map(value => `«signal» ${value}`));
      } else if (e.kind === 'constraintblock') {
        add('constraints', e.constraints);
        add('parameters', e.constraintParameters);
        add('properties', e.properties);
        add('operations', e.operations);
      } else {
        add('constraints', e.constraints);
        add('parts', e.parts);
        add('references', e.references);
        add('values', e.values);
        add('flow properties', e.flowProperties);
        add('constraint properties', e.constraintProperties);
        add('properties', e.properties);
        add('operations', e.operations);
        add('receptions', (e.receptions || []).map(value => `«signal» ${value}`));
      }
      return sections;
    }

    function wrapRequirementText(value, maxWidth = 248) {
      const paragraphs = String(value || '').split(/\r?\n/);
      const lines = [];
      paragraphs.forEach(paragraph => {
        const words = paragraph.trim().split(/\s+/).filter(Boolean);
        if (!words.length) { lines.push(''); return; }
        let line = '';
        words.forEach(word => {
          const candidate = line ? `${line} ${word}` : word;
          if (!line || tw(candidate, FONT12) <= maxWidth) {
            line = candidate;
            return;
          }
          lines.push(line);
          line = word;
        });
        if (line) lines.push(line);
      });
      return lines.length ? lines : [''];
    }

    function measure(e) {
      switch (e.kind) {
        case 'note': {
          const lines = (e.text || '').split('\n');
          let w = 70, h = lines.length * LINE_H + 18;
          lines.forEach(t => w = Math.max(w, tw(t, FONT12) + 30));
          return { minW: snapUp(w), minH: snapUp(Math.max(h, 40)), lines };
        }
        case 'requirement': {
          const stereo = `«${e.requirementType || 'requirement'}»`;
          const title = profileElementTitle(e);
          const textLines = wrapRequirementText(e.requirementText || '');
          const headH = 48;
          const bodyH = 10 + (4 + textLines.length) * LINE_H;
          const values = [
            stereo, title, `id = "${e.requirementId || ''}"`,
            `risk = ${e.risk || 'Medium'}`,
            `verifyMethod = ${e.verificationMethod || 'Analysis'}`,
          ];
          const minW = Math.max(272, ...values.map(value => tw(value, FONT12) + 28));
          return { minW: snapUp(minW), minH: headH + bodyH, stereo, title, textLines, headH, bodyH };
        }
        case 'block':
        case 'valuetype':
        case 'interfaceblock':
        case 'constraintblock': {
          const stereotype = ({
            block: 'block', valuetype: 'valueType',
            interfaceblock: 'interfaceBlock', constraintblock: 'constraintBlock',
          })[e.kind];
          const stereo = `«${stereotype}»`;
          const title = profileElementTitle(e);
          const compartments = bddCompartments(e);
          let minW = Math.max(216, tw(stereo, FONT12) + 32, tw(title, FONT13B) + 32);
          compartments.forEach(section => {
            section.h = 20 + section.items.length * LINE_H + 4;
            minW = Math.max(minW, tw(section.label, FONT12) + 32);
            section.items.forEach(item => { minW = Math.max(minW, tw(item, FONT12) + 30); });
          });
          const headH = 44;
          const minH = headH + compartments.reduce((sum, section) => sum + section.h, 0);
          return {
            minW: snapUp(minW), minH: Math.max(72, minH),
            stereo, title, compartments, headH,
          };
        }
        case 'ibdframe':
          return {
            minW: 640, minH: 440,
            title: ibdFrameTitle(e),
            tabW: snapUp(Math.max(176, tw(ibdFrameTitle(e), FONT13B) + 32)),
          };
        case 'parametricframe':
          return {
            minW: 640, minH: 440,
            title: parametricFrameTitle(e),
            tabW: snapUp(Math.max(192, tw(parametricFrameTitle(e), FONT13B) + 32)),
          };
        case 'package':
          return dg().type === 'package'
            ? { minW: snapUp(Math.max(224, tw(packageElementTitle(e), FONT13B) + 48)), minH: 152 }
            : { minW: snapUp(Math.max(120, tw(e.name, FONT13B) + 32)), minH: 64 };
        case 'model':
          return { minW: snapUp(Math.max(320, tw(packageElementTitle(e), FONT13B) + 64)), minH: 240 };
        case 'subsystem':
          return { minW: snapUp(Math.max(208, tw(packageElementTitle(e), FONT13B) + 72)), minH: 136 };
        case 'actor':
          return { minW: snapUp(Math.max(48, tw(e.name, FONT12) + 10)), minH: 72 };
        case 'usecase':
          return { minW: snapUp(Math.max(112, tw(e.name, FONT13B) + 48)), minH: 48 };
        case 'boundary':
          return { minW: snapUp(Math.max(160, tw(e.name, FONT13B) + 32)), minH: 120 };
        case 'action':
        case 'sendsignal':
        case 'acceptsignal':
        case 'timeevent':
          return { minW: snapUp(Math.max(96, tw(e.name, FONT13B) + 32)), minH: 40 };
        case 'initial': return { minW: 24, minH: 24 };
        case 'final':   return { minW: 28, minH: 28 };
        case 'flowfinal': return { minW: 26, minH: 26 };
        case 'decision':
        case 'merge':
          return { minW: snapUp(Math.max(64, tw(e.name, FONT12) + 44)), minH: 40 };
        case 'forkbar':
        case 'joinbar': return { minW: 96, minH: 8 };
        case 'swimlanev':
          return { minW: snapUp(Math.max(240, tw(e.name, FONT13B) + 48)), minH: 360 };
        case 'swimlaneh':
          return { minW: 480, minH: snapUp(Math.max(160, tw(e.name, FONT13B) + 48)) };
        case 'interruptibleregion':
          return { minW: snapUp(Math.max(280, tw(e.name, FONT13B) + 80)), minH: 184 };
        case 'structuredactivity':
          return { minW: snapUp(Math.max(240, tw(e.name, FONT13B) + 72)), minH: 160 };
        case 'expansionregion':
          return { minW: snapUp(Math.max(280, tw(e.name, FONT13B) + 96)), minH: 176 };
        case 'inputpin':
        case 'outputpin':
        case 'expansioninput':
        case 'expansionoutput':
          return { minW: 16, minH: 16 };
        case 'objectnode':
        case 'activityparameter':
          return { minW: snapUp(Math.max(104, tw(e.name, FONT13B) + 28)), minH: 40 };
        case 'centralbuffer':
        case 'activitydatastore':
          return { minW: snapUp(Math.max(128, tw(e.name, FONT13B) + 32)), minH: 56 };
        case 'lifeline': {
          const stereo = e.stereotype ? `«${e.stereotype}»` : '';
          const sH = stereo ? 14 : 0;
          const title = lifelineTitle(e);
          if (dg().type === 'timing') {
            const stateCount = childViews(e.id).filter(child => child.kind === 'timingstate').length;
            return {
              minW: 760, minH: Math.max(120, 44 + Math.max(1, stateCount) * TIMING_ROW_HEIGHT),
              stereo, title,
            };
          }
          if (e.isActor) {
            const w = Math.max(56, tw(title, FONT12) + 12, stereo ? tw(stereo, FONT12) + 12 : 0);
            return { minW: snapUp(w), minH: 52 + sH, stereo, title };
          }
          let w = Math.max(88, tw(title, FONT13B) + 24);
          if (stereo) w = Math.max(w, tw(stereo, FONT12) + 24);
          return { minW: snapUp(w), minH: 40 + sH, stereo, title };
        }
        case 'fragment': return { minW: 136, minH: 88 };
        case 'execution': return { minW: 12, minH: 20 };
        case 'frame':
          return { minW: 240, minH: 160 };
        case 'interactionuse':
          return { minW: snapUp(Math.max(140, tw(referencedInteractionName(e), FONT13B) + 56)), minH: 56 };
        case 'interactioninline':
          return { minW: snapUp(Math.max(360, tw(referencedInteractionName(e), FONT13B) + 88)), minH: 224 };
        case 'stateinvariant':
          return { minW: snapUp(Math.max(72, tw(e.name, FONT12) + 26)), minH: 28 };
        case 'continuation':
          return { minW: snapUp(Math.max(80, tw(e.name, FONT13B) + 34)), minH: 30 };
        case 'timingstate':
          return { minW: 760, minH: TIMING_ROW_HEIGHT };
        case 'timesegment':
          return { minW: 64, minH: 10 };
        case 'timetick':
          return { minW: 8, minH: 120 };
        case 'timeconstraint':
          return { minW: snapUp(Math.max(112, tw(e.constraint || e.name, FONT12) + 28)), minH: 28 };
        case 'durationconstraint':
          return { minW: snapUp(Math.max(144, tw(e.constraint || e.name, FONT12) + 36)), minH: 32 };
        case 'component':
          return { minW: snapUp(Math.max(128, tw(e.name, FONT13B) + 58)), minH: 56 };
        case 'interfaceball':
          return { minW: 20, minH: 20 };
        case 'artifact':
          return { minW: snapUp(Math.max(104, tw(e.name, FONT13B) + 44)), minH: 56 };
        case 'node': {
          let w = Math.max(128, tw(e.name, FONT13B) + 48);
          if (e.stereotype) w = Math.max(w, tw(`«${e.stereotype}»`, FONT12) + 48);
          return { minW: snapUp(w), minH: 80 };
        }
        case 'object': {
          const title = instanceTitle(e);
          const slots = e.slots || [];
          let w = Math.max(144, tw(title, FONT13B) + 28);
          slots.forEach(slot => w = Math.max(w, tw(slot, FONT12) + 24));
          const headH = 32;
          const slotH = slots.length ? slots.length * LINE_H + 10 : 18;
          return { minW: snapUp(w), minH: headH + slotH, headH, slots, slotH, title };
        }
        case 'artifactinstance':
          return { minW: snapUp(Math.max(144, tw(instanceTitle(e), FONT13B) + 48)), minH: 64, title: instanceTitle(e) };
        case 'componentinstance':
          return { minW: snapUp(Math.max(152, tw(instanceTitle(e), FONT13B) + 58)), minH: 64, title: instanceTitle(e) };
        case 'nodeinstance':
          return { minW: snapUp(Math.max(160, tw(instanceTitle(e), FONT13B) + 54)), minH: 88, title: instanceTitle(e) };
        case 'collaboration':
          return { minW: snapUp(Math.max(280, tw(e.name, FONT13B) + 64)), minH: 200, title: e.name || '' };
        case 'part': {
          const title = typedElementTitle(e);
          return { minW: snapUp(Math.max(152, tw(title, FONT13B) + 28)), minH: 64, title };
        }
        case 'reference':
        case 'value': {
          const typedTitle = typedElementTitle(e);
          const title = e.kind === 'value' && dg()?.type === 'parametric' && e.defaultValue
            ? `${typedTitle} = ${e.defaultValue}`
            : typedTitle;
          return { minW: snapUp(Math.max(152, tw(title, FONT13B) + 28)), minH: 64, title };
        }
        case 'constraintproperty': {
          const title = typedElementTitle(e);
          const equations = constraintPropertyEquations(e);
          const minW = Math.max(216, tw(title, FONT13B) + 32,
            ...equations.map(value => tw(value, FONT12) + 28));
          return {
            minW: snapUp(minW), minH: Math.max(88, 54 + equations.length * LINE_H),
            title, equations,
          };
        }
        case 'constraintparameter':
          return { minW: 18, minH: 18, title: typedElementTitle(e) };
        case 'port':
          return { minW: 18, minH: 18, title: e.name || '' };
        case 'collaborationuse': {
          const title = collaborationUseTitle(e);
          return { minW: snapUp(Math.max(176, tw(title, FONT13B) + 48)), minH: 72, title };
        }
        case 'entity': {
          const mode = erdMode();
          const cols = (e.columns || []).map(parseColumn);
          const headH = 24, RH = 17, GAP = 14;
          const F12B = `600 12px ${FONT_FAMILY}`;
          const mx = arr => arr.length ? Math.max(...arr) : 0;
          const wLog = mx(cols.map(c => tw(c.logical || c.phys, FONT12)));
          const wPhys = mx(cols.map(c => tw(c.phys, F12B)));
          const wType = mx(cols.map(c => tw(c.type, FONT12)));
          const showLog = mode !== 'physical';
          const showType = mode !== 'logical';
          const showPhys = mode !== 'logical';
          const maxKeyFlags = Math.max(1, ...cols.map(c => ['PK', 'FK'].filter(flag => c.flags.includes(flag)).length));
          const flagWidth = maxKeyFlags > 1 ? 45 : 26;
          let x = flagWidth; // explicit PK/FK badge column
          const xLog = x; if (showLog) x += wLog + GAP;
          const xType = x; if (showType && wType) x += wType + GAP;
          const xPhys = x; if (showPhys) x += wPhys + GAP;
          const wBody = x + 36; // null-constraint column
          const primaryTitle = mode === 'physical' ? e.name : (e.logicalName || e.name);
          const secondaryTitle = mode === 'both' && e.logicalName ? e.name : '';
          const wHead = tw(primaryTitle, FONT13B) + (secondaryTitle ? tw(secondaryTitle, FONT12) + 24 : 0) + 24;
          const aH = cols.length ? cols.length * RH + 6 : 14;
          return {
            minW: snapUp(Math.max(136, wBody, wHead)), minH: headH + aH,
            headH, aH, cols, RH, flagWidth, xLog, xType, xPhys, showLog, showType, showPhys,
            primaryTitle, secondaryTitle,
          };
        }
        case 'process':
          return { minW: snapUp(Math.max(96, tw(e.name, FONT13B) + 44)), minH: 64 };
        case 'external':
          return { minW: snapUp(Math.max(96, tw(e.name, FONT13B) + 28)), minH: 48 };
        case 'datastore':
          return { minW: snapUp(Math.max(120, tw(e.name, FONT13B) + 36)), minH: 40 };
        case 'mindnode':
          return { minW: snapUp(Math.max(64, tw(e.name, FONT13B) + 30)), minH: 40 };
        case 'state': {
          const behaviors = stateBehaviorLines(e);
          let w = Math.max(136, tw(e.name, FONT13B) + 32);
          behaviors.forEach(line => w = Math.max(w, tw(line, FONT12) + 24));
          const headH = 28;
          return { minW: snapUp(w), minH: headH + (behaviors.length ? behaviors.length * LINE_H + 10 : 20), headH, behaviors };
        }
        case 'compositestate': {
          const behaviors = stateBehaviorLines(e);
          let w = Math.max(280, tw(e.name, FONT13B) + 40);
          behaviors.forEach(line => w = Math.max(w, tw(line, FONT12) + 28));
          const headH = 28;
          const behaviorH = behaviors.length ? behaviors.length * LINE_H + 8 : 0;
          return { minW: snapUp(w), minH: 220, headH, behaviors, contentTop: headH + behaviorH };
        }
        case 'submachinestate': {
          const ref = referencedStateMachineName(e);
          const behaviors = stateBehaviorLines(e);
          let w = Math.max(208, tw(e.name, FONT13B) + 44, tw(`submachine: ${ref}`, FONT12) + 34);
          behaviors.forEach(line => w = Math.max(w, tw(line, FONT12) + 24));
          const headH = 48;
          return { minW: snapUp(w), minH: headH + (behaviors.length ? behaviors.length * LINE_H + 10 : 18), headH, behaviors, ref };
        }
        case 'region':
          return { minW: 160, minH: 72 };
        case 'stateinitial': return { minW: 20, minH: 20 };
        case 'statefinal': return { minW: 24, minH: 24 };
        case 'choice': return { minW: 32, minH: 32 };
        case 'junction': return { minW: 14, minH: 14 };
        case 'statefork': return { minW: 96, minH: 8 };
        case 'shallowhistory':
        case 'deephistory': return { minW: 30, minH: 30 };
        case 'entrypoint':
        case 'exitpoint':
        case 'connectionpointref': return { minW: 20, minH: 20 };
        case 'terminate': return { minW: 24, minH: 24 };
      }
      /* classifier-like elements */
      const stereo = e.kind === 'interface' ? '«interface»'
        : e.kind === 'enumeration' ? '«enumeration»'
        : e.kind === 'metaclass' ? '«metaclass»'
        : e.kind === 'stereotype' ? '«stereotype»'
        : e.kind === 'informationitem' ? `«${e.stereotype || 'information'}»`
        : (e.stereotype ? `«${e.stereotype}»` : null);
      const attrs = (e.kind === 'class' || e.kind === 'interface' || e.kind === 'stereotype' || e.kind === 'informationitem') ? (e.attributes || [])
        : e.kind === 'enumeration' ? (e.literals || []) : [];
      const ops = ['class', 'interface', 'enumeration', 'stereotype', 'informationitem'].includes(e.kind) ? (e.operations || []) : [];
      const receptions = e.kind === 'informationitem' ? (e.receptions || []) : [];
      const showAttrs = ['class', 'interface', 'enumeration', 'stereotype', 'informationitem'].includes(e.kind);
      const showOps = ['class', 'interface', 'enumeration', 'stereotype', 'informationitem'].includes(e.kind);
      const showReceptions = e.kind === 'informationitem';
      const icon = e.kind === 'stereotype' ? parseIconScript(e.iconContent || '') : null;
      const title = ['metaclass', 'stereotype', 'informationitem'].includes(e.kind) ? profileElementTitle(e) : e.name;

      let w = Math.max(e.kind === 'stereotype' ? 200 : e.kind === 'informationitem' ? 176 : 96, tw(title, FONT13B) + 28);
      if (stereo) w = Math.max(w, tw(stereo, FONT12) + 28);
      attrs.concat(ops).concat(receptions.map(value => `«signal» ${value}`))
        .forEach(t => w = Math.max(w, tw(t, FONT12) + 22));

      const hasIcon = !!(icon && icon.valid && icon.commands.length);
      const headH = hasIcon ? 64 : (stereo ? 15 : 0) + 20 + 7;
      const aH = attrs.length ? attrs.length * LINE_H + 9 : 12;
      const oH = ops.length ? ops.length * LINE_H + 9 : 12;
      const rH = receptions.length ? receptions.length * LINE_H + 9 : 12;
      const minH = headH + (showAttrs ? aH : 0) + (showOps ? oH : 0) + (showReceptions ? rH : 0);
      return {
        minW: snapUp(w), minH, stereo, attrs, ops, receptions, headH, aH, oH, rH,
        showAttrs, showOps, showReceptions, title, icon, hasIcon,
      };
    }

    function normalizeSize(e) {
      const m = measure(e);
      e._m = m;
      e.w = Math.max(e.w || 0, m.minW);
      e.h = Math.max(e.h || 0, m.minH);
    }

    return Object.freeze({
      bddCompartments,
      collaborationUseTitle,
      constraintPropertyEquations,
      erdMode,
      ibdFrameTitle,
      instanceClassifier,
      instanceTitle,
      lifelineTitle,
      measure,
      normalizeSize,
      packageElementTitle,
      parametricFrameTitle,
      parseConstraintParameterDefinition,
      profileElementTitle,
      referencedInteraction,
      referencedInteractionName,
      referencedStateMachineName,
      stateBehaviorLines,
      typedElementTitle,
      visibilitySymbol,
      wrapRequirementText,
    });
  }

  return Object.freeze({ REQUIRED_FUNCTIONS, REQUIRED_VALUES, VISIBILITY_SYMBOLS, create });
});
