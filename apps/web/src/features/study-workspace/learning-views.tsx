import { useWorkspaceAccess } from '@/lib/workspace-access';
import { useEffect, useMemo, useRef, useState } from 'react';
import { answerQuestion, inferenceError } from './local-inference';
import { frontierGrade, frontierError } from './frontier-study';
import { ModelChoice } from './model-choice';
import { Icon } from './icons';
import type { StudySource } from './study-source';
import type { View } from './demo-data';
import './source-quiz.css';

type Activity = 'flashcards' | 'audio' | 'essay' | 'explainers' | 'arcade' | 'apps';

const titles: Record<Activity, string> = {
  flashcards: 'Flashcards',
  audio: 'Audio recap',
  essay: 'Essay feedback',
  explainers: 'Explainer',
  arcade: 'Recall challenge',
  apps: 'Mini apps',
};

function makeCards(source: StudySource) {
  const sentences = source.text.match(/[^.!?\n]+(?:[.!?]+|$)/gu) ?? [];
  return sentences
    .flatMap((text, index) => {
      const words = [...text.matchAll(/\b[\p{L}][\p{L}\p{M}-]{3,}\b/gu)].filter(
        (m) =>
          !/^(which|their|there|where|about|should|these|those|would|other|this|that|with|from|they|have|does|than|when|will)$/i.test(
            m[0],
          ),
      );
      if (!words.length || text.trim().length < 16) return [];
      const term = words[index % words.length];
      if (!term) return [];
      return [
        { front: text.trim().replace(term[0], '_____'), back: term[0], sentence: text.trim() },
      ];
    })
    .slice(0, 60);
}

type SaveSource = (changes: Partial<StudySource>) => void;
function RecallCards({
  source,
  game,
  onSave,
}: {
  source: StudySource;
  game: boolean;
  onSave: SaveSource;
}) {
  const cards = useMemo(
    () => makeCards({ name: source.name, text: source.text }),
    [source.name, source.text],
  );
  const progress = game ? 'arcade' : 'flashcards';
  const { step, score } = source[progress] ?? { step: 0, score: 0 };
  const [answer, setAnswer] = useState('');
  const [shown, setShown] = useState(false);

  const card = cards[step];
  if (!cards.length) return <p>Add a few complete sentences to make recall cards.</p>;
  if (!card)
    return (
      <>
        <h2>Session complete</h2>
        <p>
          {score} of {cards.length} recalled
        </p>
        <button
          className="sp-button dark"
          onClick={() => {
            onSave({ [progress]: { step: 0, score: 0 } });
          }}
        >
          Practice again
        </button>
      </>
    );
  const correct = answer.trim().toLocaleLowerCase() === card.back.toLocaleLowerCase();
  function advance(remembered: boolean) {
    onSave({ [progress]: { step: step + 1, score: score + Number(remembered) } });
    setShown(false);
    setAnswer('');
  }
  return (
    <>
      <p>
        {source.name} · {step + 1} of {cards.length}
      </p>
      <h2>{card.front}</h2>
      {game && !shown && (
        <label>
          Missing word
          <input value={answer} maxLength={100} onChange={(e) => setAnswer(e.target.value)} />
        </label>
      )}
      {!shown ? (
        <button
          className="sp-button dark"
          disabled={game && !answer.trim()}
          onClick={() => setShown(true)}
        >
          {game ? 'Check answer' : 'Reveal answer'}
        </button>
      ) : (
        <>
          <p>
            {game && (correct ? 'Correct. ' : 'Review. ')}
            <strong>{card.back}</strong>
          </p>
          <blockquote>{card.sentence}</blockquote>
          {game ? (
            <button className="sp-button dark" onClick={() => advance(correct)}>
              Next
            </button>
          ) : (
            <div>
              <button className="sp-button white" onClick={() => advance(false)}>
                Review again
              </button>{' '}
              <button className="sp-button dark" onClick={() => advance(true)}>
                Got it
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}

function WrittenActivity({
  source,
  essay,
  onSave,
}: {
  source: StudySource;
  essay: boolean;
  onSave: SaveSource;
}) {
  const access = useWorkspaceAccess();
  const [cloud, setCloud] = useState(false);
  const kind = essay ? 'essay' : 'explainer';
  const { draft: input, response: text } = source[kind] ?? { draft: '', response: '' };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const job = useRef<AbortController | null>(null);
  useEffect(() => () => job.current?.abort(), []);
  async function run() {
    if (job.current) return;
    const controller = new AbortController();
    job.current = controller;
    setBusy(true);
    setError('');

    const question = essay
      ? 'Review the following student answer for factual accuracy against these class materials. Give one strength and one specific improvement. Student answer: ' +
        input
      : 'Teach this material with an explanation, a worked example when supported, and one recall question. Focus: ' +
        (input || source.name);
    try {
      const result =
        essay && cloud
          ? await frontierGrade(access, source, input, controller.signal)
          : await answerQuestion([source], question, [], false, controller.signal);
      if (!controller.signal.aborted) onSave({ [kind]: { draft: input, response: result } });
    } catch (error) {
      if (!controller.signal.aborted)
        setError(essay && cloud ? frontierError(error) : inferenceError(error));
    } finally {
      if (job.current === controller) {
        job.current = null;
        setBusy(false);
      }
    }
  }
  return (
    <>
      {essay && <ModelChoice cloud={cloud} onChange={setCloud} busy={busy} grading />}
      <label>
        {essay ? 'Your answer' : 'Topic to explain'}
        <textarea
          value={input}
          maxLength={1500}
          rows={essay ? 8 : 2}
          disabled={busy}
          onChange={(e) => onSave({ [kind]: { draft: e.target.value, response: '' } })}
        />
      </label>
      <button
        className="sp-button dark"
        disabled={busy || (essay && !input.trim())}
        onClick={() => void run()}
      >
        {essay ? 'Review answer' : 'Explain material'}
      </button>
      {busy && (
        <button
          className="sp-button white"
          onClick={() => {
            job.current?.abort();
            job.current = null;
            setBusy(false);
          }}
        >
          Cancel
        </button>
      )}
      {busy && (
        <p role="status">
          {essay && cloud
            ? 'Reviewing your answer with GPT-5.4 mini…'
            : 'Reading your material on this device…'}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {text && (
        <article style={{ whiteSpace: 'pre-wrap' }} aria-label="Source-grounded response">
          {text}
        </article>
      )}
    </>
  );
}

function AudioLesson({ source }: { source: StudySource }) {
  const synth = window.speechSynthesis;
  const [voices, setVoices] = useState(
    () => synth?.getVoices().filter((v) => v.localService) ?? [],
  );
  const [voiceId, setVoiceId] = useState('');
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState('');
  const reading = useRef(false);
  const current = useRef<SpeechSynthesisUtterance | null>(null);
  const paragraphs = source.text
    .split(/(?<=[.!?])\s+|\n+/u)
    .map((s) => s.trim())
    .filter((s) => s.length > 5);
  const summary = paragraphs
    .filter((_, index) => index % Math.max(1, Math.ceil(paragraphs.length / 8)) === 0)
    .slice(0, 8)
    .map((text) => text.slice(0, 550));
  useEffect(() => {
    if (!synth) return;
    const refresh = () => setVoices(synth.getVoices().filter((v) => v.localService));
    synth.addEventListener('voiceschanged', refresh);
    return () => {
      reading.current = false;
      synth.cancel();
      synth.removeEventListener('voiceschanged', refresh);
    };
  }, [synth]);
  function read(step: number) {
    const text = summary[step];
    if (!reading.current || !text) {
      setPlaying(false);
      return;
    }
    const voice =
      voices.find((v) => v.voiceURI === voiceId) ??
      voices.find((v) => v.lang.startsWith('en')) ??
      voices[0];
    if (!voice) {
      setError('Install a local system voice to listen offline.');
      setPlaying(false);
      return;
    }
    const next = new SpeechSynthesisUtterance(text);
    current.current = next;
    next.voice = voice;
    next.onend = () => {
      if (reading.current) read(step + 1);
    };
    next.onerror = () => {
      if (reading.current) {
        setError('Audio playback stopped. Check your system voice.');
        setPlaying(false);
        reading.current = false;
      }
    };
    synth.speak(next);
  }
  return (
    <>
      <p>Listen to passages from {source.name} with an installed system voice.</p>
      <label>
        Voice
        <select value={voiceId} onChange={(e) => setVoiceId(e.target.value)}>
          <option value="">System voice</option>
          {voices.map((v) => (
            <option key={v.voiceURI} value={v.voiceURI}>
              {v.name}
            </option>
          ))}
        </select>
      </label>
      <button
        className="sp-button dark"
        disabled={!voices.length || !summary.length}
        onClick={() => {
          if (playing) {
            reading.current = false;
            synth.cancel();
            setPlaying(false);
          } else {
            setError('');
            reading.current = true;
            setPlaying(true);
            read(0);
          }
        }}
      >
        {playing ? 'Stop playback' : 'Play recap'}
      </button>
      {!voices.length && (
        <p>Install a local voice in system settings to enable offline playback.</p>
      )}
      {error && <p role="alert">{error}</p>}
      <ol>
        {summary.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ol>
    </>
  );
}

export function LearningView({
  view,
  sources,
  initialMaterial,
  onSourceChange,
  onNavigate,
}: {
  view: Activity;
  sources: readonly StudySource[];
  initialMaterial?: string | undefined;
  onSourceChange: (name: string, changes: Partial<StudySource>) => void;
  onNavigate: (view: View) => void;
}) {
  const [selected, setSelected] = useState(initialMaterial ?? '');
  const source = sources.find((item) => item.name === selected) ?? sources.at(-1);
  const [started, setStarted] = useState(false);
  if (view === 'apps')
    return (
      <section className="source-quiz">
        <h1>Mini apps</h1>
        {(['flashcards', 'audio', 'essay', 'explainers', 'arcade'] as const).map((tool) => (
          <button className="sp-button white" key={tool} onClick={() => onNavigate(tool)}>
            <Icon name="book" />
            {titles[tool]}
          </button>
        ))}
      </section>
    );
  return (
    <section className="source-quiz" aria-label={titles[view]}>
      <h1>{titles[view]}</h1>
      <label>
        Source material
        <select
          value={source?.name ?? ''}
          onChange={(e) => {
            setSelected(e.target.value);
            setStarted(false);
          }}
        >
          {sources.map((s) => (
            <option key={s.name}>{s.name}</option>
          ))}
        </select>
      </label>
      {!source ? (
        <p>Add a document to this study set first.</p>
      ) : view === 'arcade' || view === 'flashcards' ? (
        started || source[view] ? (
          <RecallCards
            key={source.name}
            source={source}
            game={view === 'arcade'}
            onSave={(changes) => onSourceChange(source.name, changes)}
          />
        ) : (
          <button className="sp-button dark" onClick={() => setStarted(true)}>
            {view === 'arcade' ? 'Start challenge' : 'Create flashcards'}
          </button>
        )
      ) : view === 'audio' ? (
        <AudioLesson key={source.name} source={source} />
      ) : (
        <WrittenActivity
          key={source.name}
          source={source}
          essay={view === 'essay'}
          onSave={(changes) => onSourceChange(source.name, changes)}
        />
      )}
    </section>
  );
}
