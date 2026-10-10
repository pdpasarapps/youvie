export const PRODUCTION_TECHNIQUES = [
  { value: "traditional_drawing", label: "Gambar tradisional" },
  { value: "digital_illustration", label: "Ilustrasi digital" },
  { value: "mixed", label: "Campuran" },
  { value: "ai_assisted", label: "Dibantu AI" },
  { value: "ai_generated", label: "Dibuat dengan AI" },
] as const;

export const STORY_STATUSES = [
  { value: "ongoing", label: "Berjalan" },
  { value: "completed", label: "Tamat" },
  { value: "hiatus", label: "Hiatus" },
] as const;

export const TARGET_AUDIENCES = [
  { value: "all_ages", label: "Semua umur" },
  { value: "teen", label: "Remaja" },
  { value: "adult", label: "Dewasa" },
] as const;

export const ORIGIN_TYPES = [
  { value: "original", label: "Karya orisinal" },
  { value: "adaptation", label: "Adaptasi" },
] as const;

export const COMIC_LANGUAGES = [
  { value: "id", label: "Bahasa Indonesia" },
  { value: "en", label: "Bahasa Inggris" },
] as const;

export type ProductionTechnique = (typeof PRODUCTION_TECHNIQUES)[number]["value"];
export type StoryStatus = (typeof STORY_STATUSES)[number]["value"];
export type TargetAudience = (typeof TARGET_AUDIENCES)[number]["value"];
export type OriginType = (typeof ORIGIN_TYPES)[number]["value"];

export function getMetadataLabel(
  options: readonly { value: string; label: string }[],
  value: string,
  fallback: string,
) {
  return options.find((option) => option.value === value)?.label ?? fallback;
}
