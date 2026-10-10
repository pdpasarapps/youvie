export const COMIC_TARGET_DEVICES = [
  { value: "all", label: "Semua perangkat" },
  { value: "mobile", label: "Mobile" },
  { value: "tablet", label: "Tablet" },
  { value: "desktop", label: "Desktop" },
] as const;

export type ComicTargetDevice = (typeof COMIC_TARGET_DEVICES)[number]["value"];
export type CurrentDevice = Exclude<ComicTargetDevice, "all">;

export function getCurrentDevice(width: number, hasFinePointer = false): CurrentDevice {
  if (width <= 760) return "mobile";
  if (width <= 1050 && !hasFinePointer) return "tablet";
  return "desktop";
}

export function isComicAvailableOnDevice(
  targetDevice: ComicTargetDevice | null | undefined,
  currentDevice: CurrentDevice | null,
) {
  return !targetDevice || targetDevice === "all" || targetDevice === currentDevice;
}
