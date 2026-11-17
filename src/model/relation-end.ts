// @ts-nocheck
'use strict';

/* UML AssociationEnd / LinkEnd and ER RelationshipEnd domain helpers. */
(function initRelationEnd(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.UMLRelationEnd = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createRelationEnd() {
  const RELATION_END_QUICK_EDIT_KINDS = new Set([
    'association', 'directed', 'aggregation', 'composition',
    'link', 'directedlink', 'erd-11', 'erd-1n', 'erd-nm',
  ]);
  const ER_RELATION_KINDS = new Set(['erd-11', 'erd-1n', 'erd-nm']);
  const ASSOCIATION_QUALIFIER_KINDS = new Set([
    'association', 'directed', 'aggregation', 'composition',
  ]);
  const VISIBILITY_SYMBOL = {
    public: '+', protected: '#', private: '-', package: '~',
  };
  const VISIBILITY_VALUE = {
    '+': 'public', '#': 'protected', '-': 'private', '~': 'package',
  };

  function relationSupportsEndQuickEdit(relation) {
    return !!relation && RELATION_END_QUICK_EDIT_KINDS.has(relation.kind);
  }

  function relationEndField(end, suffix) {
    return `${end === 'source' ? 'source' : 'target'}${suffix}`;
  }

  function relationEndMultiplicity(relation, end) {
    return relation[end === 'source' ? 'sourceLabel' : 'targetLabel'] || '';
  }

  function relationEndAggregation(relation, end) {
    const field = relationEndField(end, 'Aggregation');
    if (relation[field] !== undefined) return relation[field] || 'none';
    if (end === 'target' && relation.kind === 'aggregation') return 'shared';
    if (end === 'target' && relation.kind === 'composition') return 'composite';
    return 'none';
  }

  function relationEndNavigability(relation, end) {
    const field = relationEndField(end, 'Navigability');
    if (relation[field] !== undefined) return relation[field] || 'unspecified';
    return end === 'target' && ['directed', 'directedlink'].includes(relation.kind)
      ? 'navigable' : 'unspecified';
  }

  function relationEndExpression(relation, end) {
    const prefix = end === 'source' ? 'source' : 'target';
    const stereotype = relation[`${prefix}EndStereotype`];
    const visibility = VISIBILITY_SYMBOL[relation[`${prefix}EndVisibility`]] || '';
    return [stereotype ? `«${stereotype}»` : '', visibility, relation[`${prefix}EndName`] || '']
      .filter(Boolean).join(' ');
  }

  function relationEndRoleLabel(relation, end) {
    const expression = relationEndExpression(relation, end);
    const qualifiers = relation[relationEndField(end, 'Qualifiers')];
    const qualifierText = Array.isArray(qualifiers) && qualifiers.length
      ? `[${qualifiers.join(', ')}]` : '';
    return [expression, qualifierText].filter(Boolean).join(' ');
  }

  function validRelationEndMultiplicity(value, erd = false) {
    const text = String(value || '').trim();
    if (!text) return true;
    const atom = erd ? '[A-Za-z0-9*]+' : '(?:\\d+|\\*)';
    return new RegExp(`^${atom}(?:\\.\\.${atom})?(?:\\s*,\\s*${atom}(?:\\.\\.${atom})?)*$`).test(text);
  }

  return {
    RELATION_END_QUICK_EDIT_KINDS,
    ER_RELATION_KINDS,
    ASSOCIATION_QUALIFIER_KINDS,
    VISIBILITY_SYMBOL,
    VISIBILITY_VALUE,
    relationSupportsEndQuickEdit,
    relationEndField,
    relationEndMultiplicity,
    relationEndAggregation,
    relationEndNavigability,
    relationEndExpression,
    relationEndRoleLabel,
    validRelationEndMultiplicity,
  };
});
