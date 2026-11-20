import { Unzip, UnzipInflate } from 'fflate';
import { ImportError, maxSourceCharacters } from './study-source';

const maxExpandedBytes = 4 * 1024 * 1024;
function parseXml(xml: string) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml))
    throw new ImportError('This document contains an unsupported XML declaration.');
  // Bound DOM nodes before asking the browser to allocate the tree.
  let tags = 0;
  for (let at = xml.indexOf('<'); at >= 0; at = xml.indexOf('<', at + 1)) {
    if (++tags > 100_000) throw new ImportError('Split this document into smaller parts.');
  }
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length)
    throw new ImportError('This Office document could not be read.');
  return doc;
}
function paragraphText(doc: Document) {
  const parts: string[] = [];
  const walker = doc.createTreeWalker(doc, NodeFilter.SHOW_ELEMENT);
  let started = false;
  let node = walker.nextNode();
  while (node) {
    if (node instanceof Element) {
      if (node.localName === 'p') {
        if (started) parts.push('\n');
        started = true;
      }
      if (node.localName === 't')
        for (const child of node.childNodes) {
          if (child.nodeType === Node.TEXT_NODE || child.nodeType === Node.CDATA_SECTION_NODE)
            parts.push(child.nodeValue ?? '');
        }
      if (node.localName === 'tab') parts.push('\t');
      if (node.localName === 'br') parts.push('\n');
    }
    node = walker.nextNode();
  }
  return parts.join('');
}

export async function extractOfficeText(
  data: Uint8Array,
  kind: 'docx' | 'pptx',
  signal: AbortSignal,
) {
  const sections = new Map<number, string>(),
    seen = new Set<string>();
  const relationships = new Map<string, number>();
  let order: string[] | undefined;
  let entries = 0,
    expandedBytes = 0,
    characters = 0;
  const zip = new Unzip((file) => {
    if (++entries > 2500) throw new ImportError('This Office file contains too many entries.');
    const slide = /^ppt\/slides\/slide([1-9]\d{0,4})\.xml$/.exec(file.name);
    const manifest = file.name === 'ppt/presentation.xml';
    const rels = file.name === 'ppt/_rels/presentation.xml.rels';
    if (kind === 'pptx' ? !slide && !manifest && !rels : file.name !== 'word/document.xml') return;
    if (seen.has(file.name))
      throw new ImportError('This Office document contains duplicate sections.');
    seen.add(file.name);
    if (slide && sections.size >= 200)
      throw new ImportError('Split slide decks longer than 200 slides.');
    if ((file.originalSize ?? 0) > maxExpandedBytes - expandedBytes)
      throw new ImportError('Split this document into smaller parts.');
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let xml = '';
    file.ondata = (error, chunk, final) => {
      if (error) throw error;
      expandedBytes += chunk.length;
      if (expandedBytes > maxExpandedBytes)
        throw new ImportError('Split this document into smaller parts.');
      xml += decoder.decode(chunk, { stream: !final });
      if (!final) return;
      const doc = parseXml(xml);
      if (manifest) {
        order = Array.from(
          doc.getElementsByTagNameNS('*', 'sldId'),
          (s) =>
            s.getAttributeNS(
              'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
              'id',
            ) ??
            s.getAttributeNS('http://purl.oclc.org/ooxml/officeDocument/relationships', 'id') ??
            '',
        );
        if (order.length > 200) throw new ImportError('Split slide decks longer than 200 slides.');
      } else if (rels) {
        for (const rel of doc.getElementsByTagNameNS('*', 'Relationship')) {
          if (
            rel.getAttribute('TargetMode') === 'External' ||
            !rel.getAttribute('Type')?.endsWith('/slide')
          )
            continue;
          const target = /^(?:\/ppt\/|\.\/)?slides\/slide([1-9]\d{0,4})\.xml$/.exec(
            rel.getAttribute('Target') ?? '',
          );
          const id = rel.getAttribute('Id');
          if (target && id) relationships.set(id, Number(target[1]));
        }
      } else {
        const text = paragraphText(doc);
        characters += text.length;
        if (characters > maxSourceCharacters)
          throw new ImportError('Split the document into parts under 200,000 characters.');
        sections.set(Number(slide?.[1] ?? 0), text);
      }
    };
    file.start();
  });
  zip.register(UnzipInflate);
  // Feed small compressed chunks: inflater temporaries are bounded even for streamed entries without size metadata.
  for (let offset = 0; offset < data.length; offset += 4096) {
    signal.throwIfAborted();
    zip.push(data.subarray(offset, offset + 4096), offset + 4096 >= data.length);
    if (offset && offset % (256 * 1024) === 0)
      await new Promise((resolve) => setTimeout(resolve, 0));
  }
  if (order) {
    const ordered = order.map((id) => sections.get(relationships.get(id) ?? -1));
    if (ordered.some((s) => s === undefined))
      throw new ImportError('This presentation contains an unreadable slide reference.');
    return ordered.join('\n\n');
  }
  return [...sections]
    .sort(([a], [b]) => a - b)
    .map(([, text]) => text)
    .join('\n\n');
}
