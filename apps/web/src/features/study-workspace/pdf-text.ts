import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { ImportError, maxSourceCharacters } from './study-source';
import { ocrScale } from './ocr-image';
import type { createOcrSession } from './local-ocr';

GlobalWorkerOptions.workerSrc = workerUrl;

export async function extractPdfText(data: Uint8Array<ArrayBuffer>, signal: AbortSignal) {
  signal.throwIfAborted();
  const task = getDocument({
    data,
    stopAtErrors: true,
    useWorkerFetch: false,
    useWasm: false,
    disableFontFace: true,
    enableXfa: false,
    maxImageSize: 16_000_000,
    canvasMaxAreaInBytes: 64_000_000,
    verbosity: 0,
  });
  const stop = () => {
    void task.destroy().catch(() => undefined);
  };
  signal.addEventListener('abort', stop, { once: true });
  let session: ReturnType<typeof createOcrSession> | undefined;
  try {
    const pdf = await task.promise;
    if (pdf.numPages > 200)
      throw new ImportError('Split PDFs longer than 200 pages before importing.');
    let text = '',
      scanned = 0;
    for (let i = 1; i <= pdf.numPages; i++) {
      signal.throwIfAborted();
      const page = await pdf.getPage(i);
      const stream = page.streamTextContent().getReader();
      let extracted = '';
      try {
        while (true) {
          const { value, done } = await stream.read();
          if (done) break;
          for (const item of value.items) {
            if (!('str' in item)) continue;
            extracted += item.str + (item.hasEOL ? '\n' : ' ');
            if (extracted.length + text.length > maxSourceCharacters)
              throw new ImportError('Split the PDF into parts under 200,000 characters.');
          }
        }
      } finally {
        stream.releaseLock();
      }
      if (!extracted.trim() && (await page.getOperatorList()).fnArray.length) {
        if (++scanned > 12)
          throw new ImportError(
            'Split scanned PDFs into parts containing up to 12 image-only pages.',
          );
        const size = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: ocrScale(size.width, size.height, 2.4) });
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        try {
          await page.render({ canvas, viewport, background: 'white' }).promise;
          signal.throwIfAborted();
          if (!session) session = (await import('./local-ocr')).createOcrSession(signal);
          extracted = await session.recognize(canvas);
        } finally {
          canvas.width = 0;
          canvas.height = 0;
        }
      }
      text += extracted + '\n\n';
      if (text.length > maxSourceCharacters)
        throw new ImportError('Split the PDF into parts under 200,000 characters.');
      page.cleanup();
    }
    if (!text.trim())
      throw new ImportError('No readable text was found. Try a sharper scan or paste the text.');
    return text;
  } finally {
    session?.close();
    signal.removeEventListener('abort', stop);
    await task.destroy();
  }
}
