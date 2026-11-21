import { drawingImageLimit, drawingPixelLimit, drawingSourceSchema, type DrawingSource } from "./drawingReference";

type Picture = Pick<DrawingSource, "image" | "width" | "height">;

export type DrawingReader = {
  pages?: number;
  preview: (page: number, signal: AbortSignal) => Promise<DrawingSource>;
  close: () => void;
};

export function drawingCanvas(width: number, height: number, cap = drawingPixelLimit) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 2 || height < 2)
    throw Error("This drawing has no usable page size.");
  const scale = Math.min(1, cap / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(2, Math.floor(width * scale));
  canvas.height = Math.max(2, Math.floor(height * scale));
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw Error("This browser could not prepare the drawing preview.");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  return { canvas, context };
}

export function encodeDrawing(canvas: HTMLCanvasElement): Picture {
  let working = canvas;
  for (let attempt = 0; attempt < 4; attempt++) {
    for (const quality of [0.9, 0.75, 0.6]) {
      const image = working.toDataURL("image/jpeg", quality);
      if (image.length <= drawingImageLimit) return { image, width: working.width, height: working.height };
    }
    const cap = Math.floor(Math.max(working.width, working.height) * 0.75);
    const smaller = drawingCanvas(working.width, working.height, cap);
    smaller.context.drawImage(working, 0, 0, smaller.canvas.width, smaller.canvas.height);
    working = smaller.canvas;
  }
  throw Error("The drawing could not fit inside the project. Try an image cropped to the area you need.");
}

function startsWith(data: Uint8Array, signature: number[]) {
  return signature.every((value, index) => data[index] === value);
}

export async function readDrawing(file: File, signal: AbortSignal): Promise<DrawingReader> {
  if (file.size > 20 * 1024 * 1024) throw Error("Choose a drawing under 20 MB.");
  const name = file.name.trim().slice(0, 120) || "Drawing";
  const bytes = new Uint8Array(await file.arrayBuffer());
  signal.throwIfAborted();
  if (startsWith(bytes, [37, 80, 68, 70, 45])) {
    const { openPdfDrawing } = await import("./pdfDrawing");
    signal.throwIfAborted();
    return openPdfDrawing(bytes, name, signal);
  }
  const mime = startsWith(bytes, [0xff, 0xd8, 0xff]) ? "image/jpeg"
    : startsWith(bytes, [0x89, 80, 78, 71, 13, 10, 26, 10]) ? "image/png"
    : (startsWith(bytes, [82, 73, 70, 70]) && startsWith(bytes.subarray(8), [87, 69, 66, 80])) ? "image/webp"
    : null;
  if (!mime) throw Error("Choose a PDF, PNG, JPEG or WebP drawing.");
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  try {
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
    } catch {
      throw Error("This drawing image could not be opened.");
    }
    signal.throwIfAborted();
    const { canvas, context } = drawingCanvas(image.naturalWidth, image.naturalHeight);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const source = drawingSourceSchema.parse({ name, ...encodeDrawing(canvas) });
    return { preview: () => Promise.resolve(source), close: () => {} };
  } finally {
    URL.revokeObjectURL(url);
  }
}
