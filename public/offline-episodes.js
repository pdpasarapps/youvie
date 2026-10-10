(() => {
  const DB_NAME = "mu-komik-offline";
  const STORE_NAME = "episodes";
  const LICENSE_MS = 7 * 24 * 60 * 60 * 1000;
  const list = document.getElementById("episode-list");
  const library = document.getElementById("library");
  const reader = document.getElementById("reader");
  const pageList = document.getElementById("page-list");
  const errorNode = document.getElementById("offline-error");
  let episodes = [];
  let currentEpisode = null;
  let currentPage = 0;
  let objectUrls = [];
  let currentLicenseTimer = 0;

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Penyimpanan offline tidak dapat dibuka."));
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: "chapterId" });
      };
    });
  }

  async function requestStore(mode, callback) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const request = callback(transaction.objectStore(STORE_NAME));
      let result;
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => reject(request.error || new Error("Penyimpanan offline gagal."));
      transaction.oncomplete = () => { db.close(); resolve(result); };
      transaction.onerror = () => { db.close(); reject(transaction.error || new Error("Penyimpanan offline gagal.")); };
      transaction.onabort = () => { db.close(); reject(transaction.error || new Error("Penyimpanan offline dibatalkan.")); };
    });
  }

  function getSignedInUserIds() {
    const ownerId = localStorage.getItem("mu-komik:offline-current-user-id");
    return new Set(ownerId ? [ownerId] : []);
  }

  function formatSize(bytes) {
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toLocaleString("id-ID", { maximumFractionDigits: 1 })} MB`;
  }

  function isLicensed(episode, signedInIds) {
    const now = Date.now();
    const revokedAt = Number(localStorage.getItem(`mu-komik:offline-revoked:${episode.ownerId}`) || 0);
    return signedInIds.has(episode.ownerId)
      && Number.isFinite(revokedAt)
      && revokedAt <= episode.verifiedAt
      && episode.verifiedAt <= now
      && now - episode.verifiedAt < LICENSE_MS;
  }

  function appendText(parent, tag, text, className) {
    const element = document.createElement(tag);
    element.textContent = text;
    if (className) element.className = className;
    parent.append(element);
    return element;
  }

  function renderLibrary() {
    list.replaceChildren();
    if (!episodes.length) {
      appendText(list, "p", "Belum ada episode yang tersimpan. Sambungkan ke internet, lalu unduh episode dari halaman komik sebagai anggota Premium.", "empty");
      return;
    }
    const signedInIds = getSignedInUserIds();
    episodes.forEach((episode) => {
      const row = document.createElement("article");
      row.className = "episode";
      const copy = document.createElement("div");
      copy.className = "episode-copy";
      appendText(copy, "strong", `${episode.comicTitle} · Episode ${episode.chapterNumber}: ${episode.chapterTitle}`);
      appendText(copy, "small", `${formatSize(episode.sizeBytes)} · ${episode.pages.length} halaman`);
      const actionArea = document.createElement("div");
      actionArea.className = "actions";
      if (isLicensed(episode, signedInIds)) {
        const open = document.createElement("button");
        open.type = "button";
        open.textContent = "Baca offline";
        open.addEventListener("click", () => openReader(episode.chapterId));
        actionArea.append(open);
      } else {
        appendText(copy, "small", signedInIds.has(episode.ownerId)
          ? "Lisensi berakhir. Sambungkan ke internet dan verifikasi Premium kembali."
          : "Terkunci. Masuk kembali dengan akun yang mengunduh saat internet tersedia.");
      }
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "secondary";
      remove.textContent = "Hapus";
      remove.addEventListener("click", async () => {
        try {
          await requestStore("readwrite", (store) => store.delete(episode.chapterId));
          episodes = episodes.filter((item) => item.chapterId !== episode.chapterId);
          renderLibrary();
        } catch (error) {
          showError(error);
        }
      });
      actionArea.append(remove);
      row.append(copy, actionArea);
      list.append(row);
    });
  }

  function showError(error) {
    console.error("Unable to load MU-Komik offline episodes:", error);
    errorNode.textContent = error instanceof Error ? error.message : "Unduhan offline tidak dapat dimuat.";
  }

  function renderPage() {
    pageList.replaceChildren();
    objectUrls.forEach(URL.revokeObjectURL);
    objectUrls = [];
    const page = currentEpisode.pages[currentPage];
    const frame = document.createElement("article");
    frame.className = "offline-page";
    const image = document.createElement("img");
    image.src = URL.createObjectURL(page.image);
    image.alt = `${currentEpisode.comicTitle}, episode ${currentEpisode.chapterNumber}, halaman ${page.pageNumber}`;
    image.draggable = false;
    objectUrls.push(image.src);
    frame.append(image);
    const watermark = document.createElement("div");
    watermark.className = "offline-watermarks";
    const label = `MU-KOMIK.COM · ${localStorage.getItem("mu-komik:offline-watermark-name") || "Pembaca"}`;
    for (let index = 0; index < 6; index += 1) appendText(watermark, "span", label);
    frame.append(watermark);
    pageList.append(frame);
    document.getElementById("page-counter").textContent = `Halaman ${currentPage + 1} dari ${currentEpisode.pages.length}`;
    document.getElementById("previous-page").disabled = currentPage === 0;
    document.getElementById("next-page").disabled = currentPage >= currentEpisode.pages.length - 1;
    document.getElementById("previous-page").style.opacity = currentPage === 0 ? ".45" : "1";
    document.getElementById("next-page").style.opacity = currentPage >= currentEpisode.pages.length - 1 ? ".45" : "1";
  }

  async function openReader(chapterId) {
    const episode = episodes.find((item) => item.chapterId === chapterId);
    if (!episode || !isLicensed(episode, getSignedInUserIds())) {
      errorNode.textContent = "Episode terkunci. Periksa akun dan masa berlaku lisensi offline.";
      return;
    }
    currentEpisode = episode;
    currentPage = 0;
    window.clearTimeout(currentLicenseTimer);
    currentLicenseTimer = window.setTimeout(
      lockCurrentReaderIfNeeded,
      Math.max(0, episode.verifiedAt + LICENSE_MS - Date.now()),
    );
    library.hidden = true;
    reader.classList.add("active");
    document.getElementById("reader-title").textContent = `${episode.comicTitle} · Episode ${episode.chapterNumber}: ${episode.chapterTitle}`;
    document.getElementById("reader-meta").textContent = `${episode.pages.length} halaman · Lisensi tersimpan di perangkat`;
    renderPage();
    window.scrollTo(0, 0);
  }

  function lockCurrentReaderIfNeeded() {
    if (!currentEpisode || isLicensed(currentEpisode, getSignedInUserIds())) return;
    window.clearTimeout(currentLicenseTimer);
    objectUrls.forEach(URL.revokeObjectURL);
    objectUrls = [];
    currentEpisode = null;
    reader.classList.remove("active");
    library.hidden = false;
    errorNode.textContent = "Lisensi offline berakhir atau akun berubah. Sambungkan ke internet untuk verifikasi ulang.";
    renderLibrary();
  }

  document.getElementById("back-to-library").addEventListener("click", () => {
    window.clearTimeout(currentLicenseTimer);
    objectUrls.forEach(URL.revokeObjectURL);
    objectUrls = [];
    currentEpisode = null;
    reader.classList.remove("active");
    library.hidden = false;
    history.replaceState(null, "", "/");
  });
  document.getElementById("previous-page").addEventListener("click", () => {
    if (currentPage > 0) { currentPage -= 1; renderPage(); }
  });
  document.getElementById("next-page").addEventListener("click", () => {
    if (currentEpisode && currentPage < currentEpisode.pages.length - 1) { currentPage += 1; renderPage(); }
  });
  window.addEventListener("online", () => {
    const destination = currentEpisode
      ? `/comic/${encodeURIComponent(currentEpisode.comicSlug)}/chapter/${encodeURIComponent(currentEpisode.chapterId)}`
      : "/";
    location.assign(destination);
  });
  window.addEventListener("storage", () => {
    renderLibrary();
    lockCurrentReaderIfNeeded();
  });
  document.addEventListener("visibilitychange", lockCurrentReaderIfNeeded);

  requestStore("readonly", (store) => store.getAll())
    .then((items) => {
      episodes = items.sort((left, right) => left.comicTitle.localeCompare(right.comicTitle) || left.chapterNumber - right.chapterNumber);
      renderLibrary();
      const routeMatch = location.pathname.match(/\/chapter\/([^/]+)/);
      if (routeMatch) void openReader(decodeURIComponent(routeMatch[1]));
    })
    .catch(showError);
})();
