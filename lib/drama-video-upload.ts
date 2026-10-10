import { DetailedError, Upload as TusUpload } from "tus-js-client";

const MEDIA_BUCKET = "drama-media";

export function inspectPortraitVideo(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const objectUrl = URL.createObjectURL(file);
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(objectUrl);
      if (!video.videoWidth || !video.videoHeight || video.videoHeight <= video.videoWidth) {
        reject(new Error("Video harus berorientasi vertikal (portrait)."));
        return;
      }
      if (!Number.isFinite(video.duration) || video.duration < 60 || video.duration > 120) {
        reject(new Error("Durasi video harus antara 1 dan 2 menit."));
        return;
      }
      resolve(Math.round(video.duration));
    };
    video.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Metadata video tidak dapat dibaca. Gunakan berkas MP4 atau WebM yang valid."));
    };
    video.src = objectUrl;
  });
}

export function uploadDramaVideo(
  file: File,
  path: string,
  accessToken: string,
  onProgress: (progress: string) => void,
) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return Promise.reject(new Error("Konfigurasi Supabase untuk upload video belum lengkap."));
  }

  return new Promise<void>((resolve, reject) => {
    const upload = new TusUpload(file, {
      endpoint: `${supabaseUrl.replace(/\/$/, "")}/storage/v1/upload/resumable`,
      headers: {
        authorization: `Bearer ${accessToken}`,
        apikey: supabaseAnonKey,
      },
      metadata: {
        bucketName: MEDIA_BUCKET,
        objectName: path,
        contentType: file.type,
        cacheControl: "3600",
      },
      chunkSize: 6 * 1024 * 1024,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      onProgress: (bytesSent, bytesTotal) => {
        onProgress(`Mengunggah video... ${Math.floor((bytesSent / bytesTotal) * 100)}%`);
      },
      onError: (uploadError) => {
        if (uploadError instanceof DetailedError && uploadError.originalResponse?.getStatus() === 413) {
          reject(new Error(
            `Ukuran video ${(file.size / 1024 / 1024).toFixed(1)} MB melebihi batas Supabase Storage. ` +
            "Kompres video hingga di bawah 50 MB untuk project Free, atau naikkan Global file size limit di Storage Settings " +
            "dan pastikan batas bucket drama-media juga mencukupi.",
          ));
          return;
        }
        reject(uploadError);
      },
      onSuccess: () => resolve(),
    });

    void upload.findPreviousUploads().then((previousUploads) => {
      const previousUpload = previousUploads.find((item) =>
        item.metadata.bucketName === MEDIA_BUCKET && item.metadata.objectName === path,
      );
      if (previousUpload) upload.resumeFromPreviousUpload(previousUpload);
      upload.start();
    }).catch(reject);
  });
}
