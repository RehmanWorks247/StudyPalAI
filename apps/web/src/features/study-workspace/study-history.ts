import type { ChatState, SavedPractice, StudySet } from './demo-data';
import type { QuizAttempt } from './local-inference';

export const chatHistoryLimit = 8;
export const practiceHistoryLimit = 12;

export function switchChat(current: ChatState, id?: string): ChatState {
  const saved = current.history ?? [];
  const selected = saved.find((entry) => entry.id === id);
  if (id && !selected) return current;
  const history = saved.filter((entry) => entry !== selected);
  if (current.messages.length || current.draft.trim()) {
    const { messages, draft, guided } = current;
    history.unshift({
      id: crypto.randomUUID(),
      savedAt: Date.now(),
      conversation: { messages, draft, guided },
    });
  }
  return {
    ...(selected?.conversation ?? { messages: [], draft: '', guided: false }),
    history: history.slice(0, chatHistoryLimit),
  };
}

export function savePractice(
  set: StudySet,
  mode: SavedPractice['mode'],
  next: QuizAttempt | undefined,
  replacing = false,
): StudySet {
  const previous = set.practice?.[mode];
  const practice = { ...set.practice };
  if (next) practice[mode] = next;
  else delete practice[mode];
  if (!previous || (!replacing && next)) return { ...set, practice };
  const archived = { id: crypto.randomUUID(), savedAt: Date.now(), mode, attempt: previous };
  return {
    ...set,
    practice,
    practiceHistory: [archived, ...(set.practiceHistory ?? [])].slice(0, practiceHistoryLimit),
  };
}

export function openPractice(
  set: StudySet,
  mode: SavedPractice['mode'],
  archivedId?: string,
  retry = false,
): StudySet {
  const entry = set.practiceHistory?.find((item) => item.id === archivedId && item.mode === mode);
  if (archivedId && !entry) return set;
  const attempt = entry?.attempt ?? set.practice?.[mode];
  if (!attempt || (!entry && !retry)) return set;
  const next = retry
    ? { questions: attempt.questions, answers: {}, step: 0, checked: false }
    : attempt;
  // Restoring an archived attempt exchanges it with the active one. Practicing
  // again keeps the original attempt and starts a new answer sheet.
  const before =
    entry && !retry
      ? { ...set, practiceHistory: set.practiceHistory?.filter((item) => item.id !== entry.id) }
      : set;
  return savePractice(before, mode, next, true);
}
