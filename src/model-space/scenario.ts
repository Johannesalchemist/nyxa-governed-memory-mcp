export type EvidenceRef = {
  id: string;
  kind: "measurement" | "simulation" | "observation" | "model";
  provenance: string;
  confidence: number;
};

export type ScenarioArtifact = {
  id: string;
  title: string;
  modelVersion: string;
  parameters: Record<string, number | string | boolean>;
  metrics: Record<string, number>;
  evidence: EvidenceRef[];
  energyJoules?: number;
  createdAt: string;
};

export type ScenarioDelta = {
  metric: string;
  a: number;
  b: number;
  delta: number;
  relativeDelta: number | null;
};

export type ScenarioComparison = {
  scenarioA: string;
  scenarioB: string;
  sharedParameters: string[];
  changedParameters: string[];
  deltas: ScenarioDelta[];
  evidenceRefs: string[];
  energyJoules: number;
};
