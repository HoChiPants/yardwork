import { AnnotationMode, GlobalWorkerOptions, OPS, getDocument } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { drawingCanvas, encodeDrawing, type DrawingReader } from "./drawingPreview";
import { drawingPixelLimit, drawingSourceSchema, type DrawingLine } from "./drawingReference";
import { extractPdfPlanLines } from "./pdfPlanLines";

GlobalWorkerOptions.workerSrc = workerUrl;

export async function openPdfDrawing(data: Uint8Array, name: string, signal: AbortSignal): Promise<DrawingReader> {
  const assets = new URL(`${import.meta.env.BASE_URL}plan-pdf/`, window.location.origin).href;
  const task = getDocument({
    data,
    cMapUrl: `${assets}cmaps/`, standardFontDataUrl: `${assets}standard_fonts/`,
    wasmUrl: `${assets}wasm/`, iccUrl: `${assets}iccs/`,
    enableXfa: false,
    stopAtErrors: true,
  });
  const close = () => { if (!task.destroyed) void task.destroy().catch(() => {}); };
  signal.addEventListener("abort", close, { once: true });
  try {
    const doc = await task.promise;
    signal.throwIfAborted();
    return {
      pages: doc.numPages,
      async preview(number, pageSignal) {
        if (!Number.isInteger(number) || number < 1 || number > doc.numPages)
          throw Error(`Choose a page from 1 to ${doc.numPages}.`);
        const page = await doc.getPage(number);
        pageSignal.throwIfAborted();
        const full = page.getViewport({ scale: 1 });
        const scale = Math.min(3, drawingPixelLimit / Math.max(full.width, full.height));
        const viewport = page.getViewport({ scale });
        const { canvas, context } = drawingCanvas(viewport.width, viewport.height);
        const optionalContentConfigPromise = doc.getOptionalContentConfig({ intent: "display" });
        const draw = page.render({ canvas, viewport, annotationMode: AnnotationMode.DISABLE, background: "#fff", optionalContentConfigPromise });
        const cancel = () => draw.cancel();
        pageSignal.addEventListener("abort", cancel, { once: true });
        try {
          await draw.promise;
          pageSignal.throwIfAborted();
          let pdfLines: DrawingLine[] = [];
          try {
            const [operators, layers] = await Promise.all([
              page.getOperatorList({ intent: "display", annotationMode: AnnotationMode.DISABLE }),
              optionalContentConfigPromise,
            ]);
            pageSignal.throwIfAborted();
            if (operators.fnArray.includes(OPS.constructPath)) {
              pdfLines = extractPdfPlanLines(operators, OPS, viewport.transform,
                context.getImageData(0, 0, canvas.width, canvas.height), (layer) => layers.isVisible(layer));
            }
          } catch {
            pageSignal.throwIfAborted();
            // The rendered sheet still supports manual tracing if its path data cannot be read.
          }
          return drawingSourceSchema.parse({ ...encodeDrawing(canvas), name, page: number,
            ...(pdfLines.length ? { pdfLines } : {}),
          });
        } finally {
          pageSignal.removeEventListener("abort", cancel);
          page.cleanup();
        }
      },
      close,
    };
  } catch (issue) {
    close();
    signal.throwIfAborted();
    throw Error((issue as Error).name === "PasswordException"
      ? "Open a copy of the PDF without a password to use it as a drawing reference."
      : "This PDF could not be opened. Try saving the plan as a PDF, PNG or JPEG again.");
  } finally {
    signal.removeEventListener("abort", close);
  }
}
