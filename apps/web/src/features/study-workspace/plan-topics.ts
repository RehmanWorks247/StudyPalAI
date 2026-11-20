import type { StudySource } from './study-source';

export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function planTopics(sources: readonly StudySource[]) {
  return sources.flatMap((source) => {
    const blocks = source.text
      .split(/\n\s*\n|(?=^#{1,6} )/m)
      .map((s) => s.trim())
      .filter(Boolean);
    const sections: string[] = [];
    let current = '';
    const limit = Math.max(1400, Math.ceil(source.text.length / 64));
    for (const block of blocks) {
      const isHeading =
        /^#{1,6}\s/.test(block) ||
        (block.length <= 68 && !/[.!?:]$/.test(block) && !block.includes('\n'));
      if (current && (isHeading || current.length + block.length > limit)) {
        sections.push(current);
        current = '';
      }
      if (block.length > limit) {
        const words = block.split(/\s+/);
        for (const word of words) {
          if (current.length + word.length > limit && current) {
            sections.push(current);
            current = '';
          }
          current += (current ? ' ' : '') + word;
        }
      } else current += (current ? '\n\n' : '') + block;
    }
    if (current) sections.push(current);
    // Bound the number of rendered topics while retaining text from the end of long documents.
    const stride = Math.ceil(sections.length / 80);
    return sections.flatMap((section, i) => {
      if (i % stride) return [];
      const text = sections.slice(i, i + stride).join('\n\n');
      const heading =
        section
          .split(/\n|(?<=[.!?])\s+/)[0]
          ?.replace(/^#+\s*/, '')
          .trim() || source.name;
      return [
        {
          id: JSON.stringify([source.name, i, heading.slice(0, 120)]),
          source: source.name,
          title: heading.slice(0, 100),
          text,
        },
      ];
    });
  });
}

export function scheduledDate(start: string, end: string, index: number, count: number) {
  const first = new Date(start + 'T12:00:00');
  const last = new Date(end + 'T12:00:00');
  const days = Math.max(0, Math.round((last.getTime() - first.getTime()) / 86400000));
  first.setDate(first.getDate() + Math.floor((days * index) / Math.max(1, count - 1)));
  return localDate(first);
}
