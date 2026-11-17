// @ts-nocheck
'use strict';

/* Member Lists — normalizes editable member arrays and maps measured
   compartments to the rows consumed by Quick Edit and hit testing. */
(function initMemberListsModule(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UMLMemberLists = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createMemberListsModule() {
  const REQUIRED_FUNCTIONS = Object.freeze([]);
  const REQUIRED_VALUES = Object.freeze([]);
  const MEMBER_FIELDS = Object.freeze({
    attribute: 'attributes',
    column: 'columns',
    literal: 'literals',
    operation: 'operations',
    reception: 'receptions',
    slot: 'slots',
  });

  function create() {
    function ensureMemberArray(element, field) {
      if (!Array.isArray(element[field])) element[field] = [];
      return element[field];
    }

    const describe = (element, kind, top, height) => ({
      kind,
      arr: ensureMemberArray(element, MEMBER_FIELDS[kind]),
      top,
      h: height,
    });

    function memberLists(element) {
      const metrics = element._m;
      if (!metrics) return [];
      if (element.kind === 'entity') {
        return [describe(element, 'column', metrics.headH, metrics.aH)];
      }
      if (element.kind === 'object') {
        return [describe(element, 'slot', metrics.headH, metrics.slotH)];
      }

      const lists = [];
      let top = metrics.headH;
      if (metrics.showAttrs) {
        const kind = element.kind === 'enumeration' ? 'literal' : 'attribute';
        lists.push(describe(element, kind, top, metrics.aH));
        top += metrics.aH;
      }
      if (metrics.showOps) {
        lists.push(describe(element, 'operation', top, metrics.oH));
        top += metrics.oH;
      }
      if (metrics.showReceptions) {
        lists.push(describe(element, 'reception', top, metrics.rH));
      }
      return lists;
    }

    function memberListByKind(element, kind) {
      return memberLists(element).find(list => list.kind === kind) || null;
    }

    return Object.freeze({ ensureMemberArray, memberListByKind, memberLists });
  }

  return Object.freeze({
    MEMBER_FIELDS,
    REQUIRED_FUNCTIONS,
    REQUIRED_VALUES,
    create,
  });
});
