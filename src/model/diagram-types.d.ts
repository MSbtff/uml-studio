interface DiagramPoint {
  x: number;
  y: number;
}

interface DiagramBounds extends DiagramPoint {
  w: number;
  h: number;
}

interface DiagramAnchor {
  fx: number;
  fy: number;
}

interface ErdColumnDetails {
  defaultValue?: string;
  uniqueName?: string;
}

interface ErdSchemaCheck {
  name: string;
  expression: string;
  column: string;
}

interface ErdSchemaIndex {
  kind: 'index' | 'unique';
  name: string;
  unique: boolean;
  columns: { name: string; order: '' | 'ASC' | 'DESC' }[];
  where: string;
}

interface DiagramElementBounds extends DiagramBounds {
  id: string;
  kind: string;
  parentId?: string | null;
}

interface DiagramLink {
  id: string;
  kind: string;
  from: string;
  to: string;
  srcAnchor?: DiagramAnchor;
  dstAnchor?: DiagramAnchor;
}

interface DiagramEndpoints {
  p1: DiagramPoint;
  p2: DiagramPoint;
}

interface DiagramQuadraticCurve extends DiagramEndpoints {
  c: DiagramPoint;
}

interface DiagramCubicCurve extends DiagramEndpoints {
  c1: DiagramPoint;
  c2: DiagramPoint;
}
