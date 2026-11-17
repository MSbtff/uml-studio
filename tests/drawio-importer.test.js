'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { exportDrawio } = require('../exporters.js');
const {
  importDrawio, parseXml, analyzeImport, filterImportConflicts, paginateImportConflicts,
} = require('../drawio-importer.js');
const { validateProjectData } = require('../model-core.js');

const element = (id, kind, name, extra) => ({
  id, modelId: `m_${id}`, kind, name, x: 0, y: 0, w: 180, h: 80, ...(extra || {}),
});
const relation = (id, kind, from, to, extra) => ({
  id, modelId: `m_${id}`, kind, from, to, name: '', ...(extra || {}),
});

async function run() {
  const diagram = {
    id: 'class-roundtrip', type: 'class', name: 'Class Round Trip',
    elements: [
      element('customer', 'class', 'Customer', {
        x: 40, y: 60, w: 220, h: 120,
        stereotype: 'entity', visibility: 'public',
        attributes: ['+ id: UUID'], operations: ['+ placeOrder(): void'],
      }),
      element('order', 'class', 'Order', {
        x: 420, y: 80, w: 240, h: 140,
        attributes: ['+ total: Money'], operations: [], fill: '#eef6f8',
      }),
      element('address', 'class', 'Address', {
        parentId: 'order', x: 460, y: 150, w: 140, h: 48,
        attributes: [], operations: [],
      }),
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
  const xml = exportDrawio(diagram, {});
  assert.match(xml, /umlDiagramType="class"/);
  assert.match(xml, /umlName="Customer"/);
  assert.match(xml, /umlAttributes="\[&quot;\+ id: UUID&quot;\]"/);

  const imported = await importDrawio(xml, {
    allowedElementKinds: ['class'], allowedRelationKinds: ['association'],
    resolveDiagramType: (_elements, _relations, requested) => requested,
  });
  assert.equal(imported.diagrams.length, 1);
  assert.equal(imported.diagrams[0].type, 'class');
  assert.equal(imported.diagrams[0].name, 'Class Round Trip');
  assert.equal(imported.diagrams[0].elements.length, 3);
  assert.equal(imported.diagrams[0].relations.length, 1);
  const customerView = imported.diagrams[0].elements.find(view => imported.models[view.modelId].name === 'Customer');
  const orderView = imported.diagrams[0].elements.find(view => imported.models[view.modelId].name === 'Order');
  const addressView = imported.diagrams[0].elements.find(view => imported.models[view.modelId].name === 'Address');
  assert.deepEqual([customerView.x, customerView.y, customerView.w, customerView.h], [40, 60, 220, 120]);
  assert.deepEqual(imported.models[customerView.modelId].attributes, ['+ id: UUID']);
  assert.deepEqual(imported.models[customerView.modelId].operations, ['+ placeOrder(): void']);
  assert.equal(orderView.fill, '#eef6f8');
  assert.equal(addressView.parentId, orderView.id);
  assert.deepEqual([addressView.x, addressView.y], [460, 150], '중첩 도형의 상대 좌표를 절대 좌표로 복원해야 합니다');
  assert.equal(imported.importMeta.modelOrigins[customerView.modelId], 'm_customer');
  assert.equal(imported.importMeta.modelRoles[customerView.modelId], 'element');
  const owns = imported.models[imported.diagrams[0].relations[0].modelId];
  assert.equal(imported.importMeta.modelRoles[owns.id], 'relation');
  assert.equal(owns.name, 'owns');
  assert.equal(owns.sourceLabel, '1');
  assert.equal(owns.targetLabel, '0..*');
  assert.equal(owns.sourceNavigability, 'notNavigable');
  assert.equal(owns.targetAggregation, 'composite');
  assert.equal(owns.targetEndName, 'orders');
  assert.deepEqual(owns.targetQualifiers, ['id: UUID']);
  assert.equal(validateProjectData(imported, {
    diagramTypes: ['class'], elementKinds: ['class'], relationKinds: ['association'],
  }), true);

  const erdXml = exportDrawio({
    id: 'erd-roundtrip', type: 'erd', name: 'ERD Round Trip',
    elements: [
      element('posts', 'entity', 'posts', {
        columns: ['FK user_id: BIGINT', 'UQ slug: TEXT'],
        erdColumnDetails: { slug: { defaultValue: "'draft'" } },
        erdChecks: [{ name: 'slug_check', expression: "slug <> ''", column: 'slug' }],
        erdIndexes: [{ kind: 'index', name: 'user_idx', columns: [{ name: 'user_id', order: '' }] }],
      }),
      element('users', 'entity', 'users', { x: 320, columns: ['PK id: BIGINT'] }),
    ],
    relations: [relation('writes', 'erd-1n', 'posts', 'users', {
      foreignKeyEnd: 'source', sourceColumnName: 'user_id', targetColumnName: 'id',
      foreignKeyOnDelete: 'CASCADE', foreignKeyOnUpdate: 'SET NULL',
    })],
  }, {});
  const importedErd = await importDrawio(erdXml, {
    allowedElementKinds: ['entity'], allowedRelationKinds: ['erd-1n'],
    resolveDiagramType: (_elements, _relations, requested) => requested,
  });
  const importedFk = importedErd.models[importedErd.diagrams[0].relations[0].modelId];
  assert.equal(importedFk.foreignKeyEnd, 'source');
  assert.equal(importedFk.sourceColumnName, 'user_id');
  assert.equal(importedFk.targetColumnName, 'id');
  assert.equal(importedFk.foreignKeyOnDelete, 'CASCADE');
  assert.equal(importedFk.foreignKeyOnUpdate, 'SET NULL');
  const importedPosts = Object.values(importedErd.models).find(model => model.name === 'posts');
  assert.deepEqual(importedPosts.erdColumnDetails, { slug: { defaultValue: "'draft'" } });
  assert.equal(importedPosts.erdChecks[0].name, 'slug_check');
  assert.equal(importedPosts.erdIndexes[0].name, 'user_idx');
  await assert.rejects(() => importDrawio(erdXml.replace('umlForeignKeyEnd="source"', 'umlForeignKeyEnd="left"'), {
    allowedElementKinds: ['entity'], allowedRelationKinds: ['erd-1n'],
  }), /FK 보유 끝점/);
  await assert.rejects(() => importDrawio(erdXml.replace('umlForeignKeyOnDelete="CASCADE"', 'umlForeignKeyOnDelete="DELETE ALL"'), {
    allowedElementKinds: ['entity'], allowedRelationKinds: ['erd-1n'],
  }), /ON DELETE/);

  const analysis = analyzeImport(imported, {
    m_customer: { id: 'm_customer', kind: 'class', name: 'Customer', attributes: [] },
    existing_order: { id: 'existing_order', kind: 'class', name: ' order ', attributes: ['+ legacy: String'] },
    relation_named_owns: { id: 'relation_named_owns', kind: 'association', name: 'owns' },
  }, [{ id: 'existing-diagram', type: 'class', name: 'Class Round Trip' }]);
  assert.equal(analysis.diagrams, 1);
  assert.equal(analysis.elementViews, 3);
  assert.equal(analysis.relationViews, 1);
  assert.equal(analysis.diagramNameConflicts, 1);
  assert.equal(analysis.conflicts.length, 2, '요소 모델만 원본 ID 또는 유일한 종류·이름으로 충돌 분석해야 합니다');
  const exactConflict = analysis.conflicts.find(conflict => conflict.importedName === 'Customer');
  const semanticConflict = analysis.conflicts.find(conflict => conflict.importedName === 'Order');
  assert.equal(exactConflict.type, 'exact');
  assert.equal(exactConflict.matchModelId, 'm_customer');
  assert.ok(exactConflict.changedFields.includes('attributes'));
  assert.equal(semanticConflict.type, 'semantic');
  assert.equal(semanticConflict.matchModelId, 'existing_order');
  assert.equal(analysis.compatibleConflicts, 2);

  const incompatible = analyzeImport(imported, {
    m_customer: { id: 'm_customer', kind: 'interface', name: 'Customer' },
  });
  assert.equal(incompatible.conflicts[0].type, 'incompatible');
  assert.equal(incompatible.conflicts[0].compatible, false);

  const mixedFixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'drawio-mixed-conflicts.drawio'), 'utf8');
  const mixedImported = await importDrawio(mixedFixture, {
    allowedElementKinds: ['class'], allowedRelationKinds: ['dependency'],
    resolveDiagramType: (_elements, _relations, requested) => requested,
  });
  const mixedAnalysis = analyzeImport(mixedImported, {
    existing_shape: { id: 'existing_shape', kind: 'class', name: 'Shape', attributes: ['+ currentShape: string'] },
    existing_style: { id: 'existing_style', kind: 'class', name: 'Style', attributes: ['+ currentStyle: string'] },
  });
  assert.deepEqual(mixedAnalysis.conflicts.map(conflict => conflict.importedName).sort(), ['Shape', 'Style']);
  assert.equal(mixedAnalysis.compatibleConflicts, 2);
  assert.deepEqual(filterImportConflicts(mixedAnalysis.conflicts, {}, 'shape').map(conflict => conflict.importedName), ['Shape']);
  assert.equal(filterImportConflicts(mixedAnalysis.conflicts, {}, '', 'changed').length, 2);
  const mixedPolicies = new Map(mixedAnalysis.conflicts.map(conflict => [
    conflict.importedModelId, conflict.importedName === 'Style' ? 'replace' : 'reuse',
  ]));
  assert.deepEqual(filterImportConflicts(mixedAnalysis.conflicts, mixedPolicies, '', 'replace')
    .map(conflict => conflict.importedName), ['Style']);
  assert.equal(filterImportConflicts(incompatible.conflicts, {}, '', 'incompatible').length, 1);
  const paged = paginateImportConflicts(Array.from({ length: 123 }, (_value, index) => index), 2, 50);
  assert.deepEqual({ page: paged.page, pages: paged.pageCount, start: paged.start, end: paged.end },
    { page: 2, pages: 3, start: 100, end: 123 });
  assert.equal(paged.items.length, 23);

  const graph = xml.match(/<mxGraphModel[\s\S]*<\/mxGraphModel>/)[0];
  const payload = zlib.deflateRawSync(Buffer.from(encodeURIComponent(graph), 'utf8')).toString('base64');
  const compressed = `<?xml version="1.0"?><mxfile><diagram id="compressed" name="Compressed" umlDiagramType="class">${payload}</diagram></mxfile>`;
  const importedCompressed = await importDrawio(compressed, {
    inflateRaw: bytes => zlib.inflateRawSync(bytes),
    allowedElementKinds: ['class'], allowedRelationKinds: ['association'],
    resolveDiagramType: (_elements, _relations, requested) => requested,
  });
  assert.equal(importedCompressed.diagrams[0].name, 'Compressed');
  assert.equal(importedCompressed.diagrams[0].elements.length, 3);
  assert.equal(importedCompressed.models[importedCompressed.diagrams[0].relations[0].modelId].targetEndName, 'orders');

  const bare = await importDrawio(graph, {
    defaultDiagramName: 'Bare Graph',
    allowedElementKinds: ['class'], allowedRelationKinds: ['association'],
  });
  assert.equal(bare.diagrams[0].name, 'Bare Graph');

  assert.throws(() => parseXml('<!DOCTYPE x [<!ENTITY y SYSTEM "file:///etc/passwd">]><mxfile/>'), /DOCTYPE/);
  assert.throws(() => parseXml('<mxfile><diagram></mxfile>'), /닫기 태그/);
  await assert.rejects(() => importDrawio(xml.replace('umlKind="class"', 'umlKind="script"'), {
    allowedElementKinds: ['class'], allowedRelationKinds: ['association'],
  }), /지원하지 않는 UML 요소/);
  await assert.rejects(() => importDrawio(xml.replace('umlTargetAggregation="composite"', 'umlTargetAggregation="invalid"'), {
    allowedElementKinds: ['class'], allowedRelationKinds: ['association'],
  }), /Aggregation/);
  const withUntypedShape = xml.replace('</root>', '<mxCell id="plain" value="Plain" vertex="1" parent="1"><mxGeometry x="0" y="0" width="10" height="10" as="geometry"/></mxCell></root>');
  await assert.rejects(() => importDrawio(withUntypedShape, {
    allowedElementKinds: ['class'], allowedRelationKinds: ['association'],
  }), /umlKind 메타데이터가 없는/);

  console.log('draw.io importer tests: ok');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
