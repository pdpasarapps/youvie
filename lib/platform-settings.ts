export type PlatformFeatureFlags = {
  reading: boolean;
  search: boolean;
  creators: boolean;
  comments: boolean;
  favorites: boolean;
};

export type PlatformSettings = {
  maintenance_enabled: boolean;
  maintenance_message: string;
  announcement_enabled: boolean;
  announcement_message: string;
  feature_flags: PlatformFeatureFlags;
  require_comic_review: boolean;
  creator_applications_enabled: boolean;
  max_comics_per_creator: number;
  max_upload_size_mb: number;
  max_pages_per_chapter: number;
  allowed_image_types: string[];
};

export const defaultPlatformSettings: PlatformSettings = {
  maintenance_enabled: false,
  maintenance_message: "MU-Komik sedang dalam pemeliharaan. Silakan kembali lagi nanti.",
  announcement_enabled: false,
  announcement_message: "",
  feature_flags: {
    reading: true,
    search: true,
    creators: true,
    comments: true,
    favorites: true,
  },
  require_comic_review: true,
  creator_applications_enabled: true,
  max_comics_per_creator: 5,
  max_upload_size_mb: 10,
  max_pages_per_chapter: 100,
  allowed_image_types: ["image/jpeg", "image/png", "image/webp"],
};

export function matchesImageContentType(type: string, bytes: Uint8Array) {
  if (type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") return bytes.length >= 8 && bytes.subarray(0, 8).join(",") === "137,80,78,71,13,10,26,10";
  if (type === "image/webp") {
    return bytes.length >= 12
      && String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF"
      && String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP";
  }
  return false;
}

export async function getPlatformSettings(): Promise<{ settings: PlatformSettings; error: string | null }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return { settings: defaultPlatformSettings, error: "Konfigurasi Supabase publik belum tersedia." };
  }

  try {
    const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/platform_settings?select=maintenance_enabled,maintenance_message,announcement_enabled,announcement_message,feature_flags,require_comic_review,creator_applications_enabled,max_comics_per_creator,max_upload_size_mb,max_pages_per_chapter,allowed_image_types&id=eq.true`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`HTTP ${response.status}: ${detail}`);
    }
    const [row] = await response.json() as PlatformSettings[];
    if (!row) return { settings: defaultPlatformSettings, error: null };
    return {
      settings: {
        ...defaultPlatformSettings,
        ...row,
        feature_flags: { ...defaultPlatformSettings.feature_flags, ...row.feature_flags },
        allowed_image_types: Array.isArray(row.allowed_image_types) ? row.allowed_image_types : defaultPlatformSettings.allowed_image_types,
      },
      error: null,
    };
  } catch (error) {
    console.error("Unable to load platform settings:", error);
    return { settings: defaultPlatformSettings, error: error instanceof Error ? error.message : "Pengaturan platform gagal dimuat." };
  }
}
