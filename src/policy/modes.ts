export type NyxaAgentMode =
  | "observe_only"
  | "document"
  | "suggest"
  | "draft"
  | "supervised_execute";

export const MODE_ORDER: NyxaAgentMode[] = [
  "observe_only",
  "document",
  "suggest",
  "draft",
  "supervised_execute"
];

export function modeIndex(mode: NyxaAgentMode): number {
  return MODE_ORDER.indexOf(mode);
}

export function modeSatisfiesMinimum(current: NyxaAgentMode, minimum: NyxaAgentMode): boolean {
  return modeIndex(current) >= modeIndex(minimum);
}

export function isNyxaAgentMode(value: string): value is NyxaAgentMode {
  return MODE_ORDER.includes(value as NyxaAgentMode);
}