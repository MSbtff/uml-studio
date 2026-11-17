'use strict';

(function initElementRenderer(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UMLElementRenderer = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createElementRendererModule() {
  const FAMILY_KINDS = Object.freeze({
    structure: Object.freeze(["note","requirement","block","valuetype","interfaceblock","constraintblock","ibdframe","parametricframe","package","model","subsystem","actor","usecase","boundary","collaboration","collaborationuse","part","reference","value","constraintproperty","constraintparameter","port"]),
    activity: Object.freeze(["swimlanev","swimlaneh","interruptibleregion","structuredactivity","expansionregion","inputpin","outputpin","expansioninput","expansionoutput","action","sendsignal","acceptsignal","timeevent","initial","final","flowfinal","decision","merge","forkbar","joinbar","objectnode","activityparameter","centralbuffer","activitydatastore"]),
    state: Object.freeze(["state","compositestate","submachinestate","region","stateinitial","statefinal","choice","junction","statefork","shallowhistory","deephistory","entrypoint","exitpoint","terminate","connectionpointref"]),
    interaction: Object.freeze(["timingstate","timesegment","timetick","timeconstraint","durationconstraint","lifeline","fragment","frame","interactionuse","interactioninline","stateinvariant","continuation","execution"]),
    runtime: Object.freeze(["object","componentinstance","artifactinstance","nodeinstance","component","interfaceball","artifact","node","entity","process","external","datastore","mindnode"]),
  });
  const FAMILY_BY_KIND = Object.freeze(Object.fromEntries(
    Object.entries(FAMILY_KINDS).flatMap(([family, kinds]) =>
      kinds.map(kind => [kind, family])),
  ));
  const REQUIRED_FUNCTIONS = Object.freeze([
    'el', 'text', 'measureText', 'currentDiagram', 'isMessage',
    'sequenceBottom', 'fragmentOperandLayout', 'packageElementTitle', 'compositePortDirection',
    'byId', 'childViews', 'timingConstraintAnchor',
    'referencedInteraction', 'referencedInteractionName',
  ]);

  function elementFamily(kind) {
    return FAMILY_BY_KIND[kind] || 'classifier';
  }

  function create(dependencies) {
    const deps = dependencies || {};
    const missing = REQUIRED_FUNCTIONS.filter(name => typeof deps[name] !== 'function');
    if (missing.length) {
      throw new TypeError(`요소 렌더러 의존성이 없습니다: ${missing.join(', ')}`);
    }

    const {
      el,
      text,
      measureText: tw,
      currentDiagram,
      isMessage,
      sequenceBottom,
      fragmentOperandLayout,
      packageElementTitle,
      compositePortDirection,
      byId,
      childViews,
      timingConstraintAnchor,
      referencedInteraction,
      referencedInteractionName,
    } = deps;
    const STROKE = deps.stroke || '#3d3a2e';
    const FILL_DEFAULT = deps.fillDefault || '#fffbd8';
    const TEXT_COLOR = deps.textColor || '#24231f';
    const LINE_H = deps.lineHeight || 15;
    const PAD = deps.padding || 8;
    const FONT13B = deps.font13Bold || '600 13px Arial';
    const DASH_REL = deps.dashRelation || '6 4';
    const DASH_LIFE = deps.dashLifeline || '6 5';
    const TIMING_LABEL_WIDTH = deps.timingLabelWidth || 176;
    const ERD_HEADER = deps.erdHeader || '#943126';
    const SHADOW = Object.freeze({ filter: 'url(#shadow)' });

    function drawErdColumnBadges(g, x, baseline, flags) {
      const badges = ['PK', 'FK'].filter(flag => flags.includes(flag));
      const palette = {
        PK: { fill: '#fff0bf', stroke: '#c58b13', text: '#704b00' },
        FK: { fill: '#dceeff', stroke: '#2f76b7', text: '#14558e' },
      };
      badges.forEach((flag, index) => {
        const bx = x + index * 20;
        const colors = palette[flag];
        const group = el('g', { 'pointer-events': 'none' }, g);
        el('rect', {
          x: bx, y: baseline - 10.5, width: 18, height: 11.5, rx: 2,
          fill: colors.fill, stroke: colors.stroke, 'stroke-width': .8,
        }, group);
        text(group, flag, bx + 9, baseline - 1.7, {
          bold: true, size: 7.5, color: colors.text, anchor: 'middle',
        });
      });
    }
    

    function drawStereotypeIcon(parent, icon, x, y, width, height) {
      if (!icon || !icon.valid || !icon.commands.length) return;
      const scale = Math.min(width / icon.width, height / icon.height);
      const ox = x + (width - icon.width * scale) / 2;
      const oy = y + (height - icon.height * scale) / 2;
      const group = el('g', { transform: `translate(${ox} ${oy}) scale(${scale})`, 'pointer-events': 'none' }, parent);
      const shapeAttrs = (command, filled) => ({
        fill: filled ? command.style.fill : 'none',
        stroke: filled ? 'none' : command.style.line,
        'stroke-width': command.style.width,
        opacity: command.style.alpha,
        ...(command.style.pattern.length ? { 'stroke-dasharray': command.style.pattern.join(' ') } : {}),
      });
      const box = values => ({
        x: Math.min(values[0], values[2]),
        y: Math.min(values[1], values[3]),
        width: Math.abs(values[2] - values[0]),
        height: Math.abs(values[3] - values[1]),
      });
      icon.commands.forEach(command => {
        const v = command.values;
        const filled = command.op.startsWith('f');
        if (command.op === 'l') {
          el('line', { x1: v[0], y1: v[1], x2: v[2], y2: v[3], ...shapeAttrs(command, false) }, group);
        } else if (command.op === 'r' || command.op === 'fr') {
          el('rect', { ...box(v), ...shapeAttrs(command, filled) }, group);
        } else if (command.op === 'rr' || command.op === 'frr') {
          el('rect', { ...box(v), rx: Math.max(0, v[4]), ...shapeAttrs(command, filled) }, group);
        } else if (command.op === 'e' || command.op === 'fe') {
          const b = box(v);
          el('ellipse', {
            cx: b.x + b.width / 2, cy: b.y + b.height / 2,
            rx: b.width / 2, ry: b.height / 2, ...shapeAttrs(command, filled),
          }, group);
        } else if (command.op === 'pl' || command.op === 'pg' || command.op === 'fp') {
          const points = [];
          for (let i = 0; i < v.length; i += 2) points.push(`${v[i]},${v[i + 1]}`);
          el(command.op === 'pl' ? 'polyline' : 'polygon', {
            points: points.join(' '), ...shapeAttrs(command, command.op === 'fp'),
          }, group);
        } else if (command.op === 'a' || command.op === 'fa') {
          const [cx, cy, radius, startAngle, endAngle] = v;
          const start = startAngle * Math.PI / 180, end = endAngle * Math.PI / 180;
          const p1 = { x: cx + Math.cos(start) * radius, y: cy + Math.sin(start) * radius };
          const p2 = { x: cx + Math.cos(end) * radius, y: cy + Math.sin(end) * radius };
          const span = ((endAngle - startAngle) % 360 + 360) % 360;
          const arc = `M ${p1.x} ${p1.y} A ${radius} ${radius} 0 ${span > 180 ? 1 : 0} 1 ${p2.x} ${p2.y}`;
          const d = command.op === 'fa' ? `${arc} L ${cx} ${cy} Z` : arc;
          el('path', { d, ...shapeAttrs(command, command.op === 'fa') }, group);
        }
      });
    }
    
    function drawInteractionPreview(parent, frame, diagram) {
      const inner = {
        x: frame.x + 16,
        y: frame.y + 36,
        w: Math.max(40, frame.w - 32),
        h: Math.max(40, frame.h - 48),
      };
      if (!diagram) {
        text(parent, 'Select a Sequence Diagram', frame.x + frame.w / 2, frame.y + frame.h / 2 + 4, {
          italic: true, color: '#6b7280', anchor: 'middle',
        });
        return;
      }
      const participants = diagram.elements
        .filter(view => view.kind === 'lifeline' || view.kind === 'seqactor')
        .sort((a, b) => (a.x || 0) - (b.x || 0))
        .slice(0, 5);
      if (!participants.length) {
        text(parent, 'Empty Sequence — double-click to edit', frame.x + frame.w / 2, frame.y + frame.h / 2 + 4, {
          italic: true, color: '#6b7280', anchor: 'middle',
        });
        return;
      }
      const xById = new Map();
      const gap = inner.w / participants.length;
      participants.forEach((participant, index) => {
        const x = inner.x + gap * (index + 0.5);
        xById.set(participant.id, x);
        const label = String(participant.name || 'lifeline').slice(0, 18);
        const headerW = Math.min(Math.max(52, gap - 14), 112);
        el('rect', {
          x: x - headerW / 2, y: inner.y, width: headerW, height: 24,
          fill: '#fffbd8', stroke: '#716f67', 'stroke-width': 0.9,
        }, parent);
        text(parent, label, x, inner.y + 16, { bold: true, size: 10, anchor: 'middle' });
        el('line', {
          x1: x, y1: inner.y + 24, x2: x, y2: inner.y + inner.h,
          stroke: '#8b8b85', 'stroke-width': 0.8, 'stroke-dasharray': '4 3',
        }, parent);
      });
      const messages = diagram.relations
        .filter(relation => isMessage(relation.kind) && xById.has(relation.from) && xById.has(relation.to))
        .sort((a, b) => (a.y || 0) - (b.y || 0))
        .slice(0, 8);
      const messageGap = Math.max(16, Math.min(25, (inner.h - 36) / Math.max(1, messages.length)));
      messages.forEach((message, index) => {
        const x1 = xById.get(message.from), x2 = xById.get(message.to);
        const y = inner.y + 42 + index * messageGap;
        const dash = message.kind === 'msg-reply' ? '4 3' : null;
        if (x1 === x2) {
          const loopW = Math.min(32, gap / 3);
          el('path', {
            d: `M ${x1} ${y} L ${x1 + loopW} ${y} L ${x1 + loopW} ${y + 10} L ${x1} ${y + 10}`,
            fill: 'none', stroke: '#575b62', 'stroke-width': 0.9,
            ...(dash ? { 'stroke-dasharray': dash } : {}),
          }, parent);
          el('path', {
            d: `M ${x1} ${y + 10} L ${x1 + 6} ${y + 6} L ${x1 + 6} ${y + 14} Z`,
            fill: message.kind === 'msg-sync' ? '#575b62' : '#ffffff', stroke: '#575b62', 'stroke-width': 0.8,
          }, parent);
        } else {
          el('line', {
            x1, y1: y, x2, y2: y,
            stroke: '#575b62', 'stroke-width': 0.9,
            ...(dash ? { 'stroke-dasharray': dash } : {}),
          }, parent);
          const direction = x2 > x1 ? -1 : 1;
          el('path', {
            d: `M ${x2} ${y} L ${x2 + direction * 7} ${y - 4} L ${x2 + direction * 7} ${y + 4} Z`,
            fill: message.kind === 'msg-sync' ? '#575b62' : '#ffffff', stroke: '#575b62', 'stroke-width': 0.8,
          }, parent);
        }
        if (message.name) {
          text(parent, String(message.name).slice(0, 24), Math.min(x1, x2) + Math.abs(x2 - x1) / 2, y - 3, {
            size: 9, anchor: 'middle', color: '#4a4f57',
          });
        }
      });
    }

    function drawStructureElement(e, context) {
      const { g, fill, m, cx, cy } = context;
      switch (e.kind) {
    case 'note': {
      const F = 12;
      el('path', {
        d: `M ${e.x} ${e.y} L ${e.x + e.w - F} ${e.y} L ${e.x + e.w} ${e.y + F} L ${e.x + e.w} ${e.y + e.h} L ${e.x} ${e.y + e.h} Z`,
        fill, stroke: STROKE, 'stroke-width': 1, ...SHADOW,
      }, g);
      el('path', {
        d: `M ${e.x + e.w - F} ${e.y} L ${e.x + e.w - F} ${e.y + F} L ${e.x + e.w} ${e.y + F}`,
        fill: 'none', stroke: STROKE, 'stroke-width': 1,
      }, g);
      m.lines.forEach((ln, i) => text(g, ln, e.x + 9, e.y + 16 + i * LINE_H));
      return;
    }
    case 'requirement': {
      el('rect', {
        x: e.x, y: e.y, width: e.w, height: e.h,
        fill: fill === FILL_DEFAULT ? '#edf4fa' : fill,
        stroke: STROKE, 'stroke-width': 1, ...SHADOW,
      }, g);
      text(g, m.stereo, cx, e.y + 15, { size: 11, anchor: 'middle' });
      text(g, m.title, cx, e.y + 34, { bold: true, size: 13, anchor: 'middle' });
      el('line', {
        x1: e.x, y1: e.y + m.headH, x2: e.x + e.w, y2: e.y + m.headH,
        stroke: STROKE, 'stroke-width': 1,
      }, g);
      let rowY = e.y + m.headH + 16;
      text(g, `id = "${e.requirementId || ''}"`, e.x + 10, rowY);
      rowY += LINE_H;
      text(g, 'text =', e.x + 10, rowY, { bold: true });
      m.textLines.forEach((line, index) => {
        rowY += LINE_H;
        const suffix = index === m.textLines.length - 1 ? '"' : '';
        text(g, `${index === 0 ? '"' : '  '}${line}${suffix}`, e.x + 22, rowY);
      });
      rowY += LINE_H;
      text(g, `risk = ${e.risk || 'Medium'}`, e.x + 10, rowY);
      rowY += LINE_H;
      text(g, `verifyMethod = ${e.verificationMethod || 'Analysis'}`, e.x + 10, rowY);
      return;
    }
    case 'block':
    case 'valuetype':
    case 'interfaceblock':
    case 'constraintblock': {
      el('rect', {
        x: e.x, y: e.y, width: e.w, height: e.h,
        fill: fill === FILL_DEFAULT ? '#edf4f7' : fill,
        stroke: STROKE, 'stroke-width': 1.1, ...SHADOW,
      }, g);
      text(g, m.stereo, cx, e.y + 15, { size: 11, anchor: 'middle' });
      text(g, m.title, cx, e.y + 34, {
        bold: true, size: 13, anchor: 'middle', italic: !!e.isAbstract,
      });
      let sectionY = e.y + m.headH;
      m.compartments.forEach(section => {
        el('line', {
          x1: e.x, y1: sectionY, x2: e.x + e.w, y2: sectionY,
          stroke: STROKE, 'stroke-width': 1,
        }, g);
        text(g, section.label, e.x + 8, sectionY + 14, {
          italic: true, size: 10, color: '#5c6670',
        });
        section.items.forEach((item, index) => text(
          g, item, e.x + 12, sectionY + 31 + index * LINE_H,
          { italic: /\{abstract\}/.test(item) },
        ));
        sectionY += section.h;
      });
      return;
    }
    case 'ibdframe': {
      el('rect', {
        x: e.x, y: e.y, width: e.w, height: e.h,
        fill: fill === FILL_DEFAULT ? '#f8fbfc' : fill,
        stroke: STROKE, 'stroke-width': 1.2, ...SHADOW,
      }, g);
      const tabH = 28;
      el('path', {
        d: `M ${e.x} ${e.y} H ${e.x + m.tabW} L ${e.x + m.tabW + 14} ${e.y + tabH} H ${e.x} Z`,
        fill: '#e5f0f3', stroke: STROKE, 'stroke-width': 1.2,
      }, g);
      text(g, m.title, e.x + 12, e.y + 19, { bold: true, size: 13 });
      return;
    }
    case 'parametricframe': {
      el('rect', {
        x: e.x, y: e.y, width: e.w, height: e.h,
        fill: fill === FILL_DEFAULT ? '#fbf9fd' : fill,
        stroke: STROKE, 'stroke-width': 1.2, ...SHADOW,
      }, g);
      const tabH = 28;
      el('path', {
        d: `M ${e.x} ${e.y} H ${e.x + m.tabW} L ${e.x + m.tabW + 14} ${e.y + tabH} H ${e.x} Z`,
        fill: '#eee8f4', stroke: STROKE, 'stroke-width': 1.2,
      }, g);
      text(g, m.title, e.x + 12, e.y + 19, { bold: true, size: 13 });
      return;
    }
    case 'package': {
      const TAB_W = Math.min(48, e.w - 16), TAB_H = 14;
      el('rect', { x: e.x, y: e.y, width: TAB_W, height: TAB_H, fill, stroke: STROKE, 'stroke-width': 1, ...SHADOW }, g);
      el('rect', { x: e.x, y: e.y + TAB_H, width: e.w, height: e.h - TAB_H, fill, stroke: STROKE, 'stroke-width': 1, ...SHADOW }, g);
      const titleY = currentDiagram().type === 'package' ? e.y + TAB_H + 22 : e.y + TAB_H + (e.h - TAB_H) / 2 + 4;
      if (currentDiagram().type === 'package' && e.stereotype) {
        text(g, `«${e.stereotype}»`, e.x + 10, titleY - 13, { italic: true, size: 10 });
      }
      text(g, packageElementTitle(e), currentDiagram().type === 'package' ? e.x + 10 : cx, titleY, {
        bold: true, size: 13, anchor: currentDiagram().type === 'package' ? 'start' : 'middle',
      });
      return;
    }
    case 'model': {
      const TAB_W = Math.min(56, e.w - 16), TAB_H = 16;
      el('rect', { x: e.x, y: e.y, width: TAB_W, height: TAB_H, fill, stroke: STROKE, 'stroke-width': 1.2, ...SHADOW }, g);
      el('rect', { x: e.x, y: e.y + TAB_H, width: e.w, height: e.h - TAB_H, fill, stroke: STROKE, 'stroke-width': 1.2, ...SHADOW }, g);
      text(g, '«model»', e.x + 12, e.y + TAB_H + 16, { italic: true, size: 10, color: '#6b6257' });
      text(g, packageElementTitle(e), e.x + 12, e.y + TAB_H + 33, { bold: true, size: 13 });
      el('path', {
        d: `M ${e.x + e.w - 30} ${e.y + TAB_H + 13} L ${e.x + e.w - 16} ${e.y + TAB_H + 20} L ${e.x + e.w - 30} ${e.y + TAB_H + 27} Z`,
        fill: '#ffffff', stroke: STROKE, 'stroke-width': 1,
      }, g);
      return;
    }
    case 'subsystem': {
      el('rect', { x: e.x, y: e.y, width: e.w, height: e.h, fill, stroke: STROKE, 'stroke-width': 1.2, ...SHADOW }, g);
      const ix = e.x + e.w - 28, iy = e.y + 8;
      el('rect', { x: ix, y: iy, width: 16, height: 20, fill: '#ffffff', stroke: STROKE, 'stroke-width': 1 }, g);
      el('rect', { x: ix - 5, y: iy + 3, width: 10, height: 5, fill: '#ffffff', stroke: STROKE, 'stroke-width': 1 }, g);
      el('rect', { x: ix - 5, y: iy + 12, width: 10, height: 5, fill: '#ffffff', stroke: STROKE, 'stroke-width': 1 }, g);
      text(g, '«subsystem»', e.x + 12, e.y + 20, { italic: true, size: 10, color: '#6b6257' });
      text(g, packageElementTitle(e), e.x + 12, e.y + 38, { bold: true, size: 13 });
      return;
    }
    case 'actor': {
      const hy = e.y + 8;
      el('rect', { x: e.x, y: e.y, width: e.w, height: e.h, fill: 'transparent', stroke: 'none' }, g);
      el('circle', { cx, cy: hy, r: 6, fill: '#ffffff', stroke: STROKE, 'stroke-width': 1.2 }, g);
      el('path', {
        d: `M ${cx} ${hy + 6} L ${cx} ${hy + 26} M ${cx - 11} ${hy + 12} L ${cx + 11} ${hy + 12} M ${cx} ${hy + 26} L ${cx - 9} ${hy + 40} M ${cx} ${hy + 26} L ${cx + 9} ${hy + 40}`,
        stroke: STROKE, 'stroke-width': 1.2, fill: 'none', 'stroke-linecap': 'round',
      }, g);
      text(g, e.name, cx, e.y + e.h - 4, { anchor: 'middle' });
      return;
    }
    case 'usecase':
      el('ellipse', { cx, cy, rx: e.w / 2, ry: e.h / 2, fill, stroke: STROKE, 'stroke-width': 1, ...SHADOW }, g);
      text(g, e.name, cx, cy + 4, { bold: true, size: 13, anchor: 'middle' });
      return;
    case 'boundary':
      el('rect', { x: e.x, y: e.y, width: e.w, height: e.h, fill: '#ffffff', stroke: STROKE, 'stroke-width': 1 }, g);
      text(g, e.name, cx, e.y + 17, { bold: true, size: 13, anchor: 'middle' });
      el('line', { x1: e.x, y1: e.y + 24, x2: e.x + e.w, y2: e.y + 24, stroke: STROKE, 'stroke-width': 1 }, g);
      return;
    case 'collaboration':
      el('ellipse', {
        cx, cy, rx: e.w / 2, ry: e.h / 2, fill, stroke: STROKE,
        'stroke-width': 1.2, 'stroke-dasharray': DASH_REL, ...SHADOW,
      }, g);
      text(g, '«collaboration»', cx, e.y + 24, { size: 11, anchor: 'middle' });
      text(g, e.name, cx, e.y + 42, { bold: true, size: 13, anchor: 'middle' });
      return;
    case 'collaborationuse':
      el('ellipse', {
        cx, cy, rx: e.w / 2, ry: e.h / 2, fill, stroke: STROKE,
        'stroke-width': 1.1, 'stroke-dasharray': DASH_REL, ...SHADOW,
      }, g);
      text(g, '«collaboration use»', cx, cy - 5, { size: 11, anchor: 'middle' });
      text(g, m.title, cx, cy + 13, { bold: true, size: 13, anchor: 'middle' });
      return;
    case 'part':
      el('rect', {
        x: e.x, y: e.y, width: e.w, height: e.h,
        fill, stroke: STROKE, 'stroke-width': 1, ...SHADOW,
      }, g);
      text(g, '«part»', cx, cy - 6, { size: 11, anchor: 'middle' });
      text(g, m.title, cx, cy + 13, { bold: true, size: 13, anchor: 'middle', underline: true });
      return;
    case 'reference':
    case 'value': {
      const isReference = e.kind === 'reference';
      el('rect', {
        x: e.x, y: e.y, width: e.w, height: e.h,
        fill: fill === FILL_DEFAULT ? (isReference ? '#eef6f8' : '#f7f4ec') : fill,
        stroke: STROKE, 'stroke-width': 1,
        ...(isReference ? { 'stroke-dasharray': '6 3' } : {}),
        ...SHADOW,
      }, g);
      text(g, isReference ? '«reference»' : '«value»', cx, cy - 6, { size: 11, anchor: 'middle' });
      text(g, m.title, cx, cy + 13, { bold: true, size: 13, anchor: 'middle', underline: true });
      return;
    }
    case 'constraintproperty': {
      el('rect', {
        x: e.x, y: e.y, width: e.w, height: e.h,
        fill: fill === FILL_DEFAULT ? '#f3edf8' : fill,
        stroke: STROKE, 'stroke-width': 1.1, ...SHADOW,
      }, g);
      text(g, '«constraint property»', cx, e.y + 17, { size: 11, anchor: 'middle' });
      text(g, m.title, cx, e.y + 36, { bold: true, size: 13, anchor: 'middle', underline: true });
      if (m.equations.length) {
        el('line', {
          x1: e.x, y1: e.y + 48, x2: e.x + e.w, y2: e.y + 48,
          stroke: STROKE, 'stroke-width': 1,
        }, g);
        m.equations.forEach((equation, index) =>
          text(g, equation, e.x + 10, e.y + 66 + index * LINE_H));
      }
      return;
    }
    case 'constraintparameter': {
      el('rect', {
        x: e.x, y: e.y, width: e.w, height: e.h,
        fill: fill === FILL_DEFAULT ? '#ffffff' : fill,
        stroke: STROKE, 'stroke-width': 1.3, ...SHADOW,
      }, g);
      const direction = compositePortDirection(e);
      if (m.title) {
        if (direction.x) {
          text(g, m.title, cx + direction.x * 14, cy - 10, {
            size: 11, anchor: direction.x > 0 ? 'start' : 'end',
          });
        } else {
          text(g, m.title, cx + 13, cy - direction.y * 12 + 4, { size: 11 });
        }
      }
      return;
    }
    case 'port': {
      el('rect', {
        x: e.x, y: e.y, width: e.w, height: e.h,
        fill, stroke: STROKE, 'stroke-width': 1.3, ...SHADOW,
      }, g);
      const direction = compositePortDirection(e);
      const perpendicular = { x: -direction.y, y: direction.x };
      const interfaceCount = Number(!!e.providedInterfaceModelId) + Number(!!e.requiredInterfaceModelId);
      const drawInterface = (provided, offset) => {
        const sx = cx + direction.x * (e.w / 2) + perpendicular.x * offset;
        const sy = cy + direction.y * (e.h / 2) + perpendicular.y * offset;
        const ex = sx + direction.x * 16, ey = sy + direction.y * 16;
        el('line', { x1: sx, y1: sy, x2: ex, y2: ey, stroke: STROKE, 'stroke-width': 1.2 }, g);
        if (provided) {
          el('circle', { cx: ex + direction.x * 6, cy: ey + direction.y * 6, r: 6, fill: '#ffffff', stroke: STROKE, 'stroke-width': 1.2 }, g);
        } else {
          const mx = ex + direction.x * 3, my = ey + direction.y * 3;
          el('path', {
            d: `M ${mx + perpendicular.x * 7} ${my + perpendicular.y * 7} Q ${mx - direction.x * 8} ${my - direction.y * 8} ${mx - perpendicular.x * 7} ${my - perpendicular.y * 7}`,
            fill: 'none', stroke: STROKE, 'stroke-width': 1.2,
          }, g);
        }
      };
      if (e.providedInterfaceModelId) drawInterface(true, interfaceCount > 1 ? 7 : 0);
      if (e.requiredInterfaceModelId) drawInterface(false, interfaceCount > 1 ? -7 : 0);
      if (m.title) {
        if (direction.x) {
          text(g, m.title, cx + direction.x * 14, cy - 10, {
            size: 11, anchor: direction.x > 0 ? 'start' : 'end',
          });
        } else {
          text(g, m.title, cx + 13, cy - direction.y * 12 + 4, { size: 11 });
        }
      }
      return;
    }
      }
    }

    function drawActivityElement(e, context) {
      const { g, fill, cx, cy } = context;
      switch (e.kind) {
    case 'swimlanev': {
      const headerH = 32;
      el('rect', { x: e.x, y: e.y, width: e.w, height: e.h, fill: fill === FILL_DEFAULT ? '#fffdf2' : fill, stroke: STROKE, 'stroke-width': 1.2, ...SHADOW }, g);
      el('line', { x1: e.x, y1: e.y + headerH, x2: e.x + e.w, y2: e.y + headerH, stroke: STROKE, 'stroke-width': 1 }, g);
      text(g, e.name, cx, e.y + 21, { bold: true, size: 13, anchor: 'middle' });
      return;
    }
    case 'swimlaneh': {
      const headerW = 40;
      el('rect', { x: e.x, y: e.y, width: e.w, height: e.h, fill: fill === FILL_DEFAULT ? '#fffdf2' : fill, stroke: STROKE, 'stroke-width': 1.2, ...SHADOW }, g);
      el('line', { x1: e.x + headerW, y1: e.y, x2: e.x + headerW, y2: e.y + e.h, stroke: STROKE, 'stroke-width': 1 }, g);
      const label = text(g, e.name, e.x + 24, cy, { bold: true, size: 13, anchor: 'middle' });
      label.setAttribute('transform', `rotate(-90 ${e.x + 24} ${cy})`);
      return;
    }
    case 'interruptibleregion':
      el('rect', {
        x: e.x, y: e.y, width: e.w, height: e.h, rx: 10,
        fill: fill === FILL_DEFAULT ? '#fffdf6' : fill, stroke: STROKE, 'stroke-width': 1.2,
        'stroke-dasharray': '8 4', ...SHADOW,
      }, g);
      text(g, '«interruptible»', e.x + 10, e.y + 15, { italic: true, size: 11, color: '#6b6257' });
      text(g, e.name, e.x + 10, e.y + 31, { bold: true, size: 12 });
      return;
    case 'structuredactivity':
      el('rect', {
        x: e.x, y: e.y, width: e.w, height: e.h, rx: 12,
        fill: fill === FILL_DEFAULT ? '#fff7ed' : fill, stroke: STROKE, 'stroke-width': 1.2, ...SHADOW,
      }, g);
      text(g, '«structured»', e.x + 10, e.y + 15, { italic: true, size: 11, color: '#6b6257' });
      text(g, e.name, e.x + 10, e.y + 32, { bold: true, size: 13 });
      el('line', { x1: e.x, y1: e.y + 40, x2: e.x + e.w, y2: e.y + 40, stroke: STROKE, 'stroke-width': 1 }, g);
      return;
    case 'expansionregion': {
      const mode = e.expansionMode || 'parallel';
      el('rect', {
        x: e.x, y: e.y, width: e.w, height: e.h, rx: 8,
        fill: fill === FILL_DEFAULT ? '#fff8ef' : fill, stroke: STROKE, 'stroke-width': 1.2,
        'stroke-dasharray': '5 3', ...SHADOW,
      }, g);
      text(g, `«${mode}»`, e.x + 10, e.y + 15, { italic: true, size: 11, color: '#6b6257' });
      text(g, e.name, e.x + 10, e.y + 32, { bold: true, size: 13 });
      return;
    }
    case 'inputpin':
    case 'outputpin':
    case 'expansioninput':
    case 'expansionoutput': {
      const expansion = e.kind === 'expansioninput' || e.kind === 'expansionoutput';
      el('rect', {
        x: e.x, y: e.y, width: e.w, height: e.h,
        fill: e.kind === 'outputpin' || e.kind === 'expansionoutput' ? '#f2c8b9' : '#ffffff',
        stroke: STROKE, 'stroke-width': 1.2, ...SHADOW,
      }, g);
      if (expansion) {
        [4, 8, 12].forEach(offset => el('line', {
          x1: e.x + offset, y1: e.y + 2, x2: e.x + offset, y2: e.y + e.h - 2,
          stroke: '#8a5d4c', 'stroke-width': 0.7,
        }, g));
      }
      return;
    }
    case 'action':
      el('rect', { x: e.x, y: e.y, width: e.w, height: e.h, rx: 11, fill, stroke: STROKE, 'stroke-width': 1, ...SHADOW }, g);
      text(g, e.name, cx, cy + 4, { bold: true, size: 13, anchor: 'middle' });
      return;
    case 'sendsignal':
      el('path', {
        d: `M ${e.x} ${e.y} L ${e.x + e.w - 18} ${e.y} L ${e.x + e.w} ${cy} L ${e.x + e.w - 18} ${e.y + e.h} L ${e.x} ${e.y + e.h} Z`,
        fill, stroke: STROKE, 'stroke-width': 1.1, ...SHADOW,
      }, g);
      text(g, e.name, cx - 4, cy + 4, { bold: true, size: 12, anchor: 'middle' });
      return;
    case 'acceptsignal':
    case 'timeevent': {
      el('path', {
        d: `M ${e.x} ${e.y} L ${e.x + e.w} ${e.y} L ${e.x + e.w} ${e.y + e.h} L ${e.x} ${e.y + e.h} L ${e.x + 16} ${cy} Z`,
        fill, stroke: STROKE, 'stroke-width': 1.1, ...SHADOW,
      }, g);
      if (e.kind === 'timeevent') {
        const clockX = e.x + 28;
        el('circle', { cx: clockX, cy, r: 8, fill: '#ffffff', stroke: STROKE, 'stroke-width': 1 }, g);
        el('path', { d: `M ${clockX} ${cy} L ${clockX} ${cy - 5} M ${clockX} ${cy} L ${clockX + 4} ${cy + 2}`, fill: 'none', stroke: STROKE, 'stroke-width': 1 }, g);
      }
      text(g, e.name, cx + (e.kind === 'timeevent' ? 12 : 4), cy + 4, { bold: true, size: 12, anchor: 'middle' });
      return;
    }
    case 'initial':
      el('circle', { cx, cy, r: Math.min(e.w, e.h) / 2, fill: STROKE, ...SHADOW }, g);
      return;
    case 'final': {
      const r = Math.min(e.w, e.h) / 2;
      el('circle', { cx, cy, r, fill: '#ffffff', stroke: STROKE, 'stroke-width': 1.2, ...SHADOW }, g);
      el('circle', { cx, cy, r: r - 4, fill: STROKE }, g);
      return;
    }
    case 'flowfinal': {
      const r = Math.min(e.w, e.h) / 2;
      el('circle', { cx, cy, r, fill: '#ffffff', stroke: STROKE, 'stroke-width': 1.2, ...SHADOW }, g);
      el('path', {
        d: `M ${cx - r * 0.55} ${cy - r * 0.55} L ${cx + r * 0.55} ${cy + r * 0.55} M ${cx + r * 0.55} ${cy - r * 0.55} L ${cx - r * 0.55} ${cy + r * 0.55}`,
        fill: 'none', stroke: STROKE, 'stroke-width': 1.5,
      }, g);
      return;
    }
    case 'decision':
    case 'merge':
      el('path', {
        d: `M ${cx} ${e.y} L ${e.x + e.w} ${cy} L ${cx} ${e.y + e.h} L ${e.x} ${cy} Z`,
        fill, stroke: STROKE, 'stroke-width': 1, ...SHADOW,
      }, g);
      text(g, e.name, cx, cy + 4, { anchor: 'middle' });
      return;
    case 'forkbar':
    case 'joinbar':
      el('rect', { x: e.x, y: e.y, width: e.w, height: e.h, rx: 2, fill: STROKE, ...SHADOW }, g);
      return;
    case 'objectnode':
    case 'activityparameter':
      el('rect', { x: e.x, y: e.y, width: e.w, height: e.h, fill, stroke: STROKE, 'stroke-width': 1, ...SHADOW }, g);
      text(g, e.name, cx, cy + 4, { bold: true, size: 12, anchor: 'middle', underline: e.kind === 'objectnode' });
      return;
    case 'centralbuffer':
    case 'activitydatastore':
      el('rect', { x: e.x, y: e.y, width: e.w, height: e.h, fill, stroke: STROKE, 'stroke-width': 1, ...SHADOW }, g);
      text(g, e.kind === 'centralbuffer' ? '«centralBuffer»' : '«datastore»', cx, e.y + 18, { italic: true, size: 11, anchor: 'middle' });
      text(g, e.name, cx, e.y + 38, { bold: true, size: 12, anchor: 'middle' });
      return;
      }
    }

    function drawStateElement(e, context) {
      const { g, fill, m, cx, cy } = context;
      switch (e.kind) {
    case 'state': {
      el('rect', { x: e.x, y: e.y, width: e.w, height: e.h, rx: 12, fill, stroke: STROKE, 'stroke-width': 1, ...SHADOW }, g);
      text(g, e.name, cx, e.y + 19, { bold: true, size: 13, anchor: 'middle' });
      el('line', { x1: e.x, y1: e.y + m.headH, x2: e.x + e.w, y2: e.y + m.headH, stroke: STROKE, 'stroke-width': 1 }, g);
      m.behaviors.forEach((line, i) => text(g, line, e.x + 9, e.y + m.headH + 16 + i * LINE_H));
      return;
    }
    case 'compositestate': {
      el('rect', { x: e.x, y: e.y, width: e.w, height: e.h, rx: 12, fill, stroke: STROKE, 'stroke-width': 1.2, ...SHADOW }, g);
      text(g, e.name, cx, e.y + 19, { bold: true, size: 13, anchor: 'middle' });
      el('line', { x1: e.x, y1: e.y + m.headH, x2: e.x + e.w, y2: e.y + m.headH, stroke: STROKE, 'stroke-width': 1 }, g);
      m.behaviors.forEach((line, i) => text(g, line, e.x + 9, e.y + m.headH + 15 + i * LINE_H));
      if (m.contentTop > m.headH) {
        el('line', { x1: e.x, y1: e.y + m.contentTop, x2: e.x + e.w, y2: e.y + m.contentTop, stroke: STROKE, 'stroke-width': 1 }, g);
      }
      return;
    }
    case 'submachinestate': {
      el('rect', { x: e.x, y: e.y, width: e.w, height: e.h, rx: 12, fill, stroke: STROKE, 'stroke-width': 1.2, ...SHADOW }, g);
      text(g, e.name, cx, e.y + 18, { bold: true, size: 13, anchor: 'middle' });
      text(g, `submachine: ${m.ref}`, cx, e.y + 36, { italic: true, size: 11, color: '#555b6b', anchor: 'middle' });
      el('line', { x1: e.x, y1: e.y + m.headH, x2: e.x + e.w, y2: e.y + m.headH, stroke: STROKE, 'stroke-width': 1 }, g);
      m.behaviors.forEach((line, i) => text(g, line, e.x + 9, e.y + m.headH + 16 + i * LINE_H));
      /* UML submachine-state glyph: two connection ticks joined by a bar. */
      const gx = e.x + e.w - 28, gy = e.y + e.h - 14;
      el('path', {
        d: `M ${gx} ${gy - 5} L ${gx} ${gy + 5} M ${gx} ${gy} L ${gx + 16} ${gy} M ${gx + 16} ${gy - 5} L ${gx + 16} ${gy + 5}`,
        fill: 'none', stroke: STROKE, 'stroke-width': 1.2, 'stroke-linecap': 'round',
      }, g);
      return;
    }
    case 'region': {
      const owner = byId(e.parentId);
      const siblings = owner ? childViews(owner.id).filter(x => x.kind === 'region').sort((a, b) => a.regionOrder - b.regionOrder) : [];
      const first = !siblings.length || siblings[0].id === e.id;
      if (!first) {
        el('line', {
          x1: e.x, y1: e.y, x2: e.x + e.w, y2: e.y,
          stroke: '#6d7280', 'stroke-width': 1, 'stroke-dasharray': '7 4',
        }, g);
      }
      text(g, e.name || `Region ${e.regionOrder + 1}`, e.x + 9, e.y + 15, { italic: true, size: 11, color: '#666b78' });
      return;
    }
    case 'stateinitial':
      el('circle', { cx, cy, r: Math.min(e.w, e.h) / 2, fill: STROKE, ...SHADOW }, g);
      return;
    case 'statefinal': {
      const r = Math.min(e.w, e.h) / 2;
      el('circle', { cx, cy, r, fill: '#ffffff', stroke: STROKE, 'stroke-width': 1.2, ...SHADOW }, g);
      el('circle', { cx, cy, r: r - 4, fill: STROKE }, g);
      return;
    }
    case 'choice':
      el('path', {
        d: `M ${cx} ${e.y} L ${e.x + e.w} ${cy} L ${cx} ${e.y + e.h} L ${e.x} ${cy} Z`,
        fill, stroke: STROKE, 'stroke-width': 1, ...SHADOW,
      }, g);
      return;
    case 'junction':
      el('circle', { cx, cy, r: Math.min(e.w, e.h) / 2, fill: STROKE, ...SHADOW }, g);
      return;
    case 'statefork':
      el('rect', { x: e.x, y: e.y, width: e.w, height: e.h, rx: 2, fill: STROKE, ...SHADOW }, g);
      return;
    case 'shallowhistory':
    case 'deephistory': {
      const r = Math.min(e.w, e.h) / 2;
      el('circle', { cx, cy, r, fill: '#ffffff', stroke: STROKE, 'stroke-width': 1.2, ...SHADOW }, g);
      text(g, e.kind === 'deephistory' ? 'H*' : 'H', cx, cy + 4, { bold: true, size: e.kind === 'deephistory' ? 10 : 12, anchor: 'middle' });
      return;
    }
    case 'entrypoint':
      el('circle', { cx, cy, r: Math.min(e.w, e.h) / 2, fill: '#ffffff', stroke: STROKE, 'stroke-width': 1.4, ...SHADOW }, g);
      return;
    case 'exitpoint':
      el('circle', { cx, cy, r: Math.min(e.w, e.h) / 2, fill: '#ffffff', stroke: STROKE, 'stroke-width': 1.4, ...SHADOW }, g);
      el('path', { d: `M ${cx - 4} ${cy - 4} L ${cx + 4} ${cy + 4} M ${cx + 4} ${cy - 4} L ${cx - 4} ${cy + 4}`, fill: 'none', stroke: STROKE, 'stroke-width': 1.3 }, g);
      return;
    case 'terminate':
      el('path', { d: `M ${e.x + 2} ${e.y + 2} L ${e.x + e.w - 2} ${e.y + e.h - 2} M ${e.x + e.w - 2} ${e.y + 2} L ${e.x + 2} ${e.y + e.h - 2}`, fill: 'none', stroke: STROKE, 'stroke-width': 2.2, 'stroke-linecap': 'round', ...SHADOW }, g);
      return;
    case 'connectionpointref': {
      const r = Math.min(e.w, e.h) / 2;
      el('circle', { cx, cy, r, fill: '#ffffff', stroke: STROKE, 'stroke-width': 1.5, ...SHADOW }, g);
      if ((e.referenceKind || 'entry') === 'exit') {
        el('path', { d: `M ${cx - 4} ${cy - 4} L ${cx + 4} ${cy + 4} M ${cx + 4} ${cy - 4} L ${cx - 4} ${cy + 4}`, fill: 'none', stroke: STROKE, 'stroke-width': 1.3 }, g);
      }
      return;
    }
      }
    }

    function drawInteractionElement(e, context) {
      const { g, fill, m, cx, cy } = context;
      switch (e.kind) {
    case 'timingstate': {
      el('line', {
        x1: e.x, y1: e.y, x2: e.x + e.w, y2: e.y,
        stroke: '#a9a79e', 'stroke-width': 1,
      }, g);
      el('line', {
        x1: e.x + TIMING_LABEL_WIDTH, y1: e.y,
        x2: e.x + TIMING_LABEL_WIDTH, y2: e.y + e.h,
        stroke: STROKE, 'stroke-width': 1,
      }, g);
      text(g, e.name, e.x + TIMING_LABEL_WIDTH - 12, cy + 4, { bold: true, anchor: 'end' });
      return;
    }
    case 'timesegment': {
      el('rect', {
        x: e.x, y: e.y - 5, width: e.w, height: e.h + 10,
        fill: 'transparent', stroke: 'none',
      }, g);
      el('line', {
        x1: e.x, y1: cy, x2: e.x + e.w, y2: cy,
        stroke: e.fill || '#ad6b3d', 'stroke-width': 5, 'stroke-linecap': 'round',
      }, g);
      el('line', { x1: e.x, y1: cy - 8, x2: e.x, y2: cy + 8, stroke: STROKE, 'stroke-width': 1.2 }, g);
      el('line', { x1: e.x + e.w, y1: cy - 8, x2: e.x + e.w, y2: cy + 8, stroke: STROKE, 'stroke-width': 1.2 }, g);
      if (e.startTime != null && e.startTime !== '' && e.endTime != null && e.endTime !== '') {
        text(g, `${e.startTime}–${e.endTime}`, cx, cy - 9, { size: 10, color: '#6b4b35', anchor: 'middle' });
      }
      return;
    }
    case 'timetick': {
      const x = e.x + e.w / 2;
      el('rect', { x: e.x - 5, y: e.y, width: e.w + 10, height: e.h + 28, fill: 'transparent', stroke: 'none' }, g);
      el('line', {
        x1: x, y1: e.y, x2: x, y2: e.y + e.h,
        stroke: '#aaa79d', 'stroke-width': 1, 'stroke-dasharray': '3 4',
      }, g);
      el('line', { x1: x, y1: e.y + e.h - 7, x2: x, y2: e.y + e.h + 5, stroke: STROKE, 'stroke-width': 1.2 }, g);
      text(g, e.timeValue || e.name, x, e.y + e.h + 20, { size: 11, anchor: 'middle' });
      return;
    }
    case 'timeconstraint': {
      const label = e.constraint || e.name || '{time}';
      const anchor = timingConstraintAnchor(e.constrainedViewId, currentDiagram(), e.anchorRatio);
      el('line', {
        x1: cx, y1: e.y + e.h, x2: anchor ? anchor.x : cx, y2: anchor ? anchor.y : e.y + e.h + 10,
        stroke: STROKE, 'stroke-width': 1,
      }, g);
      el('path', {
        d: `M ${e.x + 8} ${e.y + e.h - 5} L ${e.x + 8} ${e.y + 5} L ${e.x + e.w - 8} ${e.y + 5} L ${e.x + e.w - 8} ${e.y + e.h - 5}`,
        fill: 'none', stroke: STROKE, 'stroke-width': 1,
      }, g);
      text(g, label, cx, e.y + 19, { size: 11, anchor: 'middle' });
      return;
    }
    case 'durationconstraint': {
      const label = e.constraint || e.name || '{duration}';
      const y = cy + 4;
      el('line', { x1: e.x, y1: y, x2: e.x + e.w, y2: y, stroke: STROKE, 'stroke-width': 1.1 }, g);
      el('path', {
        d: `M ${e.x} ${y - 8} L ${e.x} ${y + 8} M ${e.x + e.w} ${y - 8} L ${e.x + e.w} ${y + 8}`,
        fill: 'none', stroke: STROKE, 'stroke-width': 1.1,
      }, g);
      text(g, label, cx, e.y + 11, { size: 11, anchor: 'middle' });
      return;
    }
    case 'lifeline': {
      if (currentDiagram().type === 'timing') {
        el('rect', {
          x: e.x, y: e.y, width: e.w, height: e.h,
          fill: '#ffffff', stroke: STROKE, 'stroke-width': 1.2, ...SHADOW,
        }, g);
        el('rect', {
          x: e.x, y: e.y, width: TIMING_LABEL_WIDTH, height: 44,
          fill, stroke: 'none',
        }, g);
        el('line', {
          x1: e.x, y1: e.y + 44, x2: e.x + e.w, y2: e.y + 44,
          stroke: STROKE, 'stroke-width': 1,
        }, g);
        el('line', {
          x1: e.x + TIMING_LABEL_WIDTH, y1: e.y,
          x2: e.x + TIMING_LABEL_WIDTH, y2: e.y + e.h,
          stroke: STROKE, 'stroke-width': 1,
        }, g);
        if (m.stereo) text(g, m.stereo, e.x + TIMING_LABEL_WIDTH / 2, e.y + 15, { size: 10, anchor: 'middle' });
        text(g, m.title, e.x + TIMING_LABEL_WIDTH / 2, e.y + (m.stereo ? 33 : 27), {
          bold: true, size: 13, anchor: 'middle', underline: true,
        });
        text(g, 'time →', e.x + e.w - 12, e.y + 27, { size: 10, color: '#6f6b62', anchor: 'end' });
        return;
      }
      if (currentDiagram().type === 'sequence') {
        el('line', {
          x1: cx, y1: e.y + e.h, x2: cx, y2: sequenceBottom(),
          stroke: STROKE, 'stroke-width': 1, 'stroke-dasharray': DASH_LIFE,
        }, g);
      }
      if (e.isActor) {
        /* «stereotype» on top, stick-figure head, name below */
        let topY = e.y;
        if (m.stereo) { text(g, m.stereo, cx, e.y + 11, { anchor: 'middle', size: 11 }); topY = e.y + 14; }
        const hy = topY + 8;
        el('circle', { cx, cy: hy, r: 6, fill: '#ffffff', stroke: STROKE, 'stroke-width': 1.2 }, g);
        el('path', {
          d: `M ${cx} ${hy + 6} L ${cx} ${hy + 24} M ${cx - 10} ${hy + 12} L ${cx + 10} ${hy + 12} M ${cx} ${hy + 24} L ${cx - 8} ${hy + 38} M ${cx} ${hy + 24} L ${cx + 8} ${hy + 38}`,
          stroke: STROKE, 'stroke-width': 1.2, fill: 'none', 'stroke-linecap': 'round',
        }, g);
        text(g, m.title, cx, e.y + e.h - 2, { bold: true, anchor: 'middle' });
      } else {
        el('rect', { x: e.x, y: e.y, width: e.w, height: e.h, fill, stroke: STROKE, 'stroke-width': 1, ...SHADOW }, g);
        let ny = e.y + e.h / 2 + 4;
        if (m.stereo) { text(g, m.stereo, cx, e.y + 13, { anchor: 'middle', size: 11 }); ny = e.y + e.h / 2 + 10; }
        text(g, m.title, cx, ny, { bold: true, size: 13, anchor: 'middle' });
        /* underline — UML instance notation */
        const nw = tw(m.title, FONT13B);
        el('line', { x1: cx - nw / 2, y1: ny + 3, x2: cx + nw / 2, y2: ny + 3, stroke: TEXT_COLOR, 'stroke-width': 0.8 }, g);
      }
      return;
    }
    case 'fragment': {
      el('rect', { x: e.x, y: e.y, width: e.w, height: e.h, fill: 'none', stroke: STROKE, 'stroke-width': 1 }, g);
      /* interaction operands: dashed dividers split the body into regions,
         each with its own guard ([success] / [else] …) */
      const operands = e.operands && e.operands.length ? e.operands : [];
      if (operands.length) {
        const { boundaries } = fragmentOperandLayout(e);
        operands.forEach((guard, i) => {
          const ry = boundaries[i];
          if (i > 0) el('line', {
            x1: e.x, y1: ry, x2: e.x + e.w, y2: ry,
            stroke: STROKE, 'stroke-width': 1, 'stroke-dasharray': '6 4',
          }, g);
          if (guard) text(g, guard, e.x + 8, ry + 14, { italic: true });
        });
      }
      const LW = Math.max(46, tw(e.operator || 'alt', FONT13B) + 22);
      el('path', {
        d: `M ${e.x} ${e.y} L ${e.x + LW} ${e.y} L ${e.x + LW} ${e.y + 13} L ${e.x + LW - 8} ${e.y + 21} L ${e.x} ${e.y + 21} Z`,
        fill: '#f3f3ea', stroke: STROKE, 'stroke-width': 1,
      }, g);
      text(g, e.operator || 'alt', e.x + 8, e.y + 15, { bold: true });
      /* first-region guard sits next to the operator label (unless operands drive it) */
      if (e.condition && !operands.length) text(g, e.condition, e.x + LW + 8, e.y + 15, { italic: true });
      return;
    }
    case 'frame': {
      el('rect', { x: e.x, y: e.y, width: e.w, height: e.h, fill: 'none', stroke: STROKE, 'stroke-width': 1.2 }, g);
      const lbl = 'sd ' + e.name;
      const LW = tw(lbl, FONT13B) + 24;
      el('path', {
        d: `M ${e.x} ${e.y} L ${e.x + LW} ${e.y} L ${e.x + LW} ${e.y + 14} L ${e.x + LW - 10} ${e.y + 24} L ${e.x} ${e.y + 24} Z`,
        fill: '#f3f3ea', stroke: STROKE, 'stroke-width': 1.2,
      }, g);
      text(g, lbl, e.x + 9, e.y + 17, { bold: true, size: 13 });
      return;
    }
    case 'interactionuse': {
      el('rect', { x: e.x, y: e.y, width: e.w, height: e.h, fill, stroke: STROKE, 'stroke-width': 1, ...SHADOW }, g);
      const LW = tw('ref', FONT13B) + 22;
      el('path', {
        d: `M ${e.x} ${e.y} L ${e.x + LW} ${e.y} L ${e.x + LW} ${e.y + 13} L ${e.x + LW - 8} ${e.y + 21} L ${e.x} ${e.y + 21} Z`,
        fill: '#f3f3ea', stroke: STROKE, 'stroke-width': 1,
      }, g);
      text(g, 'ref', e.x + 8, e.y + 15, { bold: true });
      text(g, referencedInteractionName(e), cx, e.y + e.h / 2 + 10, { bold: true, size: 13, anchor: 'middle' });
      return;
    }
    case 'interactioninline': {
      const referenced = referencedInteraction(e);
      el('rect', {
        x: e.x, y: e.y, width: e.w, height: e.h,
        fill: fill === FILL_DEFAULT ? '#ffffff' : fill,
        stroke: STROKE, 'stroke-width': 1.2, ...SHADOW,
      }, g);
      const label = `sd ${referencedInteractionName(e)}`;
      const LW = Math.min(e.w - 24, Math.max(72, tw(label, FONT13B) + 24));
      el('path', {
        d: `M ${e.x} ${e.y} L ${e.x + LW} ${e.y} L ${e.x + LW} ${e.y + 14} L ${e.x + LW - 10} ${e.y + 24} L ${e.x} ${e.y + 24} Z`,
        fill: '#eef4fb', stroke: STROKE, 'stroke-width': 1.2,
      }, g);
      text(g, label, e.x + 9, e.y + 17, { bold: true, size: 13 });
      drawInteractionPreview(g, e, referenced);
      return;
    }
    case 'stateinvariant':
      el('rect', { x: e.x, y: e.y, width: e.w, height: e.h, rx: e.h / 2, fill: '#fffef2', stroke: STROKE, 'stroke-width': 1, ...SHADOW }, g);
      text(g, '{' + e.name + '}', cx, cy + 4, { anchor: 'middle' });
      return;
    case 'continuation':
      el('rect', { x: e.x, y: e.y, width: e.w, height: e.h, rx: e.h / 2, fill, stroke: STROKE, 'stroke-width': 1, ...SHADOW }, g);
      text(g, e.name, cx, cy + 4, { bold: true, size: 13, anchor: 'middle' });
      return;
    case 'execution': {
      /* execution specification bar; colour follows its lifeline */
      const life = currentDiagram().elements.find(l => l.id === e.lifeId);
      const barFill = (life && life.fill) || FILL_DEFAULT;
      el('rect', { x: e.x, y: e.y, width: e.w, height: e.h, fill: barFill, stroke: STROKE, 'stroke-width': 1 }, g);
      return;
    }
      }
    }

    function drawRuntimeElement(e, context) {
      const { g, fill, m, cx, cy } = context;
      switch (e.kind) {
    case 'object': {
      el('rect', { x: e.x, y: e.y, width: e.w, height: e.h, fill, stroke: STROKE, 'stroke-width': 1, ...SHADOW }, g);
      text(g, m.title, cx, e.y + 20, { bold: true, size: 13, anchor: 'middle', underline: true });
      el('line', { x1: e.x, y1: e.y + m.headH, x2: e.x + e.w, y2: e.y + m.headH, stroke: STROKE, 'stroke-width': 1 }, g);
      m.slots.forEach((slot, i) => text(g, slot, e.x + 9, e.y + m.headH + 16 + i * LINE_H));
      return;
    }
    case 'componentinstance': {
      el('rect', { x: e.x, y: e.y, width: e.w, height: e.h, fill, stroke: STROKE, 'stroke-width': 1, ...SHADOW }, g);
      const ix = e.x + e.w - 24, iy = e.y + 7;
      el('rect', { x: ix, y: iy, width: 14, height: 17, fill: '#ffffff', stroke: STROKE, 'stroke-width': 1 }, g);
      el('rect', { x: ix - 5, y: iy + 3, width: 10, height: 4, fill: '#ffffff', stroke: STROKE, 'stroke-width': 1 }, g);
      el('rect', { x: ix - 5, y: iy + 10, width: 10, height: 4, fill: '#ffffff', stroke: STROKE, 'stroke-width': 1 }, g);
      text(g, '«component instance»', cx, cy - 5, { size: 11, anchor: 'middle' });
      text(g, m.title, cx, cy + 12, { bold: true, size: 13, anchor: 'middle', underline: true });
      return;
    }
    case 'artifactinstance': {
      el('rect', { x: e.x, y: e.y, width: e.w, height: e.h, fill, stroke: STROKE, 'stroke-width': 1, ...SHADOW }, g);
      const ix = e.x + e.w - 22, iy = e.y + 6, iw = 12, ih = 15, fd = 4;
      el('path', {
        d: `M ${ix} ${iy} L ${ix + iw - fd} ${iy} L ${ix + iw} ${iy + fd} L ${ix + iw} ${iy + ih} L ${ix} ${iy + ih} Z`,
        fill: '#ffffff', stroke: STROKE, 'stroke-width': 1,
      }, g);
      el('path', { d: `M ${ix + iw - fd} ${iy} L ${ix + iw - fd} ${iy + fd} L ${ix + iw} ${iy + fd}`, fill: 'none', stroke: STROKE, 'stroke-width': 1 }, g);
      text(g, '«artifact instance»', cx, cy - 5, { size: 11, anchor: 'middle' });
      text(g, m.title, cx, cy + 12, { bold: true, size: 13, anchor: 'middle', underline: true });
      return;
    }
    case 'nodeinstance': {
      const depth = 12;
      el('path', { d: `M ${e.x} ${e.y + depth} L ${e.x + depth} ${e.y} L ${e.x + e.w} ${e.y} L ${e.x + e.w - depth} ${e.y + depth} Z`, fill, stroke: STROKE, 'stroke-width': 1, ...SHADOW }, g);
      el('path', { d: `M ${e.x + e.w - depth} ${e.y + depth} L ${e.x + e.w} ${e.y} L ${e.x + e.w} ${e.y + e.h - depth} L ${e.x + e.w - depth} ${e.y + e.h} Z`, fill, stroke: STROKE, 'stroke-width': 1 }, g);
      el('rect', { x: e.x, y: e.y + depth, width: e.w - depth, height: e.h - depth, fill, stroke: STROKE, 'stroke-width': 1 }, g);
      const faceCx = e.x + (e.w - depth) / 2, faceCy = e.y + depth + (e.h - depth) / 2;
      text(g, '«node instance»', faceCx, faceCy - 5, { size: 11, anchor: 'middle' });
      text(g, m.title, faceCx, faceCy + 12, { bold: true, size: 13, anchor: 'middle', underline: true });
      return;
    }
    case 'component': {
      el('rect', { x: e.x, y: e.y, width: e.w, height: e.h, fill, stroke: STROKE, 'stroke-width': 1, ...SHADOW }, g);
      /* classic component icon, top-right */
      const ix = e.x + e.w - 24, iy = e.y + 7;
      el('rect', { x: ix, y: iy, width: 14, height: 17, fill: '#ffffff', stroke: STROKE, 'stroke-width': 1 }, g);
      el('rect', { x: ix - 5, y: iy + 3, width: 10, height: 4, fill: '#ffffff', stroke: STROKE, 'stroke-width': 1 }, g);
      el('rect', { x: ix - 5, y: iy + 10, width: 10, height: 4, fill: '#ffffff', stroke: STROKE, 'stroke-width': 1 }, g);
      text(g, e.name, cx, cy + 5, { bold: true, size: 13, anchor: 'middle' });
      return;
    }
    case 'interfaceball':
      el('circle', { cx, cy, r: Math.min(e.w, e.h) / 2, fill: '#ffffff', stroke: STROKE, 'stroke-width': 1.2, ...SHADOW }, g);
      text(g, e.name, cx, e.y + e.h + 15, { anchor: 'middle' });
      return;
    case 'artifact': {
      el('rect', { x: e.x, y: e.y, width: e.w, height: e.h, fill, stroke: STROKE, 'stroke-width': 1, ...SHADOW }, g);
      /* document icon, top-right */
      const ix = e.x + e.w - 22, iy = e.y + 6, IW = 12, IH = 15, FD = 4;
      el('path', {
        d: `M ${ix} ${iy} L ${ix + IW - FD} ${iy} L ${ix + IW} ${iy + FD} L ${ix + IW} ${iy + IH} L ${ix} ${iy + IH} Z`,
        fill: '#ffffff', stroke: STROKE, 'stroke-width': 1,
      }, g);
      el('path', { d: `M ${ix + IW - FD} ${iy} L ${ix + IW - FD} ${iy + FD} L ${ix + IW} ${iy + FD}`, fill: 'none', stroke: STROKE, 'stroke-width': 1 }, g);
      text(g, '«artifact»', cx, cy - 4, { anchor: 'middle' });
      text(g, e.name, cx, cy + 12, { bold: true, size: 13, anchor: 'middle' });
      return;
    }
    case 'node': {
      const D = 12;
      el('path', { d: `M ${e.x} ${e.y + D} L ${e.x + D} ${e.y} L ${e.x + e.w} ${e.y} L ${e.x + e.w - D} ${e.y + D} Z`, fill, stroke: STROKE, 'stroke-width': 1, ...SHADOW }, g);
      el('path', { d: `M ${e.x + e.w - D} ${e.y + D} L ${e.x + e.w} ${e.y} L ${e.x + e.w} ${e.y + e.h - D} L ${e.x + e.w - D} ${e.y + e.h} Z`, fill, stroke: STROKE, 'stroke-width': 1 }, g);
      el('rect', { x: e.x, y: e.y + D, width: e.w - D, height: e.h - D, fill, stroke: STROKE, 'stroke-width': 1 }, g);
      const fcx = e.x + (e.w - D) / 2, fcy = e.y + D + (e.h - D) / 2;
      if (e.stereotype) {
        text(g, `«${e.stereotype}»`, fcx, fcy - 4, { anchor: 'middle' });
        text(g, e.name, fcx, fcy + 12, { bold: true, size: 13, anchor: 'middle' });
      } else {
        text(g, e.name, fcx, fcy + 5, { bold: true, size: 13, anchor: 'middle' });
      }
      return;
    }
    case 'entity': {
      /* eXERD-style entity: dark-red header, explicit PK/FK badges, aligned columns */
      el('rect', { x: e.x, y: e.y, width: e.w, height: e.h, fill: '#ffffff', stroke: ERD_HEADER, 'stroke-width': 1.2, ...SHADOW }, g);
      el('rect', { x: e.x, y: e.y, width: e.w, height: m.headH, fill: ERD_HEADER, stroke: ERD_HEADER, 'stroke-width': 1.2 }, g);
      text(g, m.primaryTitle, e.x + 8, e.y + 16, { bold: true, size: 12.5, color: '#ffffff' });
      if (m.secondaryTitle) text(g, m.secondaryTitle, e.x + e.w - 8, e.y + 16, { bold: true, size: 11.5, color: '#f3d3c8', anchor: 'end' });
      let leadPk = 0;
      while (leadPk < m.cols.length && m.cols[leadPk].flags.includes('PK')) leadPk++;
      m.cols.forEach((c, i) => {
        const ry = e.y + m.headH + i * m.RH;
        const base = ry + 12.5;
        el('rect', {
          x: e.x + 1, y: ry, width: e.w - 2, height: m.RH,
          fill: 'transparent', cursor: 'grab', 'data-erd-column-index': i,
        }, g);
        if (i > 0) el('line', {
          x1: e.x + 1, y1: ry, x2: e.x + e.w - 1, y2: ry,
          stroke: i === leadPk ? '#c99287' : '#efece7', 'stroke-width': 1,
        }, g);
        const pk = c.flags.includes('PK'), fk = c.flags.includes('FK');
        drawErdColumnBadges(g, e.x + 4, base, c.flags);
        if (m.showLog) text(g, c.logical || c.phys, e.x + m.xLog, base, { bold: pk });
        if (m.showType && c.type) text(g, c.type, e.x + m.xType, base, { color: '#5a5a5a' });
        if (m.showPhys) text(g, c.phys, e.x + m.xPhys, base, {
          bold: pk || fk, color: pk && fk ? '#6941a5' : pk ? '#a93226' : fk ? '#2e6da4' : TEXT_COLOR,
        });
        const nn = pk || c.flags.includes('NN');
        text(g, nn ? 'NN' : 'NULL', e.x + e.w - 6, base, { size: 10, color: '#8a8a8a', anchor: 'end' });
      });
      return;
    }
    case 'process':
      el('ellipse', { cx, cy, rx: e.w / 2, ry: e.h / 2, fill, stroke: STROKE, 'stroke-width': 1.2, ...SHADOW }, g);
      text(g, e.name, cx, cy + 4, { bold: true, size: 13, anchor: 'middle' });
      return;
    case 'external':
      el('rect', { x: e.x, y: e.y, width: e.w, height: e.h, fill, stroke: STROKE, 'stroke-width': 1.2, ...SHADOW }, g);
      text(g, e.name, cx, cy + 4, { bold: true, size: 13, anchor: 'middle' });
      return;
    case 'datastore':
      el('rect', { x: e.x, y: e.y, width: e.w, height: e.h, fill, stroke: 'none', ...SHADOW }, g);
      el('path', {
        d: `M ${e.x + e.w} ${e.y} L ${e.x} ${e.y} L ${e.x} ${e.y + e.h} L ${e.x + e.w} ${e.y + e.h}`,
        fill: 'none', stroke: STROKE, 'stroke-width': 1.2,
      }, g);
      text(g, e.name, cx, cy + 4, { bold: true, size: 13, anchor: 'middle' });
      return;
    case 'mindnode': {
      const rx = Math.min(16, e.h / 2);
      el('rect', { x: e.x, y: e.y, width: e.w, height: e.h, rx, fill, stroke: STROKE, 'stroke-width': 1, ...SHADOW }, g);
      text(g, e.name, cx, cy + 4, { bold: true, size: 13, anchor: 'middle' });
      return;
    }      }
    }

    function drawClassifierElement(e, context) {
      const { g, fill, m, cx } = context;
    /* classifier-like elements */
    el('rect', { x: e.x, y: e.y, width: e.w, height: e.h, fill, stroke: STROKE, 'stroke-width': 1, ...SHADOW }, g);
    let ty = e.y + PAD + 4;
    let titleCx = cx;
    if (m.hasIcon) {
      drawStereotypeIcon(g, m.icon, e.x + 8, e.y + 8, 46, 46);
      titleCx = e.x + 58 + (e.w - 58) / 2;
      ty = e.y + 15;
    }
    if (m.stereo) { text(g, m.stereo, titleCx, ty + 6, { anchor: 'middle' }); ty += 15; }
    text(g, m.title || e.name, titleCx, ty + 8, { bold: true, size: 13, anchor: 'middle', italic: !!e.isAbstract });
  
    let compY = e.y + m.headH;
    const compartment = (items, h) => {
      el('line', { x1: e.x, y1: compY, x2: e.x + e.w, y2: compY, stroke: STROKE, 'stroke-width': 1 }, g);
      items.forEach((it, i) => text(g, it, e.x + PAD + 2, compY + 13 + i * LINE_H, {
        italic: /\{abstract\}/.test(it),
      }));
      compY += h;
    };
    if (m.showAttrs) compartment(m.attrs, m.aH);
    if (m.showOps) compartment(m.ops, m.oH);
    if (m.showReceptions) compartment(m.receptions.map(value => `«signal» ${value}`), m.rH);
    }

    const FAMILY_RENDERERS = Object.freeze({
      structure: drawStructureElement,
      activity: drawActivityElement,
      state: drawStateElement,
      interaction: drawInteractionElement,
      runtime: drawRuntimeElement,
    });

    function draw(parent, element) {
      if (!element || !element._m) return undefined;
      const diagram = currentDiagram();
      const family = elementFamily(element.kind);
      const groupAttrs = { 'data-id': element.id, 'data-element-family': family };
      if (diagram?.type === 'sequence' && element.kind === 'lifeline') {
        groupAttrs['data-quick-edit'] = 'lifeline-name';
      }
      const group = el('g', groupAttrs, parent);
      const context = {
        g: group,
        fill: element.fill || FILL_DEFAULT,
        m: element._m,
        cx: element.x + element.w / 2,
        cy: element.y + element.h / 2,
      };
      if (family === 'classifier') drawClassifierElement(element, context);
      else FAMILY_RENDERERS[family](element, context);
      return group;
    }

    return Object.freeze({ draw });
  }

  return Object.freeze({ FAMILY_KINDS, elementFamily, create });
});
