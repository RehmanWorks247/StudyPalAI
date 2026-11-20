import { readStudyFile } from './document-import';
import { zipSync, strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { createSource } from './study-source';

function read(name: string, bytes: Uint8Array) {
  const file = new File([new Uint8Array(bytes)], name);
  // jsdom's File lacks the browser's standard Blob.arrayBuffer method.
  Object.defineProperty(file, 'arrayBuffer', { value: async () => new Uint8Array(bytes).buffer });
  return readStudyFile(file, new AbortController().signal);
}

describe('local document import', () => {
  it('reads UTF-8 Markdown, rejects binary data, and bounds input', async () => {
    await expect(read('notes.md', strToU8('# Plants\r\n光合成'))).resolves.toEqual({
      name: 'notes.md',
      text: '# Plants\n光合成',
    });
    await expect(read('notes.txt', new Uint8Array([0xff, 0x00]))).rejects.toThrow('UTF-8');
    await expect(read('notes.txt', new Uint8Array(513 * 1024))).rejects.toThrow('512 KB');
    expect(() => createSource('notes.txt', 'a'.repeat(200_001))).toThrow('200,000');
  });
  it('extracts DOCX paragraphs and PPTX slides in slide number order', async () => {
    const doc =
      '<w:document xmlns:w="urn:word"><w:p><w:r><w:t>Solar </w:t></w:r><w:r><w:t>energy</w:t></w:r></w:p><w:p><w:t>Stored in glucose.</w:t></w:p></w:document>';
    const slide = (t: string) =>
      strToU8(`<slide xmlns:a="urn:drawing"><a:p><a:r><a:t>${t}</a:t></a:r></a:p></slide>`);
    await expect(
      read('plant.docx', zipSync({ 'word/document.xml': strToU8(doc) })),
    ).resolves.toMatchObject({ text: 'Solar energy\nStored in glucose.' });
    await expect(
      read(
        'slides.pptx',
        zipSync({
          'ppt/slides/slide10.xml': slide('Second idea'),
          'ppt/slides/slide2.xml': slide('First idea'),
        }),
      ),
    ).resolves.toMatchObject({ text: 'First idea\n\nSecond idea' });
  });
  it('rejects unsupported formats and bounds the expanded Office XML', async () => {
    await expect(read('unreadable.mov', new Uint8Array())).rejects.toThrow('Choose a PDF');
    await expect(
      read('book.docx', zipSync({ 'word/document.xml': new Uint8Array(4 * 1024 * 1024 + 1) })),
    ).rejects.toThrow('smaller parts');
  });
});
