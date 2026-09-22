export type NewsroomModality = "text" | "code" | "research" | "image" | "video";
export type ModelFamily = "openai" | "claude" | "kimi" | "gemini" | "qwen";

export type CatalogModel = {
  id: string;
  inputModalities: string[];
};

const FAMILY_PREFIXES: Record<ModelFamily, string[]> = {
  openai: ["openai/"],
  claude: ["anthropic/claude"],
  kimi: ["moonshotai/kimi", "moonshot/"],
  gemini: ["google/gemini"],
  qwen: ["qwen/"]
};

export const AUTO_FAMILIES: Record<NewsroomModality, ModelFamily[]> = {
  text: ["openai", "claude", "kimi"],
  code: ["claude", "openai", "qwen"],
  research: ["kimi", "openai", "claude"],
  image: ["gemini", "qwen", "openai"],
  video: ["gemini", "qwen", "openai"]
};

function supports(model: CatalogModel, modality: NewsroomModality): boolean {
  if (modality === "image") return model.inputModalities.includes("image");
  if (modality === "video") return model.inputModalities.includes("video");
  return model.inputModalities.includes("text") || model.inputModalities.length === 0;
}

export function selectModel(catalog: CatalogModel[], family: ModelFamily, modality: NewsroomModality): string | undefined {
  const prefixes = FAMILY_PREFIXES[family];
  return catalog.find((model) =>
    prefixes.some((prefix) => model.id.startsWith(prefix)) && supports(model, modality)
  )?.id;
}

export function isModelFamily(value: unknown): value is ModelFamily {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(FAMILY_PREFIXES, value);
}
