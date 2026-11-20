import type { StudySource } from './study-source';
import type { QuizAttempt } from './local-inference';
export type View =
  | 'dashboard'
  | 'home'
  | 'sets'
  | 'plan'
  | 'chat'
  | 'materials'
  | 'document'
  | 'read'
  | 'calendar'
  | 'highlights'
  | 'qbank'
  | 'record'
  | 'tutor'
  | 'quiz'
  | 'test'
  | 'flashcards'
  | 'audio'
  | 'arcade'
  | 'apps'
  | 'essay'
  | 'explainers';

export interface StudySet {
  id: number;
  name: string;
  materials: string[];
  description?: string | undefined;
  mode?: string | undefined;
  recommendations?: boolean | undefined;
  sources?: StudySource[] | undefined;
  practice?: Partial<Record<'quiz' | 'test', QuizAttempt | undefined>> | undefined;
  practiceHistory?: SavedPractice[] | undefined;
}
export interface SavedPractice {
  id: string;
  savedAt: number;
  mode: 'quiz' | 'test';
  attempt: QuizAttempt;
}
export interface StudyFolder {
  name: string;
  materials: string[];
}
export interface Conversation {
  messages: { id: number; role: 'user' | 'assistant'; text: string }[];
  draft: string;
  guided: boolean;
}
export interface ChatState extends Conversation {
  history?: { id: string; savedAt: number; conversation: Conversation }[] | undefined;
}
export interface StudyEvent {
  id: number;
  name: string;
  date: string;
  time: string;
  kind: string;
}
export type DialogName =
  | 'upload'
  | 'settings'
  | 'new-set'
  | 'share'
  | 'upgrade'
  | 'exam'
  | 'session'
  | 'new-plan'
  | 'folder'
  | 'help'
  | 'tutorials'
  | 'feedback'
  | 'profile'
  | 'plugins'
  | 'character'
  | 'search'
  | null;

export const viewNames: Record<View, string> = {
  dashboard: 'Dashboard',
  home: 'Home',
  sets: 'My Sets',
  plan: 'Study Plan',
  chat: 'Chat',
  materials: 'Materials',
  document: 'Document',
  read: 'Read',
  calendar: 'Calendar',
  highlights: 'Highlights',
  qbank: 'Question Banks',
  record: 'Live Lecture List',
  tutor: 'Tutor Me',
  quiz: 'QuizFetch',
  test: 'Test',
  flashcards: 'Flashcards',
  audio: 'Audio Recap',
  arcade: 'Arcade',
  apps: 'Mini Apps',
  essay: 'Essay Grader',
  explainers: 'Explainers',
};
export const practiceItems: { view: View; label: string; icon: string }[] = [
  { view: 'quiz', label: 'QuizFetch', icon: 'quiz' },
  { view: 'test', label: 'Test', icon: 'file' },
  { view: 'flashcards', label: 'Flashcards', icon: 'flashcards' },
  { view: 'arcade', label: 'Arcade', icon: 'gamepad' },
  { view: 'essay', label: 'Essay Grader', icon: 'pencil' },
  { view: 'explainers', label: 'Explainers', icon: 'video' },
  { view: 'apps', label: 'Mini Apps', icon: 'app' },
  { view: 'audio', label: 'Audio Recap', icon: 'volume' },
];
export function readView(): View {
  const value = window.location.hash.slice(1);
  return Object.hasOwn(viewNames, value) ? (value as View) : 'dashboard';
}
