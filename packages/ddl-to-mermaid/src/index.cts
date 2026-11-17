export interface DdlOptions {
  diagramName?: string;
}

export interface ErdEntity {
  id: string;
  kind: 'entity';
  name: string;
  columns: string[];
  erdColumnDetails?: Record<string, { defaultValue?: string; uniqueName?: string }>;
  erdChecks?: { name: string; expression: string; column: string }[];
  erdIndexes?: {
    kind: 'index' | 'unique';
    name: string;
    unique: boolean;
    columns: { name: string; order: string }[];
    where: string;
  }[];
}

export interface ErdForeignKey {
  id: string;
  kind: 'erd-1n';
  name: string;
  sourceLabel: '0..N';
  targetLabel: '0..1' | '1';
  foreignKeyEnd: 'source';
  sourceColumnName: string;
  targetColumnName: string;
  foreignKeyOnDelete: string;
  foreignKeyOnUpdate: string;
  fromModelId: string;
  toModelId: string;
}

export interface ErdDiagram {
  id: string;
  type: 'erd';
  name: string;
  elements: { id: string; modelId: string; x: number; y: number; w: number; h: number }[];
  relations: { id: string; modelId: string; from: string; to: string }[];
}

export interface ImportedErd {
  version: number;
  models: Record<string, ErdEntity | ErdForeignKey>;
  diagrams: [ErdDiagram];
  importMeta: {
    dialect: string;
    warnings: string[];
    tables: number;
    columns: number;
    foreignKeys: number;
    linkedForeignKeys: number;
    checks: number;
    indexes: number;
  };
}

export interface DdlConversion {
  erd: ImportedErd;
  mermaid: string;
}

const {
  parseDdl,
}: { parseDdl(sql: string, options?: DdlOptions): ImportedErd } = require('./shared/io/ddl-importer.js');
const {
  exportMermaid,
}: {
  exportMermaid(diagram: ErdDiagram, models: ImportedErd['models']): string;
} = require('./shared/io/exporters.js');
const {
  hydrateProject,
}: {
  hydrateProject(diagrams: [ErdDiagram], models: ImportedErd['models']): ImportedErd['models'];
} = require('./shared/model/model-core.js');

export function ddlToMermaid(sql: string, options?: DdlOptions): DdlConversion {
  if (typeof sql !== 'string') throw new TypeError('SQL input must be a string.');

  const erd = parseDdl(sql, options);
  // The exporter reads semantic fields from hydrated views. Return the original serializable ERD.
  const diagrams = structuredClone(erd.diagrams);
  const models = hydrateProject(diagrams, erd.models);

  return { erd, mermaid: exportMermaid(diagrams[0], models) };
}
