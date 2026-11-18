type DrawioPolicy = 'keepBoth' | 'reuse' | 'replace';

interface DrawioConflict {
  importedModelId: string;
  originalModelId: string;
  importedName: string;
  importedKind: string;
  matchModelId: string;
  matchName: string;
  type: 'exact' | 'semantic' | 'incompatible';
  compatible: boolean;
  changedFields: string[];
}

interface DrawioImportAnalysis {
  diagrams: number;
  models: number;
  elementViews: number;
  relationViews: number;
  compatibleConflicts: number;
  incompatibleConflicts: number;
  diagramNameConflicts: number;
  diagramDetails: { id: string; name: string; type: string; elements: number; relations: number; nameConflict: boolean }[];
  conflicts: DrawioConflict[];
}

interface DrawioPreviewDecision {
  policy: DrawioPolicy;
  modelPolicies: Partial<Record<string, DrawioPolicy>>;
}

interface DdlImportSummary {
  diagrams?: { elements: { modelId?: string }[] }[];
  models?: DiagramModels;
  importMeta?: {
    dialect?: string;
    tables?: number;
    columns?: number;
    foreignKeys?: number;
    linkedForeignKeys?: number;
    checks?: number;
    indexes?: number;
    warnings?: string[];
  };
}

interface ImportedElement extends Omit<DiagramElement, 'kind'> {
  kind?: string;
}

interface ImportedRelation extends Omit<DiagramRelation, 'kind' | 'from' | 'to'> {
  kind?: string;
  from?: string;
  to?: string;
}

interface ImportedDiagram extends Omit<EditorDiagram, 'elements' | 'relations'> {
  elements: ImportedElement[];
  relations: ImportedRelation[];
}

interface ImportedProject {
  models: DiagramModels;
  diagrams: ImportedDiagram[];
}

interface DrawioProject extends ImportedProject {
  version?: number;
  activeId?: string;
  idSeq?: number;
  counters?: Record<string, number>;
  projectId?: string;
  projectName?: string;
  importMeta?: {
    modelOrigins?: Record<string, string>;
    modelRoles?: Record<string, 'element' | 'relation'>;
  };
}
