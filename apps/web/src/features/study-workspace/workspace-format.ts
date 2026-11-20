import { z } from 'zod';
import { chatHistoryLimit, practiceHistoryLimit } from './study-history';
import type { WorkspaceData } from './workspace-storage';

const text = z.string();
const index = z.number().int().nonnegative();
const recall = z.object({ step: index, score: index });
const written = z.object({ draft: text, response: text });
const source = z.object({
  flashcards: recall.optional(),
  arcade: recall.optional(),
  essay: written.optional(),
  explainer: written.optional(),
  name: text,
  text,
  notes: text.optional(),
  reviewed: z.boolean().optional(),
  highlights: z
    .array(z.object({ start: index, end: index, color: z.enum(['yellow', 'purple', 'mint']) }))
    .optional(),
});
const question = z.object({
  question: text,
  choices: z.array(text).min(2),
  answer: index,
  explanation: text,
  evidence: z.object({ name: text, quote: text }),
});
const attempt = z.object({
  questions: z.array(question).min(1),
  answers: z.record(text, index),
  step: index,
  checked: z.boolean(),
});
const conversation = z.object({
  messages: z.array(z.object({ id: index, role: z.enum(['user', 'assistant']), text })),
  draft: text,
  guided: z.boolean(),
});
const studySet = z.object({
  id: index,
  name: text,
  materials: z.array(text),
  sources: z.array(source).optional(),
  description: text.optional(),
  mode: text.optional(),
  recommendations: z.boolean().optional(),
  practiceHistory: z
    .array(z.object({ id: text, savedAt: index, mode: z.enum(['quiz', 'test']), attempt }))
    .max(practiceHistoryLimit)
    .optional(),
  practice: z.object({ quiz: attempt.optional(), test: attempt.optional() }).optional(),
});
const schema = z.object({
  sets: z.array(studySet),
  setId: index,
  chats: z.record(
    text,
    conversation.extend({
      history: z
        .array(z.object({ id: text, savedAt: index, conversation }))
        .max(chatHistoryLimit)
        .optional(),
    }),
  ),
  folders: z.record(text, z.array(z.object({ name: text, materials: z.array(text) }))),
  events: z.array(z.object({ id: index, name: text, date: text, time: text, kind: text })),
  plans: z.record(text, z.array(z.object({ name: text, date: text, start: text, mode: text }))),
  reviewed: z.record(text, z.array(text)),
  profileName: text,
  companionName: text,
  theme: z.enum(['light', 'dark', 'system']),
});

export function readSnapshot(content: string): WorkspaceData {
  const parsed = z
    .object({ version: z.literal(1), workspace: schema })
    .safeParse(JSON.parse(content));
  if (
    !parsed.success ||
    (parsed.data.workspace.sets.length === 0
      ? parsed.data.workspace.setId !== 0
      : !parsed.data.workspace.sets.some((set) => set.id === parsed.data.workspace.setId))
  )
    throw new Error(
      'The database holds an unreadable workspace version. Your browser copy is safe.',
    );
  return parsed.data.workspace;
}

export function snapshot(data: WorkspaceData) {
  return JSON.stringify({ version: 1, workspace: data });
}

export function downloadText(name: string, text: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
