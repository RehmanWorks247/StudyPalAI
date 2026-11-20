import { ImportError } from './study-source';

const imageLimit = 16_000_000;
function checked(width: number, height: number) {
  if (!width || !height || width * height > imageLimit || Math.max(width, height) > 12_000)
    throw new ImportError('Resize this image to 16 megapixels or less before importing.');
  return { width, height };
}
function dimensions(data: Uint8Array, kind: 'png' | 'jpeg') {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (
    kind === 'png' &&
    data.length >= 33 &&
    view.getUint32(0) === 0x89504e47 &&
    view.getUint32(4) === 0x0d0a1a0a &&
    view.getUint32(8) === 13 &&
    view.getUint32(12) === 0x49484452
  )
    return checked(view.getUint32(16), view.getUint32(20));
  if (kind === 'jpeg' && data.length >= 4 && view.getUint16(0) === 0xffd8) {
    let pos = 2;
    while (pos + 4 <= data.length && data[pos] === 255) {
      while (data[pos] === 255) pos++;
      const mark = data[pos++];
      if (mark === undefined || pos + 2 > data.length || mark === 0xda || mark === 0xd9) break;
      const size = view.getUint16(pos);
      if (size < 2 || pos + size > data.length) break;
      if (size >= 8 && [0xc0, 0xc1, 0xc2].includes(mark))
        return checked(view.getUint16(pos + 5), view.getUint16(pos + 3));
      pos += size;
    }
  }
  throw new ImportError('This image is unreadable. Export a PNG or JPEG copy.');
}
export function ocrScale(width: number, height: number, desired = 1) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
    throw new ImportError('This page has invalid dimensions.');
  return Math.min(desired, Math.sqrt(4_000_000 / (width * height)), 2800 / Math.max(width, height));
}
export async function imageCanvas(
  data: Uint8Array<ArrayBuffer>,
  kind: 'png' | 'jpeg',
  signal: AbortSignal,
) {
  dimensions(data, kind);
  const image = await createImageBitmap(new Blob([data], { type: 'image/' + kind }));
  try {
    signal.throwIfAborted();
    const { width, height } = checked(image.width, image.height);
    const scale = ocrScale(width, height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(width * scale));
    canvas.height = Math.max(1, Math.floor(height * scale));
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new ImportError('This browser could not prepare the image for OCR.');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    image.close();
  }
}
