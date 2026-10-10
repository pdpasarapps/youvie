"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Check, Move, X, ZoomIn } from "lucide-react";
import NextImage from "next/image";

type ImageCropDialogProps = {
  file: File;
  title: string;
  aspectRatio: number;
  outputWidth: number;
  outputHeight: number;
  maxSourceBytes: number;
  maxOutputBytes: number;
  onCancel: () => void;
  onComplete: (file: File) => void;
};

type CropPosition = { x: number; y: number };

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Gambar tidak dapat dibuka. Coba berkas gambar lain."));
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Gambar hasil crop tidak dapat diproses di perangkat ini."));
    }, type, quality);
  });
}

export default function ImageCropDialog({
  file,
  title,
  aspectRatio,
  outputWidth,
  outputHeight,
  maxSourceBytes,
  maxOutputBytes,
  onCancel,
  onComplete,
}: ImageCropDialogProps) {
  const [previewUrl, setPreviewUrl] = useState("");
  const cropFrameRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef(onCancel);
  const dragStartRef = useRef<{ pointerId: number; x: number; y: number; position: CropPosition } | null>(null);
  const [cropFrameSize, setCropFrameSize] = useState({ width: 0, height: 0 });
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState<CropPosition>({ x: 0.5, y: 0.5 });
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const sourceTooLarge = file.size > maxSourceBytes;

  useEffect(() => {
    cancelRef.current = onCancel;
  }, [onCancel]);

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    queueMicrotask(() => {
      objectUrl = URL.createObjectURL(file);
      if (active) setPreviewUrl(objectUrl);
      else URL.revokeObjectURL(objectUrl);
    });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !processing) cancelRef.current();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [processing]);

  useEffect(() => {
    const dialog = cropFrameRef.current?.parentElement;
    if (!dialog) return;
    const updateSize = () => {
      const dialogStyle = window.getComputedStyle(dialog);
      const availableWidth = dialog.clientWidth
        - Number.parseFloat(dialogStyle.paddingLeft)
        - Number.parseFloat(dialogStyle.paddingRight);
      if (availableWidth <= 0) return;
      const availableHeight = Math.min(window.innerHeight * 0.52, 440);
      const width = Math.min(availableWidth, availableHeight * aspectRatio);
      const height = width / aspectRatio;
      setCropFrameSize((current) => current.width === width && current.height === height ? current : { width, height });
    };
    const frame = window.requestAnimationFrame(updateSize);
    const observer = new ResizeObserver(updateSize);
    observer.observe(dialog);
    window.addEventListener("resize", updateSize);
    window.visualViewport?.addEventListener("resize", updateSize);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", updateSize);
      window.visualViewport?.removeEventListener("resize", updateSize);
    };
  }, [aspectRatio]);

  useEffect(() => {
    if (!previewUrl) return;
    let active = true;
    if (!sourceTooLarge) {
      void loadImage(previewUrl).then((image) => {
        if (!active) return;
        if (image.naturalWidth * image.naturalHeight > 40_000_000) {
          setError("Dimensi gambar terlalu besar untuk diproses dengan aman di browser. Kecilkan gambar terlebih dahulu.");
          return;
        }
        setImageSize({ width: image.naturalWidth, height: image.naturalHeight });
      }).catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Gambar tidak dapat dibuka.");
      });
    }
    return () => {
      active = false;
    };
  }, [previewUrl, sourceTooLarge]);

  const crop = imageSize ? (() => {
    const sourceRatio = imageSize.width / imageSize.height;
    let width = imageSize.width;
    let height = imageSize.height;
    if (sourceRatio > aspectRatio) width = height * aspectRatio;
    else height = width / aspectRatio;
    width /= zoom;
    height /= zoom;
    const left = (imageSize.width - width) * position.x;
    const top = (imageSize.height - height) * position.y;
    return { width, height, left, top };
  })() : null;

  const imageStyle = crop && imageSize ? {
    width: `${(imageSize.width / crop.width) * 100}%`,
    height: `${(imageSize.height / crop.height) * 100}%`,
    left: `${(-crop.left / crop.width) * 100}%`,
    top: `${(-crop.top / crop.height) * 100}%`,
  } : undefined;

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!imageSize || !crop) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStartRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, position };
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = dragStartRef.current;
    const frame = cropFrameRef.current;
    if (!start || start.pointerId !== event.pointerId || !frame || !imageSize || !crop) return;
    const bounds = frame.getBoundingClientRect();
    const maxLeft = imageSize.width - crop.width;
    const maxTop = imageSize.height - crop.height;
    setPosition({
      x: maxLeft ? Math.max(0, Math.min(1, start.position.x - ((event.clientX - start.x) * crop.width / bounds.width) / maxLeft)) : 0.5,
      y: maxTop ? Math.max(0, Math.min(1, start.position.y - ((event.clientY - start.y) * crop.height / bounds.height) / maxTop)) : 0.5,
    });
  };

  const handleCrop = async () => {
    if (!imageSize || !crop) return;
    setProcessing(true);
    setError("");
    try {
      const image = await loadImage(previewUrl);
      let scale = Math.min(1, outputWidth / crop.width, outputHeight / crop.height);
      let width = Math.max(1, Math.round(crop.width * scale));
      let height = Math.max(1, Math.round(crop.height * scale));
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Pemrosesan gambar tidak tersedia di browser ini.");
      let blob: Blob | null = null;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        canvas.width = width;
        canvas.height = height;
        context.drawImage(image, crop.left, crop.top, crop.width, crop.height, 0, 0, width, height);
        const quality = file.type === "image/png" ? undefined : Math.max(0.58, 0.9 - attempt * 0.08);
        blob = await canvasToBlob(canvas, file.type, quality);
        if (blob.size <= maxOutputBytes) break;
        scale *= 0.86;
        width = Math.max(1, Math.round(crop.width * scale));
        height = Math.max(1, Math.round(crop.height * scale));
      }
      if (!blob) throw new Error("Gambar hasil crop tidak dapat dibuat.");
      if (!blob.type || blob.type !== file.type) throw new Error("Format gambar ini tidak dapat diproses. Coba simpan sebagai JPG, PNG, atau WebP.");
      if (blob.size > maxOutputBytes) {
        throw new Error(`Gambar tetap melebihi batas ${(maxOutputBytes / (1024 * 1024)).toFixed(0)} MB setelah diproses. Pilih gambar yang lebih kecil.`);
      }
      const name = file.name.replace(/\.[^.]+$/, "") || "gambar";
      onComplete(new File([blob], `${name}-crop.${file.type.split("/")[1]}`, { type: file.type }));
    } catch (processError) {
      setError(processError instanceof Error ? processError.message : "Gambar tidak dapat diproses.");
      setProcessing(false);
    }
  };

  return (
    <div className="image-crop-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !processing) onCancel();
    }}>
      <section className="image-crop-dialog" role="dialog" aria-modal="true" aria-labelledby="image-crop-title">
        <header className="image-crop-heading">
          <div><p className="eyebrow">ATUR GAMBAR</p><h2 id="image-crop-title">{title}</h2></div>
          <button type="button" className="image-crop-close" aria-label="Batal crop" onClick={onCancel} disabled={processing}><X size={19} /></button>
        </header>
        <p className="image-crop-instructions">Geser gambar untuk mengatur posisi, lalu sesuaikan zoom. Area di luar bingkai tidak akan disimpan.</p>
        <div
          ref={cropFrameRef}
          className="image-crop-frame"
          style={{
            aspectRatio: `${aspectRatio}`,
            width: cropFrameSize.width > 0 ? `${cropFrameSize.width}px` : "100%",
            height: cropFrameSize.height ? `${cropFrameSize.height}px` : undefined,
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={(event) => {
            if (dragStartRef.current?.pointerId === event.pointerId) dragStartRef.current = null;
          }}
          onPointerCancel={() => { dragStartRef.current = null; }}
        >
          {imageSize && imageStyle && <NextImage src={previewUrl} alt="Pratinjau crop" width={imageSize.width} height={imageSize.height} unoptimized draggable={false} style={imageStyle} />}
          <span className="image-crop-move-hint"><Move size={14} /> Geser untuk mengatur</span>
        </div>
        <label className="image-crop-zoom">
          <span><ZoomIn size={16} /> Perbesar gambar <b>{zoom.toFixed(1)}×</b></span>
          <input type="range" min="1" max="3" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} disabled={!imageSize || processing} />
        </label>
        <p className="image-crop-output-size">Hasil: maksimal {outputWidth} × {outputHeight} px · diproses di perangkatmu</p>
        {(error || (sourceTooLarge ? `Gambar sumber maksimal ${(maxSourceBytes / (1024 * 1024)).toFixed(0)} MB.` : "")) && <p className="image-crop-error" role="alert">{error || `Gambar sumber maksimal ${(maxSourceBytes / (1024 * 1024)).toFixed(0)} MB.`}</p>}
        <footer className="image-crop-actions">
          <button type="button" className="button button-light" onClick={onCancel} disabled={processing}>Batal</button>
          <button type="button" className="button button-dark" onClick={() => void handleCrop()} disabled={!imageSize || processing}>
            {processing ? "Memproses..." : <>Gunakan gambar <Check size={16} /></>}
          </button>
        </footer>
      </section>
    </div>
  );
}
