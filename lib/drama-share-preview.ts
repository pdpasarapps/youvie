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

export async function createDramaSharePreview(source: Blob, title: string, genre: string): Promise<Blob> {
  const image = await createImageBitmap(source);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = previewWidth;
    canvas.height = previewHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Browser canvas is unavailable for the drama share preview.");

    context.fillStyle = "#101412";
    context.fillRect(0, 0, previewWidth, previewHeight);

    const imageBox = { x: 78, y: 38, width: 350, height: 554 };
    const scale = Math.max(imageBox.width / image.width, imageBox.height / image.height);
    const imageWidth = image.width * scale;
    const imageHeight = image.height * scale;
    context.save();
    context.beginPath();
    context.roundRect(imageBox.x, imageBox.y, imageBox.width, imageBox.height, 18);
    context.clip();
    context.drawImage(
      image,
      imageBox.x + (imageBox.width - imageWidth) / 2,
      imageBox.y + (imageBox.height - imageHeight) / 2,
      imageWidth,
      imageHeight,
    );
    context.restore();

    const textX = 500;
    const textWidth = 620;
    context.fillStyle = "#f59473";
    context.font = "700 24px Arial";
    context.fillText("YOUVIE  ·  DRAMA PENDEK", textX, 194);

    context.fillStyle = "#f1efe8";
    context.font = "700 58px Arial";
    const titleLines = wrapText(context, title, textWidth, 3);
    titleLines.forEach((line, index) => context.fillText(line, textX, 286 + index * 70));

    context.fillStyle = "#b8c0b9";
    context.font = "700 24px Arial";
    if (genre.trim()) context.fillText(wrapText(context, genre.toLocaleUpperCase("id-ID"), textWidth, 1)[0], textX, 505);

    context.fillStyle = "#ffffff";
    context.font = "28px Arial";
    context.fillText("Tonton dramanya di Youvie", textX, 560);

    const preview = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Browser could not encode the drama share preview."));
      }, "image/jpeg", 0.84);
    });
    if (preview.size === 0) throw new Error("Generated drama share preview is empty.");
    return preview;
  } finally {
    image.close();
  }
}
