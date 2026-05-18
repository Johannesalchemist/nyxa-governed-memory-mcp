export type NyxaAgentMode =
  | "observe_only"
  | "document"
  | "suggest"
  | "draft"
  | "supervised_execute";

const orderedModes: NyxaAgentMode[] = [
  "observe_only",
  "document",
  "suggest",
  "draft",
  "supervised_execute"
];

export function getModeRank(mode: NyxaAgentMode): number {
  const index = orderedModes.indexOf(mode);
  return index;
}

export function modeSatisfiesMinimum(current: NyxaAgentMode, minimum: NyxaAgentMode): boolean {
  return getModeRank(current) >= getModeRank(minimum);
}

export function isNyxaAgentMode(value: string): value is NyxaAgentMode {
  return orderedModes.includes(value as NyxaAgentMode);
}
