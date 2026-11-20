import { useWorkspaceAccess } from '@/lib/workspace-access';
import { useEffect, useRef, useState } from 'react';
import { backUpLecture } from './lecture-backup';
import { LectureRestore } from './lecture-restore';
import { Icon } from './icons';
import { RecordingDialog } from './recording-dialog';
import {
  deleteLecture,
  listLectures,
  loadLectureAudio,
  saveLecture,
  updateLectureTranscript,
  type Lecture,
} from './lecture-storage';
import { prepareSpeechModel, transcribeLecture } from './lecture-transcription';
import type { StudySource } from './study-source';
import './lecture-studio.css';

interface StudioProps {
  setId: number;
  onTranscript: (source: StudySource) => void;
}

const modelFlag = 'studypal-speech-en-us-0.15';

function readModelFlag() {
  try {
    return localStorage.getItem(modelFlag) === 'ready';
  } catch {
    return false;
  }
}

function LectureDetail({
  lecture,
  onDelete,
  onTranscript,
  onUpdate,
  modelReady,
}: {
  lecture: Lecture;
  onDelete: () => void;
  onTranscript: StudioProps['onTranscript'];
  onUpdate: (lecture: Lecture) => void;
  modelReady: boolean;
}) {
  const access = useWorkspaceAccess();
  const [audio, setAudio] = useState<{ blob: Blob; url: string } | null>(null);
  const [draft, setDraft] = useState(lecture.transcript);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const job = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    let active = true;
    mounted.current = true;
    let url = '';
    void loadLectureAudio(access, lecture.setId, lecture.id)
      .then((blob) => {
        if (active) {
          url = URL.createObjectURL(blob);
          setAudio({ blob, url });
        }
      })
      .catch(() => {
        if (active) setError('Could not read this recording from the device.');
      });
    return () => {
      active = false;
      mounted.current = false;
      job.current?.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [access, lecture.id, lecture.setId]);

  async function persist(text: string) {
    await updateLectureTranscript(access, lecture.setId, lecture.id, text);
    if (mounted.current)
      onUpdate({
        ...lecture,
        transcript: text,
        backupCurrent: !!lecture.backupCurrent && lecture.transcript === text,
      });
  }
  async function transcribe() {
    if (!audio || job.current || !modelReady) return;
    const cancel = new AbortController();
    job.current = cancel;
    setProgress(0);
    setError('');
    setNotice('');
    try {
      const text = await transcribeLecture(audio.blob, cancel.signal, setProgress);
      if (cancel.signal.aborted) return;
      setDraft(text);
      await persist(text);
      if (mounted.current)
        setNotice('Transcript saved. Review the wording before adding it to your materials.');
    } catch (failure) {
      if (mounted.current && !cancel.signal.aborted)
        setError(failure instanceof Error ? failure.message : 'Transcription could not finish.');
    } finally {
      job.current = null;
      if (mounted.current) setProgress(null);
    }
  }

  async function saveTranscript(publish: boolean) {
    if (pending || !draft.trim()) return;
    setPending(true);
    setNotice('');
    setError('');
    try {
      const text = draft.trim();
      await persist(text);
      if (!mounted.current) return;
      if (publish)
        onTranscript({ name: lecture.title + ' · ' + lecture.id.slice(0, 8) + '.txt', text });
      setNotice(publish ? 'Transcript added to study materials.' : 'Transcript saved.');
    } catch {
      if (mounted.current)
        setError('Could not save the transcript. Copy your text before leaving.');
    } finally {
      if (mounted.current) setPending(false);
    }
  }

  async function backUp() {
    if (!audio || pending || job.current) return;
    const cancel = new AbortController();
    job.current = cancel;
    setPending(true);
    setError('');
    setNotice('Contacting local PostgreSQL…');
    try {
      const updated = await backUpLecture(access, lecture, audio.blob, cancel.signal, setNotice);
      if (mounted.current) {
        onUpdate(updated);
        setNotice('Audio and saved notes backed up to local PostgreSQL.');
      }
    } catch (e) {
      if (mounted.current && !cancel.signal.aborted) {
        setError(
          e instanceof TypeError
            ? 'The local backup server is unavailable. Your device has the recording.'
            : e instanceof Error
              ? e.message
              : 'Could not back up this recording.',
        );
        setNotice('');
      }
    } finally {
      job.current = null;
      if (mounted.current) setPending(false);
    }
  }
  async function remove() {
    setPending(true);
    try {
      await deleteLecture(access, lecture.setId, lecture.id);
      if (mounted.current) onDelete();
    } catch {
      if (mounted.current) {
        setError('Could not delete this recording. Try again.');
        setPending(false);
      }
    }
  }
  const extension = audio?.blob.type.includes('mp4')
    ? 'm4a'
    : audio?.blob.type.includes('ogg')
      ? 'ogg'
      : 'webm';
  return (
    <div className="lecture-detail">
      {audio && (
        <>
          <audio controls preload="metadata" src={audio.url} aria-label={'Play ' + lecture.title} />
          <a href={audio.url} download={lecture.title + '.' + extension}>
            Download audio
          </a>
        </>
      )}
      <div className="lecture-actions">
        <button
          className="sp-button"
          disabled={!audio || pending || progress !== null || draft.trim() !== lecture.transcript}
          onClick={() => void backUp()}
        >
          Back up recording
        </button>
        {lecture.backedUpAt && (
          <small>
            {lecture.backupCurrent ? 'Backup verified' : 'Notes changed since backup'} ·{' '}
            {new Date(lecture.backedUpAt).toLocaleString()}
          </small>
        )}
      </div>
      <label>
        Transcript or lecture notes
        <textarea
          value={draft}
          maxLength={100000}
          disabled={pending || progress !== null}
          onChange={(e) => {
            setDraft(e.target.value);
            setNotice('');
          }}
          rows={5}
        />
      </label>
      <div className="lecture-actions">
        {progress === null && !draft.trim() && (
          <button
            className="sp-button"
            disabled={!audio || !modelReady || pending}
            onClick={() => void transcribe()}
          >
            Transcribe on device
          </button>
        )}
        {progress !== null && (
          <>
            <span role="status">Transcribing · {progress}%</span>
            <button className="sp-button" onClick={() => job.current?.abort()}>
              Cancel transcription
            </button>
          </>
        )}
        <button
          className="sp-button"
          disabled={
            pending || progress !== null || !draft.trim() || draft.trim() === lecture.transcript
          }
          onClick={() => void saveTranscript(false)}
        >
          Save notes
        </button>
        <button
          className="sp-button"
          disabled={pending || progress !== null || !draft.trim()}
          onClick={() => void saveTranscript(true)}
        >
          Add to study materials
        </button>
      </div>
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
      {confirmDelete ? (
        <div className="lecture-actions">
          <p>Delete this recording and its saved notes?</p>
          <button className="sp-button" disabled={pending} onClick={() => void remove()}>
            Delete recording
          </button>
          <button className="sp-button" disabled={pending} onClick={() => setConfirmDelete(false)}>
            Keep recording
          </button>
        </div>
      ) : (
        <button
          className="text-button"
          disabled={pending || progress !== null}
          onClick={() => setConfirmDelete(true)}
        >
          Remove recording
        </button>
      )}
    </div>
  );
}

export function LectureStudio({ setId, onTranscript }: StudioProps) {
  const access = useWorkspaceAccess();
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [selected, setSelected] = useState('');
  const [showRecorder, setShowRecorder] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [modelReady, setModelReady] = useState(readModelFlag);
  const [preparing, setPreparing] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const setup = useRef<AbortController | null>(null);
  const active = useRef(false);
  useEffect(() => {
    active.current = true;
    let current = true;
    void listLectures(access, setId)
      .then((rows) => {
        if (current) {
          setLectures(rows);
          setReady(true);
          setError('');
        }
      })
      .catch(() => {
        if (current)
          setError(
            'Your browser could not open local recording storage. Allow site storage and retry.',
          );
      });
    return () => {
      current = false;
      active.current = false;
      setup.current?.abort();
    };
  }, [access, setId, attempt]);

  async function save(title: string, audio: Blob, seconds: number) {
    const lecture = {
      id: crypto.randomUUID(),
      setId,
      title,
      createdAt: new Date().toISOString(),
      seconds,
      transcript: '',
    };
    await saveLecture(access, lecture, audio);
    if (active.current) {
      setLectures((items) => [lecture, ...items]);
      setSelected(lecture.id);
    }
  }

  async function prepare() {
    if (setup.current) return;
    const cancel = new AbortController();
    setup.current = cancel;
    setError('');
    setPreparing(true);
    try {
      await prepareSpeechModel(cancel.signal);
      if (cancel.signal.aborted) return;
      setModelReady(true);
      try {
        localStorage.setItem(modelFlag, 'ready');
      } catch {
        /* The model itself uses IndexedDB. */
      }
    } catch {
      if (active.current && !cancel.signal.aborted)
        setError(
          'The English speech model could not be installed. Check your connection and available browser storage, then retry.',
        );
    } finally {
      setup.current = null;
      if (active.current) setPreparing(false);
    }
  }

  return (
    <section className="lecture-studio">
      <header>
        <div>
          <h1>Record Lecture</h1>
          <p>Record, listen back, and study from your transcript on this device.</p>
        </div>
        <button
          className="sp-button"
          disabled={!ready || lectures.length >= 100}
          onClick={() => setShowRecorder(true)}
        >
          <Icon name="mic" size={18} />
          Create Live Lecture
        </button>
      </header>
      {lectures.length >= 100 && (
        <p>Download and remove a recording to make room for another lecture.</p>
      )}
      <section className="lecture-model">
        <div>
          <h2>Offline transcription</h2>
          <p>
            {modelReady
              ? 'English speech model installed on this device.'
              : 'Install the 41 MB English model once to transcribe without an internet connection.'}
          </p>
        </div>
        {!modelReady && (
          <button className="sp-button" disabled={preparing} onClick={() => void prepare()}>
            {preparing ? 'Preparing model…' : 'Install English model'}
          </button>
        )}
      </section>
      {error && (
        <p role="alert">
          {error}{' '}
          {!ready && (
            <button className="text-button" onClick={() => setAttempt((n) => n + 1)}>
              Retry storage
            </button>
          )}
        </p>
      )}
      <h2>Saved recordings</h2>
      {ready && lectures.length === 0 && <p>No recordings in this study set yet.</p>}
      {lectures.map((lecture) => (
        <article key={lecture.id} className="lecture-item">
          <button
            className="lecture-select"
            aria-expanded={selected === lecture.id}
            onClick={() => setSelected(selected === lecture.id ? '' : lecture.id)}
          >
            <Icon name="mic" />
            <span>
              <strong>{lecture.title}</strong>
              <small>
                {new Date(lecture.createdAt).toLocaleString()} · {Math.floor(lecture.seconds / 60)}:
                {String(lecture.seconds % 60).padStart(2, '0')}
              </small>
            </span>
            <Icon name="chevron-down" />
          </button>
          {selected === lecture.id && (
            <LectureDetail
              lecture={lecture}
              modelReady={modelReady}
              onTranscript={onTranscript}
              onUpdate={(updated) =>
                setLectures((items) =>
                  items.map((item) => (item.id === updated.id ? updated : item)),
                )
              }
              onDelete={() => {
                setLectures((items) => items.filter((item) => item.id !== lecture.id));
                setSelected('');
              }}
            />
          )}
        </article>
      ))}
      <LectureRestore
        key={setId}
        setId={setId}
        lectures={lectures}
        onRestore={(lecture) => {
          setLectures((items) => [lecture, ...items]);
          setSelected(lecture.id);
        }}
      />
      {showRecorder && (
        <RecordingDialog onClose={() => setShowRecorder(false)} onSaveRecording={save} />
      )}
    </section>
  );
}
