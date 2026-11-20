import { createSource, ImportError, type StudySource } from './study-source';

export async function readStudyFile(file: File, signal: AbortSignal): Promise<StudySource> {
  const extension = file.name.split('.').pop()?.toLowerCase();
  const photo = extension === 'png' || extension === 'jpeg' || extension === 'jpg';
  const structured = photo || extension === 'pdf' || extension === 'docx' || extension === 'pptx';
  if (!structured && !['txt', 'md', 'markdown', 'csv'].includes(extension ?? '')) {
    throw new ImportError(
      'Choose a PDF, Word (.docx), PowerPoint (.pptx), PNG, JPEG, Markdown, CSV or text file.',
    );
  }
  if (file.size > (structured ? 12 * 1024 * 1024 : 512 * 1024)) {
    throw new ImportError(
      structured ? 'The file exceeds 12 MB.' : 'Text files must be under 512 KB.',
    );
  }
  signal.throwIfAborted();
  const data = new Uint8Array(await file.arrayBuffer());
  signal.throwIfAborted();
  try {
    if (photo) {
      const { imageCanvas } = await import('./ocr-image');
      const canvas = await imageCanvas(data, extension === 'png' ? 'png' : 'jpeg', signal);
      const { createOcrSession } = await import('./local-ocr');
      const session = createOcrSession(signal);
      try {
        const text = await session.recognize(canvas);
        if (!text)
          throw new ImportError('No readable English text was found. Try a sharper image.');
        return createSource(file.name, text);
      } finally {
        session.close();
        canvas.width = 0;
        canvas.height = 0;
      }
    }
    if (extension === 'pdf') {
      const { extractPdfText } = await import('./pdf-text');
      return createSource(file.name, await extractPdfText(data, signal));
    }
    if (extension === 'docx' || extension === 'pptx') {
      const { extractOfficeText } = await import('./office-text');
      return createSource(file.name, await extractOfficeText(data, extension, signal));
    }
    return createSource(file.name, new TextDecoder('utf-8', { fatal: true }).decode(data));
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof ImportError) throw error;
    if (error instanceof Error && error.name === 'PasswordException') {
      throw new ImportError('Unlock this PDF and try again.');
    }
    throw new ImportError(
      structured
        ? 'This file could not be read. Export a fresh copy or paste its text.'
        : 'Save this file as UTF-8 text and try again.',
    );
  }
}
