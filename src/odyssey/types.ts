export type StageId = "source" | "allocation" | "activity" | "outcome" | "result";

export type OdysseyNode = {
  id: string;
  stage: StageId;
  label: string;
  value: number;
  pctLabel?: string;
  deltaPct?: number;
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
  dark?: boolean;
  meta?: string;
};

export type OdysseyFlow = {
  id: string;
  from: string;
  to: string;
  value: number;
  scenarioValue?: number;
  color: string;
  laneOffset?: number;
  curvature?: number;
  confidence?: number;
  velocity?: number;
  residual?: boolean;
  dashed?: boolean;
};

export type OdysseyMetric = {
  label: string;
  value: string;
  accent: string;
  sublabel?: string;
};

export type OdysseyDataset = {
  title: string;
  subtitle: string;
  stages: Array<{ id: StageId; title: string; subtitle: string; color: string }>;
  nodes: OdysseyNode[];
  flows: OdysseyFlow[];
  metrics: OdysseyMetric[];
};
