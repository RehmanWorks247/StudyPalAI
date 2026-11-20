import { expect, it } from 'vitest';
import type { ChatState, StudySet } from './demo-data';
import type { QuizAttempt } from './local-inference';
import {
  chatHistoryLimit,
  openPractice,
  practiceHistoryLimit,
  savePractice,
  switchChat,
} from './study-history';
import { readSnapshot, snapshot } from './workspace-format';
import { initialWorkspace } from './workspace-storage';

it('restores an empty account snapshot without accepting a reference to a nonexistent set', () => {
  expect(readSnapshot(snapshot(initialWorkspace))).toEqual(initialWorkspace);
  expect(() => readSnapshot(snapshot({ ...initialWorkspace, setId: 1 }))).toThrow('unreadable');
});

const completed: QuizAttempt = {
  questions: [
    {
      question: 'Which tissue carries water?',
      choices: ['Xylem', 'Phloem', 'Cortex', 'Epidermis'],
      answer: 0,
      explanation: 'Xylem conducts water.',
      evidence: { name: 'Botany', quote: 'Xylem conducts water.' },
    },
  ],
  answers: { 0: 0 },
  step: 1,
  checked: false,
};
it('migrates existing active scores to bounded history and resumes or retries without losing them', () => {
  const oldSet: StudySet = { id: 1, name: 'Biology', materials: [], practice: { test: completed } };
  const set = savePractice(oldSet, 'test', undefined);
  const entry = set.practiceHistory?.[0];
  expect(entry?.attempt).toEqual(completed);
  const resumed = openPractice(set, 'test', entry?.id);
  expect(resumed.practice?.test).toEqual(completed);
  const fresh = openPractice(set, 'test', entry?.id, true);
  expect(fresh.practice?.test?.questions).toEqual(completed.questions);
  expect(fresh.practice?.test?.answers).toEqual({});
  expect(fresh.practiceHistory?.[0]?.attempt).toEqual(completed);
  let many = oldSet;
  for (let i = 0; i < practiceHistoryLimit + 2; i++)
    many = savePractice(many, 'test', completed, true);
  expect(many.practiceHistory).toHaveLength(practiceHistoryLimit);
  expect(
    readSnapshot(snapshot({ ...initialWorkspace, setId: many.id, sets: [many] })).sets[0]
      ?.practiceHistory,
  ).toEqual(many.practiceHistory);
});
it('keeps recent chats, exchanges the active draft on reopen and round-trips workspace snapshots', () => {
  let current: ChatState = { messages: [], draft: '', guided: false };
  expect(switchChat(current).history).toEqual([]);
  for (let i = 0; i < chatHistoryLimit + 2; i++)
    current = switchChat({ ...current, draft: 'Draft ' + i, guided: true });
  expect(current.history).toHaveLength(chatHistoryLimit);
  const restored = switchChat({ ...current, draft: 'Another draft' }, current.history?.[0]?.id);
  expect(restored.guided).toBe(true);
  expect(restored.draft).toBe('Draft ' + (chatHistoryLimit + 1));
  expect(restored.history?.[0]?.conversation.draft).toBe('Another draft');
  expect(readSnapshot(snapshot({ ...initialWorkspace, chats: { 1: restored } })).chats[1]).toEqual(
    restored,
  );
});
