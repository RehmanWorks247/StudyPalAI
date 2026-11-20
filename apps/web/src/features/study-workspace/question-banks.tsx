import type { SavedPractice, StudySet } from './demo-data';
import { Icon } from './icons';
import { ToolIllustration } from './illustrations';
import type { QuizAttempt } from './local-inference';
import { practiceHistoryLimit } from './study-history';
import './question-banks.css';

type Mode = SavedPractice['mode'];
export function QuestionBanks({
  sets,
  onCreate,
  onOpen,
}: {
  sets: StudySet[];
  onCreate: (setId: number) => void;
  onOpen: (setId: number, mode: Mode, id?: string, retry?: boolean) => void;
}) {
  function attemptRow(set: StudySet, mode: Mode, attempt: QuizAttempt, entry?: SavedPractice) {
    const done = attempt.step >= attempt.questions.length;
    const score = attempt.questions.filter((q, i) => q.answer === attempt.answers[i]).length;
    const title = mode === 'quiz' ? 'Practice quiz' : 'Practice test';
    return (
      <article
        className="bank-attempt"
        key={entry?.id ?? mode}
        aria-label={title + (entry ? ' · Saved' : ' · Current')}
      >
        <h3>
          {title} · {entry ? 'Saved' : 'Current'}
        </h3>
        <p>{attempt.questions[0]?.question}</p>
        <p>{[...new Set(attempt.questions.map((q) => q.evidence.name))].join(', ')}</p>
        <small>
          {done
            ? score + ' of ' + attempt.questions.length + ' correct'
            : 'Question ' + (attempt.step + 1) + ' of ' + attempt.questions.length}
          {entry && ' · ' + new Date(entry.savedAt).toLocaleDateString()}
        </small>
        <div>
          <button className="sp-button white" onClick={() => onOpen(set.id, mode, entry?.id)}>
            {done ? 'View results' : 'Continue practice'}
          </button>
          <button className="sp-button white" onClick={() => onOpen(set.id, mode, entry?.id, true)}>
            Practice again
          </button>
        </div>
      </article>
    );
  }
  return (
    <div className="question-banks">
      <div className="page-title">
        <span>
          <Icon name="layers" size={30} />
        </span>
        <div>
          <h1>Question Banks</h1>
          <p>
            Resume practice or review your last {practiceHistoryLimit} saved attempts per study set.
          </p>
        </div>
      </div>
      <div className="question-bank-grid">
        {sets.map((set) => (
          <section key={set.id} aria-label={set.name} className="bank-set">
            <div className="bank-art">
              <ToolIllustration kind="quiz" />
            </div>
            <h2>{set.name}</h2>
            {(['quiz', 'test'] as const).map((mode) => {
              const attempt = set.practice?.[mode];
              return attempt && attemptRow(set, mode, attempt);
            })}
            {set.practiceHistory?.map((entry) => attemptRow(set, entry.mode, entry.attempt, entry))}
            {!set.practice?.quiz && !set.practice?.test && !set.practiceHistory?.length && (
              <p>No saved practice yet.</p>
            )}
            {set.sources?.length ? (
              <button className="sp-button dark bank-generate" onClick={() => onCreate(set.id)}>
                Generate practice questions <Icon name="play" />
              </button>
            ) : (
              <p>Add a material to generate questions.</p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
