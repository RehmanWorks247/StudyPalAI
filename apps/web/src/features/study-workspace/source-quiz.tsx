import { useWorkspaceAccess } from '@/lib/workspace-access';
import { useEffect, useRef, useState } from 'react';
import { generateQuestions, inferenceError, type QuizAttempt } from './local-inference';
import { frontierQuestions, frontierError } from './frontier-study';
import { ModelChoice } from './model-choice';
import type { StudySource } from './study-source';
import './source-quiz.css';

export function SourceQuiz({
  sources,
  mode,
  attempt,
  preset,
  onSave,
}: {
  sources: readonly StudySource[];
  mode: 'quiz' | 'test';
  preset?: { source: string; title: string } | undefined;
  attempt: QuizAttempt | undefined;
  onSave: (attempt: QuizAttempt | undefined, replacing?: boolean) => void;
}) {
  const access = useWorkspaceAccess();
  const [cloud, setCloud] = useState(false);
  const [material, setMaterial] = useState(preset?.source ?? '');
  const [choosing, setChoosing] = useState(Boolean(preset));
  const selected = material ? sources.filter((source) => source.name === material) : sources;
  const [count, setCount] = useState(3);
  const [focus, setFocus] = useState(preset?.title ?? '');
  const { questions, answers, step, checked } = attempt ?? {
    questions: [],
    answers: {},
    step: 0,
    checked: false,
  };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      request.current?.abort();
      request.current = null;
    },
    [],
  );
  const title = mode === 'quiz' ? 'Practice quiz' : 'Practice test';
  async function generate() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError('');
    try {
      const items = await (cloud ? frontierQuestions.bind(null, access) : generateQuestions)(
        selected,
        count,
        focus,
        controller.signal,
      );
      if (!controller.signal.aborted) {
        setChoosing(false);
        onSave({ questions: items, answers: {}, step: 0, checked: false }, true);
      }
    } catch (reason) {
      if (!controller.signal.aborted)
        setError(cloud ? frontierError(reason) : inferenceError(reason));
    } finally {
      if (request.current === controller) {
        request.current = null;
        setBusy(false);
      }
    }
  }
  const question = questions[step];
  if (!questions.length || choosing)
    return (
      <section className="source-quiz" aria-label={title}>
        <h1>{title}</h1>
        {choosing && questions.length > 0 && (
          <button className="sp-button white" onClick={() => setChoosing(false)}>
            Resume saved practice
          </button>
        )}
        <ModelChoice cloud={cloud} onChange={setCloud} busy={busy} />
        <label>
          Source material
          <select
            value={material}
            disabled={busy}
            onChange={(event) => setMaterial(event.target.value)}
          >
            <option value="">All materials in this set</option>
            {sources.map((source) => (
              <option key={source.name} value={source.name}>
                {source.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Topic (optional)
          <input
            value={focus}
            disabled={busy}
            maxLength={300}
            onChange={(e) => setFocus(e.target.value)}
            placeholder="All materials"
          />
        </label>
        <label>
          Number of questions
          <select value={count} disabled={busy} onChange={(e) => setCount(Number(e.target.value))}>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        {!sources.length && <p>Add materials to this study set to generate questions.</p>}
        {error && <p role="alert">{error}</p>}
        {busy && (
          <p role="status">
            {cloud
              ? 'Generating and checking questions with GPT-5.4 mini…'
              : 'Generating and checking questions on this device…'}
          </p>
        )}
        <button className="sp-button" disabled={!selected.length || busy} onClick={generate}>
          Generate {mode}
        </button>
        {busy && (
          <button
            className="sp-button"
            onClick={() => {
              request.current?.abort();
              request.current = null;
              setBusy(false);
            }}
          >
            Cancel
          </button>
        )}
      </section>
    );
  if (!question)
    return (
      <section className="source-quiz" aria-label="Practice results">
        <h1>{title} results</h1>
        <p>
          {questions.filter((item, i) => item.answer === answers[i]).length} of {questions.length}{' '}
          correct
        </p>
        {questions.map((item, i) => (
          <details key={item.question}>
            <summary>
              {answers[i] === item.answer ? 'Correct' : 'Review'} · {item.question}
            </summary>
            <p>Your choice: {item.choices[answers[i] ?? -1]}</p>
            <p>Correct answer: {item.choices[item.answer]}</p>
            <p>{item.explanation}</p>
            <blockquote>
              {item.evidence.quote}
              <cite>{item.evidence.name}</cite>
            </blockquote>
          </details>
        ))}
        <button
          className="sp-button"
          onClick={() => {
            onSave(undefined);
            setError('');
          }}
        >
          Create another {mode}
        </button>
      </section>
    );
  const choice = answers[step];
  const showAnswer = checked && mode === 'quiz';
  return (
    <section className="source-quiz" aria-label={title}>
      <p>
        {title} · Question {step + 1} of {questions.length}
      </p>
      <h1>{question.question}</h1>
      <fieldset>
        <legend>Choose one answer</legend>
        {question.choices.map((option, i) => (
          <label key={option}>
            <input
              type="radio"
              name={'answer-' + mode}
              checked={choice === i}
              disabled={showAnswer}
              onChange={() =>
                onSave({ questions, step, checked, answers: { ...answers, [step]: i } })
              }
            />
            {option}
          </label>
        ))}
      </fieldset>
      {showAnswer && (
        <div role="status">
          <strong>
            {choice === question.answer
              ? 'Correct'
              : 'Correct answer: ' + question.choices[question.answer]}
          </strong>
          <p>{question.explanation}</p>
          <blockquote>
            {question.evidence.quote}
            <cite>{question.evidence.name}</cite>
          </blockquote>
        </div>
      )}
      <button
        className="sp-button"
        disabled={choice === undefined}
        onClick={() => {
          if (mode === 'quiz' && !checked) {
            onSave({ questions, step, answers, checked: true });
            return;
          }
          onSave({ questions, answers, step: step + 1, checked: false });
        }}
      >
        {mode === 'quiz' && !checked
          ? 'Check answer'
          : step + 1 === questions.length
            ? 'See results'
            : 'Next question'}
      </button>
    </section>
  );
}
