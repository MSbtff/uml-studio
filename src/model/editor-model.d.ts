/** Semantic fields shared by model records and their hydrated views. */
interface ModelFields {
  name?: string;
  stereotype?: string;
  isAbstract?: boolean;
  isActor?: boolean;
  attributes?: string[];
  operations?: string[];
  receptions?: string[];
  literals?: string[];
  columns?: string[];
  text?: string;
  logicalName?: string;
  erdColumnDetails?: Record<string, ErdColumnDetails>;
  erdChecks?: ErdSchemaCheck[];
  erdIndexes?: ErdSchemaIndex[];
  operator?: string;
  condition?: string;
  operands?: string[];
  seqNo?: string;
  sourceLabel?: string;
  targetLabel?: string;
  foreignKeyEnd?: string;
  sourceColumnName?: string;
  targetColumnName?: string;
  foreignKeyOnDelete?: string;
  foreignKeyOnUpdate?: string;
  sourceEndName?: string;
  targetEndName?: string;
  sourceEndVisibility?: string;
  targetEndVisibility?: string;
  sourceEndStereotype?: string;
  targetEndStereotype?: string;
  sourceNavigability?: string;
  targetNavigability?: string;
  sourceAggregation?: string;
  targetAggregation?: string;
  sourceQualifiers?: string[];
  targetQualifiers?: string[];
  messageSort?: string;
  entry?: string;
  doActivity?: string;
  exit?: string;
  internalTransitions?: string[];
  trigger?: string;
  guard?: string;
  effect?: string;
  submachineDiagramId?: string;
  interactionDiagramId?: string;
  referenceKind?: string;
  classifierModelId?: string;
  slots?: string[];
  collaborationModelId?: string;
  providedInterfaceModelId?: string;
  requiredInterfaceModelId?: string;
  startTime?: string;
  endTime?: string;
  timeValue?: string;
  constraint?: string;
  defaultValue?: string;
  expansionMode?: string;
  visibility?: string;
  iconContent?: string;
  isRequired?: boolean;
  conveyedModelIds?: string[];
  itemFlowModelIds?: string[];
  requirementType?: string;
  requirementId?: string;
  requirementText?: string;
  risk?: string;
  verificationMethod?: string;
  parts?: string[];
  references?: string[];
  values?: string[];
  flowProperties?: string[];
  constraintProperties?: string[];
  properties?: string[];
  constraints?: string[];
  constraintParameters?: string[];
  valueTypeUnit?: string;
  c4Description?: string;
  c4Technology?: string;
  c4ContainerType?: 'application' | 'database';
  c4OwnerModelId?: string;
  quantityKind?: string;
}

interface DiagramModel extends ModelFields {
  id: string;
  kind: string;
  fromModelId?: string | null;
  toModelId?: string | null;
}

type DiagramModels = Record<string, DiagramModel>;

interface DiagramElement extends DiagramElementBounds, ModelFields {
  modelId?: string;
  fill?: string;
  borderStyle?: 'solid' | 'dashed';
  borderAnchor?: DiagramAnchor;
  lifeId?: string;
  _depth?: number;
  _m?: ElementMeasurement;
  regionOrder?: number;
  stateOrder?: number;
  constrainedViewId?: string;
  anchorRatio?: number;
  operandDividers?: number[];
}

interface DiagramRelation extends DiagramLink, ModelFields {
  modelId?: string;
  connectorId?: string;
  y?: number;
  lblOff?: Partial<Record<string, { dx: number; dy: number }>>;
  manualPoints?: DiagramPoint[];
  routeMode?: string;
  jumpStyle?: string;
}

interface EditorDiagram {
  c4AutoName?: boolean;
  erdMode?: string;
  seqNumbers?: boolean;
  id: string;
  type: string;
  name: string;
  elements: DiagramElement[];
  relations: DiagramRelation[];
}

interface ErdColumnClipboard {
  raw: string;
  schema: { sourceColumn?: string; details?: ErdColumnDetails; checks?: ErdSchemaCheck[] };
  sourceModelId?: string;
  sourceIndex: number;
}
