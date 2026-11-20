import { createWorker, OEM, type Worker as OcrWorker } from 'tesseract.js';
import workerUrl from 'tesseract.js/dist/worker.min.js?url';
import coreUrl from 'tesseract.js-core/tesseract-core-lstm.wasm.js?url';
import modelUrl from '@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz?url';
import { ImportError } from './study-source';

// Some static servers attach Content-Encoding: gzip; fetch then returns the verified decompressed model.
const checksums = new Set([
  '45b4cb346724ac1774f1c36f42f182b887bcdb28ebe63e6fff90ac41f3fcff91',
  '5dc5d8d640a212c9d6184921ba103b186f50e0fed9ee716c53e6b312b400d747',
]);
function abortable<T>(pending: Promise<T>, signal: AbortSignal) {
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    pending.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
export function createOcrSession(signal: AbortSignal) {
  let pending: Promise<OcrWorker> | undefined;
  let current: OcrWorker | undefined;
  let closed = false;
  async function worker() {
    const response = await fetch(modelUrl, {
      signal,
      credentials: 'same-origin',
      redirect: 'error',
    });
    if (!response.ok) throw new ImportError('Open StudyPal online once to prepare offline OCR.');
    const data = await response.arrayBuffer();
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
    if (!checksums.has([...hash].map((v) => v.toString(16).padStart(2, '0')).join('')))
      throw new ImportError(
        'The offline OCR model failed verification. Reload StudyPal to reinstall it.',
      );
    signal.throwIfAborted();
    const instance = await createWorker('eng', OEM.LSTM_ONLY, {
      workerPath: new URL(workerUrl, location.href).href,
      corePath: new URL(coreUrl, location.href).href,
      langPath: new URL('.', new URL(modelUrl, location.href)).href,
      workerBlobURL: false,
      cacheMethod: 'none',
      errorHandler: () => undefined,
    });
    if (closed) {
      await instance.terminate();
      throw new DOMException('OCR canceled', 'AbortError');
    }
    current = instance;
    return instance;
  }
  function close() {
    closed = true;
    signal.removeEventListener('abort', close);
    void current?.terminate();
    current = undefined;
  }
  signal.addEventListener('abort', close, { once: true });
  return {
    close,
    async recognize(canvas: HTMLCanvasElement) {
      signal.throwIfAborted();
      pending ??= worker();
      try {
        const engine = await abortable(pending, signal);
        const result = await abortable(engine.recognize(canvas), signal);
        return result.data.text.trim();
      } catch (error) {
        signal.throwIfAborted();
        if (error instanceof ImportError) throw error;
        throw new ImportError(
          'Local English OCR could not read this page. Try a sharper image or paste the text.',
        );
      }
    },
  };
}
