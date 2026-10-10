export const OFFLINE_EPISODE_LIMIT = 20;
export const OFFLINE_LICENSE_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const DATABASE_NAME = "mu-komik-offline";
const DATABASE_VERSION = 1;
const EPISODES_STORE = "episodes";

export type OfflineEpisodePage = {
  id: string;
  pageNumber: number;
  image: Blob;
};

export type OfflineEpisode = {
  chapterId: string;
  comicSlug: string;
  comicTitle: string;
  chapterTitle: string;
  chapterNumber: number;
  ownerId: string;
  downloadedAt: number;
  verifiedAt: number;
  sizeBytes: number;
  pages: OfflineEpisodePage[];
};

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("Penyimpanan offline tidak didukung browser ini."));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(EPISODES_STORE)) {
        database.createObjectStore(EPISODES_STORE, { keyPath: "chapterId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Penyimpanan offline gagal dibuka."));
    request.onblocked = () => reject(new Error("Penyimpanan offline sedang dipakai tab lain. Tutup tab MU-Komik lain lalu coba lagi."));
  });
}

function runTransaction<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDatabase().then((database) => new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(EPISODES_STORE, mode);
    const request = operation(transaction.objectStore(EPISODES_STORE));
    let result: T;
    request.onsuccess = () => { result = request.result; };
    request.onerror = () => reject(request.error ?? new Error("Penyimpanan episode offline gagal."));
    transaction.oncomplete = () => {
      database.close();
      resolve(result);
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("Penyimpanan episode offline gagal."));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error ?? new Error("Penyimpanan episode offline dibatalkan."));
    };
  }));
}

export function getOfflineEpisodes(): Promise<OfflineEpisode[]> {
  return runTransaction("readonly", (store) => store.getAll());
}

export function getOfflineEpisode(chapterId: string): Promise<OfflineEpisode | undefined> {
  return runTransaction("readonly", (store) => store.get(chapterId));
}

export async function saveOfflineEpisode(episode: OfflineEpisode, replacementChapterId?: string): Promise<void> {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(EPISODES_STORE, "readwrite");
    const store = transaction.objectStore(EPISODES_STORE);
    const countRequest = store.count();
    const currentRequest = store.get(episode.chapterId);
    const replacementRequest = replacementChapterId && replacementChapterId !== episode.chapterId
      ? store.get(replacementChapterId)
      : null;
    let pending = replacementRequest ? 3 : 2;
    let currentEpisodeExists = false;
    let replacementExists = false;
    let abortMessage = "";
    const checkReady = () => {
      pending -= 1;
      if (pending > 0) return;
      currentEpisodeExists = Boolean(currentRequest.result);
      replacementExists = Boolean(replacementRequest?.result);
      if (countRequest.result >= OFFLINE_EPISODE_LIMIT && !currentEpisodeExists && !replacementExists) {
        abortMessage = replacementChapterId
          ? "Unduhan yang dipilih sebagai pengganti tidak ditemukan. Perbarui daftar unduhan lalu coba lagi."
          : "Batas 20 episode per perangkat sudah tercapai. Pilih unduhan lama yang akan diganti.";
        transaction.abort();
        return;
      }
      if (!currentEpisodeExists && replacementExists && replacementChapterId && replacementChapterId !== episode.chapterId) {
        store.delete(replacementChapterId);
      }
      store.put(episode);
    };
    countRequest.onsuccess = checkReady;
    currentRequest.onsuccess = checkReady;
    replacementRequest?.addEventListener("success", checkReady);
    for (const request of [countRequest, currentRequest, ...(replacementRequest ? [replacementRequest] : [])]) {
      request.onerror = () => {
        abortMessage = "Unduhan offline tidak dapat disimpan. Periksa ruang penyimpanan browser.";
        transaction.abort();
      };
    }
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("Episode tidak dapat disimpan. Periksa ruang penyimpanan browser."));
    };
    transaction.onabort = () => {
      database.close();
      reject(new Error(abortMessage || transaction.error?.message || "Episode offline tidak dapat disimpan."));
    };
  });
}

export async function removeOfflineEpisode(chapterId: string): Promise<void> {
  await runTransaction("readwrite", (store) => store.delete(chapterId));
}

export async function refreshOfflineLicenses(ownerId: string): Promise<void> {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(EPISODES_STORE, "readwrite");
    const store = transaction.objectStore(EPISODES_STORE);
    const request = store.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const episode = cursor.value as OfflineEpisode;
      if (episode.ownerId === ownerId) cursor.update({ ...episode, verifiedAt: Date.now() });
      cursor.continue();
    };
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("Lisensi unduhan offline tidak dapat diperbarui."));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error ?? new Error("Lisensi unduhan offline tidak dapat diperbarui."));
    };
  });
}

export async function revokeOfflineLicenses(ownerId: string): Promise<void> {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(EPISODES_STORE, "readwrite");
    const request = transaction.objectStore(EPISODES_STORE).openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const episode = cursor.value as OfflineEpisode;
      if (episode.ownerId === ownerId) cursor.update({ ...episode, verifiedAt: 0 });
      cursor.continue();
    };
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("Lisensi unduhan offline tidak dapat dikunci."));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error ?? new Error("Lisensi unduhan offline tidak dapat dikunci."));
    };
  });
}

export async function synchronizeOfflineMembership(ownerId: string, tier: "free" | "premium" | "vip"): Promise<void> {
  const revocationKey = `mu-komik:offline-revoked:${ownerId}`;
  if (tier === "premium" || tier === "vip") {
    await refreshOfflineLicenses(ownerId);
    localStorage.removeItem(revocationKey);
    return;
  }
  localStorage.setItem(revocationKey, String(Date.now()));
  await revokeOfflineLicenses(ownerId);
}

export function isOfflineLicenseValid(episode: OfflineEpisode, ownerId: string, now = Date.now()): boolean {
  const revokedAt = Number(localStorage.getItem(`mu-komik:offline-revoked:${ownerId}`) || 0);
  return episode.ownerId === ownerId
    && episode.verifiedAt <= now
    && Number.isFinite(revokedAt)
    && revokedAt <= episode.verifiedAt
    && now - episode.verifiedAt < OFFLINE_LICENSE_DURATION_MS;
}

export function formatOfflineSize(sizeBytes: number): string {
  if (sizeBytes < 1024 * 1024) return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
  return `${(sizeBytes / (1024 * 1024)).toLocaleString("id-ID", { maximumFractionDigits: 1 })} MB`;
}

export function getOfflineTimestamp(): number {
  return Date.now();
}
