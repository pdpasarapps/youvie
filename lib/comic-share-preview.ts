const previewWidth = 1200;
const previewHeight = 630;

function wrapText(context: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    } else {
      line = candidate;
    }
  }

  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length === maxLines && words.join(" ") !== lines.join(" ")) {
    let lastLine = lines[maxLines - 1];
    while (lastLine && context.measureText(`${lastLine}...`).width > maxWidth) {
      lastLine = lastLine.slice(0, -1).trimEnd();
    }
    lines[maxLines - 1] = `${lastLine}...`;
  }
  return lines;
}

export async function createComicSharePreview(source: Blob, title: string): Promise<Blob> {
  const image = await createImageBitmap(source);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = previewWidth;
    canvas.height = previewHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Browser canvas is unavailable for the comic share preview.");

    context.fillStyle = "#211b17";
    context.fillRect(0, 0, previewWidth, previewHeight);

    const imageBox = { x: 70, y: 42, width: 390, height: 546 };
    const scale = Math.min(imageBox.width / image.width, imageBox.height / image.height);
    const imageWidth = image.width * scale;
    const imageHeight = image.height * scale;
    context.drawImage(
      image,
      imageBox.x + (imageBox.width - imageWidth) / 2,
      imageBox.y + (imageBox.height - imageHeight) / 2,
      imageWidth,
      imageHeight,
    );

    const textX = 520;
    const textWidth = 600;
    context.fillStyle = "#ffd16b";
    context.font = "700 24px Arial";
    context.fillText("MU KOMIK  ·  KOMIK INDONESIA", textX, 198);

    context.fillStyle = "#fff8ec";
    context.font = "700 54px Arial";
    const titleLines = wrapText(context, title, textWidth, 3);
    titleLines.forEach((line, index) => context.fillText(line, textX, 284 + index * 68));

    context.fillStyle = "#eadfd1";
    context.font = "28px Arial";
    context.fillText("Baca cerita lengkapnya di mu-komik.com", textX, 520);

    const preview = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Browser could not encode the comic share preview."));
      }, "image/jpeg", 0.84);
    });
    if (preview.size === 0) throw new Error("Generated comic share preview is empty.");
    return preview;
  } finally {
    image.close();
  }
}

export function getComicSharePreviewKey(comicId: string, coverKey: string) {
  const filename = coverKey.split("/").at(-1)?.replace(/\.[^.]+$/, "");
  if (!filename) throw new Error("Comic cover key does not include a filename.");
  return `comics/${comicId}/share-preview/${filename}.jpg`;
}
