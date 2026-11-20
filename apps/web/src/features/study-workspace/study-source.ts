export type HighlightColor = 'yellow' | 'purple' | 'mint';
export interface SourceHighlight {
  start: number;
  end: number;
  color: HighlightColor;
}
export interface RecallProgress {
  step: number;
  score: number;
}
export interface WrittenWork {
  draft: string;
  response: string;
}
export interface StudySource {
  flashcards?: RecallProgress | undefined;
  arcade?: RecallProgress | undefined;
  essay?: WrittenWork | undefined;
  explainer?: WrittenWork | undefined;
  name: string;
  text: string;
  notes?: string | undefined;
  highlights?: SourceHighlight[] | undefined;
  reviewed?: boolean | undefined;
}

export const maxSourceCharacters = 200_000;
export const acceptedDocumentTypes = '.pdf,.docx,.pptx,.png,.jpg,.jpeg,.txt,.md,.markdown,.csv';

export class ImportError extends Error {}

export function createSource(name: string, input: string): StudySource {
  const text = input.replaceAll('\r\n', '\n').trim();
  if (!text) throw new ImportError('The document contains no readable text.');
  if (text.includes('\0')) throw new ImportError('Save your document as UTF-8 text.');
  if (text.length > maxSourceCharacters) {
    throw new ImportError('Split the document into parts under 200,000 characters.');
  }
  return { name: name.slice(0, 160).trim() || 'Class notes.txt', text };
}
