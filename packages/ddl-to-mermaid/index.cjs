'use strict';

const { parseDdl } = require('./dist/ddl-importer.js');
const { exportMermaid } = require('./dist/exporters.js');
const { hydrateProject } = require('./dist/model-core.js');

function ddlToMermaid(sql, options) {
  if (typeof sql !== 'string') throw new TypeError('SQL input must be a string.');

  const erd = parseDdl(sql, options);
  // The exporter reads semantic fields from hydrated views. Return the original serializable ERD.
  const diagrams = structuredClone(erd.diagrams);
  const models = hydrateProject(diagrams, erd.models);

  return { erd, mermaid: exportMermaid(diagrams[0], models) };
}

exports.ddlToMermaid = ddlToMermaid;
