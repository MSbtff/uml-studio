interface DiagramPoint {
  x: number;
  y: number;
}

type DiagramMoveAxis = 'x' | 'y';

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
  c4Boundary?: boolean;
  c4ContextFocus?: boolean;
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

interface BindingCrossing {
  point: DiagramPoint;
  segmentIndex: number;
  routeIndex: number;
}

interface OrthogonalRoute {
  points: DiagramPoint[];
  obstacleHits: number;
  crossings: number;
  overlap: number;
  bends: number;
}

interface BindingRoute extends OrthogonalRoute {
  jumpCrossings: BindingCrossing[];
  jumpCount: number;
}

interface BindingRouteOptions {
  start: DiagramPoint;
  end: DiagramPoint;
  clearance?: number;
  grid?: number;
  startDirection?: DiagramPoint;
  endDirection?: DiagramPoint;
  obstacles?: DiagramBounds[];
  existingRoutes?: DiagramPoint[][];
}
