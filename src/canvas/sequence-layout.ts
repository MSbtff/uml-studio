// @ts-nocheck
'use strict';

(function initSequenceLayout(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.UMLSequenceLayout = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSequenceLayout() {
  const DEFAULT_SEQUENCE_TOP = 32;

  function sequenceLifelineTop(diagram) {
    return diagram.elements?.find(view => view.kind === 'lifeline')?.y ?? DEFAULT_SEQUENCE_TOP;
  }

  function sequenceMessageMinY(diagram) {
    return sequenceLifelineTop(diagram) + 64;
  }

  function fragmentOperandLayout(view) {
    const top = view.y + 21;
    const bottom = Math.max(top, view.y + view.h);
    const count = view.operands?.length || 0;
    const height = bottom - top;
    const minHeight = Math.min(24, height / Math.max(count, 1));
    const saved = Array.isArray(view.operandDividers) && view.operandDividers.length === count - 1
      ? view.operandDividers : [];
    const boundaries = [top];
    for (let index = 1; index < count; index++) {
      const fraction = Number.isFinite(saved[index - 1]) ? saved[index - 1] : index / count;
      const earliest = boundaries.at(-1) + minHeight;
      const latest = bottom - (count - index) * minHeight;
      boundaries.push(Math.min(latest, Math.max(earliest, top + fraction * height)));
    }
    boundaries.push(bottom);
    return { boundaries, minHeight };
  }

  /*
   * Assign the smallest available depth to time intervals that overlap on the
   * same lifeline. Longer intervals win the outer slot when start times match.
   */
  function assignTemporalDepths(items) {
    const groups = new Map();
    items.forEach(item => {
      const key = item.el;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    });
    groups.forEach(group => {
      const sorted = group.slice().sort((a, b) =>
        a.y0 - b.y0 || b.y1 - a.y1 || String(a.id || '').localeCompare(String(b.id || '')));
      let active = [];
      sorted.forEach(item => {
        active = active.filter(x => x.y1 > item.y0);
        const used = new Set(active.map(x => x.depth));
        let depth = 0;
        while (used.has(depth)) depth++;
        item.depth = depth;
        active.push(item);
      });
    });
    return items;
  }

  function activeAt(items, lifelineId, y) {
    return items
      .filter(item => item.el === lifelineId && y >= item.y0 - 1 && y <= item.y1 + 1)
      .sort((a, b) => b.depth - a.depth || b.y0 - a.y0);
  }

  return {
    DEFAULT_SEQUENCE_TOP, sequenceLifelineTop, sequenceMessageMinY, fragmentOperandLayout, assignTemporalDepths, activeAt,
  };
});
