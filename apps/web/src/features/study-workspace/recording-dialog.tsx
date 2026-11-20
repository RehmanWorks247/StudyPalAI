import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons';
import { Modal } from './primitives';
import './recording-dialog.css';
const maxRecordingMilliseconds = 60 * 60 * 1000;
const maxRecordingBytes = 200 * 1024 * 1024;

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes.toString().padStart(2, '0')}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0')}`;
}

type RecordingState =
  'ready' | 'requesting' | 'recording' | 'paused' | 'stopping' | 'preview' | 'saving';

export function RecordingDialog({
  onClose,
  onSaveRecording,
}: {
  onClose: () => void;
  onSaveRecording: (title: string, audio: Blob, seconds: number) => Promise<void>;
}) {
  const [state, setState] = useState<RecordingState>('ready');
  const [title, setTitle] = useState('Untitled lecture');
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [discard, setDiscard] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const bytes = useRef(0);
  const elapsed = useRef(0);
  const startedAt = useRef<number | null>(null);
  const alive = useRef(true);
  const previewUrl = useRef('');
  const recordedBlob = useRef<Blob | null>(null);
  const saving = useRef(false);
  const [mimeType, setMimeType] = useState('audio/webm');
  const supported = Boolean(
    typeof navigator.mediaDevices?.getUserMedia === 'function' &&
    typeof MediaRecorder !== 'undefined',
  );

  function releaseMicrophone() {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  }

  function currentMilliseconds() {
    return (
      elapsed.current + (startedAt.current === null ? 0 : performance.now() - startedAt.current)
    );
  }

  function stopRecording() {
    const current = recorder.current;
    if (!current || current.state === 'inactive') return;
    elapsed.current = currentMilliseconds();
    startedAt.current = null;
    setSeconds(Math.floor(elapsed.current / 1000));
    setState('stopping');
    current.stop();
    releaseMicrophone();
  }

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      const current = recorder.current;
      if (current) {
        current.ondataavailable = null;
        current.onstop = null;
        current.onerror = null;
        if (current.state !== 'inactive') current.stop();
      }
      stream.current?.getTracks().forEach((track) => track.stop());
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    };
  }, []);

  useEffect(() => {
    if (state !== 'recording') return;
    const timer = window.setInterval(() => {
      const duration =
        elapsed.current + (startedAt.current === null ? 0 : performance.now() - startedAt.current);
      setSeconds(Math.floor(duration / 1000));
      if (duration >= maxRecordingMilliseconds) {
        elapsed.current = duration;
        startedAt.current = null;
        setNotice('The one-hour recording limit was reached. Your recording is ready to save.');
        setState('stopping');
        if (recorder.current?.state !== 'inactive') recorder.current?.stop();
        stream.current?.getTracks().forEach((track) => track.stop());
        stream.current = null;
      }
    }, 500);
    return () => window.clearInterval(timer);
  }, [state]);

  async function startRecording() {
    if (!supported || state !== 'ready') return;
    setError('');
    setNotice('');
    setState('requesting');
    try {
      const input = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!alive.current) {
        input.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = input;
      const preferredType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find(
        (type) => MediaRecorder.isTypeSupported(type),
      );
      const current = new MediaRecorder(
        input,
        preferredType ? { mimeType: preferredType } : undefined,
      );
      recorder.current = current;
      chunks.current = [];
      bytes.current = 0;
      elapsed.current = 0;
      current.ondataavailable = (event) => {
        if (!alive.current || event.data.size === 0) return;
        chunks.current.push(event.data);
        bytes.current += event.data.size;
        if (bytes.current >= maxRecordingBytes && current.state !== 'inactive') {
          setNotice('The recording size limit was reached. Your recording is ready to save.');
          stopRecording();
        }
      };
      current.onstop = () => {
        releaseMicrophone();
        if (!alive.current) return;
        if (chunks.current.length === 0) {
          setError('No audio was captured. Check your microphone and try again.');
          setState('ready');
          return;
        }
        const type = current.mimeType || 'audio/webm';
        setMimeType(type);
        const blob = new Blob(chunks.current, { type });
        recordedBlob.current = blob;
        chunks.current = [];
        previewUrl.current = URL.createObjectURL(blob);
        setAudioUrl(previewUrl.current);
        setState('preview');
      };
      current.onerror = () => {
        current.onstop = null;
        current.ondataavailable = null;
        if (current.state !== 'inactive') current.stop();
        releaseMicrophone();
        if (alive.current) {
          setError(
            'Recording stopped because the microphone became unavailable. Please try again.',
          );
          setState('ready');
        }
      };
      current.start(1000);
      startedAt.current = performance.now();
      setSeconds(0);
      setState('recording');
    } catch (failure) {
      releaseMicrophone();
      if (!alive.current) return;
      setError(
        failure instanceof DOMException && failure.name === 'NotAllowedError'
          ? 'Microphone access was denied. Allow access in your browser, then try again.'
          : 'Your microphone could not be started. Check that it is connected and available.',
      );
      setState('ready');
    }
  }

  function togglePause() {
    const current = recorder.current;
    if (!current) return;
    if (current.state === 'recording') {
      current.pause();
      elapsed.current = currentMilliseconds();
      startedAt.current = null;
      setSeconds(Math.floor(elapsed.current / 1000));
      setState('paused');
    } else if (current.state === 'paused') {
      current.resume();
      startedAt.current = performance.now();
      setState('recording');
    }
  }

  function requestClose() {
    if (saving.current) return;
    if (['recording', 'paused', 'stopping', 'preview'].includes(state)) setDiscard(true);
    else onClose();
  }

  async function saveRecording() {
    if (!audioUrl || !title.trim() || saving.current) return;
    if (recordedBlob.current) {
      saving.current = true;
      setState('saving');
      setError('');
      try {
        await onSaveRecording(title.trim(), recordedBlob.current, seconds);
        if (alive.current) onClose();
      } catch {
        if (alive.current) {
          setError(
            'Could not save this recording. Download the audio now, or free some browser storage and retry.',
          );
          setState('preview');
        }
      } finally {
        saving.current = false;
      }
      return;
    }
  }

  const extension = mimeType.includes('mp4') ? 'm4a' : mimeType.includes('ogg') ? 'ogg' : 'webm';

  return (
    <Modal title="Record lecture" onClose={requestClose}>
      <div className="materials-recording">
        <label className="sp-field">
          Lecture title
          <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} />
        </label>
        <div className={`materials-recorder ${state === 'recording' ? 'is-recording' : ''}`}>
          <span className="materials-recording-icon">
            <Icon name="mic" size={26} />
          </span>
          <strong className="materials-recording-time">{formatDuration(seconds)}</strong>
          <p role="status">
            {state === 'requesting'
              ? 'Waiting for microphone permission…'
              : state === 'recording'
                ? 'Recording your lecture'
                : state === 'paused'
                  ? 'Recording paused'
                  : state === 'stopping'
                    ? 'Finishing your recording…'
                    : state === 'preview'
                      ? 'Ready to listen'
                      : state === 'saving'
                        ? 'Saving recording…'
                        : 'Ready when you are'}
          </p>
        </div>
        {state === 'preview' && (
          <audio controls src={audioUrl} aria-label="Preview lecture recording" />
        )}
        {!supported && (
          <p className="materials-error" role="alert">
            Recording needs a browser with microphone support and a secure connection.
          </p>
        )}
        {error && (
          <p className="materials-error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="materials-notice" role="status">
            {notice}
          </p>
        )}
        <div className="materials-recording-controls">
          {state === 'ready' && (
            <button className="sp-button primary" onClick={startRecording} disabled={!supported}>
              <Icon name="mic" size={18} /> Start recording
            </button>
          )}
          {(state === 'recording' || state === 'paused') && (
            <>
              <button className="sp-button" onClick={togglePause}>
                <Icon name={state === 'paused' ? 'play' : 'pause'} size={17} />
                {state === 'paused' ? 'Resume' : 'Pause'}
              </button>
              <button className="sp-button primary" onClick={stopRecording}>
                <Icon name="stop" size={16} /> Finish recording
              </button>
            </>
          )}
          {state === 'preview' && (
            <>
              <a
                className="sp-button"
                href={audioUrl}
                download={`${title.trim() || 'lecture'}.${extension}`}
              >
                Download audio
              </a>
              <button
                className="sp-button primary"
                onClick={saveRecording}
                disabled={!title.trim()}
              >
                Save recording
              </button>
            </>
          )}
        </div>
        <p className="materials-session-note">
          Recordings are saved in this browser and can be downloaded.
        </p>
        {discard && (
          <div className="materials-discard" role="alert">
            <p>Discard this recording?</p>
            <div>
              <button className="sp-button" onClick={() => setDiscard(false)}>
                Keep recording
              </button>
              <button className="sp-button" onClick={onClose}>
                Discard recording
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
