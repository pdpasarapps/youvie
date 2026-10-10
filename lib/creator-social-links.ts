export type CreatorSocialLink = {
  platform: string;
  url: string;
};

const socialPlaceholders: Record<string, string> = {
  Instagram: "@mukomiks atau https://instagram.com/mukomiks",
  TikTok: "@mukomiks atau https://tiktok.com/@mukomiks",
  X: "@mukomiks atau https://x.com/mukomiks",
  YouTube: "@mukomiks atau https://youtube.com/@mukomiks",
  Facebook: "https://facebook.com/mukomiks",
  Threads: "@mukomiks atau https://threads.net/@mukomiks",
  Twitch: "mukomiks atau https://twitch.tv/mukomiks",
  Discord: "https://discord.gg/...",
  Website: "https://websitekamu.com",
  Lainnya: "https://...",
};

export function getCreatorSocialPlaceholder(platform: string, creatorName: string) {
  const creatorHandle = creatorName.trim().toLocaleLowerCase("id-ID").replace(/\s+/g, "") || "namakreator";
  return (socialPlaceholders[platform] ?? "https://...").replace(/mukomiks/g, creatorHandle);
}

export function normalizeCreatorSocialUrl(platform: string, value: string) {
  const trimmedValue = value.trim();
  if (/^https:\/\//i.test(trimmedValue)) return trimmedValue;

  const handle = trimmedValue.replace(/^@/, "");
  if (!handle || /[\s/?#]/.test(handle)) return trimmedValue;

  const profileUrlBases: Record<string, string> = {
    Instagram: "https://www.instagram.com/",
    TikTok: "https://www.tiktok.com/@",
    X: "https://x.com/",
    YouTube: "https://www.youtube.com/@",
    Threads: "https://www.threads.net/@",
    Twitch: "https://www.twitch.tv/",
  };
  const baseUrl = profileUrlBases[platform];
  return baseUrl ? `${baseUrl}${handle}` : trimmedValue;
}

export function parseCreatorSocialLinks(value: unknown): CreatorSocialLink[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || !("platform" in item) || !("url" in item)) return [];
    const platform = typeof item.platform === "string" ? item.platform.trim().slice(0, 32) : "";
    const url = typeof item.url === "string" ? item.url.trim().slice(0, 500) : "";
    if (!platform || !isValidCreatorSocialUrl(url)) return [];
    return [{ platform, url }];
  });
}

export function isValidCreatorSocialUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    return false;
  }
}
