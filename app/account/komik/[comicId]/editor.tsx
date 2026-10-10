"use client";

import { FormEvent, useEffect, useRef, useState, type DragEvent } from "react";
import { ArrowLeft, ArrowUpRight, BookOpen, ChevronDown, ChevronLeft, ChevronRight, GripVertical, Info, LoaderCircle, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { COMIC_GENRES, getComicGenreLabel } from "@/lib/comic-genres";
import { COMIC_LANGUAGES, ORIGIN_TYPES, PRODUCTION_TECHNIQUES, STORY_STATUSES, TARGET_AUDIENCES } from "@/lib/comic-metadata";
import { COMIC_TARGET_DEVICES, type ComicTargetDevice } from "@/lib/comic-target-device";
import { createComicSharePreview } from "@/lib/comic-share-preview";
import { usePlatformSettings } from "../../../platform-runtime";
import ImageCropDialog from "@/components/image-crop-dialog";

type ComicContributor = { role: string; name: string };
type Comic = {
  id: string;
  title: string;
  slug: string;
  synopsis: string;
  contributor: string;
  contributors: ComicContributor[];
  genre: string;
  target_device: ComicTargetDevice;
  production_technique: string;
  story_status: string;
  target_audience: string;
  language: string;
  origin_type: string;
  source_info: string;
  status: string;
  cover_key: string | null;
  share_preview_key: string | null;
};
type ComicForm = {
  title: string;
  synopsis: string;
  genre: string;
  targetDevice: ComicTargetDevice;
  contributors: ComicContributor[];
  technique: string;
  storyStatus: string;
  targetAudience: string;
  language: string;
  otherLanguage: string;
  originType: string;
  sourceInfo: string;
};
type Chapter = { id: string; title: string; chapter_number: number; published_at: string | null };
type ChapterPage = { id: string; chapter_id: string; page_number: number; object_key: string };

const supabase = createClient();
const initialComicForm: ComicForm = {
  title: "",
  synopsis: "",
  genre: "Fantasy",
  targetDevice: "all",
  contributors: [{ role: "Penulis", name: "" }],
  technique: "traditional_drawing",
  storyStatus: "ongoing",
  targetAudience: "all_ages",
  language: "id",
  otherLanguage: "",
  originType: "original",
  sourceInfo: "",
};

function getLocalizedContributorRole(role: string) {
  const localizedRoles: Record<string, string> = {
    inker: "Penintaan",
    outline: "Pembuat outline",
    coloring: "Pewarnaan",
    outlet: "Penintaan",
    editor: "Penyunting",
    letterer: "Penata huruf",
  };
  return localizedRoles[role.trim().toLowerCase()] ?? role;
}

function getComicForm(comic: Comic): ComicForm {
  const storedContributors = Array.isArray(comic.contributors) ? comic.contributors : [];
  const namedContributors = storedContributors.filter((item) => item.name?.trim());
  const knownLanguages = COMIC_LANGUAGES.map((item) => item.value);
  const hasKnownLanguage = knownLanguages.some((language) => language === comic.language);
  return {
    title: comic.title,
    synopsis: comic.synopsis,
    genre: comic.genre,
    targetDevice: COMIC_TARGET_DEVICES.find((device) => device.value === comic.target_device)?.value ?? "all",
    contributors: namedContributors.length
      ? namedContributors.map((item) => ({ role: getLocalizedContributorRole(item.role || ""), name: item.name || "" }))
      : [{ role: "Penulis", name: comic.contributor || "" }],
    technique: comic.production_technique || "traditional_drawing",
    storyStatus: comic.story_status || "ongoing",
    targetAudience: comic.target_audience || "all_ages",
    language: hasKnownLanguage ? comic.language : "other",
    otherLanguage: hasKnownLanguage ? "" : comic.language || "",
    originType: comic.origin_type || "original",
    sourceInfo: comic.source_info || "",
  };
}

function getPageLabel(pageNumber: number) {
  const label = `Hal ${pageNumber}`;
  return label.length > 8 ? `${label.slice(0, 7)}…` : label;
}

export default function CreatorComicPage() {
  const { settings } = usePlatformSettings();
  const { comicId } = useParams<{ comicId: string }>();
  const router = useRouter();
  const [comic, setComic] = useState<Comic | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [expandedChapterIds, setExpandedChapterIds] = useState<string[] | null>(null);
  const [pagesByChapter, setPagesByChapter] = useState<Record<string, ChapterPage[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingComic, setSavingComic] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [activeTab, setActiveTab] = useState<"comic" | "chapters">("chapters");
  const [editingChapterId, setEditingChapterId] = useState<string | null>(null);
  const [deletingChapterId, setDeletingChapterId] = useState<string | null>(null);
  const [deletingPageId, setDeletingPageId] = useState<string | null>(null);
  const [reorderingPageId, setReorderingPageId] = useState<string | null>(null);
  const [draggedPageId, setDraggedPageId] = useState<string | null>(null);
  const [draggedPageChapterId, setDraggedPageChapterId] = useState<string | null>(null);
  const [pageDropSlot, setPageDropSlot] = useState<{ chapterId: string; index: number } | null>(null);
  const reorderInFlightRef = useRef(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ title: "", chapterNumber: "", published: false });
  const [comicForm, setComicForm] = useState<ComicForm>(initialComicForm);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverCropFile, setCoverCropFile] = useState<File | null>(null);
  const [uploadingChapter, setUploadChapterState] = useState<Chapter | null>(null);
  const uploadChapterRef = useRef<Chapter | null>(null);
  const setUploadChapter = (chapter: Chapter | null) => {
    uploadChapterRef.current = chapter;
    setUploadChapterState(chapter);
  };
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    percent: number;
    fileName: string;
    fileIndex: number;
    totalFiles: number;
  } | null>(null);
  const startCoverCrop = (file: File | null) => {
    if (!file) return;
    if (!settings.allowed_image_types.includes(file.type)) {
      setMessage(`Format sampul harus ${settings.allowed_image_types.map((type) => type.replace("image/", "").toUpperCase()).join(", ")}.`);
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setMessage("Gambar sumber maksimal 25 MB agar dapat diproses dengan lancar di perangkat.");
      return;
    }
    setMessage("");
    setCoverCropFile(file);
  };

  useEffect(() => {
    const loadComic = async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        router.replace("/login");
        return;
      }
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", userData.user.id).single();
      if (profile?.role !== "creator" && profile?.role !== "admin") {
        router.replace("/account");
        return;
      }
      const comicQuery = supabase.from("comics").select("id, title, slug, synopsis, contributor, contributors, genre, target_device, production_technique, story_status, target_audience, language, origin_type, source_info, status, cover_key, share_preview_key").eq("id", comicId);
      const { data: comicData } = profile.role === "admin" ? await comicQuery.single() : await comicQuery.eq("creator_id", userData.user.id).single();
      if (!comicData) {
        router.replace("/account/creator");
        return;
      }
      setComic(comicData);
      setComicForm(getComicForm(comicData));
      if (new URLSearchParams(window.location.search).get("edit") === "comic") {
        setActiveTab("comic");
      }
      const { data: chapterData } = await supabase.from("chapters").select("id, title, chapter_number, published_at").eq("comic_id", comicId).order("chapter_number", { ascending: true });
      const loadedChapters = chapterData ?? [];
      setChapters(loadedChapters);
      const storageKey = `mu-komik:expanded-chapters:${comicData.id}`;
      let expandedIds = loadedChapters.slice(0, 1).map((chapter) => chapter.id);
      try {
        const stored = window.localStorage.getItem(storageKey);
        if (stored !== null) {
          const parsed: unknown = JSON.parse(stored);
          if (!Array.isArray(parsed) || parsed.some((id) => typeof id !== "string")) {
            throw new Error("Saved chapter visibility is invalid.");
          }
          const chapterIds = new Set(loadedChapters.map((chapter) => chapter.id));
          expandedIds = parsed.filter((id: string) => chapterIds.has(id));
        } else {
          window.localStorage.setItem(storageKey, JSON.stringify(expandedIds));
        }
      } catch (error) {
        console.error("Unable to load saved chapter visibility:", error);
      }
      setExpandedChapterIds(expandedIds);
      if (loadedChapters.length) {
        const { data: pageData } = await supabase.from("pages").select("id, chapter_id, page_number, object_key").in("chapter_id", loadedChapters.map((chapter) => chapter.id)).order("page_number", { ascending: true });
        setPagesByChapter((pageData ?? []).reduce<Record<string, ChapterPage[]>>((grouped, page) => {
          grouped[page.chapter_id] = [...(grouped[page.chapter_id] ?? []), page];
          return grouped;
        }, {}));
      }
      setLoading(false);
    };
    loadComic();
  }, [comicId, router]);

  const setChapterExpanded = (chapterId: string, expanded: boolean) => {
    const current = expandedChapterIds ?? chapters.slice(0, 1).map((chapter) => chapter.id);
    const next = expanded
      ? Array.from(new Set([...current, chapterId]))
      : current.filter((id) => id !== chapterId);
    setExpandedChapterIds(next);
    try {
      window.localStorage.setItem(`mu-komik:expanded-chapters:${comic?.id ?? comicId}`, JSON.stringify(next));
    } catch (error) {
      console.error("Unable to save chapter visibility:", error);
    }
  };

  const createChapter = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!comic) return;
    setSaving(true);
    setMessage("");
    const chapterNumber = Number(form.chapterNumber);
    if (!Number.isInteger(chapterNumber) || chapterNumber < 1) {
      setMessage("Nomor bab harus berupa bilangan bulat positif.");
      setSaving(false);
      return;
    }
    const existingChapter = chapters.find((chapter) => chapter.id === editingChapterId);
    const publishedAt = form.published ? existingChapter?.published_at || new Date().toISOString() : null;
    if (editingChapterId) {
      const { data, error } = await supabase
        .from("chapters")
        .update({ title: form.title.trim(), chapter_number: chapterNumber, published_at: publishedAt })
        .eq("id", editingChapterId)
        .eq("comic_id", comic.id)
        .select("id, title, chapter_number, published_at")
        .single();
      if (error) {
        console.error("Unable to update chapter:", error);
        setMessage(error.code === "23505" ? "Nomor bab ini sudah digunakan." : "Bab gagal diperbarui. Periksa koneksi dan coba lagi.");
      } else {
        setChapters((current) => current.map((chapter) => chapter.id === data.id ? data : chapter).sort((a, b) => a.chapter_number - b.chapter_number));
        setShowForm(false);
        setEditingChapterId(null);
        setForm({ title: "", chapterNumber: "", published: false });
        setMessage("Bab berhasil diperbarui.");
      }
    } else {
      const { data, error } = await supabase
        .from("chapters")
        .insert({ comic_id: comic.id, title: form.title.trim(), chapter_number: chapterNumber, published_at: publishedAt })
        .select("id, title, chapter_number, published_at")
        .single();
      if (error) {
        console.error("Unable to create chapter:", error);
        setMessage(error.code === "23505" ? "Nomor bab ini sudah digunakan." : "Bab gagal dibuat. Periksa koneksi dan coba lagi.");
      } else {
        setChapters((current) => [...current, data].sort((a, b) => a.chapter_number - b.chapter_number));
        setForm({ title: "", chapterNumber: "", published: false });
        setShowForm(false);
        setMessage("Bab berhasil dibuat. Selanjutnya, kamu dapat menambahkan halaman.");
      }
    }
    setSaving(false);
  };

  const startComicEdit = () => {
    if (!comic) return;
    setComicForm(getComicForm(comic));
    setCoverFile(null);
    switchEditorTab("comic");
  };

  const switchEditorTab = (tab: "comic" | "chapters") => {
    setActiveTab(tab);
    if (!comic) return;
    router.replace(`/account/komik/${encodeURIComponent(comic.id)}${tab === "comic" ? "?edit=comic" : ""}`, { scroll: false });
  };

  const updateContributor = (index: number, field: keyof ComicContributor, value: string) => {
    setComicForm((current) => ({
      ...current,
      contributors: current.contributors.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item),
    }));
  };

  const addContributor = () => {
    setComicForm((current) => ({ ...current, contributors: [...current.contributors, { role: "", name: "" }] }));
  };

  const removeContributor = (index: number) => {
    setComicForm((current) => current.contributors.length <= 1
      ? current
      : { ...current, contributors: current.contributors.filter((_, itemIndex) => itemIndex !== index) });
  };

  const updateComic = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!comic) return;
    const contributors = comicForm.contributors.map((item) => ({ role: item.role.trim(), name: item.name.trim() }));
    if (!contributors.length || contributors.some((item) => !item.role || !item.name)) {
      setMessage("Lengkapi peran dan nama untuk minimal satu kontributor.");
      return;
    }
    const language = comicForm.language === "other" ? comicForm.otherLanguage.trim() : comicForm.language;
    if (!language) {
      setMessage("Masukkan bahasa komik.");
      return;
    }
    if (comicForm.originType === "adaptation" && !comicForm.sourceInfo.trim()) {
      setMessage("Cantumkan sumber karya yang diadaptasi.");
      return;
    }
    setSavingComic(true);
    setMessage("");
    const previousCoverKey = comic.cover_key;
    let uploadedCoverKey: string | null = null;
    let uploadedSharePreviewKey: string | null = null;
    let comicSaved = false;

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Sesi kamu telah berakhir. Silakan masuk kembali.");

      let coverKey = previousCoverKey;
      let sharePreviewKey = comic.share_preview_key;
      if (coverFile) {
        const uploadForm = new FormData();
        uploadForm.set("kind", "cover");
        uploadForm.set("comicId", comic.id);
        uploadForm.set("file", coverFile);
        const signResponse = await fetch("/api/r2/upload-image", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: uploadForm,
        });
        const uploadResult = await signResponse.json() as { objectKey?: string; error?: string };
        if (!signResponse.ok || !uploadResult.objectKey) {
          throw new Error(uploadResult.error || "Sampul komik tidak dapat diunggah.");
        }
        uploadedCoverKey = uploadResult.objectKey;
        coverKey = uploadedCoverKey;

        const preview = await createComicSharePreview(coverFile, comicForm.title.trim());
        const previewForm = new FormData();
        previewForm.set("comicId", comic.id);
        previewForm.set("coverKey", coverKey);
        previewForm.set("file", preview, "share-preview.jpg");
        const previewSignResponse = await fetch("/api/r2/share-preview", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: previewForm,
        });
        const previewUploadResult = await previewSignResponse.json() as { objectKey?: string; error?: string };
        if (!previewSignResponse.ok || !previewUploadResult.objectKey) {
          throw new Error(previewUploadResult.error || "Pratinjau berbagi komik tidak dapat diunggah.");
        }
        uploadedSharePreviewKey = previewUploadResult.objectKey;
        sharePreviewKey = uploadedSharePreviewKey;
      }

      const { data, error } = await supabase
        .from("comics")
        .update({
          title: comicForm.title.trim(),
          synopsis: comicForm.synopsis.trim(),
          genre: comicForm.genre,
          target_device: comicForm.targetDevice,
          contributor: contributors.map((item) => `${item.role}: ${item.name}`).join(" · "),
          contributors,
          production_technique: comicForm.technique,
          story_status: comicForm.storyStatus,
          target_audience: comicForm.targetAudience,
          language,
          origin_type: comicForm.originType,
          source_info: comicForm.originType === "adaptation" ? comicForm.sourceInfo.trim() : "",
          cover_key: coverKey,
          share_preview_key: sharePreviewKey,
          status: comic.status === "published" ? "pending_review" : comic.status,
        })
        .eq("id", comic.id)
        .select("id, title, slug, synopsis, contributor, contributors, genre, target_device, production_technique, story_status, target_audience, language, origin_type, source_info, status, cover_key, share_preview_key")
        .single();
      if (error) throw new Error(error.message);

      comicSaved = true;
      setComic(data);
      setComicForm(getComicForm(data));
      setCoverFile(null);

      let cleanupPending = false;
      if (previousCoverKey && coverKey !== previousCoverKey) {
        try {
          const cleanupResponse = await fetch("/api/r2/comic-cover", {
            method: "DELETE",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ comicId: comic.id, objectKey: previousCoverKey }),
          });
          cleanupPending = !cleanupResponse.ok;
        } catch {
          cleanupPending = true;
        }
      }
      setMessage(cleanupPending
        ? "Komik berhasil diperbarui, tetapi sampul sebelumnya tidak dapat dihapus dari penyimpanan."
        : comic.status === "published"
          ? "Komik berhasil diperbarui dan dikirim untuk ditinjau admin."
          : "Detail komik berhasil diperbarui.");
    } catch (error) {
      if (uploadedCoverKey && !comicSaved) {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (token) {
          await fetch("/api/r2/comic-cover", {
            method: "DELETE",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ comicId: comic.id, objectKey: uploadedCoverKey }),
          }).catch(() => undefined);
        }
      }
      if (uploadedSharePreviewKey && coverFile && !comicSaved) {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (token && uploadedCoverKey) {
          await fetch("/api/r2/share-preview", {
            method: "DELETE",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              comicId: comic.id,
              coverKey: uploadedCoverKey,
              previewKey: uploadedSharePreviewKey,
            }),
          }).catch((cleanupError: unknown) => {
            console.error("Unable to clean up failed comic share preview upload:", cleanupError);
          });
        }
      }
      setMessage(error instanceof Error ? error.message : "Detail komik tidak dapat diperbarui.");
    } finally {
      setSavingComic(false);
    }
  };

  const startChapterForm = (chapter?: Chapter) => {
    setActiveTab("chapters");
    setEditingChapterId(chapter?.id ?? null);
    setForm(chapter
      ? { title: chapter.title, chapterNumber: String(chapter.chapter_number), published: Boolean(chapter.published_at) }
      : { title: "", chapterNumber: "", published: false });
    setShowForm(true);
  };

  const deleteChapter = async (chapter: Chapter) => {
    if (!comic || !window.confirm(`Hapus "${chapter.title}" beserta semua halamannya? Tindakan ini tidak dapat dibatalkan.`)) return;
    setDeletingChapterId(chapter.id);
    setMessage("");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Sesi kamu telah berakhir. Silakan masuk kembali.");
      const response = await fetch("/api/r2/delete-chapter", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ comicId: comic.id, chapterId: chapter.id }),
      });
      const result = await response.json() as { deleted?: boolean; storageCleanupPending?: boolean; error?: string };
      if (!response.ok || !result.deleted) throw new Error(result.error || "Bab tidak dapat dihapus.");
      setChapters((current) => current.filter((item) => item.id !== chapter.id));
      setMessage(result.storageCleanupPending
        ? "Bab berhasil dihapus, tetapi beberapa berkas gambar tidak dapat dihapus dari penyimpanan."
        : "Bab dan semua halamannya berhasil dihapus.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Bab tidak dapat dihapus.");
    }
    setDeletingChapterId(null);
  };

  const uploadPages = async (event: React.ChangeEvent<HTMLInputElement>, selectedChapter?: Chapter) => {
    const files = Array.from(event.target.files || []);
    const chapter = selectedChapter || uploadChapterRef.current || chapters.find((item) => item.id === event.target.dataset.chapterId);
    if (!comic || !chapter || !files.length) return;
    setUploadChapter(chapter);
    setUploading(true);
    setMessage("");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Sesi kamu telah berakhir. Silakan masuk kembali.");
      const totalBytes = files.reduce((total, file) => total + file.size, 0);
      let completedBytes = 0;
      for (const [fileIndex, file] of files.entries()) {
        const uploadForm = new FormData();
        uploadForm.set("kind", "page");
        uploadForm.set("comicId", comic.id);
        uploadForm.set("chapterId", chapter.id);
        uploadForm.set("file", file);
        setUploadProgress({
          percent: Math.floor((completedBytes / totalBytes) * 100),
          fileName: file.name,
          fileIndex: fileIndex + 1,
          totalFiles: files.length,
        });
        const page = await new Promise<ChapterPage>((resolve, reject) => {
          const request = new XMLHttpRequest();
          request.open("POST", "/api/r2/upload-image");
          request.setRequestHeader("Authorization", `Bearer ${token}`);
          request.responseType = "json";
          request.upload.onprogress = (progressEvent) => {
            if (!progressEvent.lengthComputable || totalBytes === 0) return;
            const currentFileProgress = Math.min(progressEvent.loaded / progressEvent.total, 1);
            const percent = Math.min(99, Math.floor(((completedBytes + file.size * currentFileProgress) / totalBytes) * 100));
            setUploadProgress({ percent, fileName: file.name, fileIndex: fileIndex + 1, totalFiles: files.length });
          };
          request.onload = () => {
            const result = request.response as { page?: ChapterPage; error?: string } | null;
            if (request.status < 200 || request.status >= 300 || !result?.page) {
              reject(new Error(result?.error || `Halaman ${file.name} gagal diunggah.`));
              return;
            }
            resolve(result.page);
          };
          request.onerror = () => reject(new Error(`Koneksi gagal saat mengunggah halaman ${file.name}.`));
          request.onabort = () => reject(new Error(`Unggah halaman ${file.name} dibatalkan.`));
          request.send(uploadForm);
        });
        setPagesByChapter((current) => ({ ...current, [chapter.id]: [...(current[chapter.id] ?? []), page] }));
        completedBytes += file.size;
        setUploadProgress({
          percent: Math.min(99, Math.floor((completedBytes / totalBytes) * 100)),
          fileName: file.name,
          fileIndex: fileIndex + 1,
          totalFiles: files.length,
        });
      }
      setMessage(`${files.length} halaman berhasil diunggah.`);
      setUploadChapter(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Halaman gagal diunggah.");
    }
    setUploading(false);
    setUploadProgress(null);
    event.target.value = "";
  };

  const deletePage = async (chapter: Chapter, page: ChapterPage) => {
    if (!comic || !window.confirm(`Hapus halaman ${page.page_number}? Tindakan ini tidak dapat dibatalkan.`)) return;
    setDeletingPageId(page.id);
    setMessage("");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Sesi kamu telah berakhir. Silakan masuk kembali.");
      const response = await fetch("/api/r2/delete-page", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ comicId: comic.id, chapterId: chapter.id, pageId: page.id }),
      });
      const result = await response.json() as { deleted?: boolean; storageCleanupPending?: boolean; error?: string };
      if (!response.ok || !result.deleted) throw new Error(result.error || "Halaman tidak dapat dihapus.");
      setPagesByChapter((current) => ({
        ...current,
        [chapter.id]: (current[chapter.id] ?? []).filter((item) => item.id !== page.id),
      }));
      setMessage(result.storageCleanupPending
        ? "Halaman berhasil dihapus, tetapi berkas gambarnya tidak dapat dihapus dari penyimpanan."
        : "Halaman dan gambarnya berhasil dihapus.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Halaman tidak dapat dihapus.");
    }
    setDeletingPageId(null);
  };

  const swapPagesOnServer = async (chapterId: string, pageId: string, targetPageId: string) => {
    if (!comic) throw new Error("Komik tidak ditemukan.");
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error("Sesi kamu telah berakhir. Silakan masuk kembali.");
    const response = await fetch("/api/r2/reorder-page", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ comicId: comic.id, chapterId, pageId, targetPageId }),
    });
    const result = await response.json() as { reordered?: boolean; pages?: Array<{ id: string; page_number: number }>; error?: string };
    if (!response.ok || !result.reordered || !result.pages) throw new Error(result.error || "Urutan halaman tidak dapat diubah.");
    return result.pages;
  };

  const reorderPage = async (chapter: Chapter, page: ChapterPage, targetPage: ChapterPage) => {
    if (reorderInFlightRef.current) return;
    reorderInFlightRef.current = true;
    setReorderingPageId(page.id);
    setMessage("");
    try {
      const updatedPages = await swapPagesOnServer(chapter.id, page.id, targetPage.id);
      const updatedNumbers = new Map(updatedPages.map((item) => [item.id, item.page_number]));
      setPagesByChapter((current) => ({
        ...current,
        [chapter.id]: (current[chapter.id] ?? [])
          .map((item) => updatedNumbers.has(item.id) ? { ...item, page_number: updatedNumbers.get(item.id)! } : item)
          .sort((first, second) => first.page_number - second.page_number),
      }));
      setMessage("Urutan halaman berhasil diperbarui.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Urutan halaman tidak dapat diubah.");
    } finally {
      reorderInFlightRef.current = false;
      setReorderingPageId(null);
    }
  };

  const movePageToIndex = async (chapter: Chapter, page: ChapterPage, targetIndex: number) => {
    if (reorderInFlightRef.current) return;
    const currentPages = pagesByChapter[chapter.id] ?? [];
    const startIndex = currentPages.findIndex((item) => item.id === page.id);
    if (startIndex < 0) return;
    const finalIndex = Math.max(0, Math.min(targetIndex > startIndex ? targetIndex - 1 : targetIndex, currentPages.length - 1));
    if (startIndex === finalIndex) return;

    reorderInFlightRef.current = true;
    setReorderingPageId(page.id);
    setMessage("");
    try {
      const direction = finalIndex > startIndex ? 1 : -1;
      const firstNeighborIndex = startIndex + direction;
      const swapToFinalIndex = async (neighborIndex: number): Promise<void> => {
        if (direction > 0 ? neighborIndex > finalIndex : neighborIndex < finalIndex) return;
        const updatedPages = await swapPagesOnServer(chapter.id, page.id, currentPages[neighborIndex].id);
        const updatedNumbers = new Map(updatedPages.map((item) => [item.id, item.page_number]));
        setPagesByChapter((current) => ({
          ...current,
          [chapter.id]: (current[chapter.id] ?? [])
            .map((item) => updatedNumbers.has(item.id) ? { ...item, page_number: updatedNumbers.get(item.id)! } : item)
            .sort((first, second) => first.page_number - second.page_number),
        }));
        await swapToFinalIndex(neighborIndex + direction);
      };
      await swapToFinalIndex(firstNeighborIndex);
      setMessage("Urutan halaman berhasil diperbarui.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Urutan halaman tidak dapat diubah.");
    } finally {
      reorderInFlightRef.current = false;
      setReorderingPageId(null);
      setDraggedPageId(null);
      setDraggedPageChapterId(null);
      setPageDropSlot(null);
    }
  };

  const handlePageDragOver = (event: DragEvent<HTMLElement>, chapter: Chapter, index: number) => {
    if (!draggedPageId || draggedPageChapterId !== chapter.id) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setPageDropSlot((current) => current?.chapterId === chapter.id && current.index === index ? current : { chapterId: chapter.id, index });
  };

  const handlePageDrop = (event: DragEvent<HTMLElement>, chapter: Chapter, index: number) => {
    event.preventDefault();
    if (draggedPageChapterId !== chapter.id) {
      setDraggedPageId(null);
      setDraggedPageChapterId(null);
      setPageDropSlot(null);
      return;
    }
    const pageId = event.dataTransfer.getData("text/plain") || draggedPageId;
    const page = (pagesByChapter[chapter.id] ?? []).find((item) => item.id === pageId);
    setPageDropSlot(null);
    if (page) void movePageToIndex(chapter, page, index);
    else {
      setDraggedPageId(null);
      setDraggedPageChapterId(null);
    }
  };

  const handlePageCardDragOver = (event: DragEvent<HTMLDivElement>, chapter: Chapter, pageIndex: number) => {
    if (!draggedPageId || draggedPageChapterId !== chapter.id) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const bounds = event.currentTarget.getBoundingClientRect();
    const index = event.clientX < bounds.left + bounds.width / 2 ? pageIndex : pageIndex + 1;
    setPageDropSlot((current) => current?.chapterId === chapter.id && current.index === index ? current : { chapterId: chapter.id, index });
  };

  if (loading) return <div className="creator-comic-editor-loading"><LoaderCircle className="spin" size={24} /></div>;
  if (!comic) return null;
  const publicUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;
  const thumbnailKey = comic.cover_key || pagesByChapter[chapters[0]?.id]?.[0]?.object_key;
  const coverUrl = thumbnailKey && publicUrl ? `${publicUrl.replace(/\/$/, "")}/${thumbnailKey}` : null;
  const contributorSummary = Array.isArray(comic.contributors) && comic.contributors.length
    ? comic.contributors.map((item) => `${getLocalizedContributorRole(item.role)}: ${item.name}`).join(" · ")
    : comic.contributor;

  return (
    <>
    <div className="creator-comic-editor">
      <header className="chapter-manager-header">
        <Link className="auth-back creator-comic-back" href="/account/komiku"><ArrowLeft size={16} /> Komikku</Link>
        <div className="chapter-manager-intro">
          <div className={`chapter-manager-cover ${coverUrl ? "has-cover" : ""}`}>
            {coverUrl
              ? <img src={coverUrl} alt={`Sampul ${comic.title}`} />
              : <div className="chapter-manager-cover-fallback" role="img" aria-label={`Sampul ${comic.title}`}><span>{getComicGenreLabel(comic.genre)}</span><strong>{comic.title.slice(0, 2).toUpperCase()}</strong></div>}
          </div>
          <div className="chapter-manager-title">
            <p className="eyebrow"><span /> Kelola komik</p>
            <h1>{comic.title}</h1>
            {contributorSummary && <p className="chapter-manager-contributors">{contributorSummary}</p>}
            <div className="chapter-manager-description-row">
              <p>{comic.synopsis}</p>
            </div>
            <div className="chapter-manager-inline-actions">
              <span className={`request-status request-${comic.status === "published" ? "approved" : "pending"}`}>
                {comic.status === "pending_review" ? "Menunggu kurasi" : comic.status === "published" ? "Terbit" : comic.status === "draft" ? "Draf" : "Diarsipkan"}
              </span>
              <button className="button button-light chapter-manager-inline-edit" onClick={startComicEdit}>
                <Pencil size={16} /> Ubah komik
              </button>
            </div>
          </div>
        </div>
      </header>
      {message && <p className="creator-message" role="status">{message}</p>}
      <div className="comic-editor-tabs" role="tablist" aria-label="Kelola komik">
        <button id="comic-details-tab" type="button" role="tab" aria-selected={activeTab === "comic"} aria-controls="comic-details-panel" onClick={() => switchEditorTab("comic")}>Ubah komik</button>
        <button id="comic-chapters-tab" type="button" role="tab" aria-selected={activeTab === "chapters"} aria-controls="comic-chapters-panel" onClick={() => switchEditorTab("chapters")}>Bab &amp; halaman <span>{chapters.length}</span></button>
      </div>
      {activeTab === "comic" && (
        <div id="comic-details-panel" className="comic-editor-tab-panel" role="tabpanel" aria-labelledby="comic-details-tab">
        <form className="comic-form" onSubmit={updateComic}>
          <div className="form-heading">
            <div>
              <p className="eyebrow">Pengaturan komik</p>
              <h2>Ubah komik</h2>
            </div>
            <button type="button" className="form-close" aria-label="Kembali ke bab dan halaman" onClick={() => switchEditorTab("chapters")}>&times;</button>
          </div>
          <label>Judul Komik<input required maxLength={120} value={comicForm.title} onChange={(event) => setComicForm({ ...comicForm, title: event.target.value })} /></label>
          <label>Genre<select value={comicForm.genre} onChange={(event) => setComicForm({ ...comicForm, genre: event.target.value })}>{COMIC_GENRES.map((genre) => <option key={genre} value={genre}>{getComicGenreLabel(genre)}</option>)}</select></label>
          <label>Target perangkat<select value={comicForm.targetDevice} onChange={(event) => setComicForm({ ...comicForm, targetDevice: COMIC_TARGET_DEVICES.find((device) => device.value === event.target.value)?.value ?? "all" })}>{COMIC_TARGET_DEVICES.map((device) => <option key={device.value} value={device.value}>{device.label}</option>)}</select><small>{comicForm.targetDevice === "all" ? "Komik akan tampil di semua perangkat." : `Komik hanya akan tampil dan dapat dibaca di ${COMIC_TARGET_DEVICES.find((device) => device.value === comicForm.targetDevice)?.label.toLowerCase()}; komik tidak akan tampil di perangkat lain.`}</small></label>
          <label>Deskripsi<textarea required maxLength={3000} rows={4} value={comicForm.synopsis} onChange={(event) => setComicForm({ ...comicForm, synopsis: event.target.value })} /></label>
          <fieldset className="comic-contributors-fieldset">
            <legend>Kredit kreator (minimal satu)</legend>
            <datalist id="comic-contributor-roles">
              <option value="Penulis" />
              <option value="Ilustrator" />
              <option value="Pewarna" />
              <option value="Penerjemah" />
              <option value="Penintaan" />
              <option value="Pembuat outline" />
              <option value="Pewarnaan" />
              <option value="Penyunting" />
              <option value="Penata huruf" />
            </datalist>
            {comicForm.contributors.map((item, index) => (
              <div className="comic-contributor-row" key={index}>
                <input
                  required
                  maxLength={60}
                  list="comic-contributor-roles"
                  aria-label={`Peran kontributor ${index + 1}`}
                  placeholder="Peran, mis. Ilustrator"
                  value={item.role}
                  onChange={(event) => updateContributor(index, "role", event.target.value)}
                />
                <input
                  required
                  maxLength={120}
                  aria-label={`Nama kontributor ${index + 1}`}
                  placeholder="Nama"
                  value={item.name}
                  onChange={(event) => updateContributor(index, "name", event.target.value)}
                />
                <button
                  type="button"
                  className="chapter-action chapter-action-danger"
                  aria-label={`Hapus kontributor ${index + 1}`}
                  onClick={() => removeContributor(index)}
                  disabled={comicForm.contributors.length === 1 || savingComic}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
            <button type="button" className="button button-light contributor-add-button" onClick={addContributor} disabled={savingComic}>
              <Plus size={15} /> Tambah kontributor
            </button>
          </fieldset>
          <label>Teknik produksi<select value={comicForm.technique} onChange={(event) => setComicForm({ ...comicForm, technique: event.target.value })}>{PRODUCTION_TECHNIQUES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label>Status cerita<select value={comicForm.storyStatus} onChange={(event) => setComicForm({ ...comicForm, storyStatus: event.target.value })}>{STORY_STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label>Target pembaca<select value={comicForm.targetAudience} onChange={(event) => setComicForm({ ...comicForm, targetAudience: event.target.value })}>{TARGET_AUDIENCES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label>Bahasa<select value={comicForm.language} onChange={(event) => setComicForm({ ...comicForm, language: event.target.value })}>{COMIC_LANGUAGES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}<option value="other">Bahasa lainnya</option></select></label>
          {comicForm.language === "other" && <label>Nama bahasa<input required maxLength={80} value={comicForm.otherLanguage} onChange={(event) => setComicForm({ ...comicForm, otherLanguage: event.target.value })} placeholder="Contoh: Bahasa Jawa" /></label>}
          <label>Asal karya<select value={comicForm.originType} onChange={(event) => setComicForm({ ...comicForm, originType: event.target.value })}>{ORIGIN_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          {comicForm.originType === "adaptation" && <label>Sumber adaptasi<input required maxLength={500} value={comicForm.sourceInfo} onChange={(event) => setComicForm({ ...comicForm, sourceInfo: event.target.value })} placeholder="Judul dan pencipta karya sumber" /></label>}
          <p className="comic-form-note">Semua komik di mu-komik gratis untuk dibaca.</p>
          <label className="cover-upload-field">Sampul komik
            <input type="file" accept={settings.allowed_image_types.join(",")} onChange={(event) => { startCoverCrop(event.target.files?.[0] ?? null); event.currentTarget.value = ""; }} />
            <span>{coverFile ? `Sampul siap: ${coverFile.name}` : comic.cover_key ? "Sampul saat ini tetap digunakan jika kamu tidak memilih berkas baru." : "Belum ada sampul."} Rasio crop 3:4 · hasil maksimal 1200 × 1600 px dan {settings.max_upload_size_mb} MB.</span>
          </label>
          {coverFile && <button className="button button-light cover-crop-change" type="button" onClick={() => setCoverFile(null)} disabled={savingComic}>Hapus pilihan sampul</button>}
          <div className="comic-form-actions">
            <button className="button button-dark" type="submit" disabled={savingComic}>
              {savingComic ? <><LoaderCircle className="spin" size={16} /> Menyimpan...</> : <>Simpan perubahan <ArrowUpRight size={16} /></>}
            </button>
            <button className="button button-light" type="button" onClick={() => { if (comic) setComicForm(getComicForm(comic)); setCoverFile(null); switchEditorTab("chapters"); }} disabled={savingComic}>Batal</button>
          </div>
        </form>
        </div>
      )}
      {activeTab === "chapters" && <div id="comic-chapters-panel" className="comic-editor-tab-panel" role="tabpanel" aria-labelledby="comic-chapters-tab">
      {showForm && (
        <form className="comic-form" onSubmit={createChapter}>
          <div className="form-heading">
            <div>
              <p className="eyebrow">{editingChapterId ? "Perbarui bab ini" : "Lanjutkan ceritamu"}</p>
              <h2>{editingChapterId ? "Ubah bab" : "Detail bab"}</h2>
            </div>
            <button type="button" className="form-close" aria-label="Tutup formulir bab" onClick={() => { setShowForm(false); setEditingChapterId(null); }}>&times;</button>
          </div>
          <label>Judul bab<input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Nama bab ini" /></label>
          <label>Nomor bab<input required type="number" min="1" step="1" value={form.chapterNumber} onChange={(event) => setForm({ ...form, chapterNumber: event.target.value })} placeholder="1" /></label>
          <label className="checkbox-label"><input type="checkbox" checked={form.published} onChange={(event) => setForm({ ...form, published: event.target.checked })} /> Terbitkan bab</label>
          <button className="button button-dark" type="submit" disabled={saving}>
            {saving ? <><LoaderCircle className="spin" size={16} /> Menyimpan...</> : <>{editingChapterId ? "Simpan perubahan" : "Buat bab"} <ArrowUpRight size={16} /></>}
          </button>
        </form>
      )}
      <section className="chapter-manager-list">
        <div className="creator-section-heading">
          <div><p className="eyebrow">{chapters.length} bab</p><h2>Alur cerita</h2></div>
          <div className="chapter-list-heading-actions">
            <button className="button button-dark" onClick={() => startChapterForm()}><Plus size={17} /> Bab baru</button>
          </div>
        </div>
        {chapters.length === 0 ? (
          <div className="creator-empty"><BookOpen size={26} /><h3>Belum ada bab.</h3><p>Buat bab pertama untuk cerita ini.</p></div>
        ) : (
          <div className="chapter-manager-rows">
            {chapters.map((chapter, chapterIndex) => (
              <article className="chapter-manager-row" key={chapter.id}>
                <div className="chapter-card-header">
                  <div className="chapter-card-heading">
                    <div className="chapter-number">{String(chapter.chapter_number).padStart(2, "0")}</div>
                    <div className="chapter-manager-copy">
                      <h3>{chapter.title}</h3>
                      <p>{chapter.published_at ? `Terbit ${new Date(chapter.published_at).toLocaleDateString("id-ID")}` : "Bab draf"}</p>
                    </div>
                  </div>
                  <div className="chapter-row-actions">
                    <span className={`request-status request-${chapter.published_at ? "approved" : "pending"}`}>{chapter.published_at ? "Terbit" : "Draf"}</span>
                    <button type="button" className="chapter-action" aria-label={`Ubah ${chapter.title}`} title="Ubah bab" onClick={() => startChapterForm(chapter)} disabled={deletingChapterId !== null}>
                      <Pencil size={16} />
                    </button>
                    <button type="button" className="chapter-action chapter-action-danger" aria-label={`Hapus ${chapter.title}`} title="Hapus bab" onClick={() => void deleteChapter(chapter)} disabled={deletingChapterId !== null || uploading}>
                      {deletingChapterId === chapter.id ? <LoaderCircle className="spin" size={16} /> : <Trash2 size={16} />}
                    </button>
                    <Link className="round-arrow" href={`/comic/${comic.slug}/chapter/${chapter.id}`} aria-label={`Pratinjau ${chapter.title}`}><ArrowUpRight size={17} /></Link>
                    <label className="page-upload-button">
                      <input type="file" accept={settings.allowed_image_types.join(",")} multiple disabled={uploading || deletingChapterId !== null || (pagesByChapter[chapter.id]?.length ?? 0) >= settings.max_pages_per_chapter} onChange={(event) => { setChapterExpanded(chapter.id, true); setUploadChapter(chapter); void uploadPages(event); }} />
                      <Upload size={15} aria-hidden="true" />
                      Unggah halaman
                    </label>
                  </div>
                  <button
                    type="button"
                    className="chapter-collapse-toggle"
                    aria-label={`${expandedChapterIds?.includes(chapter.id) ?? chapterIndex === 0 ? "Tutup" : "Buka"} halaman ${chapter.title}`}
                    aria-expanded={expandedChapterIds?.includes(chapter.id) ?? chapterIndex === 0}
                    aria-controls={`chapter-content-${chapter.id}`}
                    title={expandedChapterIds?.includes(chapter.id) ?? chapterIndex === 0 ? "Tutup bab" : "Buka bab"}
                    onClick={() => setChapterExpanded(chapter.id, !(expandedChapterIds?.includes(chapter.id) ?? chapterIndex === 0))}
                  >
                    <ChevronDown className={expandedChapterIds?.includes(chapter.id) ?? chapterIndex === 0 ? "is-open" : ""} size={23} aria-hidden="true" />
                  </button>
                </div>
                <div id={`chapter-content-${chapter.id}`} className="chapter-card-content" hidden={!(expandedChapterIds?.includes(chapter.id) ?? chapterIndex === 0)}>
                {uploading && uploadProgress && uploadingChapter?.id === chapter.id && (
                  <div className="chapter-page-upload-progress">
                    <div className="chapter-page-upload-progress-copy">
                      <span aria-live="polite">Mengunggah halaman {uploadProgress.fileIndex} dari {uploadProgress.totalFiles}: {uploadProgress.fileName}</span>
                      <span>{uploadProgress.percent}%</span>
                    </div>
                    <progress value={uploadProgress.percent} max={100} aria-label={`Progres unggah halaman ke ${chapter.title}`} />
                  </div>
                )}
                <div className="chapter-page-list" aria-label={`Halaman dalam ${chapter.title}`}>
                  {(pagesByChapter[chapter.id] ?? []).map((page, pageIndex) => (
                    <div className="chapter-page-position" key={page.id}>
                    {pageDropSlot?.chapterId === chapter.id && pageDropSlot.index === pageIndex && draggedPageId !== page.id && (
                      <div
                        className="chapter-page-drop-spacer"
                        role="presentation"
                        onDragOver={(event) => handlePageDragOver(event, chapter, pageIndex)}
                        onDrop={(event) => handlePageDrop(event, chapter, pageIndex)}
                      >
                        <span>Lepaskan halaman di sini</span>
                      </div>
                    )}
                    <div
                      className={`chapter-page-item${draggedPageId === page.id ? " is-dragging" : ""}`}
                      data-page-id={page.id}
                      onDragOver={(event) => handlePageCardDragOver(event, chapter, pageIndex)}
                      onDrop={(event) => {
                        event.preventDefault();
                        const bounds = event.currentTarget.getBoundingClientRect();
                        const index = event.clientX < bounds.left + bounds.width / 2 ? pageIndex : pageIndex + 1;
                        handlePageDrop(event, chapter, index);
                      }}
                    >
                      <div
                        className="chapter-page-thumbnail"
                        style={publicUrl ? { backgroundImage: `url(${publicUrl.replace(/\/$/, "")}/${page.object_key})` } : undefined}
                        role="img"
                        aria-label={`Gambar kecil halaman ${page.page_number}`}
                      >
                        {!publicUrl && <BookOpen size={16} />}
                      </div>
                      <div className="chapter-page-meta">
                        <div className="chapter-page-meta-row">
                          <span className="chapter-page-label-group">
                            <button
                              type="button"
                              className="chapter-page-drag-handle"
                              aria-label={`Seret untuk mengurutkan ulang halaman ${page.page_number}`}
                              title="Seret untuk mengurutkan ulang"
                              draggable={reorderingPageId === null && uploading === false && deletingChapterId === null}
                              onDragStart={(event) => {
                                event.dataTransfer.effectAllowed = "move";
                                event.dataTransfer.setData("text/plain", page.id);
                                setDraggedPageId(page.id);
                                setDraggedPageChapterId(chapter.id);
                                setPageDropSlot(null);
                              }}
                              onDragEnd={() => {
                                setDraggedPageId(null);
                                setDraggedPageChapterId(null);
                                setPageDropSlot(null);
                              }}
                              disabled={reorderingPageId !== null || uploading || deletingChapterId !== null}
                            >
                              <GripVertical size={16} />
                            </button>
                            <span className="chapter-page-label" title={`Halaman ${page.page_number}`}>
                              {getPageLabel(page.page_number)}
                            </span>
                          </span>
                          <button
                            type="button"
                            className="chapter-action chapter-action-danger"
                            aria-label={`Hapus halaman ${page.page_number} dari ${chapter.title}`}
                            title="Hapus halaman"
                            onClick={() => void deletePage(chapter, page)}
                            disabled={deletingPageId !== null || uploading || deletingChapterId !== null || reorderingPageId !== null}
                          >
                            {deletingPageId === page.id ? <LoaderCircle className="spin" size={14} /> : <Trash2 size={14} />}
                          </button>
                        </div>
                        <div className="chapter-page-order">
                          <button
                            type="button"
                            className="chapter-action"
                            aria-label={`Pindahkan halaman ${page.page_number} ke kiri`}
                            title="Pindahkan halaman ke kiri"
                            onClick={() => void reorderPage(chapter, page, pagesByChapter[chapter.id][pageIndex - 1])}
                            disabled={pageIndex === 0 || reorderingPageId !== null || deletingPageId !== null || uploading || deletingChapterId !== null}
                          >
                            {reorderingPageId === page.id ? <LoaderCircle className="spin" size={14} /> : <ChevronLeft size={15} />}
                          </button>
                          <button
                            type="button"
                            className="chapter-action"
                            aria-label={`Pindahkan halaman ${page.page_number} ke kanan`}
                            title="Pindahkan halaman ke kanan"
                            onClick={() => void reorderPage(chapter, page, pagesByChapter[chapter.id][pageIndex + 1])}
                            disabled={pageIndex === pagesByChapter[chapter.id].length - 1 || reorderingPageId !== null || deletingPageId !== null || uploading || deletingChapterId !== null}
                          >
                            {reorderingPageId === page.id ? <LoaderCircle className="spin" size={14} /> : <ChevronRight size={15} />}
                          </button>
                        </div>
                      </div>
                    </div>
                    </div>
                  ))}
                  {pageDropSlot?.chapterId === chapter.id && pageDropSlot.index === (pagesByChapter[chapter.id] ?? []).length && draggedPageId && (
                    <div
                      className="chapter-page-drop-spacer"
                      role="presentation"
                      onDragOver={(event) => handlePageDragOver(event, chapter, pageDropSlot.index)}
                      onDrop={(event) => handlePageDrop(event, chapter, pageDropSlot.index)}
                    >
                      <span>Lepaskan halaman di sini</span>
                    </div>
                  )}
                  <label className={`chapter-page-add${uploading || deletingChapterId !== null || (pagesByChapter[chapter.id]?.length ?? 0) >= settings.max_pages_per_chapter ? " is-disabled" : ""}`}>
                    <input type="file" accept={settings.allowed_image_types.join(",")} multiple disabled={uploading || deletingChapterId !== null || (pagesByChapter[chapter.id]?.length ?? 0) >= settings.max_pages_per_chapter} onChange={(event) => { setChapterExpanded(chapter.id, true); setUploadChapter(chapter); void uploadPages(event); }} />
                    <span className="chapter-page-add-icon"><Plus size={25} /></span>
                    <strong>Tambah halaman</strong>
                    <span>Unggah gambar halaman cerita berikutnya.</span>
                  </label>
                </div>
                <div className="page-upload-guide">
                  <Info size={17} aria-hidden="true" />
                  <p>Rekomendasi per halaman: ponsel 720 × 1280 px (9:16), tablet 900 × 1200 px (3:4), desktop 1200 × 1800 px (2:3). Uploader menyimpan satu gambar per halaman tanpa varian perangkat. Jika komik tersedia di semua perangkat, gunakan master 1200 × 1800 px; reader menampilkan gambar utuh tanpa crop. Maks. {settings.max_pages_per_chapter} halaman per bab, {settings.max_upload_size_mb} MB per gambar.</p>
                </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      </div>}
    </div>
      {coverCropFile && <ImageCropDialog
        file={coverCropFile}
        title="Crop sampul komik"
        aspectRatio={3 / 4}
        outputWidth={1200}
        outputHeight={1600}
        maxSourceBytes={25 * 1024 * 1024}
        maxOutputBytes={settings.max_upload_size_mb * 1024 * 1024}
        onCancel={() => setCoverCropFile(null)}
        onComplete={(file) => {
          setCoverFile(file);
          setCoverCropFile(null);
        }}
      />}
    </>
  );
}
