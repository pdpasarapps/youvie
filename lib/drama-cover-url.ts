export function getDramaCoverUrl(path: string | null | undefined) {
  return path ? `/api/drama-cover?key=${encodeURIComponent(path)}` : null;
}
