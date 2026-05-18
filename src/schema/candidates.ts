export type MemoryCandidate = {
  id: string;
  source: "observation" | "draft" | "dream";
  summary: string;
  createdAt: string;
};
