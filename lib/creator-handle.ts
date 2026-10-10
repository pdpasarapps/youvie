export function createCreatorHandle(displayName: string): string {
  return displayName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)
    .replace(/-$/g, "");
}

export function isValidCreatorHandle(handle: string): boolean {
  return handle.length >= 3
    && handle.length <= 40
    && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(handle);
}
